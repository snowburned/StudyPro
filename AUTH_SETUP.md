# Autenticação do StudyPro — como configurar no Vercel

O app agora tem cadastro, login, logout e sessão persistente de verdade,
usando **Vercel Serverless Functions** + **Postgres** + **bcrypt** (via
`bcryptjs`) para o hash da senha. Nenhuma senha é salva em texto puro em
lugar nenhum.

## O que foi adicionado
- `api/auth/signup.js` — cria conta (nome, e-mail, senha)
- `api/auth/login.js` — autentica e abre sessão
- `api/auth/logout.js` — encerra a sessão
- `api/auth/me.js` — retorna o usuário logado (usado para proteger a "rota" do app)
- `lib/db.js` / `lib/auth.js` — helpers de banco e de sessão (JWT em cookie `httpOnly`)
- `schema.sql` — tabela `users` (criada automaticamente também, se preferir não rodar na mão)
- `app.js` — tela de login agora é um formulário real de e-mail/senha (com cadastro), e todo o progresso salvo localmente passou a ser isolado por usuário

## Passo a passo no Vercel

1. **Suba estes arquivos** para o seu repositório (mantendo a estrutura de pastas: `api/auth/*.js` e `lib/*.js` na raiz do projeto, do lado de `index.html`).

2. **Crie um banco Postgres**: no dashboard do projeto → aba **Storage** → **Create Database** → Postgres (roda em cima do Neon). Ao conectar, o Vercel injeta automaticamente a variável `POSTGRES_URL` (e afins) no projeto.

3. **Defina o segredo de sessão**: em **Project Settings → Environment Variables**, adicione:
   - `JWT_SECRET` → um valor aleatório e longo, ex: gere com `openssl rand -base64 48`

4. **Instale as dependências** (o Vercel faz isso automaticamente no build a partir do `package.json`, mas localmente):
   ```bash
   npm install
   ```

5. **Rodar localmente** (opcional, para testar antes do deploy):
   ```bash
   vercel env pull   # baixa as env vars do projeto para .env.local
   vercel dev
   ```

6. **Deploy**: `git push` (se o projeto já está conectado ao Vercel) ou `vercel --prod`.

A tabela `users` é criada automaticamente (`CREATE TABLE IF NOT EXISTS`) na
primeira chamada de qualquer rota `/api/auth/*`. Se preferir, rode
`schema.sql` manualmente no console do banco antes disso.

## Limitações importantes (seja honesto sobre isso com quem for usar)
- A sessão dura 30 dias e fica em um cookie `httpOnly` + `Secure` — só funciona em `https` (o Vercel já serve tudo em https por padrão).
- O progresso de estudo (matérias/módulos concluídos) continua em `localStorage`, agora separado por conta (`id` do usuário). Se quiser esse progresso sincronizado entre dispositivos, ele precisaria migrar para o banco também — hoje só a conta (nome/e-mail/senha) é 100% no servidor.
- Não há verificação de e-mail nem "esqueci minha senha" implementados — dá pra adicionar depois se precisar.
