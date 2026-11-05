
require("dotenv").config();

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const crypto = require("crypto");
const pool = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CONFIGURAÇÕES
// ==========================================

if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    console.error("ERRO: Configure DATABASE_URL e JWT_SECRET no .env");
    process.exit(1);
}

app.use(express.json());

app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));

// ==========================================
// PÁGINAS DO SITE
// ==========================================

const paginas = [
    "index.html",
    "clientes.html",
    "login.html",
    "mesas.html",
    "pagamento.html",
    "checkin.html"
];

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/:pagina", (req, res, next) => {
    if (paginas.includes(req.params.pagina)) {
        return res.sendFile(
            path.join(__dirname, req.params.pagina)
        );
    }

    next();
});

// ==========================================
// AUTENTICAÇÃO
// ==========================================

function autenticarToken(req, res, next) {
    const cabecalho = req.headers.authorization;

    if (!cabecalho || !cabecalho.startsWith("Bearer ")) {
        return res.status(401).json({
            erro: "Faça login para continuar."
        });
    }

    const token = cabecalho.split(" ")[1];

    try {
        const dados = jwt.verify(token, process.env.JWT_SECRET);

        req.cliente = dados;

        next();

    } catch (erro) {
        return res.status(401).json({
            erro: "Sessão expirada. Faça login novamente."
        });
    }
}

// ==========================================
// VERIFICAR E REGISTRAR NO-SHOW
// PRAZO: 30 MINUTOS APÓS O HORÁRIO DA RESERVA
// ==========================================

async function atualizarNoShows(conexao = pool, clienteId = null) {
    const parametros = [];
    let filtroCliente = "";

    if (clienteId !== null) {
        parametros.push(clienteId);
        filtroCliente = "AND cliente_id = $1";
    }

    await conexao.query(
        `UPDATE reservas
         SET status = 'Cancelada por No-Show',
             reembolso = 27.00,
             percentual_reembolso = 90.00,
             valor_retido = 3.00,
             percentual_retido = 10.00,
             cancelada_em = CURRENT_TIMESTAMP,
             motivo = 'Cliente não realizou o check-in dentro do prazo.'
         WHERE status = 'Paga'
           AND checkin = FALSE
           AND data_reserva + INTERVAL '30 minutes' < CURRENT_TIMESTAMP
           ${filtroCliente}`,
        parametros
    );
}

// ==========================================
// TESTAR SERVIDOR E BANCO
// ==========================================

app.get("/api/health", async (req, res) => {
    try {
        await pool.query("SELECT NOW()");

        res.json({
            mensagem: "Servidor e banco funcionando!"
        });

    } catch (erro) {
        console.error(erro);

        res.status(500).json({
            erro: "Não foi possível acessar o banco."
        });
    }
});

// ==========================================
// CADASTRO DE CLIENTES
// ==========================================

app.post("/api/clientes", async (req, res) => {
    try {
        const { nome, email, telefone, senha } = req.body;

        if (!nome || !email || !telefone || !senha) {
            return res.status(400).json({
                erro: "Preencha todos os campos."
            });
        }

        if (nome.trim().length > 80) {
            return res.status(400).json({
                erro: "O nome deve ter no máximo 80 caracteres."
            });
        }

       if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            return res.status(400).json({
                erro: "Informe um e-mail válido."
            });
        }

        if (senha.length < 8) {
            return res.status(400).json({
                erro: "A senha deve ter pelo menos 8 caracteres."
            });
        }

        const emailNormalizado = email.trim().toLowerCase();

        const senhaHash = await bcrypt.hash(senha, 12);

        const resultado = await pool.query(
            `INSERT INTO clientes
            (nome, email, telefone, senha_hash)
            VALUES ($1, $2, $3, $4)
            RETURNING id, nome, email, telefone`,
            [
                nome.trim(),
                emailNormalizado,
                telefone.trim(),
                senhaHash
            ]
        );

        res.status(201).json({
            mensagem: "Cliente cadastrado com sucesso!",
            cliente: resultado.rows[0]
        });

    } catch (erro) {
        if (erro.code === "23505") {
            return res.status(409).json({
                erro: "Este e-mail já está cadastrado."
            });
        }

        console.error(erro);

        res.status(500).json({
            erro: "Erro ao cadastrar cliente."
        });
    }
});

