
// ==========================================
// RESERVA CANARINHO
// Cadastro e login pela API
// Demais funcionalidades temporariamente locais
// ==========================================

const CHAVE_CLIENTES = "canarinho_clientes";
const CHAVE_RESERVAS = "canarinho_reservas";
const CHAVE_ESPERA = "canarinho_espera";

const TOTAL_MESAS = 10;
const VALOR_CAUCao = 30;
const PERCENTUAL_REEMBOLSO = 90;
const PERCENTUAL_RETIDO = 10;
const PRAZO_CHECKIN = 30 * 60 * 1000;

// ==========================================
// FUNÇÕES GERAIS
// ==========================================

function ler(chave) {
    try {
        return JSON.parse(localStorage.getItem(chave)) || [];
    } catch {
        return [];
    }
}

function salvar(chave, dados) {
    localStorage.setItem(chave, JSON.stringify(dados));
}

function mensagem(id, texto, tipo = "") {
    const elemento = document.getElementById(id);

    if (!elemento) return;

    elemento.textContent = texto;
    elemento.classList.remove("erro", "sucesso");

    if (tipo) {
        elemento.classList.add(tipo);
    }
}

function gerarCodigo() {
    return "CANA-" + Math.floor(100000 + Math.random() * 900000);
}

function dataLegivel(data) {
    return new Date(data).toLocaleString("pt-BR");
}

function escapar(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, caractere => {
        const entidades = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return entidades[caractere];
    });
}

// ==========================================
// CLIENTES
// ==========================================

// Guarda somente os dados públicos do cliente.
// Nunca guarda a senha no navegador.

function guardarClienteLocal(cliente) {
    const clientes = ler(CHAVE_CLIENTES);

    const existe = clientes.some(
        item => item.email.toLowerCase() === cliente.email.toLowerCase()
    );

    if (!existe) {
        clientes.push({
            id: cliente.id,
            nome: cliente.nome,
            email: cliente.email,
            telefone: cliente.telefone
        });
    } else {
        const atualizados = clientes.map(item => {
            if (item.email.toLowerCase() === cliente.email.toLowerCase()) {
                return {
                    id: cliente.id,
                    nome: cliente.nome,
                    email: cliente.email,
                    telefone: cliente.telefone
                };
            }

            return item;
        });

        salvar(CHAVE_CLIENTES, atualizados);
        return;
    }

    salvar(CHAVE_CLIENTES, clientes);
}

function clienteExiste(email) {
    return ler(CHAVE_CLIENTES).some(
        cliente => cliente.email.toLowerCase() === email.toLowerCase()
    );
}

// ==========================================
// CADASTRO DE CLIENTES - POSTGRESQL
// ==========================================

const formCadastro = document.getElementById("formCadastro");

if (formCadastro) {
    formCadastro.addEventListener("submit", async function(event) {
        event.preventDefault();

        const nome = document.getElementById("nome").value.trim();
        const email = document.getElementById("email").value.trim();
        const telefone = document.getElementById("telefone").value.trim();
        const senha = document.getElementById("senha").value;

        try {
            const resposta = await fetch("/api/clientes", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    nome,
                    email,
                    telefone,
                    senha
                })
            });

            const dados = await resposta.json();

            if (!resposta.ok) {
                mensagem("mensagemCadastro", dados.erro, "erro");
                return;
            }

            guardarClienteLocal(dados.cliente);

            mensagem(
                "mensagemCadastro",
                dados.mensagem,
                "sucesso"
            );

            formCadastro.reset();

        } catch (erro) {
            console.error("Erro no cadastro:", erro);

            mensagem(
                "mensagemCadastro",
                "Não foi possível conectar ao servidor.",
                "erro"
            );
        }
    });
}

// ==========================================
// LOGIN DE CLIENTES - POSTGRESQL
// ==========================================

const formLogin = document.getElementById("formLogin");

