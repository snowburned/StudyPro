// api/auth/login.js
const bcrypt = require("bcryptjs");
const { sql, ensureUsersTable } = require("../../lib/db");
const { signSession, setSessionCookie } = require("../../lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  try {
    await ensureUsersTable();

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const email = (body.email || "").toString().trim().toLowerCase();
    const password = (body.password || "").toString();

    if (!email || !password) {
      res.status(400).json({ error: "Informe e-mail e senha." });
      return;
    }

    const result = await sql`
      SELECT id, name, email, password_hash, avatar_color
      FROM users WHERE email = ${email}
    `;
    const user = result.rows[0];

    // Mensagem genérica de propósito — não revela se o e-mail existe ou não.
    const invalidMsg = "E-mail ou senha inválidos.";

    if (!user) {
      res.status(401).json({ error: invalidMsg });
      return;
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      res.status(401).json({ error: invalidMsg });
      return;
    }

    const token = signSession({ uid: user.id });
    setSessionCookie(res, token);

    res.status(200).json({
      user: { id: user.id, name: user.name, email: user.email, color: user.avatar_color },
    });
  } catch (err) {
    console.error("login error:", err);
    res.status(500).json({ error: "Erro interno ao entrar." });
  }
};
