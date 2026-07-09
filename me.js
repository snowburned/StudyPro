// api/auth/me.js
// Usado no carregamento do app para saber se existe uma sessão válida.
// Toda "rota privada" do front-end deve checar isso antes de renderizar
// dados do usuário; endpoints de API que exponham dados do usuário devem
// usar requireAuth() de lib/auth.js, como feito aqui.
const { sql, ensureUsersTable } = require("../../lib/db");
const { requireAuth } = require("../../lib/auth");

module.exports = requireAuth(async (req, res, session) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Método não permitido." });
    return;
  }

  try {
    await ensureUsersTable();
    const result = await sql`
      SELECT id, name, email, avatar_color FROM users WHERE id = ${session.uid}
    `;
    const user = result.rows[0];
    if (!user) {
      res.status(401).json({ error: "Sessão inválida." });
      return;
    }
    res.status(200).json({
      user: { id: user.id, name: user.name, email: user.email, color: user.avatar_color },
    });
  } catch (err) {
    console.error("me error:", err);
    res.status(500).json({ error: "Erro interno." });
  }
});