if (formLogin) {
    formLogin.addEventListener("submit", async function(event) {
        event.preventDefault();

        const email = document.getElementById("emailLogin").value.trim();
        const senha = document.getElementById("senhaLogin").value;

        try {
            const resposta = await fetch("/api/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    email,
                    senha
                })
            });

            const dados = await resposta.json();

            if (!resposta.ok) {
                mensagem("mensagemLogin", dados.erro, "erro");
                return;
            }

            sessionStorage.setItem(
                "canarinho_token",
                dados.token
            );

            sessionStorage.setItem(
                "canarinho_cliente",
                JSON.stringify(dados.cliente)
            );

            sessionStorage.setItem(
                "canarinho_cliente_logado",
                dados.cliente.email
            );

            guardarClienteLocal(dados.cliente);

            mensagem(
                "mensagemLogin",
                dados.mensagem,
                "sucesso"
            );

            formLogin.reset();

            setTimeout(() => {
                window.location.href = "mesas.html";
            }, 1000);

        } catch (erro) {
            console.error("Erro no login:", erro);

            mensagem(
                "mensagemLogin",
                "Não foi possível conectar ao servidor.",
                "erro"
            );
        }
    });
}

// ==========================================
// RESERVAS
// ==========================================

function reservaAtivaMesa(numero) {
    return ler(CHAVE_RESERVAS).some(reserva =>
        Number(reserva.mesa) === Number(numero) &&
        ["Pendente", "Paga", "Check-in realizado"].includes(reserva.status)
    );
}

function verificarNoShow() {
    const reservas = ler(CHAVE_RESERVAS);
    const agora = Date.now();

    let alterou = false;

    reservas.forEach(reserva => {
        if (reserva.status !== "Paga" || reserva.checkin) {
            return;
        }

        const limite = new Date(reserva.data).getTime() + PRAZO_CHECKIN;

        if (agora > limite) {
            reserva.status = "Cancelada por No-Show";
            reserva.reembolso = 27;
            reserva.percentualReembolso = PERCENTUAL_REEMBOLSO;
            reserva.valorRetido = 3;
            reserva.percentualRetido = PERCENTUAL_RETIDO;
            reserva.canceladaEm = new Date().toISOString();

            reserva.motivo =
                "Cliente não realizou o check-in dentro do prazo.";

            alterou = true;
        }
    });

    if (alterou) {
        salvar(CHAVE_RESERVAS, reservas);
    }
}

// ==========================================
// MAPA DE MESAS
// ==========================================

function atualizarMapa() {
    const mapa = document.getElementById("mapaMesas");
    const select = document.getElementById("mesaReserva");

    if (!mapa) return;

    mapa.innerHTML = "";

    if (select) {
        select.innerHTML =
            '<option value="">Selecione uma mesa livre</option>';
    }

    for (let numero = 1; numero <= TOTAL_MESAS; numero++) {
        const ocupada = reservaAtivaMesa(numero);

        const botao = document.createElement("button");

        botao.type = "button";
        botao.className = ocupada ? "mesa ocupada" : "mesa livre";

        botao.textContent = `Mesa ${numero}`;

        botao.disabled = ocupada;

        if (!ocupada) {
            botao.addEventListener("click", () => {
                if (select) {
                    select.value = numero;
                    mensagem("mensagemReserva", "");
                }

                mapa.querySelectorAll(".mesa").forEach(mesa => {
                    mesa.classList.remove("selecionada");
                });

                botao.classList.add("selecionada");
            });

            if (select) {
                const opcao = document.createElement("option");

                opcao.value = numero;
                opcao.textContent = `Mesa ${numero}`;

                select.appendChild(opcao);
            }
        }

        mapa.appendChild(botao);
    }
}

// ==========================================
// LISTA DE RESERVAS
// ==========================================

function atualizarReservas() {
    const lista = document.getElementById("listaReservas");
    const pagamento = document.getElementById("reservaPagamento");

    const reservas = ler(CHAVE_RESERVAS);

    if (lista) {
        if (reservas.length === 0) {
            lista.innerHTML = "<p>Nenhuma reserva cadastrada.</p>";
        } else {
            lista.innerHTML = reservas.map(reserva => `
                <div class="item-reserva">
                    <strong>${escapar(reserva.codigo)}</strong>
                    <p>Mesa: ${escapar(reserva.mesa)}</p>
                    <p>Cliente: ${escapar(reserva.email)}</p>
                    <p>Data: ${escapar(dataLegivel(reserva.data))}</p>
                    <p>Status: ${escapar(reserva.status)}</p>
                    ${
                        reserva.status === "Cancelada por No-Show"
                        ? `<p>Reembolso: R$ ${Number(reserva.reembolso).toFixed(2).replace(".", ",")}</p>
                           <p>Valor retido: R$ ${Number(reserva.valorRetido).toFixed(2).replace(".", ",")}</p>`
                        : ""
                    }
                </div>
            `).join("");
        }
    }

    if (pagamento) {
        pagamento.innerHTML =
            '<option value="">Selecione uma reserva</option>';

        reservas
            .filter(reserva => reserva.status === "Pendente")
            .forEach(reserva => {
                const opcao = document.createElement("option");

                opcao.value = reserva.codigo;
                opcao.textContent =
                    `${reserva.codigo} - Mesa ${reserva.mesa}`;

                pagamento.appendChild(opcao);
            });
    }
}

