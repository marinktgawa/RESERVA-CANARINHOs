
require("dotenv").config();

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
const crypto = require("crypto");
const pool = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

// Verificar configurações obrigatórias
if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    console.error("ERRO: Configure DATABASE_URL e JWT_SECRET no .env");
    process.exit(1);
}

// Configurações do servidor
app.use(express.json());

app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));

// Páginas do site
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

// AUTENTICAÇÃO
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

// TESTAR SERVIDOR E BANCO
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

// CADASTRO DE CLIENTES
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

// LOGIN DE CLIENTES
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
            token: token,
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

// CONSULTAR MESAS
app.get("/api/mesas", async (req, res) => {
    try {
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

// CONSULTAR RESERVAS DO CLIENTE LOGADO
app.get("/api/reservas", autenticarToken, async (req, res) => {
    try {
        const resultado = await pool.query(
            `SELECT
                id,
                codigo,
                mesa_numero,
                data_reserva,
                status,
                checkin,
                reembolso,
                valor_retido
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

// CRIAR RESERVA
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

// ROTA PARA PÁGINAS INEXISTENTES
app.use((req, res) => {
    res.status(404).send("Página não encontrada.");
});

// INICIAR SERVIDOR
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor funcionando na porta ${PORT}`);
});
