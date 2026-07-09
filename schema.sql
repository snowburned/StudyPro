-- Rode isso no console do seu banco Postgres (Vercel Storage) se preferir
-- criar a tabela manualmente. As rotas de API também criam essa tabela
-- automaticamente na primeira chamada (CREATE TABLE IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#7C3AED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