// ==========================================
// LISTA DE ESPERA
// ==========================================

function atualizarEspera() {
    const lista = document.getElementById("listaEspera");

    if (!lista) return;

    const espera = ler(CHAVE_ESPERA);

    if (espera.length === 0) {
        lista.innerHTML = "<li>Ninguém na lista de espera.</li>";
        return;
    }

    lista.innerHTML = espera.map((item, indice) => `
        <li>
            ${indice + 1}. ${escapar(item.email)}
        </li>
    `).join("");
}

// ==========================================
// FORMULÁRIO DE RESERVA
// ==========================================

const formReserva = document.getElementById("formReserva");

if (formReserva) {
    formReserva.addEventListener("submit", function(event) {
        event.preventDefault();

        const email = document.getElementById("clienteReserva")
            .value.trim().toLowerCase();

        const mesa = Number(
            document.getElementById("mesaReserva").value
        );

        const data = document.getElementById("dataReserva").value;

        if (!clienteExiste(email)) {
            mensagem(
                "mensagemReserva",
                "Cliente não encontrado. Faça o cadastro primeiro.",
                "erro"
            );
            return;
        }

        if (!mesa || !data) {
            mensagem(
                "mensagemReserva",
                "Preencha todos os campos.",
                "erro"
            );
            return;
        }

        if (reservaAtivaMesa(mesa)) {
            mensagem(
                "mensagemReserva",
                "Esta mesa já está reservada.",
                "erro"
            );

            atualizarMapa();
            return;
        }

        if (new Date(data).getTime() <= Date.now()) {
            mensagem(
                "mensagemReserva",
                "Escolha uma data e horário futuros.",
                "erro"
            );
            return;
        }

        const reservas = ler(CHAVE_RESERVAS);

        const possuiReserva = reservas.some(reserva =>
            reserva.email.toLowerCase() === email &&
            ["Pendente", "Paga", "Check-in realizado"].includes(reserva.status)
        );

        if (possuiReserva) {
            mensagem(
                "mensagemReserva",
                "Este cliente já possui uma reserva ativa.",
                "erro"
            );
            return;
        }

        const codigo = gerarCodigo();

        reservas.push({
            codigo,
            email,
            mesa,
            data,
            status: "Pendente",
            checkin: false,
            criadoEm: new Date().toISOString()
        });

        salvar(CHAVE_RESERVAS, reservas);

        mensagem(
            "mensagemReserva",
            `Reserva criada! Seu código é ${codigo}. Confirme a caução de R$ 30,00.`,
            "sucesso"
        );

        formReserva.reset();

        atualizarMapa();
        atualizarReservas();
    });
}

// ==========================================
// FORMULÁRIO DE PAGAMENTO
// CAUÇÃO DEMONSTRATIVA DE R$ 30,00
// ==========================================

const formPagamento = document.getElementById("formPagamento");

if (formPagamento) {
    formPagamento.addEventListener("submit", function(event) {
        event.preventDefault();

        const codigo = document.getElementById("reservaPagamento").value;

        const reservas = ler(CHAVE_RESERVAS);

        const reserva = reservas.find(
            item => item.codigo === codigo
        );

        if (!reserva) {
            mensagem(
                "mensagemPagamento",
                "Selecione uma reserva válida.",
                "erro"
            );
            return;
        }

        if (reserva.status !== "Pendente") {
            mensagem(
                "mensagemPagamento",
                "Esta reserva não está pendente.",
                "erro"
            );
            return;
        }

        const limite =
            new Date(reserva.data).getTime() + PRAZO_CHECKIN;

        if (Date.now() > limite) {
            mensagem(
                "mensagemPagamento",
                "O prazo para pagamento desta reserva terminou.",
                "erro"
            );
            return;
        }

        reserva.status = "Paga";
        reserva.pagoEm = new Date().toISOString();
        reserva.valorCaucao = VALOR_CAUCao;

        salvar(CHAVE_RESERVAS, reservas);

        mensagem(
            "mensagemPagamento",
            "Caução demonstrativa de R$ 30,00 confirmada com sucesso!",
            "sucesso"
        );

        formPagamento.reset();

        atualizarMapa();
        atualizarReservas();
    });
}