// ==========================================
// LOGIN DE CLIENTES
// ==========================================

app.post("/api/login", async (req, res) => {
    try {
        const { email, senha } = req.body;

        if (!email || !senha) {
            return res.status(400).json({
                erro: "Informe o e-mail e a senha."
            });
        }

        const resultado = await pool.query(
            `SELECT id, nome, email, telefone, senha_hash
             FROM clientes
             WHERE LOWER(email) = LOWER($1)`,
            [email.trim()]
        );

        if (resultado.rows.length === 0) {
            return res.status(401).json({
                erro: "E-mail ou senha incorretos."
            });
        }

        const cliente = resultado.rows[0];

        const senhaCorreta = await bcrypt.compare(
            senha,
            cliente.senha_hash
        );

        if (!senhaCorreta) {
            return res.status(401).json({
                erro: "E-mail ou senha incorretos."
            });
        }

        const token = jwt.sign(
            {
                id: cliente.id,
                email: cliente.email
            },
            process.env.JWT_SECRET,
            { expiresIn: "2h" }
        );

        res.json({
            mensagem: "Login realizado com sucesso!",
            token,
            cliente: {
                id: cliente.id,
                nome: cliente.nome,
                email: cliente.email,
                telefone: cliente.telefone
            }
        });

    } catch (erro) {
        console.error(erro);

        res.status(500).json({
            erro: "Erro ao realizar login."
        });
    }
});

// ==========================================
// CONSULTAR MESAS
// ==========================================

app.get("/api/mesas", async (req, res) => {
    try {
        // Libera mesas de reservas vencidas por No-Show.
        await atualizarNoShows();

        const resultado = await pool.query(`
            SELECT
                m.numero,
                CASE
                    WHEN r.id IS NULL THEN 'Livre'
                    ELSE 'Ocupada'
                END AS status
            FROM mesas m
            LEFT JOIN reservas r
                ON r.mesa_numero = m.numero
                AND r.status IN (
                    'Pendente',
                    'Paga',
                    'Check-in realizado'
                )
            ORDER BY m.numero
        `);

        res.json(resultado.rows);

    } catch (erro) {
        console.error(erro);

        res.status(500).json({
            erro: "Erro ao consultar as mesas."
        });
    }
});

// ==========================================
// CONSULTAR RESERVAS DO CLIENTE LOGADO
// ==========================================

app.get("/api/reservas", autenticarToken, async (req, res) => {
    try {
        await atualizarNoShows(pool, req.cliente.id);

        const resultado = await pool.query(
            `SELECT
                id,
                codigo,
                mesa_numero,
                data_reserva,
                status,
                checkin,
                criado_em,
                pago_em,
                checkin_em,
                reembolso,
                percentual_reembolso,
                valor_retido,
                percentual_retido,
                cancelada_em,
                motivo
             FROM reservas
             WHERE cliente_id = $1
             ORDER BY data_reserva DESC`,
            [req.cliente.id]
        );

        res.json(resultado.rows);

    } catch (erro) {
        console.error(erro);

        res.status(500).json({
            erro: "Erro ao consultar suas reservas."
        });
    }
});

// ==========================================
// CRIAR RESERVA
// ==========================================

