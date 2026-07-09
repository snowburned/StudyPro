// api/auth/signup.js
const bcrypt = require("bcryptjs");
const { sql, ensureUsersTable } = require("../../lib/db");
const { signSession, setSessionCookie } = require("../../lib/auth");

const AVATAR_COLORS = [
  "#7C3AED", "#A855F7", "#22C55E", "#F59E0B",
  "#EC4899", "#3B82F6", "#EF4444", "#14B8A6",
];

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  try {
    await ensureUsersTable();

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const name = (body.name || "").toString().trim();
    const email = (body.email || "").toString().trim().toLowerCase();
    const password = (body.password || "").toString();
    const color = AVATAR_COLORS.includes(body.color) ? body.color : AVATAR_COLORS[0];

    if (!name || name.length > 60) {
      res.status(400).json({ error: "Informe um nome válido." });
      return;
    }
    if (!isValidEmail(email)) {
      res.status(400).json({ error: "Informe um e-mail válido." });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "A senha deve ter pelo menos 8 caracteres." });
      return;
    }

    const existing = await sql`SELECT id FROM users WHERE email = ${email}`;
    if (existing.rows.length > 0) {
      res.status(409).json({ error: "Já existe uma conta com este e-mail." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await sql`
      INSERT INTO users (name, email, password_hash, avatar_color)
      VALUES (${name}, ${email}, ${passwordHash}, ${color})
      RETURNING id, name, email, avatar_color, created_at
    `;
    const user = result.rows[0];

    const token = signSession({ uid: user.id });
    setSessionCookie(res, token);

    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email, color: user.avatar_color },
    });
  } catch (err) {
    console.error("signup error:", err);
    res.status(500).json({ error: "Erro interno ao criar a conta." });
  }
};