// ==========================================
// CHECK-IN
// ==========================================

const formCheckin = document.getElementById("formCheckin");

if (formCheckin) {
    formCheckin.addEventListener("submit", function(event) {
        event.preventDefault();

        const codigo = document.getElementById("codigoCheckin")
            .value.trim().toUpperCase();

        const reservas = ler(CHAVE_RESERVAS);

        const reserva = reservas.find(
            item => item.codigo.toUpperCase() === codigo
        );

        if (!reserva) {
            mensagem(
                "mensagemCheckin",
                "Código de reserva não encontrado.",
                "erro"
            );
            return;
        }

        if (reserva.status !== "Paga") {
            mensagem(
                "mensagemCheckin",
                "A reserva precisa estar paga para realizar o check-in.",
                "erro"
            );
            return;
        }

        const limite =
            new Date(reserva.data).getTime() + PRAZO_CHECKIN;

        if (Date.now() > limite) {
            mensagem(
                "mensagemCheckin",
                "O prazo para check-in terminou.",
                "erro"
            );

            verificarNoShow();
            atualizarMapa();
            atualizarReservas();
            return;
        }

        reserva.checkin = true;
        reserva.status = "Check-in realizado";
        reserva.checkinEm = new Date().toISOString();

        salvar(CHAVE_RESERVAS, reservas);

        mensagem(
            "mensagemCheckin",
            "Check-in realizado com sucesso!",
            "sucesso"
        );

        formCheckin.reset();

        atualizarMapa();
        atualizarReservas();
    });
}

// ==========================================
// FORMULÁRIO DA LISTA DE ESPERA
// ==========================================

const formEspera = document.getElementById("formEspera");

if (formEspera) {
    formEspera.addEventListener("submit", function(event) {
        event.preventDefault();

        const email = document.getElementById("emailEspera")
            .value.trim().toLowerCase();

        if (!clienteExiste(email)) {
            mensagem(
                "mensagemEspera",
                "Cliente não cadastrado. Faça o cadastro primeiro.",
                "erro"
            );
            return;
        }

        const espera = ler(CHAVE_ESPERA);

        const jaExiste = espera.some(
            item => item.email.toLowerCase() === email
        );

        if (jaExiste) {
            mensagem(
                "mensagemEspera",
                "Este cliente já está na lista de espera.",
                "erro"
            );
            return;
        }

        espera.push({
            email,
            entrouEm: new Date().toISOString()
        });

        salvar(CHAVE_ESPERA, espera);

        mensagem(
            "mensagemEspera",
            "Cliente adicionado à lista de espera!",
            "sucesso"
        );

        formEspera.reset();

        atualizarEspera();
    });
}

// ==========================================
// COPIAR CHAVE PIX DEMONSTRATIVA
// ==========================================

const botaoPix = document.getElementById("copiarPix");

if (botaoPix) {
    botaoPix.addEventListener("click", async function() {
        const campoPix = document.getElementById("chavePix");

        if (!campoPix) return;

        try {
            await navigator.clipboard.writeText(campoPix.value);

            mensagem(
                "mensagemPix",
                "Chave Pix copiada!",
                "sucesso"
            );

        } catch (erro) {
            console.error("Erro ao copiar Pix:", erro);

            mensagem(
                "mensagemPix",
                "Não foi possível copiar a chave Pix.",
                "erro"
            );
        }
    });
}

// ==========================================
// INICIALIZAÇÃO DAS PÁGINAS
// ==========================================

document.addEventListener("DOMContentLoaded", function() {
    verificarNoShow();

    atualizarMapa();
    atualizarReservas();
    atualizarEspera();

    // Atualizar informações a cada 15 segundos
    setInterval(function() {
        verificarNoShow();

        atualizarMapa();
        atualizarReservas();
        atualizarEspera();

    }, 15000);

    // Atualizar seleção quando o usuário escolher uma mesa
    const selectMesa = document.getElementById("mesaReserva");

    if (selectMesa) {
        selectMesa.addEventListener("change", function() {
            const mapa = document.getElementById("mapaMesas");

            if (!mapa) return;

            mapa.querySelectorAll(".mesa").forEach(botao => {
                botao.classList.remove("selecionada");

                if (
                    botao.textContent === `Mesa ${selectMesa.value}` &&
                    selectMesa.value !== ""
                ) {
                    botao.classList.add("selecionada");
                }
            });
        });
    }
});