app.post("/api/reservas", autenticarToken, async (req, res) => {
    try {
        const { mesa_numero, data_reserva } = req.body;

        const numeroMesa = Number(mesa_numero);

        if (!Number.isInteger(numeroMesa) ||
            numeroMesa < 1 ||
            numeroMesa > 10) {
            return res.status(400).json({
                erro: "Selecione uma mesa válida."
            });
        }

        if (!data_reserva) {
            return res.status(400).json({
                erro: "Informe a data e o horário da reserva."
            });
        }

        const data = new Date(data_reserva);

        if (Number.isNaN(data.getTime())) {
            return res.status(400).json({
                erro: "Informe uma data válida."
            });
        }

        if (data.getTime() <= Date.now()) {
            return res.status(400).json({
                erro: "A reserva precisa ser para uma data futura."
            });
        }

        const codigo = "CAN" +
            crypto.randomBytes(4).toString("hex").toUpperCase();

        const resultado = await pool.query(
            `INSERT INTO reservas
            (codigo, cliente_id, mesa_numero, data_reserva, status)
            VALUES ($1, $2, $3, $4, 'Pendente')
            RETURNING
                id,
                codigo,
                mesa_numero,
                data_reserva,
                status`,
            [
                codigo,
                req.cliente.id,
                numeroMesa,
                data.toISOString()
            ]
        );

        res.status(201).json({
            mensagem: "Reserva realizada com sucesso!",
            reserva: resultado.rows[0]
        });

    } catch (erro) {
        if (erro.code === "23505") {
            return res.status(409).json({
                erro: "Esta mesa ou este cliente já possui uma reserva ativa."
            });
        }

        console.error(erro);

        res.status(500).json({
            erro: "Erro ao realizar reserva."
        });
    }
});

// ==========================================
// CONFIRMAR PAGAMENTO
// CAUÇÃO DEMONSTRATIVA DE R$ 30,00
// ==========================================

app.post("/api/pagamentos", autenticarToken, async (req, res) => {
    let conexao;
    let transacaoIniciada = false;

    try {
        conexao = await pool.connect();

        const { codigo } = req.body;

        if (!codigo) {
            return res.status(400).json({
                erro: "Informe o código da reserva."
            });
        }

        await conexao.query("BEGIN");
        transacaoIniciada = true;

        const resultado = await conexao.query(
            `SELECT id, status
             FROM reservas
             WHERE codigo = $1
             AND cliente_id = $2
             FOR UPDATE`,
            [codigo, req.cliente.id]
        );

        if (resultado.rows.length === 0) {
            await conexao.query("ROLLBACK");
            transacaoIniciada = false;

            return res.status(404).json({
                erro: "Reserva não encontrada."
            });
        }

        const reserva = resultado.rows[0];

        if (reserva.status !== "Pendente") {
            await conexao.query("ROLLBACK");
            transacaoIniciada = false;

            return res.status(400).json({
                erro: "Esta reserva não está pendente de pagamento."
            });
        }

        await conexao.query(
            `INSERT INTO pagamentos
            (reserva_id, valor, forma_pagamento, status)
            VALUES ($1, $2, $3, $4)`,
            [
                reserva.id,
                30.00,
                "PIX_DEMO",
                "CONFIRMADO_SIMULADO"
            ]
        );

        await conexao.query(
            `UPDATE reservas
             SET status = 'Paga',
                 pago_em = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [reserva.id]
        );

        await conexao.query("COMMIT");
        transacaoIniciada = false;

        res.json({
            mensagem: "Caução demonstrativa de R$ 30,00 confirmada com sucesso!"
        });

    } catch (erro) {
        if (conexao && transacaoIniciada) {
            await conexao.query("ROLLBACK");
        }

        console.error(erro);

        res.status(500).json({
            erro: "Erro ao confirmar pagamento."
        });

    } finally {
        if (conexao) {
            conexao.release();
        }
    }
});

// ==========================================
// REALIZAR CHECK-IN
// POSTGRESQL
// ==========================================

app.post("/api/checkin", autenticarToken, async (req, res) => {
    let conexao;
    let transacaoIniciada = false;

    try {
        conexao = await pool.connect();

        const codigo = String(req.body.codigo || "")
            .trim()
            .toUpperCase();

        if (!codigo) {
            return res.status(400).json({
                erro: "Informe o código da reserva."
            });
        }

        await conexao.query("BEGIN");
        transacaoIniciada = true;

        // Atualiza primeiro os No-Shows vencidos deste cliente.
        await atualizarNoShows(conexao, req.cliente.id);

        const resultado = await conexao.query(
            `SELECT id, codigo, status, checkin
             FROM reservas
             WHERE codigo = $1
             AND cliente_id = $2
             FOR UPDATE`,
            [codigo, req.cliente.id]
        );

        if (resultado.rows.length === 0) {
            await conexao.query("ROLLBACK");
            transacaoIniciada = false;

            return res.status(404).json({
                erro: "Código de reserva não encontrado."
            });
        }

        const reserva = resultado.rows[0];

        if (reserva.status === "Cancelada por No-Show") {
            await conexao.query("COMMIT");
            transacaoIniciada = false;

            return res.status(400).json({
                erro: "O prazo para check-in terminou. A reserva foi cancelada por No-Show."
            });
        }

        if (reserva.status !== "Paga") {
            await conexao.query("ROLLBACK");
            transacaoIniciada = false;

            return res.status(400).json({
                erro: "A reserva precisa estar paga para realizar o check-in."
            });
        }

        if (reserva.checkin) {
            await conexao.query("ROLLBACK");
            transacaoIniciada = false;

            return res.status(400).json({
                erro: "O check-in desta reserva já foi realizado."
            });
        }

        await conexao.query(
            `UPDATE reservas
             SET checkin = TRUE,
                 status = 'Check-in realizado',
                 checkin_em = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [reserva.id]
        );

        await conexao.query("COMMIT");
        transacaoIniciada = false;

        res.json({
            mensagem: "Check-in realizado com sucesso!"
        });

    } catch (erro) {
        if (conexao && transacaoIniciada) {
            await conexao.query("ROLLBACK");
        }

        console.error(erro);

        res.status(500).json({
            erro: "Erro ao realizar check-in."
        });

    } finally {
        if (conexao) {
            conexao.release();
        }
    }
});

