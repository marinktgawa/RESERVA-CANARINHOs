
require("dotenv").config();

const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const path = require("path");
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

// Testar o servidor e o banco
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

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
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

// Rota para páginas inexistentes
app.use((req, res) => {
    res.status(404).send("Página não encontrada.");
});

// Iniciar servidor
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor funcionando na porta ${PORT}`);
});
