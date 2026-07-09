// lib/auth.js
// Sessão via cookie httpOnly assinado com JWT. O token só guarda o id do
// usuário; os dados reais (nome, cor, e-mail) sempre são buscados no banco
// em /api/auth/me, então revogar acesso é só invalidar o cookie/segredo.
const jwt = require("jsonwebtoken");

const COOKIE_NAME = "studypro_session";
const SESSION_DAYS = 30;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET não configurado. Defina essa variável de ambiente no projeto Vercel."
    );
  }
  return secret;
}

function signSession(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: `${SESSION_DAYS}d` });
}

function verifySession(token) {
  try {
    return jwt.verify(token, getSecret());
  } catch (e) {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers && req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = decodeURIComponent(pair.slice(idx + 1).trim());
    out[key] = val;
  });
  return out;
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  );
}

// Retorna o payload da sessão ({ uid }) ou null se não houver sessão válida.
function getSession(req) {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  return verifySession(token);
}

// Helper para proteger uma rota de API: chama `handler(req, res, session)`
// só se houver sessão válida; caso contrário responde 401.
function requireAuth(handler) {
  return async (req, res) => {
    const session = getSession(req);
    if (!session) {
      res.status(401).json({ error: "Não autenticado." });
      return;
    }
    return handler(req, res, session);
  };
}

module.exports = {
  signSession,
  verifySession,
  getSession,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
};