// ==========================================
// PÁGINAS INEXISTENTES
// ==========================================

// ==========================================
// LISTA DE ESPERA - POSTGRESQL
// ==========================================

// CONSULTAR LISTA DE ESPERA
app.get("/api/lista-espera", autenticarToken, async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                c.nome,
                e.entrou_em
            FROM lista_espera e
            INNER JOIN clientes c
                ON c.id = e.cliente_id
            ORDER BY e.entrou_em ASC
        `);

        res.json(resultado.rows);

    } catch (erro) {
        console.error("Erro ao consultar lista de espera:", erro);

        res.status(500).json({
            erro: "Erro ao consultar a lista de espera."
        });
    }
});

// ADICIONAR CLIENTE À LISTA DE ESPERA
app.post("/api/lista-espera", autenticarToken, async (req, res) => {
    try {
        const email = String(req.body.email || "")
            .trim()
            .toLowerCase();

        if (!email) {
            return res.status(400).json({
                erro: "Informe o e-mail."
            });
        }

        // Confere se o e-mail pertence à conta conectada.
        const cliente = await pool.query(
            `SELECT id, email
             FROM clientes
             WHERE id = $1`,
            [req.cliente.id]
        );

        if (cliente.rows.length === 0) {
            return res.status(404).json({
                erro: "Cliente não encontrado."
            });
        }

        if (cliente.rows[0].email.toLowerCase() !== email) {
            return res.status(403).json({
                erro: "Informe o e-mail da conta que está conectada."
            });
        }

        const resultado = await pool.query(
            `INSERT INTO lista_espera (cliente_id)
             VALUES ($1)
             ON CONFLICT (cliente_id) DO NOTHING
             RETURNING id`,
            [req.cliente.id]
        );

        if (resultado.rows.length === 0) {
            return res.status(409).json({
                erro: "Este cliente já está na lista de espera."
            });
        }

        res.status(201).json({
            mensagem: "Cliente adicionado à lista de espera!"
        });

    } catch (erro) {
        console.error("Erro ao adicionar à lista de espera:", erro);

        res.status(500).json({
            erro: "Erro ao adicionar cliente à lista de espera."
        });
    }
});

app.use((req, res) => {
    res.status(404).send("Página não encontrada.");
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor funcionando na porta ${PORT}`);
});
