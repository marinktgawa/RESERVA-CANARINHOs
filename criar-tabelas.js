
require("dotenv").config();

const fs = require("fs");
const pool = require("./database");

async function criarTabelas() {
    try {
        const path = require("path");
const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
        await pool.query(sql);

        console.log("Tabelas criadas com sucesso!");
        console.log("As 10 mesas também foram cadastradas.");

    } catch (erro) {
        console.log("Erro ao criar as tabelas:");
        console.log(erro.message);

    } finally {
        await pool.end();
    }
}

criarTabelas();
