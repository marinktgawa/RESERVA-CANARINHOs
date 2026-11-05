require("dotenv").config();

const pool = require("./database");

async function testarConexao() {
    try {
        const resultado = await pool.query("SELECT NOW()");

        console.log("Conexao realizada com sucesso!");
        console.log("Data do servidor:", resultado.rows[0]);

    } catch (erro) {
        console.log("Erro ao conectar:");
        console.log(erro.message);

    } finally {
        await pool.end();
    }
}

testarConexao();