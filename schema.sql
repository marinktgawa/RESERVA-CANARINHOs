CREATE TABLE IF NOT EXISTS clientes (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    email VARCHAR(150) NOT NULL,
    telefone VARCHAR(20) NOT NULL,
    senha_hash TEXT NOT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clientes_email
ON clientes (LOWER(email));


CREATE TABLE IF NOT EXISTS mesas (
    numero INTEGER PRIMARY KEY,
    status VARCHAR(20) DEFAULT 'Livre'
);

INSERT INTO mesas (numero)
SELECT generate_series(1, 10)
ON CONFLICT (numero) DO NOTHING;


CREATE TABLE IF NOT EXISTS reservas (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id),
    mesa_numero INTEGER NOT NULL REFERENCES mesas(numero),
    data_reserva TIMESTAMP NOT NULL,
    status VARCHAR(40) DEFAULT 'Pendente',
    checkin BOOLEAN DEFAULT FALSE,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    pago_em TIMESTAMP,
    checkin_em TIMESTAMP,
    reembolso NUMERIC(10,2) DEFAULT 0,
    percentual_reembolso NUMERIC(5,2) DEFAULT 0,
    valor_retido NUMERIC(10,2) DEFAULT 0,
    percentual_retido NUMERIC(5,2) DEFAULT 0,
    cancelada_em TIMESTAMP,
    motivo TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reserva_mesa_ativa
ON reservas (mesa_numero)
WHERE status IN ('Pendente', 'Paga', 'Check-in realizado');

CREATE UNIQUE INDEX IF NOT EXISTS idx_reserva_cliente_ativa
ON reservas (cliente_id)
WHERE status IN ('Pendente', 'Paga', 'Check-in realizado');


CREATE TABLE IF NOT EXISTS pagamentos (
    id SERIAL PRIMARY KEY,
    reserva_id INTEGER NOT NULL UNIQUE REFERENCES reservas(id),
    valor NUMERIC(10,2) NOT NULL DEFAULT 30.00,
    forma_pagamento VARCHAR(30) DEFAULT 'PIX_DEMO',
    status VARCHAR(40) DEFAULT 'CONFIRMADO_SIMULADO',
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS lista_espera (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL UNIQUE REFERENCES clientes(id),
    entrou_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
