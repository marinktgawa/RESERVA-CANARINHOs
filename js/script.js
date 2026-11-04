
// ==========================================
// RESERVACANARINHO - GESTÃO SOLUTIONS
// ==========================================

// CHAVES DO LOCALSTORAGE
const CHAVE_CLIENTES = "canarinho_clientes";
const CHAVE_RESERVAS = "canarinho_reservas";
const CHAVE_ESPERA = "canarinho_espera";

// CONFIGURAÇÕES
const TOTAL_MESAS = 10;
const VALOR_CAUCAO = 30;
const PERCENTUAL_REEMBOLSO = 90;
const PERCENTUAL_RETIDO = 10;
const PRAZO_CHECKIN = 30 * 60 * 1000;


// ==========================================
// FUNÇÕES GERAIS
// ==========================================

// Ler informações salvas no navegador
function ler(chave) {
    try {
        return JSON.parse(localStorage.getItem(chave)) || [];
    } catch {
        return [];
    }
}

// Salvar informações no navegador
function salvar(chave, dados) {
    localStorage.setItem(chave, JSON.stringify(dados));
}

// Mostrar mensagens na tela
function mensagem(id, texto, tipo = "sucesso") {
    const elemento = document.getElementById(id);

    if (!elemento) return;

    elemento.textContent = texto;
    elemento.className = "mensagem " + tipo;
}

// Gerar código da reserva
function gerarCodigo() {
    return "CANA-" +
        Math.floor(100000 + Math.random() * 900000);
}

// Formatar data
function dataLegivel(valor) {
    if (!valor) return "Data não informada";

    const data = new Date(valor);

    return Number.isNaN(data.getTime())
        ? valor
        : data.toLocaleString("pt-BR");
}

// Evitar inserir texto HTML enviado pelo usuário
function escapar(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caractere => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[caractere]);
}


// ==========================================
// VERIFICAR CLIENTE
// ==========================================

function clienteExiste(email) {
    return ler(CHAVE_CLIENTES).some(
        cliente =>
            cliente.email &&
            cliente.email.toLowerCase() === email.toLowerCase()
    );
}


// ==========================================
// VERIFICAR MESAS OCUPADAS
// ==========================================

function reservaAtivaMesa(numero) {
    return ler(CHAVE_RESERVAS).some(reserva =>
        Number(reserva.mesa) === Number(numero) &&
        ["Pendente", "Paga", "Check-in realizado"]
            .includes(reserva.status)
    );
}


// ==========================================
// NO-SHOW E REEMBOLSO
// ==========================================

