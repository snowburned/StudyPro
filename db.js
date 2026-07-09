// lib/db.js
// Conexão com o Postgres do Vercel (Storage > Postgres, integração Neon).
// A variável de ambiente POSTGRES_URL é injetada automaticamente pelo Vercel
// quando você cria/conecta o banco no dashboard do projeto.
const { sql } = require("@vercel/postgres");

let schemaReady = false;

// Garante que a tabela de usuários existe (idempotente).
// Também dá para rodar schema.sql manualmente no console do banco, se preferir.
async function ensureUsersTable() {
  if (schemaReady) return;
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      avatar_color TEXT NOT NULL DEFAULT '#7C3AED',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  schemaReady = true;
}

module.exports = { sql, ensureUsersTable };
