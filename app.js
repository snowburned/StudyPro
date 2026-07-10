/* ==========================================================================
   StudyPro — Melhore o seu estudo
   Aplicação de organização de estudos para o ENEM
   Vanilla JS + TailwindCSS (CDN) + Chart.js (CDN) + Lucide Icons (CDN)
   ========================================================================== */

(function () {
  "use strict";

  /* ---------------------------- Constantes ------------------------------ */
  // Login/cadastro aqui é só de fachada (front-end): os dados ficam salvos
  // no localStorage do navegador, sem servidor, sem banco de dados e sem
  // verificação real de senha. Serve para o layout/fluxo da tela, não é uma
  // autenticação de verdade.
  const LS_SUBJECTS = "studypro_subjects_v1";
  const LS_STREAK = "studypro_streak_v1";
  const LS_UI = "studypro_ui_v1";
  const LS_LAST_ACCESS = "studypro_last_access_v1";
  const LS_USER = "studypro_user_v1";

  const AVATAR_COLORS = ["#7C3AED", "#A855F7", "#22C55E", "#F59E0B", "#EC4899", "#3B82F6", "#EF4444", "#14B8A6"];

  const SUBJECT_ICONS = {
    "Sigma": "sigma", "Atom": "atom", "FlaskConical": "flask-conical", "Dna": "dna",
    "Landmark": "landmark", "Globe": "globe", "BrainCircuit": "brain-circuit",
    "Users": "users", "BookOpenText": "book-open-text", "PenLine": "pen-line"
  };

  /* ------------------------------- Estado -------------------------------- */
  const state = {
    subjects: [],
    view: "dashboard",
    search: "",
    filter: "all", // all | completed | pending | favorites
    expanded: new Set(),
    charts: { pie: null, bar: null },
    sidebarOpen: false,
    deferredInstallPrompt: null,
    user: null,
  };

  /* ----------------------------- Utilidades ------------------------------ */
  function todayISO() {
    const d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function addDaysISO(iso, delta) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + delta);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function normalize(str) {
    return (str || "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  }

  function escapeHtml(str) {
    return (str || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function highlight(text, query) {
    const safe = escapeHtml(text);
    if (!query) return safe;
    const nText = normalize(text);
    const nQuery = normalize(query);
    const idx = nText.indexOf(nQuery);
    if (idx === -1) return safe;
    return safe.slice(0, idx) + "<mark>" + safe.slice(idx, idx + query.length) + "</mark>" + safe.slice(idx + query.length);
  }

  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function toast(message, kind) {
    const wrap = document.getElementById("toast-wrap");
    const el = document.createElement("div");
    el.className = "toast glass-solid rounded-xl px-4 py-3 text-sm font-medium shadow-2xl flex items-center gap-2 " +
      (kind === "error" ? "text-red-300 border-red-500/30" : kind === "success" ? "text-emerald-300" : "text-zinc-100");
    el.innerHTML = `<i data-lucide="${kind === "error" ? "alert-circle" : kind === "success" ? "check-circle-2" : "info"}" class="w-4 h-4"></i><span>${escapeHtml(message)}</span>`;
    wrap.appendChild(el);
    if (window.lucide) lucide.createIcons();
    setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(8px)"; el.style.transition = "all .3s ease"; setTimeout(() => el.remove(), 320); }, 2600);
  }

  /* --------------------------- Autenticação (fake / só front-end) ----------------------------- */
  // Não existe backend nem verificação real de senha aqui. O cadastro só
  // guarda nome, e-mail e cor no localStorage; a senha digitada nunca é
  // salva em lugar nenhum, e o "login" apenas confere se o e-mail bate com
  // o perfil salvo neste mesmo navegador. É só para dar o fluxo/layout de
  // login e cadastro — não protege nada de verdade.
  function loadUser() {
    try {
      const raw = localStorage.getItem(LS_USER);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* noop */ }
    return null;
  }

  function saveUser(user) {
    try { localStorage.setItem(LS_USER, JSON.stringify(user)); }
    catch (e) { console.warn("Falha ao salvar perfil:", e); }
  }

  // Simula um cadastro: cria o perfil local. Não guarda a senha.
  function signup({ name, email, color }) {
    const user = { id: "local", name, email, color, createdAt: new Date().toISOString() };
    saveUser(user);
    return Promise.resolve(user);
  }

  // Simula um login: só confere se já existe um perfil salvo com esse e-mail
  // neste navegador. Não valida a senha de verdade.
  function login({ email }) {
    const existing = loadUser();
    if (existing && existing.email.toLowerCase() === email.toLowerCase()) {
      return Promise.resolve(existing);
    }
    return Promise.reject(new Error("Nenhuma conta encontrada com este e-mail neste navegador. Cadastre-se primeiro."));
  }

  function logoutUser() {
    state.user = null;
    state.view = "dashboard";
    document.getElementById("app").style.display = "none";
    renderLoginScreen();
    if (window.lucide) lucide.createIcons();
  }

  function initials(name) {
    const parts = (name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join("");
  }

  // Renderiza o avatar do usuário: foto (se tiver sido enviada) ou círculo
  // com iniciais na cor escolhida. `extraClass` permite variar o tamanho
  // (ex: "!w-24 !h-24 !text-2xl") reaproveitando o mesmo componente.
  function avatarHtml(user, extraClass) {
    const cls = extraClass || "";
    if (!user) return `<div class="avatar-circle ${cls}" style="background:#7C3AED">?</div>`;
    if (user.photo) {
      return `<div class="avatar-circle ${cls}" style="padding:0;overflow:hidden;background:${user.color}">
        <img src="${user.photo}" alt="Foto de perfil" class="w-full h-full object-cover rounded-full" />
      </div>`;
    }
    return `<div class="avatar-circle ${cls}" style="background:${user.color}">${initials(user.name)}</div>`;
  }

  // Lê um arquivo de imagem (PNG/JPG), recorta para quadrado centralizado e
  // redimensiona para `size`x`size`, devolvendo um data URL JPEG compacto —
  // assim a foto cabe tranquilamente no localStorage.
  function readImageAsAvatarDataUrl(file, size) {
    return new Promise((resolve, reject) => {
      if (!file) { reject(new Error("Nenhum arquivo selecionado.")); return; }
      if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
        reject(new Error("Envie um arquivo PNG ou JPG.")); return;
      }
      if (file.size > 5 * 1024 * 1024) {
        reject(new Error("Imagem muito grande (máx. 5MB).")); return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("Arquivo de imagem inválido."));
        img.onload = () => {
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          resolve(canvas.toDataURL("image/jpeg", 0.86));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* --------------------------- Persistência ------------------------------ */
  function loadSubjects() {
    try {
      const raw = localStorage.getItem(LS_SUBJECTS);
      if (raw) return JSON.parse(raw);
    } catch (e) { console.warn("Falha ao ler progresso salvo:", e); }
    return deepClone(ENEM_DEFAULT_DATA);
  }

  function saveSubjects() {
    try { localStorage.setItem(LS_SUBJECTS, JSON.stringify(state.subjects)); }
    catch (e) { console.warn("Falha ao salvar progresso:", e); toast("Não foi possível salvar o progresso.", "error"); }
  }

  function loadStreak() {
    try {
      const raw = localStorage.getItem(LS_STREAK);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* noop */ }
    return { dates: [] };
  }

  function saveStreak(s) { localStorage.setItem(LS_STREAK, JSON.stringify(s)); }

  function registerActivityToday() {
    const streak = loadStreak();
    const today = todayISO();
    if (!streak.dates.includes(today)) {
      streak.dates.push(today);
      saveStreak(streak);
    }
  }

  function computeStreak() {
    const streak = loadStreak();
    const set = new Set(streak.dates);
    let current = 0;
    let cursor = todayISO();
    if (!set.has(cursor)) {
      // permite manter a sequência se o último estudo foi ontem
      const yesterday = addDaysISO(cursor, -1);
      if (set.has(yesterday)) cursor = yesterday; else return { current: 0, longest: computeLongest(streak.dates) };
    }
    while (set.has(cursor)) { current++; cursor = addDaysISO(cursor, -1); }
    return { current, longest: computeLongest(streak.dates) };
  }

  function computeLongest(dates) {
    if (!dates.length) return 0;
    const sorted = [...new Set(dates)].sort();
    let longest = 1, run = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (addDaysISO(sorted[i - 1], 1) === sorted[i]) { run++; } else { run = 1; }
      longest = Math.max(longest, run);
    }
    return longest;
  }

  function loadUi() {
    try {
      const raw = localStorage.getItem(LS_UI);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.filter = parsed.filter || "all";
        state.expanded = new Set(parsed.expanded || []);
      }
    } catch (e) { /* noop */ }
  }

  function saveUi() {
    localStorage.setItem(LS_UI, JSON.stringify({ filter: state.filter, expanded: [...state.expanded] }));
  }

  /* ------------------------------ Cálculos -------------------------------- */
  function subjectStats(subject) {
    let total = 0, completed = 0;
    subject.modules.forEach((m) => m.contents.forEach((c) => { total++; if (c.completed) completed++; }));
    return { total, completed, pct: total ? Math.round((completed / total) * 100) : 0 };
  }

  function moduleStats(mod) {
    const total = mod.contents.length;
    const completed = mod.contents.filter((c) => c.completed).length;
    let triState = "none";
    if (completed === total && total > 0) triState = "all";
    else if (completed > 0) triState = "partial";
    return { total, completed, pct: total ? Math.round((completed / total) * 100) : 0, triState };
  }

  function globalStats() {
    let total = 0, completed = 0;
    state.subjects.forEach((s) => s.modules.forEach((m) => m.contents.forEach((c) => { total++; if (c.completed) completed++; })));
    return { total, completed, pending: total - completed, pct: total ? Math.round((completed / total) * 100) : 0 };
  }

  function subjectTriState(subject) {
    const st = subjectStats(subject);
    if (st.completed === 0) return "none";
    if (st.completed === st.total) return "all";
    return "partial";
  }

  function findSubject(id) { return state.subjects.find((s) => s.id === id); }
  function findModule(subjectId, moduleId) { const s = findSubject(subjectId); return s && s.modules.find((m) => m.id === moduleId); }
  function findContent(subjectId, moduleId, contentId) { const m = findModule(subjectId, moduleId); return m && m.contents.find((c) => c.id === contentId); }

  /* -------------------------------- Ícones --------------------------------- */
  function checkboxHtml(triOrBool, size) {
    const cls = triOrBool === true || triOrBool === "all" ? "checked" : triOrBool === "partial" ? "indeterminate" : "";
    const icon = triOrBool === "partial" ? '<i data-lucide="minus" class="w-3 h-3" style="color:#06110A"></i>' : '<i data-lucide="check" class="w-3 h-3" style="color:#06110A"></i>';
    return `<span class="check-box ${cls}" style="${size ? `width:${size}px;height:${size}px;` : ""}">${cls ? icon : ""}</span>`;
  }

  /* ------------------------------ Renderização ----------------------------- */

  /* ------------------------------ Tela de login / cadastro ------------------------------ */
  function renderLoginScreen() {
    let mode = "login"; // "login" | "signup"
    let selectedColor = AVATAR_COLORS[0];
    const root = document.getElementById("login-root");

    function render() {
      root.innerHTML = `
        <div class="login-shell fade-in">
          <div class="glass login-card rounded-3xl pop">
            <div class="flex flex-col items-center text-center mb-7">
              <img src="favicon.svg" alt="StudyPro" class="w-14 h-14 rounded-2xl mb-4" />
              <h1 class="text-xl font-extrabold brand-gradient-text">StudyPro</h1>
              <p class="text-xs text-zinc-500 mt-1">Melhore o seu estudo</p>
            </div>

            <div id="auth-error" class="hidden mb-4 text-xs text-red-300 bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2"></div>

            <form id="auth-form" autocomplete="on">
              ${mode === "signup" ? `
                <label class="text-xs font-semibold text-zinc-400 mb-2 block">Nome</label>
                <input id="auth-name" type="text" maxlength="60" placeholder="Seu nome"
                  class="input-search w-full rounded-xl px-4 py-3 text-sm mb-4" autocomplete="name" />
              ` : ""}

              <label class="text-xs font-semibold text-zinc-400 mb-2 block">E-mail</label>
              <input id="auth-email" type="email" placeholder="voce@exemplo.com"
                class="input-search w-full rounded-xl px-4 py-3 text-sm mb-4" autocomplete="email" />

              <label class="text-xs font-semibold text-zinc-400 mb-2 block">Senha</label>
              <input id="auth-password" type="password" placeholder="${mode === "signup" ? "Mínimo 8 caracteres" : "Sua senha"}"
                class="input-search w-full rounded-xl px-4 py-3 text-sm ${mode === "signup" ? "mb-5" : "mb-7"}"
                autocomplete="${mode === "signup" ? "new-password" : "current-password"}" />

              ${mode === "signup" ? `
                <label class="text-xs font-semibold text-zinc-400 mb-3 block">Escolha uma cor para seu avatar</label>
                <div id="avatar-swatches" class="flex items-center gap-3 mb-7 flex-wrap">
                  ${AVATAR_COLORS.map((c, i) => `
                    <div class="avatar-swatch ${c === selectedColor ? "selected" : ""}" data-color="${c}" style="background:${c}"></div>
                  `).join("")}
                </div>
              ` : ""}

              <button id="auth-submit" type="submit" class="btn-primary rounded-xl px-4 py-3 text-sm w-full flex items-center justify-center gap-2">
                <i data-lucide="${mode === "signup" ? "user-plus" : "arrow-right"}" class="w-4 h-4"></i>
                <span>${mode === "signup" ? "Criar conta" : "Entrar"}</span>
              </button>
            </form>

            <button id="auth-toggle-mode" class="text-[12px] text-zinc-400 hover:text-purple-300 text-center mt-5 w-full transition-colors">
              ${mode === "signup" ? "Já tem uma conta? <span class=\"text-purple-300 font-semibold\">Entrar</span>" : "Ainda não tem conta? <span class=\"text-purple-300 font-semibold\">Cadastre-se</span>"}
            </button>
            <p class="text-[11px] text-zinc-600 text-center mt-4">Seus dados ficam salvos apenas neste navegador.</p>
          </div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      bind();
    }

    function showError(msg) {
      const el = document.getElementById("auth-error");
      el.textContent = msg;
      el.classList.remove("hidden");
    }

    function setLoading(loading) {
      const btn = document.getElementById("auth-submit");
      btn.disabled = loading;
      btn.style.opacity = loading ? "0.6" : "1";
    }

    function bind() {
      const form = document.getElementById("auth-form");
      const toggleBtn = document.getElementById("auth-toggle-mode");
      const swatches = document.getElementById("avatar-swatches");

      if (swatches) {
        swatches.addEventListener("click", (e) => {
          const el = e.target.closest(".avatar-swatch");
          if (!el) return;
          selectedColor = el.getAttribute("data-color");
          [...swatches.children].forEach((c) => c.classList.remove("selected"));
          el.classList.add("selected");
        });
      }

      toggleBtn.addEventListener("click", () => {
        mode = mode === "signup" ? "login" : "signup";
        render();
      });

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("auth-email").value.trim();
        const password = document.getElementById("auth-password").value;

        if (!email || !password) { showError("Preencha e-mail e senha."); return; }

        setLoading(true);
        try {
          let user;
          if (mode === "signup") {
            const name = document.getElementById("auth-name").value.trim();
            if (!name) { showError("Informe seu nome."); setLoading(false); return; }
            if (password.length < 8) { showError("A senha deve ter pelo menos 8 caracteres."); setLoading(false); return; }
            user = await signup({ name, email, password, color: selectedColor });
            toast("Conta criada com sucesso!", "success");
          } else {
            user = await login({ email, password });
          }
          state.user = user;
          startApp();
        } catch (err) {
          showError(err.message || "Não foi possível concluir. Tente novamente.");
          setLoading(false);
        }
      });

      const emailInput = document.getElementById("auth-email");
      if (emailInput) emailInput.focus();
    }

    render();
  }

  function renderUserChip() {
    if (!state.user) return "";
    return `
      <div class="user-chip" data-view="profile" title="Ir para o perfil">
        ${avatarHtml(state.user)}
        <span class="hidden lg:inline text-sm font-medium text-zinc-200 max-w-[110px] truncate">${escapeHtml(state.user.name)}</span>
      </div>`;
  }

  function renderSidebar() {
    const items = [
      { id: "dashboard", label: "Dashboard", icon: "layout-dashboard" },
      { id: "subjects", label: "Matérias", icon: "book-open" },
      { id: "stats", label: "Estatísticas", icon: "bar-chart-3" },
      { id: "favorites", label: "Favoritos", icon: "star" },
      { id: "profile", label: "Perfil", icon: "user-circle" },
      { id: "settings", label: "Configurações", icon: "settings" },
    ];
    const html = `
      <div class="flex flex-col h-full">
        <div class="px-5 pt-6 pb-5 border-b border-white/5">
          <div class="flex items-center gap-3">
            <div class="icon-box"><img src="favicon.svg" alt="StudyPro" class="w-6 h-6" /></div>
            <div>
              <div class="text-lg font-extrabold tracking-tight brand-gradient-text leading-none">StudyPro</div>
              <div class="text-[11px] text-zinc-500 mt-1">Melhore o seu estudo</div>
            </div>
          </div>
        </div>
        <nav class="flex-1 px-3 py-5 space-y-1.5 overflow-y-auto">
          ${items.map((it) => `
            <div class="nav-item ${state.view === it.id ? "active" : ""}" data-view="${it.id}">
              <i data-lucide="${it.icon}" class="nav-icon"></i>
              <span>${it.label}</span>
            </div>
          `).join("")}
        </nav>
        <div class="px-4 py-4 border-t border-white/5">
          <div class="h-px w-full bg-gradient-to-r from-transparent via-purple-500/30 to-transparent mb-3"></div>
          <div class="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500" style="opacity:0.6">
            <i data-lucide="zap" class="w-3 h-3"></i>
            <span>Feito por Burn Studios</span>
          </div>
        </div>
      </div>`;
    document.getElementById("sidebar-content").innerHTML = html;
  }

  function updateHeaderProgress() {
    const g = globalStats();
    document.getElementById("header-pct-label").textContent = g.pct + "%";
    document.getElementById("header-progress-fill").style.width = g.pct + "%";
    document.getElementById("header-progress-sub").textContent = `${g.completed}/${g.total} concluídos`;
  }

  function renderHeaderStatic() {
    document.getElementById("header").innerHTML = `
      <div class="flex items-center gap-3 flex-1 min-w-0">
        <button id="btn-open-sidebar" class="lg:hidden btn-ghost rounded-lg p-2"><i data-lucide="menu" class="w-5 h-5"></i></button>
        <div class="hidden md:block">
          <h1 class="text-lg font-bold tracking-tight">ENEM <span class="brand-gradient-text">Tracker</span></h1>
        </div>
        <div class="flex-1 max-w-md relative ml-1 md:ml-6">
          <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500"></i>
          <input id="global-search" type="text" placeholder="Buscar matérias, módulos ou conteúdos..."
            class="input-search w-full rounded-xl pl-9 pr-8 py-2.5 text-sm" autocomplete="off" />
          <button id="btn-clear-search" class="hidden absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
            <i data-lucide="x" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
      <div class="hidden sm:flex items-center gap-3 pl-4">
        <div class="w-40 lg:w-56">
          <div class="flex items-center justify-between mb-1">
            <span id="header-progress-sub" class="text-[11px] text-zinc-500">0/0 concluídos</span>
            <span id="header-pct-label" class="text-xs font-bold brand-gradient-text">0%</span>
          </div>
          <div class="progress-track progress-track-sm">
            <div id="header-progress-fill" class="progress-fill" style="width:0%"></div>
          </div>
        </div>
      </div>
      <div id="header-user-chip" class="pl-3 flex-shrink-0">${renderUserChip()}</div>
    `;
    updateHeaderProgress();
  }

  function refreshHeaderUserChip() {
    const el = document.getElementById("header-user-chip");
    if (el) el.innerHTML = renderUserChip();
    if (window.lucide) lucide.createIcons();
  }

  function renderMainContent() {
    const map = { dashboard: renderDashboard, subjects: renderSubjectsView, stats: renderStats, favorites: renderFavorites, profile: renderProfile, settings: renderSettings };
    (map[state.view] || renderDashboard)();
    if (window.lucide) lucide.createIcons();
  }

  /* --------------------------------- Dashboard -------------------------------- */
  function renderDashboard() {
    const g = globalStats();
    const streak = computeStreak();
    const cards = [
      { label: "Total de conteúdos", value: g.total, icon: "layers", accent: "from-purple-600/30 to-indigo-600/10" },
      { label: "Concluídos", value: g.completed, icon: "check-circle-2", accent: "from-emerald-600/25 to-emerald-900/5" },
      { label: "Pendentes", value: g.pending, icon: "circle-dashed", accent: "from-zinc-600/20 to-zinc-900/5" },
      { label: "Progresso geral", value: g.pct + "%", icon: "trending-up", accent: "from-fuchsia-600/25 to-purple-900/10" },
    ];

    const subjectRows = state.subjects.map((s) => {
      const st = subjectStats(s);
      return `
        <div class="flex items-center gap-4 py-3 border-b border-white/5 last:border-0 cursor-pointer group" data-goto-subject="${s.id}">
          <div class="icon-box !w-9 !h-9"><i data-lucide="${SUBJECT_ICONS[s.icon] || "book"}" class="w-4 h-4 text-purple-300"></i></div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between mb-1.5">
              <span class="text-sm font-semibold truncate group-hover:text-purple-300 transition-colors">${escapeHtml(s.name)}</span>
              <span class="text-xs text-zinc-500 ml-2 flex-shrink-0">${st.completed}/${st.total}</span>
            </div>
            <div class="progress-track progress-track-sm"><div class="progress-fill" style="width:${st.pct}%"></div></div>
          </div>
          <span class="text-xs font-bold text-zinc-400 w-9 text-right">${st.pct}%</span>
        </div>`;
    }).join("");

    document.getElementById("main-content").innerHTML = `
      <div class="fade-in">
        <div class="mb-6">
          <h2 class="text-2xl font-extrabold tracking-tight">Olá, ${escapeHtml(state.user ? state.user.name : "estudante")} 👋</h2>
          <p class="text-sm text-zinc-500 mt-1">Acompanhe seu progresso rumo ao ENEM.</p>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger">
          ${cards.map((c, i) => `
            <div class="glass glass-hover rounded-2xl p-5 bg-gradient-to-br ${c.accent}" style="animation-delay:${i * 60}ms">
              <div class="flex items-center justify-between mb-4">
                <div class="icon-box"><i data-lucide="${c.icon}" class="w-4 h-4 text-purple-300"></i></div>
              </div>
              <div class="text-2xl font-extrabold">${c.value}</div>
              <div class="text-xs text-zinc-500 mt-1">${c.label}</div>
            </div>
          `).join("")}
        </div>

        <div class="grid lg:grid-cols-3 gap-5">
          <div class="lg:col-span-2 glass rounded-2xl p-5">
            <div class="flex items-center justify-between mb-2">
              <h3 class="font-bold text-sm">Progresso por matéria</h3>
              <span class="badge">${state.subjects.length} matérias</span>
            </div>
            <div>${subjectRows}</div>
          </div>

          <div class="space-y-5">
            <div class="glass glass-hover rounded-2xl p-5 text-center">
              <div class="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center mb-3" style="background:linear-gradient(135deg, rgba(251,191,36,0.25), rgba(251,146,60,0.1)); border:1px solid rgba(251,191,36,0.3)">
                <i data-lucide="flame" class="w-7 h-7 text-amber-400"></i>
              </div>
              <div class="text-3xl font-extrabold">${streak.current}</div>
              <div class="text-xs text-zinc-500 mt-1">dias seguidos estudando</div>
              <div class="text-[11px] text-zinc-600 mt-2">Recorde: ${streak.longest} dias</div>
            </div>
            <div class="glass rounded-2xl p-5">
              <h3 class="font-bold text-sm mb-3 flex items-center gap-2"><i data-lucide="sparkles" class="w-4 h-4 text-purple-300"></i>Dica</h3>
              <p class="text-xs text-zinc-400 leading-relaxed">Marque os conteúdos conforme for estudando — seu progresso é salvo automaticamente e sincronizado com os gráficos de estatísticas.</p>
              <button class="btn-primary rounded-xl px-4 py-2 text-xs mt-4 w-full" data-view="subjects">Ir para Matérias</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* -------------------------------- Matérias ---------------------------------- */
  function passesFilter(content) {
    if (state.filter === "completed") return content.completed;
    if (state.filter === "pending") return !content.completed;
    if (state.filter === "favorites") return content.favorite;
    return true;
  }

  function passesSearch(subject, mod, content) {
    if (!state.search) return true;
    const q = state.search;
    return normalize(subject.name).includes(normalize(q)) ||
      normalize(mod.name).includes(normalize(q)) ||
      normalize(content.name).includes(normalize(q));
  }

  function renderSubjectsView() {
    document.getElementById("main-content").innerHTML = `
      <div class="fade-in">
        <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-5">
          <div>
            <h2 class="text-2xl font-extrabold tracking-tight">Matérias</h2>
            <p class="text-sm text-zinc-500 mt-1">Organize seus estudos por matéria, módulo e conteúdo.</p>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <button class="btn-ghost rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-1.5" data-action="expand-all"><i data-lucide="chevrons-down" class="w-3.5 h-3.5"></i>Expandir tudo</button>
            <button class="btn-ghost rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-1.5" data-action="collapse-all"><i data-lucide="chevrons-up" class="w-3.5 h-3.5"></i>Recolher tudo</button>
          </div>
        </div>

        <div class="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
          ${[["all", "Todos"], ["completed", "Concluídos"], ["pending", "Pendentes"], ["favorites", "Favoritos"]].map(([k, l]) => `
            <div class="filter-chip ${state.filter === k ? "active" : ""}" data-filter="${k}">${l}</div>
          `).join("")}
        </div>

        <div id="subjects-results"></div>
      </div>
    `;
    renderSubjectsResults();
  }

  function renderSubjectsResults() {
    const container = document.getElementById("subjects-results");
    if (!container) return;

    const cardsHtml = state.subjects.map((subject) => {
      const modulesHtml = subject.modules.map((mod) => {
        const visibleContents = mod.contents.filter((c) => passesSearch(subject, mod, c) && passesFilter(c));
        if (!visibleContents.length) return "";
        const mSt = moduleStats(mod);
        const contentsHtml = visibleContents.map((c) => `
          <div class="flex items-center gap-3 py-2.5 pl-11 pr-2 rounded-lg hover:bg-white/[0.03] transition-colors group">
            <div data-toggle-content data-subject="${subject.id}" data-module="${mod.id}" data-content="${c.id}">
              ${checkboxHtml(c.completed)}
            </div>
            <span class="content-text text-sm flex-1 ${c.completed ? "done" : "text-zinc-300"}">${highlight(c.name, state.search)}</span>
            <div class="star-btn ${c.favorite ? "active" : ""}" data-toggle-favorite data-subject="${subject.id}" data-module="${mod.id}" data-content="${c.id}">
              <i data-lucide="star" class="w-4 h-4"></i>
            </div>
          </div>
        `).join("");

        return `
          <div class="mt-1">
            <div class="flex items-center gap-3 py-2 px-2 rounded-lg">
              <div data-toggle-module data-subject="${subject.id}" data-module="${mod.id}">
                ${checkboxHtml(mSt.triState)}
              </div>
              <span class="text-sm font-semibold text-zinc-200 flex-1">${highlight(mod.name, state.search)}</span>
              <span class="text-[11px] text-zinc-500">${mSt.completed}/${mSt.total}</span>
              <div class="w-16 hidden sm:block"><div class="progress-track progress-track-sm"><div class="progress-fill" style="width:${mSt.pct}%"></div></div></div>
              <span class="text-[11px] font-bold text-zinc-400 w-8 text-right">${mSt.pct}%</span>
            </div>
            <div>${contentsHtml}</div>
          </div>
        `;
      }).join("");

      if (!modulesHtml.trim()) return "";

      const sSt = subjectStats(subject);
      const isOpen = state.expanded.has(subject.id) || !!state.search;

      return `
        <div class="glass rounded-2xl overflow-hidden mb-4" id="subject-card-${subject.id}">
          <div class="flex items-center gap-3 p-4 cursor-pointer select-none" data-toggle-subject-accordion="${subject.id}">
            <div data-toggle-subject-check data-subject="${subject.id}" data-stop>
              ${checkboxHtml(subjectTriState(subject))}
            </div>
            <div class="icon-box"><i data-lucide="${SUBJECT_ICONS[subject.icon] || "book"}" class="w-4 h-4 text-purple-300"></i></div>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-[15px]">${highlight(subject.name, state.search)}</div>
              <div class="flex items-center gap-2 mt-1.5">
                <div class="progress-track progress-track-sm flex-1 max-w-[160px]"><div class="progress-fill" style="width:${sSt.pct}%"></div></div>
                <span class="text-[11px] text-zinc-500">${sSt.completed}/${sSt.total}</span>
              </div>
            </div>
            <span class="badge">${sSt.pct}%</span>
            <i data-lucide="chevron-down" class="chevron ${isOpen ? "open" : ""} w-5 h-5 text-zinc-500"></i>
          </div>
          <div class="accordion-body ${isOpen ? "open" : ""}">
            <div>
              <div class="px-4 pb-4 border-t border-white/5 pt-2">${modulesHtml}</div>
            </div>
          </div>
        </div>
      `;
    }).filter(Boolean).join("");

    container.innerHTML = cardsHtml || `
      <div class="glass rounded-2xl p-12 text-center">
        <i data-lucide="search-x" class="w-10 h-10 text-zinc-600 mx-auto mb-3"></i>
        <p class="text-zinc-400 font-medium">Nenhum resultado encontrado</p>
        <p class="text-xs text-zinc-600 mt-1">Tente ajustar sua busca ou filtro.</p>
      </div>`;
    if (window.lucide) lucide.createIcons();
  }

  /* -------------------------------- Estatísticas ------------------------------- */
  function renderStats() {
    const g = globalStats();
    const streak = computeStreak();
    const sorted = [...state.subjects].map((s) => ({ s, st: subjectStats(s) })).sort((a, b) => b.st.pct - a.st.pct);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    document.getElementById("main-content").innerHTML = `
      <div class="fade-in">
        <div class="mb-6">
          <h2 class="text-2xl font-extrabold tracking-tight">Estatísticas</h2>
          <p class="text-sm text-zinc-500 mt-1">Uma visão detalhada da sua jornada de estudos.</p>
        </div>

        <div class="grid lg:grid-cols-2 gap-5 mb-5">
          <div class="glass rounded-2xl p-5">
            <h3 class="font-bold text-sm mb-4">Concluído × Pendente</h3>
            <div class="h-64 flex items-center justify-center"><canvas id="chart-pie"></canvas></div>
          </div>
          <div class="glass rounded-2xl p-5">
            <h3 class="font-bold text-sm mb-4">Progresso por matéria</h3>
            <div class="h-64"><canvas id="chart-bar"></canvas></div>
          </div>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="glass glass-hover rounded-2xl p-5">
            <i data-lucide="check-check" class="w-5 h-5 text-emerald-400 mb-3"></i>
            <div class="text-2xl font-extrabold">${g.completed}</div>
            <div class="text-xs text-zinc-500 mt-1">Total estudado</div>
          </div>
          <div class="glass glass-hover rounded-2xl p-5">
            <i data-lucide="hourglass" class="w-5 h-5 text-zinc-400 mb-3"></i>
            <div class="text-2xl font-extrabold">${g.pending}</div>
            <div class="text-xs text-zinc-500 mt-1">Total restante</div>
          </div>
          <div class="glass glass-hover rounded-2xl p-5">
            <i data-lucide="trophy" class="w-5 h-5 text-amber-400 mb-3"></i>
            <div class="text-lg font-extrabold truncate">${best ? escapeHtml(best.s.name) : "—"}</div>
            <div class="text-xs text-zinc-500 mt-1">Maior matéria concluída (${best ? best.st.pct : 0}%)</div>
          </div>
          <div class="glass glass-hover rounded-2xl p-5">
            <i data-lucide="target" class="w-5 h-5 text-rose-400 mb-3"></i>
            <div class="text-lg font-extrabold truncate">${worst ? escapeHtml(worst.s.name) : "—"}</div>
            <div class="text-xs text-zinc-500 mt-1">Menor matéria concluída (${worst ? worst.st.pct : 0}%)</div>
          </div>
        </div>

        <div class="glass rounded-2xl p-5 mt-5 flex items-center gap-4">
          <div class="icon-box !w-12 !h-12"><i data-lucide="flame" class="w-6 h-6 text-amber-400"></i></div>
          <div>
            <div class="font-bold text-sm">Streak de estudos</div>
            <div class="text-xs text-zinc-500 mt-0.5">${streak.current} dias seguidos · recorde de ${streak.longest} dias</div>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    drawCharts(g, sorted);
  }

  function drawCharts(g, sorted) {
    if (!window.Chart) return;
    const purple = "#A855F7", purple2 = "#7C3AED", track = "rgba(255,255,255,0.06)";

    if (state.charts.pie) state.charts.pie.destroy();
    if (state.charts.bar) state.charts.bar.destroy();

    const pieCtx = document.getElementById("chart-pie");
    if (pieCtx) {
      state.charts.pie = new Chart(pieCtx, {
        type: "doughnut",
        data: {
          labels: ["Concluído", "Pendente"],
          datasets: [{ data: [g.completed, g.pending], backgroundColor: [purple, track], borderWidth: 0, hoverOffset: 6 }],
        },
        options: {
          cutout: "72%",
          plugins: { legend: { position: "bottom", labels: { color: "#A1A1AA", padding: 16, font: { size: 12 } } } },
        },
      });
    }

    const barCtx = document.getElementById("chart-bar");
    if (barCtx) {
      state.charts.bar = new Chart(barCtx, {
        type: "bar",
        data: {
          labels: sorted.map((x) => x.s.name),
          datasets: [{
            label: "% concluído",
            data: sorted.map((x) => x.st.pct),
            backgroundColor: (ctx) => {
              const c = ctx.chart.ctx;
              const gr = c.createLinearGradient(0, 0, 0, 220);
              gr.addColorStop(0, purple); gr.addColorStop(1, purple2);
              return gr;
            },
            borderRadius: 6,
            maxBarThickness: 26,
          }],
        },
        options: {
          indexAxis: "y",
          scales: {
            x: { min: 0, max: 100, grid: { color: track }, ticks: { color: "#71717A", callback: (v) => v + "%" } },
            y: { grid: { display: false }, ticks: { color: "#A1A1AA", font: { size: 11 } } },
          },
          plugins: { legend: { display: false } },
        },
      });
    }
  }

  /* --------------------------------- Favoritos --------------------------------- */
  function renderFavorites() {
    const favItems = [];
    state.subjects.forEach((s) => s.modules.forEach((m) => m.contents.forEach((c) => {
      if (c.favorite) favItems.push({ s, m, c });
    })));

    const list = favItems.map(({ s, m, c }) => `
      <div class="flex items-center gap-3 py-3 px-4 border-b border-white/5 last:border-0">
        <div data-toggle-content data-subject="${s.id}" data-module="${m.id}" data-content="${c.id}">${checkboxHtml(c.completed)}</div>
        <div class="flex-1 min-w-0">
          <span class="content-text text-sm ${c.completed ? "done" : "text-zinc-200"}">${escapeHtml(c.name)}</span>
          <div class="text-[11px] text-zinc-500 mt-0.5">${escapeHtml(s.name)} · ${escapeHtml(m.name)}</div>
        </div>
        <div class="star-btn active" data-toggle-favorite data-subject="${s.id}" data-module="${m.id}" data-content="${c.id}">
          <i data-lucide="star" class="w-4 h-4"></i>
        </div>
      </div>
    `).join("");

    document.getElementById("main-content").innerHTML = `
      <div class="fade-in">
        <div class="mb-6">
          <h2 class="text-2xl font-extrabold tracking-tight">Favoritos</h2>
          <p class="text-sm text-zinc-500 mt-1">Conteúdos marcados com estrela para revisão rápida.</p>
        </div>
        ${favItems.length ? `<div class="glass rounded-2xl overflow-hidden">${list}</div>` : `
          <div class="glass rounded-2xl p-12 text-center">
            <i data-lucide="star" class="w-10 h-10 text-zinc-600 mx-auto mb-3"></i>
            <p class="text-zinc-400 font-medium">Nenhum favorito ainda</p>
            <p class="text-xs text-zinc-600 mt-1">Toque na estrela de um conteúdo para adicioná-lo aqui.</p>
          </div>`}
      </div>
    `;
  }

  /* -------------------------------- Configurações ------------------------------- */
  /* ------------------------------- Perfil -------------------------------- */
  function renderProfile() {
    const hasPhoto = !!(state.user && state.user.photo);
    document.getElementById("main-content").innerHTML = `
      <div class="fade-in max-w-2xl">
        <div class="mb-6">
          <h2 class="text-2xl font-extrabold tracking-tight">Perfil</h2>
          <p class="text-sm text-zinc-500 mt-1">Sua foto e informações de perfil.</p>
        </div>

        <div class="glass rounded-2xl p-6 mb-5">
          <div class="flex flex-col items-center text-center">
            <div class="mb-5">${avatarHtml(state.user, "!w-24 !h-24 !text-2xl")}</div>
            <div class="flex items-center gap-2 flex-wrap justify-center">
              <button id="btn-change-photo" class="btn-primary rounded-xl px-4 py-2.5 text-sm flex items-center gap-2">
                <i data-lucide="image-plus" class="w-4 h-4"></i>${hasPhoto ? "Trocar foto" : "Adicionar foto"}
              </button>
              ${hasPhoto ? `
                <button id="btn-remove-photo" class="btn-ghost rounded-xl px-4 py-2.5 text-sm flex items-center gap-2">
                  <i data-lucide="trash-2" class="w-4 h-4"></i>Remover foto
                </button>
              ` : ""}
            </div>
            <input type="file" id="profile-photo-input" accept=".png,.jpg,.jpeg,image/png,image/jpeg" class="hidden" />
            <p class="text-[11px] text-zinc-600 mt-3">PNG ou JPG, máx. 5MB. A imagem fica salva apenas neste navegador.</p>
          </div>
        </div>

        <div class="glass rounded-2xl p-5">
          <h3 class="font-bold text-sm mb-4 flex items-center gap-2"><i data-lucide="id-card" class="w-4 h-4 text-purple-300"></i>Dados</h3>
          <div class="space-y-4">
            <div>
              <div class="text-[11px] text-zinc-500 mb-1">Nome</div>
              <div class="text-sm font-medium">${state.user ? escapeHtml(state.user.name) : "-"}</div>
            </div>
            <div>
              <div class="text-[11px] text-zinc-500 mb-1">E-mail</div>
              <div class="text-sm font-medium">${state.user ? escapeHtml(state.user.email) : "-"}</div>
            </div>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();

    const input = document.getElementById("profile-photo-input");
    document.getElementById("btn-change-photo").addEventListener("click", () => input.click());

    input.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const dataUrl = await readImageAsAvatarDataUrl(file, 256);
        state.user.photo = dataUrl;
        saveUser(state.user);
        toast("Foto de perfil atualizada!", "success");
        renderProfile();
        refreshHeaderUserChip();
      } catch (err) {
        toast(err.message || "Não foi possível usar essa imagem.", "error");
      } finally {
        e.target.value = "";
      }
    });

    const removeBtn = document.getElementById("btn-remove-photo");
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        delete state.user.photo;
        saveUser(state.user);
        toast("Foto removida.", "success");
        renderProfile();
        refreshHeaderUserChip();
      });
    }
  }

  function renderSettings() {
    const streak = computeStreak();
    document.getElementById("main-content").innerHTML = `
      <div class="fade-in max-w-2xl">
        <div class="mb-6">
          <h2 class="text-2xl font-extrabold tracking-tight">Configurações</h2>
          <p class="text-sm text-zinc-500 mt-1">Gerencie seus dados e o progresso salvo.</p>
        </div>

        <div class="glass rounded-2xl p-5 mb-5">
          <h3 class="font-bold text-sm mb-4 flex items-center gap-2"><i data-lucide="user" class="w-4 h-4 text-purple-300"></i>Perfil</h3>
          <div class="flex items-center gap-4">
            ${avatarHtml(state.user, "!w-12 !h-12 !text-base")}
            <div class="flex-1">
              <div class="font-semibold text-sm">${state.user ? escapeHtml(state.user.name) : "Convidado"}</div>
              <div class="text-xs text-zinc-500 mt-0.5">${state.user ? escapeHtml(state.user.email) : "Sem sessão"}</div>
            </div>
            <button id="btn-logout" class="btn-ghost rounded-xl px-3 py-2 text-xs flex items-center gap-1.5"><i data-lucide="log-out" class="w-3.5 h-3.5"></i>Sair</button>
          </div>
        </div>

        <div class="glass rounded-2xl p-5 mb-5">
          <h3 class="font-bold text-sm mb-4 flex items-center gap-2"><i data-lucide="database" class="w-4 h-4 text-purple-300"></i>Dados de progresso</h3>
          <div class="flex flex-wrap gap-3">
            <button id="btn-export" class="btn-primary rounded-xl px-4 py-2.5 text-sm flex items-center gap-2"><i data-lucide="download" class="w-4 h-4"></i>Exportar progresso (JSON)</button>
            <button id="btn-import" class="btn-ghost rounded-xl px-4 py-2.5 text-sm flex items-center gap-2"><i data-lucide="upload" class="w-4 h-4"></i>Importar progresso</button>
            <input type="file" id="file-import" accept="application/json" class="hidden" />
            <button id="btn-reset" class="rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 border border-red-500/30 text-red-300 hover:bg-red-500/10 transition-colors"><i data-lucide="trash-2" class="w-4 h-4"></i>Resetar progresso</button>
          </div>
        </div>

        <div id="install-app-card" class="${state.deferredInstallPrompt ? "" : "hidden"} glass glass-hover rounded-2xl p-5 mb-5 flex items-center gap-4">
          <div class="icon-box !w-12 !h-12"><i data-lucide="smartphone" class="w-5 h-5 text-purple-300"></i></div>
          <div class="flex-1">
            <div class="font-bold text-sm">Instalar StudyPro</div>
            <div class="text-xs text-zinc-500 mt-0.5">Adicione o app à sua tela inicial e use offline.</div>
          </div>
          <button id="btn-install-app" class="btn-primary rounded-xl px-4 py-2 text-xs flex-shrink-0">Instalar</button>
        </div>

        <div class="glass rounded-2xl p-5 mb-5">
          <h3 class="font-bold text-sm mb-4 flex items-center gap-2"><i data-lucide="activity" class="w-4 h-4 text-purple-300"></i>Atividade</h3>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div><span class="text-zinc-500 text-xs">Streak atual</span><div class="font-bold text-lg">${streak.current} dias</div></div>
            <div><span class="text-zinc-500 text-xs">Recorde</span><div class="font-bold text-lg">${streak.longest} dias</div></div>
          </div>
        </div>

        <div class="glass rounded-2xl p-5 text-center">
          <img src="favicon.svg" alt="StudyPro" class="w-10 h-10 mx-auto mb-2 rounded-lg" />
          <div class="font-extrabold brand-gradient-text text-lg">StudyPro</div>
          <div class="text-xs text-zinc-500 mt-1">Melhore o seu estudo</div>
          <div class="text-[11px] text-zinc-600 mt-4" style="opacity:.6">Feito por Burn Studios</div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();

    document.getElementById("btn-export").addEventListener("click", exportProgress);
    document.getElementById("btn-import").addEventListener("click", () => document.getElementById("file-import").click());
    document.getElementById("file-import").addEventListener("change", handleImportFile);
    document.getElementById("btn-reset").addEventListener("click", () => openConfirmModal(
      "Resetar progresso",
      "Isso apagará todo o seu progresso salvo, favoritos e streak. Essa ação não pode ser desfeita. Deseja continuar?",
      resetProgress
    ));
    const installBtn = document.getElementById("btn-install-app");
    if (installBtn) installBtn.addEventListener("click", triggerInstallPrompt);

    document.getElementById("btn-logout").addEventListener("click", () => openConfirmModal(
      "Sair da conta",
      "Você precisará entrar novamente com seu e-mail e senha. Seu progresso de estudos fica salvo neste navegador.",
      logoutUser
    ));
  }

  /* ----------------------------------- Modal ------------------------------------ */
  function openConfirmModal(title, message, onConfirm) {
    const root = document.getElementById("modal-root");
    root.innerHTML = `
      <div class="fixed inset-0 modal-backdrop flex items-center justify-center z-50 p-4" id="modal-backdrop">
        <div class="glass-solid rounded-2xl p-6 max-w-sm w-full pop">
          <div class="w-11 h-11 rounded-xl bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4">
            <i data-lucide="alert-triangle" class="w-5 h-5 text-red-400"></i>
          </div>
          <h3 class="font-bold text-lg mb-2">${escapeHtml(title)}</h3>
          <p class="text-sm text-zinc-400 mb-6 leading-relaxed">${escapeHtml(message)}</p>
          <div class="flex gap-3 justify-end">
            <button id="modal-cancel" class="btn-ghost rounded-xl px-4 py-2 text-sm">Cancelar</button>
            <button id="modal-confirm" class="rounded-xl px-4 py-2 text-sm font-semibold bg-red-500/90 hover:bg-red-500 text-white transition-colors">Confirmar</button>
          </div>
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    document.getElementById("modal-cancel").addEventListener("click", closeModal);
    document.getElementById("modal-backdrop").addEventListener("click", (e) => { if (e.target.id === "modal-backdrop") closeModal(); });
    document.getElementById("modal-confirm").addEventListener("click", () => { onConfirm(); closeModal(); });
  }
  function closeModal() { document.getElementById("modal-root").innerHTML = ""; }

  /* ------------------------------- Ações de dados -------------------------------- */
  function exportProgress() {
    const payload = { app: "StudyPro", exportedAt: new Date().toISOString(), subjects: state.subjects, streak: loadStreak() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `studypro-progresso-${todayISO()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast("Progresso exportado com sucesso!", "success");
  }

  function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const subjects = Array.isArray(parsed) ? parsed : parsed.subjects;
        if (!Array.isArray(subjects)) throw new Error("Formato inválido");
        state.subjects = subjects;
        if (parsed.streak) saveStreak(parsed.streak);
        saveSubjects();
        toast("Progresso importado com sucesso!", "success");
        refreshAll();
      } catch (err) {
        toast("Arquivo inválido. Verifique o JSON e tente novamente.", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function resetProgress() {
    state.subjects = deepClone(ENEM_DEFAULT_DATA);
    saveSubjects();
    localStorage.removeItem(LS_STREAK);
    state.filter = "all"; state.search = "";
    const searchInput = document.getElementById("global-search");
    if (searchInput) searchInput.value = "";
    saveUi();
    toast("Progresso resetado.", "success");
    refreshAll();
  }

  function refreshAll() {
    updateHeaderProgress();
    renderMainContent();
  }

  /* ------------------------------- Event delegation ------------------------------- */
  function setupEvents() {
    document.body.addEventListener("click", (e) => {
      // Navegação sidebar / botões com data-view
      const navEl = e.target.closest("[data-view]");
      if (navEl) { switchView(navEl.getAttribute("data-view")); return; }

      // Ir para matéria específica a partir do dashboard
      const gotoEl = e.target.closest("[data-goto-subject]");
      if (gotoEl) {
        const id = gotoEl.getAttribute("data-goto-subject");
        state.expanded.add(id); saveUi();
        switchView("subjects");
        setTimeout(() => { const card = document.getElementById("subject-card-" + id); if (card) card.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
        return;
      }

      // Toggle conteúdo
      const contentEl = e.target.closest("[data-toggle-content]");
      if (contentEl) {
        const c = findContent(contentEl.dataset.subject, contentEl.dataset.module, contentEl.dataset.content);
        if (c) { c.completed = !c.completed; if (c.completed) registerActivityToday(); saveSubjects(); refreshAll(); }
        return;
      }

      // Toggle favorito
      const favEl = e.target.closest("[data-toggle-favorite]");
      if (favEl) {
        const c = findContent(favEl.dataset.subject, favEl.dataset.module, favEl.dataset.content);
        if (c) { c.favorite = !c.favorite; saveSubjects(); refreshAll(); }
        return;
      }

      // Toggle módulo inteiro
      const modEl = e.target.closest("[data-toggle-module]");
      if (modEl) {
        const mod = findModule(modEl.dataset.subject, modEl.dataset.module);
        if (mod) {
          const st = moduleStats(mod);
          const markAll = st.triState !== "all";
          mod.contents.forEach((c) => { c.completed = markAll; });
          if (markAll) registerActivityToday();
          saveSubjects(); refreshAll();
        }
        return;
      }

      // Toggle matéria inteira (checkbox no header do accordion)
      const subCheckEl = e.target.closest("[data-toggle-subject-check]");
      if (subCheckEl) {
        e.stopPropagation();
        const subject = findSubject(subCheckEl.dataset.subject);
        if (subject) {
          const tri = subjectTriState(subject);
          const markAll = tri !== "all";
          subject.modules.forEach((m) => m.contents.forEach((c) => { c.completed = markAll; }));
          if (markAll) registerActivityToday();
          saveSubjects(); refreshAll();
        }
        return;
      }

      // Accordion (expandir/recolher matéria) — evita conflito com o checkbox interno
      const accEl = e.target.closest("[data-toggle-subject-accordion]");
      if (accEl && !e.target.closest("[data-toggle-subject-check]")) {
        const id = accEl.getAttribute("data-toggle-subject-accordion");
        if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
        saveUi();
        renderSubjectsResults();
        return;
      }

      // Filtros
      const filterEl = e.target.closest("[data-filter]");
      if (filterEl) {
        state.filter = filterEl.getAttribute("data-filter"); saveUi();
        renderSubjectsResults();
        return;
      }

      // Expandir/recolher tudo
      const actionEl = e.target.closest("[data-action]");
      if (actionEl) {
        const action = actionEl.getAttribute("data-action");
        if (action === "expand-all") state.subjects.forEach((s) => state.expanded.add(s.id));
        if (action === "collapse-all") state.expanded.clear();
        saveUi();
        renderSubjectsResults();
        return;
      }
    });

    // Filtros de sidebar/nav via botão de abrir sidebar mobile
    document.body.addEventListener("click", (e) => {
      if (e.target.closest("#btn-open-sidebar")) toggleSidebar(true);
      if (e.target.closest("#sidebar-backdrop")) toggleSidebar(false);
    });

    // Busca global (delegada, mas o input é persistente no header — sem perda de foco)
    document.body.addEventListener("input", (e) => {
      if (e.target.id === "global-search") {
        state.search = e.target.value.trim();
        document.getElementById("btn-clear-search").classList.toggle("hidden", !state.search);
        if (state.search && state.view !== "subjects") { state.view = "subjects"; updateActiveNav(); renderMainContent(); }
        else if (state.view === "subjects") { renderSubjectsResults(); }
      }
    });
    document.body.addEventListener("click", (e) => {
      if (e.target.closest("#btn-clear-search")) {
        state.search = "";
        const input = document.getElementById("global-search");
        if (input) input.value = "";
        document.getElementById("btn-clear-search").classList.add("hidden");
        if (state.view === "subjects") renderSubjectsResults();
      }
    });
  }

  function toggleSidebar(open) {
    state.sidebarOpen = open;
    document.getElementById("sidebar").classList.toggle("open", open);
    document.getElementById("sidebar-backdrop").classList.toggle("hidden", !open);
  }

  function updateActiveNav() {
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("active", el.getAttribute("data-view") === state.view);
    });
  }

  function switchView(view) {
    state.view = view;
    updateActiveNav();
    toggleSidebar(false);
    renderMainContent();
    document.getElementById("main-content").scrollTo({ top: 0 });
  }

  /* ------------------------------ PWA: instalação e offline ------------------------------ */
  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    const okProtocol = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!okProtocol) return; // service workers exigem HTTPS (ou localhost); não funcionam em file://
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("Falha ao registrar service worker:", err));
    });
  }

  function setupInstallPrompt() {
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      state.deferredInstallPrompt = e;
      const card = document.getElementById("install-app-card");
      if (card) card.classList.remove("hidden");
    });
    window.addEventListener("appinstalled", () => {
      state.deferredInstallPrompt = null;
      toast("StudyPro instalado com sucesso!", "success");
      const card = document.getElementById("install-app-card");
      if (card) card.classList.add("hidden");
    });
  }

  async function triggerInstallPrompt() {
    if (!state.deferredInstallPrompt) return;
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    const card = document.getElementById("install-app-card");
    if (card) card.classList.add("hidden");
  }

  /* ----------------------------------- Init -------------------------------------- */
  let bootstrapped = false;

  function startApp() {
    const appEl = document.getElementById("app");
    if (appEl) appEl.style.display = "";
    const loginRoot = document.getElementById("login-root");
    if (loginRoot) loginRoot.innerHTML = "";

    state.subjects = loadSubjects();
    loadUi();
    localStorage.setItem(LS_LAST_ACCESS, todayISO());

    renderSidebar();
    renderHeaderStatic();
    renderMainContent();

    if (!bootstrapped) {
      bootstrapped = true;
      setupEvents();
      setupInstallPrompt();
      registerServiceWorker();
    }
    if (window.lucide) lucide.createIcons();
  }

  function init() {
    document.title = "StudyPro - Melhore o seu estudo";
    const existingUser = loadUser();
    if (existingUser) {
      state.user = existingUser;
      startApp();
    } else {
      renderLoginScreen();
      if (window.lucide) lucide.createIcons();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