function verificarNoShow() {
    const agora = Date.now();
    const reservas = ler(CHAVE_RESERVAS);

    let mudou = false;

    reservas.forEach(reserva => {

        if (
            reserva.status === "Paga" &&
            !reserva.checkin &&
            reserva.data
        ) {

            const horarioMarcado =
                new Date(reserva.data).getTime();

            const prazoFinal =
                horarioMarcado + PRAZO_CHECKIN;

            if (
                !Number.isNaN(horarioMarcado) &&
                agora > prazoFinal
            ) {

                // Cliente recebe 90% da caução
                const valorReembolso =
                    VALOR_CAUCAO *
                    (PERCENTUAL_REEMBOLSO / 100);

                // Estabelecimento retém 10%
                const valorRetido =
                    VALOR_CAUCAO *
                    (PERCENTUAL_RETIDO / 100);

                reserva.status = "Cancelada por No-Show";

                reserva.reembolso = valorReembolso;

                reserva.percentualReembolso =
                    PERCENTUAL_REEMBOLSO;

                reserva.valorRetido = valorRetido;

                reserva.percentualRetido =
                    PERCENTUAL_RETIDO;

                reserva.canceladaEm =
                    new Date().toISOString();

                reserva.motivo =
                    "Cliente não realizou check-in até 30 minutos após o horário marcado.";

                mudou = true;
            }
        }
    });

    if (mudou) {
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

    const mesaAnterior = select ? select.value : "";

    mapa.innerHTML = "";

    if (select) {
        select.innerHTML =
            '<option value="">Selecione uma mesa livre</option>';
    }

    for (let numero = 1; numero <= TOTAL_MESAS; numero++) {

        const ocupada = reservaAtivaMesa(numero);

        const card = document.createElement("button");

        card.type = "button";

        card.className =
            "mesa " + (ocupada ? "ocupada" : "livre");

        card.disabled = ocupada;

        card.setAttribute("aria-pressed", "false");

        card.setAttribute(
            "aria-label",
            "Mesa " + numero +
            (ocupada ? ", reservada" : ", livre")
        );

        const titulo = document.createElement("strong");

        titulo.textContent = "Mesa " + numero;

        const status = document.createElement("span");

        status.textContent =
            ocupada ? "Reservada" : "Livre";

        card.appendChild(titulo);
        card.appendChild(status);

        // Selecionar mesa
        card.addEventListener("click", () => {

            if (ocupada) return;

            if (select) {
                select.value = numero;
            }

            mapa.querySelectorAll(".mesa").forEach(mesa => {
                mesa.classList.remove("selecionada");
                mesa.setAttribute("aria-pressed", "false");
            });

            card.classList.add("selecionada");

            card.setAttribute("aria-pressed", "true");
        });

        mapa.appendChild(card);

        // Adicionar mesas livres ao formulário
        if (!ocupada && select) {

            const opcao = document.createElement("option");

            opcao.value = numero;

            opcao.textContent = "Mesa " + numero;

            select.appendChild(opcao);
        }
    }

    // Restaurar seleção anterior
    if (
        select &&
        mesaAnterior &&
        Array.from(select.options).some(
            opcao => opcao.value === mesaAnterior
        )
    ) {

        select.value = mesaAnterior;

        const mesaSelecionada = Array.from(
            mapa.querySelectorAll(".mesa")
        ).find(mesa =>
            mesa.querySelector("strong").textContent ===
            "Mesa " + mesaAnterior
        );

        if (mesaSelecionada) {
            mesaSelecionada.classList.add("selecionada");
            mesaSelecionada.setAttribute("aria-pressed", "true");
        }
    }
}


// ==========================================
// ATUALIZAR RESERVAS
// ==========================================

function atualizarReservas() {
    const lista = document.getElementById("listaReservas");

    if (lista) {

        const reservas = ler(CHAVE_RESERVAS);

        if (!reservas.length) {

            lista.innerHTML =
                '<p class="muted">Ainda não existem reservas.</p>';

        } else {

            lista.innerHTML = reservas.slice().reverse().map(reserva => `

                <div class="reserva-item">

                    <strong>${escapar(reserva.codigo)}</strong>

                    · Mesa ${escapar(reserva.mesa)}

                    <br>

                    <span>${escapar(dataLegivel(reserva.data))}</span>

                    <br>

                    Cliente: ${escapar(reserva.email)}

                    <br>

                    Status:

                    <span class="status ${classeStatus(reserva.status)}">
                        ${escapar(reserva.status)}
                    </span>

                    ${
                        reserva.status === "Pendente"
                        ? '<br><a href="pagamento.html">Ir para pagamento da caução</a>'
                        : ""
                    }

                    ${
                        reserva.reembolso !== undefined
                        ? `
                            <br><br>
                            <strong>Reembolso ao cliente (${reserva.percentualReembolso}%):</strong>
                            R$ ${Number(reserva.reembolso).toFixed(2).replace(".", ",")}

                            <br>

                            <strong>Valor retido pelo estabelecimento (${reserva.percentualRetido}%):</strong>
                            R$ ${Number(reserva.valorRetido).toFixed(2).replace(".", ",")}
                        `
                        : ""
                    }

                </div>

            `).join("");
        }
    }

    // Atualizar opções da página de pagamento
    const selectPagamento =
        document.getElementById("reservaPagamento");

    if (selectPagamento) {

        const pendentes = ler(CHAVE_RESERVAS).filter(
            reserva => reserva.status === "Pendente"
        );

        selectPagamento.innerHTML =
            '<option value="">Selecione uma reserva</option>';

        pendentes.forEach(reserva => {

            const opcao = document.createElement("option");

            opcao.value = reserva.codigo;

            opcao.textContent =
                `${reserva.codigo} · Mesa ${reserva.mesa} · ${reserva.email}`;

            selectPagamento.appendChild(opcao);
        });
    }
}


// ==========================================
// LISTA DE ESPERA
// ==========================================

function atualizarEspera() {
    const lista = document.getElementById("listaEspera");

    if (!lista) return;

    const fila = ler(CHAVE_ESPERA);

    lista.innerHTML = fila.length

        ? fila.map((item, indice) =>
            `<li>${indice + 1}. ${escapar(item.email)} — aguardando mesa</li>`
        ).join("")

        : "<li>A lista de espera está vazia.</li>";
}


// ==========================================
// CORES DOS STATUS
// ==========================================

function classeStatus(status) {
    if (status === "Paga") return "pago";

    if (status === "Check-in realizado") return "checkin";

    if (status.includes("Cancelada")) return "cancelada";

    return "";
}


// ==========================================
// INICIALIZAÇÃO DO SISTEMA
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    verificarNoShow();

    atualizarMapa();

    atualizarReservas();

    atualizarEspera();


    // ======================================
    // ATUALIZAÇÃO AUTOMÁTICA A CADA 15 SEGUNDOS
    // ======================================

    setInterval(() => {

        verificarNoShow();

        atualizarMapa();

        atualizarReservas();

        atualizarEspera();

    }, 15000);


    // ======================================
    // SINCRONIZAR MAPA E FORMULÁRIO
    // ======================================

    const selectMesa =
        document.getElementById("mesaReserva");

    if (selectMesa) {

        selectMesa.addEventListener("change", () => {

            const mapa =
                document.getElementById("mapaMesas");

            if (!mapa) return;

            mapa.querySelectorAll(".mesa").forEach(mesa => {
                mesa.classList.remove("selecionada");
                mesa.setAttribute("aria-pressed", "false");
            });

            const selecionada = Array.from(
                mapa.querySelectorAll(".mesa")
            ).find(mesa =>
                mesa.querySelector("strong").textContent ===
                "Mesa " + selectMesa.value
            );

            if (selecionada) {
                selecionada.classList.add("selecionada");
                selecionada.setAttribute("aria-pressed", "true");
            }
        });
    }


    // ======================================
    // CADASTRO DE CLIENTES
    // ======================================

    const formCadastro =
        document.getElementById("formCadastro");

    if (formCadastro) {

        formCadastro.addEventListener("submit", evento => {

            evento.preventDefault();

            const cliente = {

                nome: document.getElementById("nome")
                    .value.trim(),

                email: document.getElementById("email")
                    .value.trim().toLowerCase(),

                telefone: document.getElementById("telefone")
                    .value.trim(),

                senha: document.getElementById("senha").value
            };

            const clientes = ler(CHAVE_CLIENTES);

            if (clientes.some(c => c.email === cliente.email)) {

                mensagem(
                    "mensagemCadastro",
                    "Já existe um cadastro com esse e-mail.",
                    "erro"
                );

                return;
            }

            clientes.push(cliente);

            salvar(CHAVE_CLIENTES, clientes);

            formCadastro.reset();

            mensagem(
                "mensagemCadastro",
                "Cadastro realizado! Agora você pode entrar ou reservar uma mesa."
            );
        });
    }


    // ======================================
    // LOGIN
    // ======================================

    const formLogin =
        document.getElementById("formLogin");

    if (formLogin) {

        formLogin.addEventListener("submit", evento => {

            evento.preventDefault();

            const email = document.getElementById("emailLogin")
                .value.trim().toLowerCase();

            const senha = document.getElementById("senhaLogin").value;

            const cliente = ler(CHAVE_CLIENTES).find(
                c => c.email === email && c.senha === senha
            );

            if (!cliente) {

                mensagem(
                    "mensagemLogin",
                    "E-mail ou senha incorretos. Confira seus dados ou faça o cadastro.",
                    "erro"
                );

                return;
            }

            sessionStorage.setItem(
                "canarinho_cliente_logado",
                cliente.email
            );

            mensagem(
                "mensagemLogin",
                `Bem-vindo(a), ${cliente.nome}! Login realizado com sucesso.`
            );
        });
    }


    // ======================================
    // CRIAR RESERVA
    // ======================================

    const formReserva =
        document.getElementById("formReserva");

    if (formReserva) {

        formReserva.addEventListener("submit", evento => {

            evento.preventDefault();

            verificarNoShow();

            const email = document.getElementById("clienteReserva")
                .value.trim().toLowerCase();

            const mesa = Number(
                document.getElementById("mesaReserva").value
            );

            const data = document.getElementById("dataReserva").value;

            if (!clienteExiste(email)) {

                mensagem(
                    "mensagemReserva",
                    "Esse e-mail não está cadastrado. Cadastre o cliente primeiro.",
                    "erro"
                );

                return;
            }

            if (!mesa || reservaAtivaMesa(mesa)) {

                mensagem(
                    "mensagemReserva",
                    "Essa mesa não está disponível. Atualize a página e escolha outra.",
                    "erro"
                );

                atualizarMapa();

                return;
            }

            if (
                !data ||
                Number.isNaN(new Date(data).getTime()) ||
                new Date(data).getTime() <= Date.now()
            ) {

                mensagem(
                    "mensagemReserva",
                    "Escolha uma data e horário futuros.",
                    "erro"
                );

                return;
            }

            const reservas = ler(CHAVE_RESERVAS);

            const conflito = reservas.some(reserva =>
                reserva.email === email &&
                ["Pendente", "Paga", "Check-in realizado"]
                    .includes(reserva.status)
            );

            if (conflito) {

                mensagem(
                    "mensagemReserva",
                    "Esse cliente já tem uma reserva ativa. Finalize ou cancele antes de criar outra.",
                    "erro"
                );

                return;
            }

            reservas.push({

                codigo: gerarCodigo(),

                email: email,

                mesa: mesa,

                data: data,

                status: "Pendente",

                checkin: false,

                criadoEm: new Date().toISOString()
            });

            salvar(CHAVE_RESERVAS, reservas);

            formReserva.reset();

            mensagem(
                "mensagemReserva",
                "Reserva criada! Anote o código exibido em Minhas reservas e confirme a caução na página Caução."
            );

            atualizarMapa();

            atualizarReservas();
        });
    }


    // ======================================
    // PAGAMENTO SIMULADO
    // ======================================

    const formPagamento =
        document.getElementById("formPagamento");

    if (formPagamento) {

        formPagamento.addEventListener("submit", evento => {

            evento.preventDefault();

            verificarNoShow();

            const codigo = document.getElementById("reservaPagamento")
                .value;

            const reservas = ler(CHAVE_RESERVAS);

            const reserva = reservas.find(
                r => r.codigo === codigo && r.status === "Pendente"
            );

            if (!reserva) {

                mensagem(
                    "mensagemPagamento",
                    "Selecione uma reserva pendente válida.",
                    "erro"
                );

                return;
            }

            // Não permitir pagamento após o prazo
            const horarioMarcado =
                new Date(reserva.data).getTime();

            const prazoFinal =
                horarioMarcado + PRAZO_CHECKIN;

            if (
                Number.isNaN(horarioMarcado) ||
                Date.now() > prazoFinal
            ) {

                verificarNoShow();

                atualizarMapa();

                atualizarReservas();

                mensagem(
                    "mensagemPagamento",
                    "O prazo da reserva terminou. Não é possível confirmar a caução.",
                    "erro"
                );

                return;
            }

            reserva.status = "Paga";

            reserva.pagoEm = new Date().toISOString();

            salvar(CHAVE_RESERVAS, reservas);

            mensagem(
                "mensagemPagamento",
                `Pagamento simulado confirmado para ${reserva.codigo}. Nenhum dinheiro foi movimentado.`
            );

            atualizarMapa();

            atualizarReservas();
        });
    }


    // ======================================
    // CHECK-IN
    // ======================================

    const formCheckin =
        document.getElementById("formCheckin");

    if (formCheckin) {

        formCheckin.addEventListener("submit", evento => {

            evento.preventDefault();

            verificarNoShow();

            const codigo = document.getElementById("codigoCheckin")
                .value.trim().toUpperCase();

            const reservas = ler(CHAVE_RESERVAS);

            const reserva = reservas.find(
                r => r.codigo.toUpperCase() === codigo
            );

            if (!reserva) {

                mensagem(
                    "mensagemCheckin",
                    "Código não encontrado. Confira o código da reserva.",
                    "erro"
                );

                return;
            }

            if (reserva.status !== "Paga") {

                mensagem(
                    "mensagemCheckin",
                    `Não foi possível fazer check-in. Status atual: ${reserva.status}. A caução deve estar confirmada e a reserva não pode estar cancelada.`,
                    "erro"
                );

                return;
            }

            const horarioMarcado =
                new Date(reserva.data).getTime();

            const prazoFinal =
                horarioMarcado + PRAZO_CHECKIN;

            if (
                Number.isNaN(horarioMarcado) ||
                Date.now() > prazoFinal
            ) {

                verificarNoShow();

                atualizarMapa();

                atualizarReservas();

                mensagem(
                    "mensagemCheckin",
                    "Prazo encerrado! A reserva foi cancelada por No-Show. O sistema registrou R$ 27,00 de reembolso e R$ 3,00 de valor retido.",
                    "erro"
                );

                return;
            }

            // Confirmar presença
            reserva.checkin = true;

            reserva.status = "Check-in realizado";

            reserva.checkinEm = new Date().toISOString();

            salvar(CHAVE_RESERVAS, reservas);

            mensagem(
                "mensagemCheckin",
                `Check-in confirmado! Sua mesa ${reserva.mesa} está garantida.`,
                "sucesso"
            );

            atualizarMapa();

            atualizarReservas();
        });
    }


    // ======================================
    // LISTA DE ESPERA
    // ======================================

    const formEspera =
        document.getElementById("formEspera");

    if (formEspera) {

        formEspera.addEventListener("submit", evento => {

            evento.preventDefault();

            const email = document.getElementById("emailEspera")
                .value.trim().toLowerCase();

            if (!clienteExiste(email)) {

                mensagem(
                    "mensagemEspera",
                    "Cadastre o cliente antes de entrar na lista de espera.",
                    "erro"
                );

                return;
            }

            const fila = ler(CHAVE_ESPERA);

            if (fila.some(item => item.email === email)) {

                mensagem(
                    "mensagemEspera",
                    "Esse e-mail já está na lista de espera.",
                    "erro"
                );

                return;
            }

            fila.push({

                email: email,

                entrouEm: new Date().toISOString()
            });

            salvar(CHAVE_ESPERA, fila);

            formEspera.reset();

            mensagem(
                "mensagemEspera",
                "Você entrou na lista de espera."
            );

            atualizarEspera();
        });
    }

const botaoCopiarPix = document.getElementById("copiarPix");

if (botaoCopiarPix) {
    botaoCopiarPix.addEventListener("click", async function () {
        const chavePix = document.getElementById("chavePix").value;
        const mensagemPix = document.getElementById("mensagemPix");

        try {
            await navigator.clipboard.writeText(chavePix);
            mensagemPix.textContent = "Chave Pix copiada com sucesso!";
        } catch (erro) {
            mensagemPix.textContent =
                "Não foi possível copiar automaticamente. Copie a chave manualmente.";
        }
    });
}

});
