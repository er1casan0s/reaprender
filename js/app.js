/* ================================================================
   REAPRENDER | APLICAÇÃO PRINCIPAL
   ================================================================ */

(() => {
  "use strict";

  const MIN_STUDY_SECONDS = 5 * 60;
  const DEMO_USER_KEY = "reaprender_demo_user";
  const DEMO_PROGRESS_KEY = "reaprender_demo_progress";

  const app = document.getElementById("app");
  const toastRegion = document.getElementById("toast-region");
  let supabaseClient = null;
  let currentUser = null;
  let currentProfile = null;
  let isDemo = false;
  let progressMap = {};
  let activeLessonId = null;
  let lessonTimer = null;
  let elapsedSeconds = 0;
  let readConfirmed = false;
  let quizPassed = false;
  let selectedAnswer = null;
  let lastSavedSecond = 0;

  // Variáveis do Mural
  let wallPosts = [];
  let wallLikesSet = new Set();
  let wallComments = [];
  let wallAuthors = {};

  function hasSupabaseConfig() {
    const config = window.REAPRENDER_CONFIG || {};
    return Boolean(
      window.supabase &&
      config.supabaseUrl &&
      config.supabaseAnonKey &&
      !config.supabaseUrl.includes("COLE_AQUI") &&
      !config.supabaseAnonKey.includes("COLE_AQUI")
    );
  }

  function toast(message, type = "success") {
    const item = document.createElement("div");
    item.className = `toast ${type === "error" ? "error" : ""}`;
    item.textContent = message;
    toastRegion.appendChild(item);
    window.setTimeout(() => item.remove(), 3800);
  }

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);
  }

  function firstName(name = "Estudante") {
    return String(name).trim().split(/\s+/)[0] || "Estudante";
  }

  function initializeSupabase() {
    if (!hasSupabaseConfig()) return;
    const config = window.REAPRENDER_CONFIG;
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  }

  async function loadOnlineProfile() {
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles").select("id, full_name, role").eq("id", currentUser.id).single();
    if (profileError) throw profileError;
    currentProfile = profile;

    const { data: rows, error: progressError } = await supabaseClient
      .from("lesson_progress").select("lesson_id, elapsed_seconds, read_confirmed, quiz_passed, completed_at")
      .eq("user_id", currentUser.id);
    if (progressError) throw progressError;
    progressMap = {};
    (rows || []).forEach(row => { progressMap[row.lesson_id] = row; });
  }

  async function loadWall() {
    if (isDemo) {
      try { wallPosts = JSON.parse(localStorage.getItem("reaprender_demo_wall") || "[]"); } catch { wallPosts = []; }
      wallLikesSet = new Set(); wallComments = []; return;
    }
    
    const { data: posts } = await supabaseClient
      .from("wall_posts").select("id, author_id, body, attachment_url, attachment_label, created_at")
      .order("created_at", { ascending: false }).limit(50);
    wallPosts = posts || [];

    const ids = wallPosts.map(p => p.id);
    if (ids.length) {
      const { data: comments } = await supabaseClient
        .from("wall_comments").select("id, post_id, parent_id, author_id, body, created_at")
        .in("post_id", ids).order("created_at");
      wallComments = comments || [];
      
      const { data: likes } = await supabaseClient
        .from("wall_likes").select("post_id, user_id").in("post_id", ids);
      wallLikesSet = new Set((likes || []).filter(l => l.user_id === currentUser.id).map(l => l.post_id));

      const authorIds = new Set([...wallPosts.map(p => p.author_id), ...wallComments.map(c => c.author_id)]);
      const { data: profiles } = await supabaseClient
        .from("profiles").select("id, full_name, role").in("id", Array.from(authorIds));
      
      wallAuthors = {};
      (profiles || []).forEach(prof => { wallAuthors[prof.id] = prof; });
    } else {
      wallComments = []; wallLikesSet = new Set(); wallAuthors = {};
    }
  }

  async function loadCustomContent() {
    if (isDemo || !supabaseClient) return;
    const { data: modules } = await supabaseClient
      .from("custom_modules").select("id, subject_id, title, description, created_by, created_at, position")
      .eq("is_published", true)
      .order("position", { ascending: true });

    const { data: lessons } = await supabaseClient
      .from("custom_lessons").select("id, module_id, title, lead, sections_json, summary, study_tips, video_url, extra_link, position, question_prompt, question_option_a, question_option_b, question_option_c, question_option_d, question_answer")
      .order("position");
      
    window.CUSTOM_MODULES = modules || [];
    window.CUSTOM_LESSONS = lessons || [];
  }

  function loadDemoProgress() {
    try { progressMap = JSON.parse(localStorage.getItem(DEMO_PROGRESS_KEY) || "{}"); }
    catch { progressMap = {}; }
  }

  async function saveLessonProgress(lessonId, patch = {}) {
    const previous = progressMap[lessonId] || {};
    const next = {
      lesson_id: lessonId,
      elapsed_seconds: Math.max(Number(previous.elapsed_seconds || 0), Number(patch.elapsed_seconds ?? elapsedSeconds)),
      read_confirmed: Boolean(patch.read_confirmed ?? previous.read_confirmed ?? false),
      quiz_passed: Boolean(patch.quiz_passed ?? previous.quiz_passed ?? false),
      completed_at: patch.completed_at ?? previous.completed_at ?? null
    };
    progressMap[lessonId] = next;

    if (isDemo) {
      localStorage.setItem(DEMO_PROGRESS_KEY, JSON.stringify(progressMap));
      return;
    }

    const { error } = await supabaseClient.from("lesson_progress").upsert({
      user_id: currentUser.id,
      lesson_id: next.lesson_id,
      elapsed_seconds: next.elapsed_seconds,
      read_confirmed: next.read_confirmed,
      quiz_passed: next.quiz_passed,
      completed_at: next.completed_at
    }, { onConflict: "user_id,lesson_id" });
    if (error) throw error;
  }

  function isLessonComplete(lessonId) { return Boolean(progressMap[lessonId]?.completed_at); }
  function isModuleComplete(module) { return module.lessons.length > 0 && module.lessons.every(lesson => isLessonComplete(lesson.id)); }
  function isModuleUnlocked(subject, moduleIndex) { if (moduleIndex === 0) return true; return isModuleComplete(subject.modules[moduleIndex - 1]); }
  function isLessonUnlocked(module, lessonIndex) { if (lessonIndex === 0) return true; return isLessonComplete(module.lessons[lessonIndex - 1].id); }
  function getOverallProgress() {
    const lessons = window.getAllLessons();
    if (!lessons.length) return 0;
    const completed = lessons.filter(lesson => isLessonComplete(lesson.id)).length;
    return Math.round((completed / lessons.length) * 100);
  }

  function renderHeader() {
    const name = currentProfile?.full_name || currentUser?.email || "Estudante";
    const teacher = currentProfile?.role === "teacher";
    return `
      <header class="topbar">
        <button class="brand text-button" data-action="home" aria-label="Ir para o início" style="text-decoration: none; background: none; border: none; padding: 0; cursor: pointer;">
          <span class="brand-mark">R</span>
          <span style="text-align: left;"><span class="brand-name">REAPRENDER</span><br><span class="brand-tagline">Educação • Conhecimento • Futuro</span></span>
        </button>
        <div class="topbar-actions">
          <button class="btn btn-outline btn-small" data-action="home">Início</button>
          ${teacher ? '<button class="btn btn-outline btn-small" data-action="teacher">Painel da professora</button>' : ''}
          <div class="user-chip"><span class="avatar">${escapeHtml(firstName(name).charAt(0).toUpperCase())}</span><span>${escapeHtml(firstName(name))}</span></div>
          <button class="btn btn-outline btn-small" data-action="logout">Sair</button>
        </div>
      </header>`;
  }

  function renderWallFeed() {
    if (!wallPosts.length) return '<div class="empty-state">Ainda não há publicações. Seja a primeira pessoa a compartilhar!</div>';
    
    const getAuthorInfo = (authorId) => {
      if (authorId === currentUser.id) return { name: currentProfile?.full_name || "Você", role: currentProfile?.role === "teacher" ? "Professora" : "Estudante" };
      const author = wallAuthors[authorId];
      if (author) return { name: author.full_name || "Participante", role: author.role === "teacher" ? "Professora" : "Estudante" };
      return { name: "Participante", role: "Estudante" };
    };

    const renderCommentNode = (c) => {
      const cInfo = getAuthorInfo(c.author_id);
      const canModify = c.author_id === currentUser.id || currentProfile?.role === "teacher";
      const replies = wallComments.filter(r => r.parent_id === c.id);
      const repliesHtml = replies.length ? `<ul class="wall-comments" style="margin-top:8px; padding-left:15px; border-left:2px solid #ddd;">${replies.map(r => renderCommentNode(r)).join("")}</ul>` : "";

      return `<li class="comment-item" data-comment-id="${c.id}">
        <div class="comment-content">
          <strong>${escapeHtml(cInfo.name)} - ${cInfo.role}:</strong> <span class="comment-text">${escapeHtml(c.body)}</span>
          <div class="comment-actions" style="margin-top: 4px; margin-bottom: 8px;">
            <button class="text-button small muted" data-reply-comment="${c.id}">Responder</button>
            ${canModify ? `<button class="text-button small muted" data-edit-comment="${c.id}">Editar</button>
            <button class="text-button small muted" data-delete-comment="${c.id}">Excluir</button>` : ""}
          </div>
        </div>
        ${repliesHtml}
      </li>`;
    };

    return wallPosts.map(p => {
      const rootComments = wallComments.filter(c => c.post_id === p.id && !c.parent_id);
      const liked = wallLikesSet.has(p.id);
      const authorInfo = getAuthorInfo(p.author_id);
      const canModifyPost = p.author_id === currentUser.id || currentProfile?.role === "teacher";

      return `<article class="wall-post" data-post-id="${p.id}">
        <header>
          <strong>${escapeHtml(authorInfo.name)} - ${authorInfo.role}</strong> • <span class="muted small">${new Date(p.created_at).toLocaleString("pt-BR")}</span>
          ${canModifyPost ? `<div style="float: right;">
            <button class="text-button small muted" data-edit-post="${p.id}">✏️ Editar</button>
            <button class="text-button small muted" data-delete-post="${p.id}">🗑️ Excluir</button>
          </div>` : ""}
        </header>
        <p class="post-body-text">${escapeHtml(p.body)}</p>
        <div class="post-edit-form" style="display:none; margin-bottom:10px;">
          <textarea class="form-control" rows="3">${escapeHtml(p.body)}</textarea>
          <button class="btn btn-primary btn-small" data-save-edit-post="${p.id}">Salvar</button>
        </div>
        ${p.attachment_url ? `<a class="wall-attachment" href="${escapeHtml(p.attachment_url)}" target="_blank" rel="noopener">🔗 ${escapeHtml(p.attachment_label || p.attachment_url)}</a>` : ""}
        
        <div class="wall-actions">
          <button class="text-button" data-like="${p.id}">${liked ? "♥" : "♡"} Curtir</button>
          <span class="muted small">${wallComments.filter(c => c.post_id === p.id).length} comentário(s)</span>
        </div>
        
        <ul class="wall-comments">
          ${rootComments.map(c => renderCommentNode(c)).join("")}
        </ul>

        <form class="wall-comment-form" data-post-id="${p.id}" data-parent-id="">
          <input name="body" placeholder="Escreva um comentário..." required maxlength="400">
          <button class="btn btn-outline btn-small" type="submit">Enviar</button>
        </form>
      </article>`;
    }).join("");
  }

  function renderAuth(mode = "login") {
    stopLessonTimer();
    const signup = mode === "signup";
    const reset = mode === "reset";
    const newPassword = mode === "new-password";
    app.innerHTML = `
      <main class="auth-layout">
        <section class="auth-brand-panel">
          <div class="brand"><span class="brand-mark">R</span><span><span class="brand-name">REAPRENDER</span><br><span class="brand-tagline">Educação • Conhecimento • Futuro</span></span></div>
          <div class="auth-brand-copy"><p class="eyebrow">Seu próximo capítulo começa aqui</p><h1>Nunca é tarde para aprender algo novo.</h1><p>Um espaço de aprendizagem feito para respeitar seu tempo, valorizar sua história e abrir caminhos para o futuro.</p></div>
          <div class="auth-quote">“Aprender é um direito. Recomeçar também.”</div>
        </section>
        <section class="form-card auth-form-card">
          <p class="eyebrow">${signup ? "Crie seu espaço" : reset ? "Recuperação de acesso" : newPassword ? "Atualização de acesso" : "Boas-vindas"}</p>
          <h1>${signup ? "Vamos começar?" : reset ? "Recuperar senha" : newPassword ? "Escolha uma nova senha" : "Que bom ter você aqui."}</h1>
          <p>${signup ? "Preencha seus dados para criar sua conta de estudante." : reset ? "Informe seu e-mail para receber o link de recuperação." : newPassword ? "Crie uma nova senha para acessar sua conta." : "Entre na sua conta e continue sua jornada de aprendizagem."}</p>
          <form id="auth-form">
            ${signup ? '<div class="field"><label for="full-name">Nome completo</label><input id="full-name" name="fullName" autocomplete="name" required maxlength="100" placeholder="Como podemos chamar você?"></div>' : ''}
            ${reset || newPassword ? '' : '<div class="field"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="email" required placeholder="voce@email.com"></div>'}
            ${reset ? '' : '<div class="field"><label for="password">' + (newPassword ? 'Nova senha' : 'Senha') + '</label><input id="password" name="password" type="password" autocomplete="' + (signup || newPassword ? 'new-password' : 'current-password') + '" minlength="6" required placeholder="Mínimo de 6 caracteres"></div>'}
            <div class="form-actions"><button class="btn btn-primary" type="submit">${signup ? "Criar minha conta" : reset ? "Enviar link de recuperação" : newPassword ? "Salvar nova senha" : "Entrar na plataforma"}</button></div>
          </form>
          <div class="form-links">
            ${signup ? '<button class="text-button" data-auth-mode="login">Já tenho uma conta</button>' : reset || newPassword ? '<button class="text-button" data-auth-mode="login">Voltar ao login</button>' : '<button class="text-button" data-auth-mode="signup">Criar conta</button><button class="text-button" data-auth-mode="reset">Esqueci minha senha</button>'}
          </div>
          <p class="small muted" style="margin-top:22px">Plataforma de aprendizagem para jovens e adultos.</p>
        </section>
      </main>`;
    const authForm = document.getElementById("auth-form");
    if (authForm) authForm.dataset.mode = mode;
  }

  function renderHome() {
    stopLessonTimer();
    const lessons = window.getAllLessons();
    const completed = lessons.filter(lesson => isLessonComplete(lesson.id)).length;
    const percent = getOverallProgress();
    const started = Object.values(progressMap).filter(row => Number(row.elapsed_seconds || 0) > 0 || row.completed_at).length;
    
    app.innerHTML = `${renderHeader()}
      <main class="container">
        <section class="hero"><div class="hero-content"><p class="eyebrow">Sua jornada de aprendizagem</p><h1>Olá, ${escapeHtml(firstName(currentProfile?.full_name || "estudante"))}. Vamos aprender algo novo?</h1><p>Você não precisa saber tudo hoje. Um passo de cada vez também leva longe. Escolha uma disciplina e continue no seu ritmo.</p><button class="btn btn-gold" data-action="continue-learning">Continuar estudando <span aria-hidden="true">→</span></button></div></section>
        
        <section class="stats-grid" aria-label="Resumo do progresso">
          <div class="stat-card"><span class="stat-number">${completed}</span><span class="stat-label">Aulas concluídas</span></div>
          <div class="stat-card"><span class="stat-number">${started}</span><span class="stat-label">Aulas iniciadas</span></div>
          <div class="stat-card"><span class="stat-number">${percent}%</span><span class="stat-label">Progresso geral</span><div class="progress-track" style="margin-top:9px"><div class="progress-fill" style="width:${percent}%"></div></div></div>
        </section>

        <section class="wall-section">
          <div class="section-heading"><div><p class="eyebrow">Comunidade</p><h2>📢 Mural REAPRENDER</h2><p class="muted small">Todos participam: professora e estudantes.</p></div></div>
          <form id="wall-form" class="content-card">
            <div class="field"><label for="wall-body">Compartilhe alguma coisa!</label>
              <textarea id="wall-body" name="body" rows="3" maxlength="800" required placeholder="Uma dúvida, descoberta, indicação de vídeo ou experiência."></textarea>
            </div>
            <div class="field"><label for="wall-url">Link (vídeo, matéria...)</label><input id="wall-url" name="attachment_url" type="url" placeholder="https://..."></div>
            <div class="field"><label for="wall-label">Descrição do link (opcional)</label><input id="wall-label" name="attachment_label" maxlength="120"></div>
            <div class="form-actions"><button class="btn btn-primary" type="submit">Publicar</button></div>
          </form>
          <div id="wall-feed" style="margin-top: 20px;">${renderWallFeed()}</div>
        </section>

        <div class="section-heading"><div><p class="eyebrow">Escolha seu caminho</p><h2>Disciplinas</h2><p class="muted small">Conteúdos organizados em módulos, do básico ao aprofundamento.</p></div></div>
        <section class="subject-grid">${window.REAPRENDER_CATALOG.map(subject => {
          const total = subject.modules.flatMap(module => module.lessons).length;
          const done = subject.modules.flatMap(module => module.lessons).filter(lesson => isLessonComplete(lesson.id)).length;
          return `<article class="subject-card"><div class="subject-icon" aria-hidden="true">${subject.icon}</div><h3>${escapeHtml(subject.name)}</h3><p>${escapeHtml(subject.description)}</p><div class="card-bottom"><span class="pill">${done}/${total} aulas</span><button class="btn btn-outline btn-small" data-subject="${subject.id}">Acessar →</button></div></article>`;
        }).join("")}</section>
        <div class="section-heading"><div><p class="eyebrow">Seu espaço</p><h2>Aprender no seu ritmo</h2></div></div>
        <div class="content-card"><p>As aulas são liberadas em sequência. Para avançar, estude por pelo menos cinco minutos com a página ativa, confirme a leitura e responda à atividade. Seu progresso fica salvo na sua conta.</p></div>
      </main><footer class="footer">REAPRENDER • Conhecimento para a vida toda.</footer>`;
  }

  function renderCustomLesson(lessonId) {
    const lesson = (window.CUSTOM_LESSONS || []).find(l => l.id === Number(lessonId));
    if (!lesson) return renderHome();
    const module = (window.CUSTOM_MODULES || []).find(m => m.id === lesson.module_id);
    const isTeacher = currentProfile?.role === "teacher";

    let sectionsHtml = "";
    if (Array.isArray(lesson.sections_json)) {
      sectionsHtml = lesson.sections_json.map(sec => `
        <section>
          <h2>${escapeHtml(sec.title)}</h2>
          ${sec.paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join("")}
          ${sec.image_url ? `<img src="${escapeHtml(sec.image_url)}" alt="Imagem da aula" style="max-width: 100%; border-radius: 8px; margin: 15px 0; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">` : ""}
          ${sec.example ? `<div class="example-box"><strong>Exemplo prático</strong><p>${escapeHtml(sec.example)}</p></div>` : ""}
        </section>
      `).join("");
    }

    let summaryHtml = "";
    if (lesson.summary) {
      const items = lesson.summary.split('\n').filter(i => i.trim());
      summaryHtml = `<section><h2>4. O que você precisa guardar?</h2><ul>${items.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul></section>`;
    }

    let tipsHtml = lesson.study_tips ? `<section><h2>3. Dicas para estudar</h2><p>${escapeHtml(lesson.study_tips).replace(/\n/g, '<br>')}</p></section>` : "";

    let quizHtml = "";
    if (lesson.question_prompt && !isTeacher) {
      const opts = [lesson.question_option_a, lesson.question_option_b, lesson.question_option_c, lesson.question_option_d];
      const optsHtml = opts.map((o, i) => o ? `<label class="quiz-option"><input type="radio" name="custom-answer" value="${i}"><span>${escapeHtml(o)}</span></label>` : "").join("");
      quizHtml = `<section id="custom-lesson-exercise" style="margin-top:30px; padding-top:20px; border-top:1px solid #eee;">
        <h2>5. Vamos praticar?</h2>
        <p>${escapeHtml(lesson.question_prompt)}</p>
        <form id="custom-quiz-form" data-answer="${lesson.question_answer}">
          ${optsHtml}
          <div class="form-actions" style="margin-top:15px;"><button class="btn btn-primary" type="submit">Conferir resposta</button></div>
        </form>
        <div id="custom-quiz-feedback" aria-live="polite"></div>
      </section>`;
    }

    const asideHtml = isTeacher ? `
      <aside class="reader-aside">
        <div class="aside-card" style="background: var(--beige);">
          <h3>Modo Professor</h3>
          <p class="small">Você está visualizando o conteúdo que criou.</p>
          <button class="btn btn-primary" style="width: 100%;" data-subject="${module.subject_id}">Gerenciar Módulo e Aulas</button>
        </div>
      </aside>
    ` : `
      <aside class="reader-aside">
        <div class="aside-card">
          <h3>Material Complementar</h3>
          ${lesson.video_url ? `<a href="${escapeHtml(lesson.video_url)}" target="_blank" class="btn btn-outline" style="width:100%; margin-bottom:8px;">🎥 Assistir Vídeo</a>` : '<p class="small muted">Nenhum link adicionado.</p>'}
        </div>
      </aside>
    `;

    app.innerHTML = `${renderHeader()}
      <main class="container">
        <button class="text-button" data-subject="${module.subject_id}">← Voltar</button>
        <div class="reader-layout" style="margin-top:20px">
          <article class="reader">
            <p class="eyebrow">Conteúdo da Professora</p>
            <h1>${escapeHtml(lesson.title)}</h1>
            <p class="lead">${escapeHtml(lesson.lead)}</p>
            
            ${sectionsHtml}
            ${tipsHtml}
            ${summaryHtml}
            ${quizHtml}
            
            ${!isTeacher ? `<section style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px;">
              <h2>7. Espaço para anotações</h2>
              <textarea id="custom-notes-${lesson.id}" rows="4" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 8px;" placeholder="Anote suas dúvidas aqui..."></textarea>
            </section>` : ""}
          </article>
          ${asideHtml}
        </div>
      </main>`;
      
    if (!isTeacher) {
      const notesArea = document.getElementById(`custom-notes-${lesson.id}`);
      const savedNotes = localStorage.getItem(`notes_${lesson.id}`);
      if (savedNotes) notesArea.value = savedNotes;
      notesArea.addEventListener("input", (e) => {
        localStorage.setItem(`notes_${lesson.id}`, e.target.value);
      });
    }
  }

   function renderSubject(subjectId) {
    stopLessonTimer();
    const subject = window.findSubject(subjectId);
    if (!subject) return renderHome();
    
    const isTeacher = currentProfile?.role === "teacher";

    // Botão elegante para abrir o formulário de criar módulo
    let teacherCreateHtml = "";
    if (isTeacher) {
      teacherCreateHtml = `
        <div style="margin-bottom: 30px;">
          <details style="background: var(--white); border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.03); overflow: hidden;">
            <summary style="cursor: pointer; padding: 18px 20px; font-weight: bold; color: var(--navy); font-size: 16px; display: flex; align-items: center; gap: 10px; list-style: none; background: #f8fafc;">
              <span style="background: var(--blue); color: white; width: 28px; height: 28px; border-radius: 50%; display: inline-flex; justify-content: center; align-items: center; font-size: 16px;">+</span>
              Criar Novo Módulo para esta Disciplina
            </summary>
            <div style="padding: 20px; border-top: 1px solid var(--line);">
              <form id="form-module">
                <input type="hidden" name="subject_id" value="${subjectId}">
                <div class="field"><label>Título do Módulo</label><input name="title" required placeholder="Ex: Módulo 1: Introdução à Matéria"></div>
                <div class="field"><label>Descrição (Opcional)</label><input name="description" placeholder="Ex: Conceitos básicos que veremos nesta etapa."></div>
                <div class="form-actions"><button class="btn btn-primary" type="submit">Criar Módulo Agora</button></div>
              </form>
            </div>
          </details>
        </div>
      `;
    }
    
    const customModules = (window.CUSTOM_MODULES || []).filter(m => m.subject_id === subjectId);
    
    // Layout bonito dos cards de módulos
    const customHtml = customModules.map(m => {
      const lessons = (window.CUSTOM_LESSONS || []).filter(l => l.module_id === m.id);
      const total = lessons.length;
      
      const teacherActions = isTeacher ? `
        <div style="display: flex; gap: 8px; margin-top: 15px; padding-top: 15px; border-top: 1px dashed #e2e8f0;">
          <button class="btn btn-outline btn-small" data-move-mod="${m.id}" data-dir="up" title="Mover para cima">↑ Subir</button>
          <button class="btn btn-outline btn-small" data-move-mod="${m.id}" data-dir="down" title="Mover para baixo">↓ Descer</button>
          <button class="btn btn-outline btn-small" data-edit-mod="${m.id}" style="margin-left: auto;">✏️ Editar Módulo</button>
          <button class="btn btn-outline btn-small" data-delete-mod="${m.id}" style="color: var(--danger); border-color: #f5c6cb;">🗑️ Excluir</button>
        </div>
      ` : "";

      // Formulário de adicionar aula super organizado (em blocos)
      const lessonForm = isTeacher ? `
        <details style="margin-top: 15px; background: #fafafa; border: 1px dashed #cbd5e1; padding: 15px; border-radius: 8px;">
          <summary style="cursor: pointer; font-weight: bold; color: var(--blue); font-size: 14px; list-style: none;">➕ Adicionar Nova Aula (Estrutura Completa)</summary>
          
          <form class="form-lesson" data-module-id="${m.id}" style="margin-top: 20px;" enctype="multipart/form-data">
            
            <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 15px;">
              <h4 style="margin: 0 0 10px 0; color: var(--navy); font-size: 14px; border-bottom: 1px solid #eee; padding-bottom: 5px;">Informações Principais</h4>
              <div class="field"><label>1. Título do Tema</label><input name="title" required></div>
              <div class="field"><label>Apresentação Inicial (Texto introdutório)</label><textarea name="lead" rows="2" required></textarea></div>
            </div>

            <h4 style="margin: 15px 0 10px 0; color: var(--navy); font-size: 14px;">2. Desenvolvimento do Conteúdo</h4>
            
            <!-- Subtópico 1 -->
            <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 10px;">
              <div class="field"><label>Subtópico 1 (Título)</label><input name="sec1_title"></div>
              <div class="field"><label>Explicação</label><textarea name="sec1_text" rows="2"></textarea></div>
              <div class="field"><label>Exemplo Prático</label><textarea name="sec1_example" rows="2"></textarea></div>
              <div class="field"><label>Anexar Imagem (Opcional)</label><input type="file" name="sec1_image_file" accept="image/*" style="padding: 8px; border: 1px solid #ddd; border-radius: 6px; width: 100%;"></div>
            </div>
            
            <!-- Subtópico 2 -->
            <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 10px;">
              <div class="field"><label>Subtópico 2 (Título)</label><input name="sec2_title"></div>
              <div class="field"><label>Explicação</label><textarea name="sec2_text" rows="2"></textarea></div>
              <div class="field"><label>Exemplo Prático</label><textarea name="sec2_example" rows="2"></textarea></div>
              <div class="field"><label>Anexar Imagem (Opcional)</label><input type="file" name="sec2_image_file" accept="image/*" style="padding: 8px; border: 1px solid #ddd; border-radius: 6px; width: 100%;"></div>
            </div>

            <!-- Subtópico 3 -->
            <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 10px;">
              <div class="field"><label>Subtópico 3 (Título)</label><input name="sec3_title"></div>
              <div class="field"><label>Explicação</label><textarea name="sec3_text" rows="2"></textarea></div>
              <div class="field"><label>Exemplo Prático</label><textarea name="sec3_example" rows="2"></textarea></div>
              <div class="field"><label>Anexar Imagem (Opcional)</label><input type="file" name="sec3_image_file" accept="image/*" style="padding: 8px; border: 1px solid #ddd; border-radius: 6px; width: 100%;"></div>
            </div>

            <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 15px;">
              <div class="field"><label>3. Dicas para estudar</label><textarea name="study_tips" rows="2"></textarea></div>
              <div class="field"><label>4. O que você precisa guardar? (Resumo)</label><textarea name="summary" rows="3"></textarea></div>
            </div>
            
            <div style="background: var(--beige); padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #ead9b5;">
              <h4 style="margin: 0 0 10px 0; color: var(--navy); font-size: 14px;">5. Vamos praticar? (Quiz)</h4>
              <div class="field"><label>Pergunta</label><input name="q_prompt"></div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="field"><label>A)</label><input name="q_a"></div>
                <div class="field"><label>B)</label><input name="q_b"></div>
                <div class="field"><label>C)</label><input name="q_c"></div>
                <div class="field"><label>D)</label><input name="q_d"></div>
              </div>
              <div class="field"><label>Qual é a correta?</label>
                <select name="q_answer"><option value="0">Alternativa A</option><option value="1">Alternativa B</option><option value="2">Alternativa C</option><option value="3">Alternativa D</option></select>
              </div>
            </div>

            <div style="background: white; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 15px;">
              <div class="field"><label>6. Material Complementar (Link Opcional)</label><input name="video_url" type="url" placeholder="https://..."></div>
            </div>

            <div class="form-actions"><button class="btn btn-gold" type="submit" style="width: 100%; font-size: 16px;">Salvar Aula Completa</button></div>
          </form>
        </details>
      ` : "";

      return `<article class="module-card" style="display: block; border: 1px solid var(--line); box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="display: flex; gap: 15px; align-items: center;">
            <div class="module-number" style="background: var(--blue-soft); color: var(--navy); font-size: 20px;">✨</div>
            <div>
              <h3 style="margin: 0; color: var(--navy);">${escapeHtml(m.title)}</h3>
              <p class="muted" style="margin: 0; font-size: 13px;">${escapeHtml(m.description || "")} • ${total} aula(s)</p>
            </div>
          </div>
          ${total > 0 ? `<button class="btn btn-primary btn-small" data-custom-module="${m.id}">Abrir Módulo</button>` : '<span class="pill">Sem aulas</span>'}
        </div>
        ${teacherActions}
        ${lessonForm}
      </article>`;
    }).join("");

    const modulesHtml = subject.modules.map((module, index) => {
      const unlocked = isModuleUnlocked(subject, index);
      const done = module.lessons.filter(lesson => isLessonComplete(lesson.id)).length;
      const percent = Math.round(done / module.lessons.length * 100);
      return `<article class="module-card ${unlocked ? "" : "locked"}"><div class="module-number">${unlocked ? String(index + 1).padStart(2, "0") : "🔒"}</div><div class="module-info"><h3>${escapeHtml(module.title)}</h3><p>${escapeHtml(module.description)} • ${done}/${module.lessons.length} aulas concluídas</p><div class="progress-track" style="max-width:260px;margin-top:9px"><div class="progress-fill" style="width:${percent}%"></div></div></div>${unlocked ? `<button class="btn btn-primary btn-small" data-module="${module.id}">Abrir módulo</button>` : '<span class="pill">Bloqueado</span>'}</article>`;
    }).join("");

    app.innerHTML = `${renderHeader()}<main class="container"><button class="text-button" data-action="home">← Voltar às disciplinas</button>
    <div style="margin-top:22px; margin-bottom: 30px;">
      <p class="eyebrow">Disciplina</p>
      <h1 class="page-title">${subject.icon} ${escapeHtml(subject.name)}</h1>
      <p class="page-intro">${escapeHtml(subject.description)}</p>
    </div>
    
    ${teacherCreateHtml}
    
    <div class="section-heading"><div><h2>Trilha de aprendizagem</h2><p class="muted small">Conclua um módulo para abrir o próximo.</p></div></div>
    <section class="module-list">${modulesHtml}</section>
    
    ${customHtml ? `<div class="section-heading" style="margin-top: 50px;"><div><h2>👩‍🏫 Conteúdos da Professora</h2><p class="muted small">Módulos e aulas criados por você.</p></div></div><section class="module-list">${customHtml}</section>` : ""}</main>`;
  }
  
  function renderModule(moduleId) {
    stopLessonTimer();
    const subject = window.REAPRENDER_CATALOG.find(item => item.modules.some(module => module.id === moduleId));
    const moduleIndex = subject?.modules.findIndex(module => module.id === moduleId) ?? -1;
    const module = subject?.modules[moduleIndex];
    if (!module || !isModuleUnlocked(subject, moduleIndex)) return renderHome();
    const lessonHtml = module.lessons.map((lesson, index) => {
      const unlocked = isLessonUnlocked(module, index);
      const complete = isLessonComplete(lesson.id);
      const saved = progressMap[lesson.id]?.elapsed_seconds || 0;
      return `<article class="lesson-row"><div class="module-number">${complete ? "✓" : unlocked ? "📘" : "🔒"}</div><div class="lesson-meta"><h3>${escapeHtml(lesson.title)}</h3><p>${complete ? "Conteúdo concluído" : unlocked ? `Leitura estimada: ${lesson.minutes} min` : "Conclua a aula anterior para liberar"}${saved && !complete ? ` • ${Math.min(5, Math.floor(saved / 60))} min registrados` : ""}</p></div><span class="lesson-state">${complete ? '<span class="pill green">Concluída</span>' : unlocked ? '<span class="pill">Disponível</span>' : '<span class="pill">Bloqueada</span>'}</span>${unlocked ? `<button class="btn btn-outline btn-small" data-lesson="${lesson.id}">${complete ? "Revisar" : "Estudar"} →</button>` : ""}</article>`;
    }).join("");
    app.innerHTML = `${renderHeader()}<main class="container"><button class="text-button" data-subject="${subject.id}">← Voltar para ${escapeHtml(subject.name)}</button><div style="margin-top:22px"><p class="eyebrow">${escapeHtml(subject.name)} • Módulo ${moduleIndex + 1}</p><h1 class="page-title">${escapeHtml(module.title)}</h1><p class="page-intro">${escapeHtml(module.description)}</p></div><div class="section-heading"><div><h2>Conteúdos deste módulo</h2><p class="muted small">Leia, confirme a compreensão e pratique.</p></div></div><section class="lesson-list">${lessonHtml}</section>${isModuleComplete(module) ? '<div class="notice" style="margin-top:20px">🎉 Você concluiu este módulo! O próximo módulo já está disponível.</div>' : ''}</main>`;
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const rest = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${rest}`;
  }

  function updateLessonControls() {
    const timerNode = document.getElementById("study-timer");
    const timerProgress = document.getElementById("timer-progress");
    const readBox = document.getElementById("read-confirmation");
    const status = document.getElementById("study-status");
    const quizButton = document.getElementById("submit-quiz");
    if (!timerNode) return;
    timerNode.textContent = formatTime(elapsedSeconds);
    const percent = Math.min(100, elapsedSeconds / MIN_STUDY_SECONDS * 100);
    if (timerProgress) timerProgress.style.width = `${percent}%`;
    if (readBox) readBox.disabled = elapsedSeconds < MIN_STUDY_SECONDS;
    if (status) status.textContent = elapsedSeconds >= MIN_STUDY_SECONDS ? "Tempo mínimo alcançado. Confirme a leitura e responda à atividade." : "Mantenha esta aula aberta e ativa durante cinco minutos.";
    if (quizButton) quizButton.disabled = !(elapsedSeconds >= MIN_STUDY_SECONDS && readConfirmed);
    const finishButton = document.getElementById("finish-lesson");
    if (finishButton) finishButton.disabled = !(elapsedSeconds >= MIN_STUDY_SECONDS && readConfirmed && quizPassed);
  }

  async function periodicSave() {
    if (!activeLessonId || document.hidden) return;
    try { await saveLessonProgress(activeLessonId, { elapsed_seconds: elapsedSeconds }); }
    catch (error) { console.error("Falha ao salvar o progresso:", error); }
  }

  function startLessonTimer() {
    stopLessonTimer();
    lessonTimer = window.setInterval(() => {
      if (document.hidden || !activeLessonId) return;
      elapsedSeconds += 1;
      updateLessonControls();
      if (elapsedSeconds - lastSavedSecond >= 10) {
        lastSavedSecond = elapsedSeconds;
        periodicSave();
      }
    }, 1000);
  }

  function stopLessonTimer() {
    if (lessonTimer) window.clearInterval(lessonTimer);
    lessonTimer = null;
    if (activeLessonId && currentUser) periodicSave();
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && activeLessonId) updateLessonControls();
  });

  function renderLesson(lessonId) {
    stopLessonTimer();
    const lesson = window.findLesson(lessonId);
    if (!lesson) return renderHome();
    const module = window.findModule(window.REAPRENDER_CATALOG.flatMap(subject => subject.modules).find(item => item.lessons.some(itemLesson => itemLesson.id === lessonId)).id);
    const existing = progressMap[lessonId] || {};
    activeLessonId = lessonId;
    elapsedSeconds = Math.min(MIN_STUDY_SECONDS, Number(existing.elapsed_seconds || 0));
    lastSavedSecond = elapsedSeconds;
    readConfirmed = Boolean(existing.read_confirmed);
    quizPassed = Boolean(existing.quiz_passed);
    selectedAnswer = null;

    const sections = lesson.sections.map(section => `
      <section><h2>${escapeHtml(section.title)}</h2>${section.paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join("")}
      ${section.example ? `<div class="example-box"><strong>Exemplo prático</strong><p>${escapeHtml(section.example)}</p></div>` : ""}</section>`).join("");
    const summary = lesson.summary.map(item => `<li>${escapeHtml(item)}</li>`).join("");
    
    const isTeacher = currentProfile?.role === "teacher";
    const options = lesson.question.options.map((option, index) => `<label class="quiz-option"><input type="radio" name="lesson-answer" value="${index}" ${selectedAnswer === index ? "checked" : ""}><span>${escapeHtml(option)}</span></label>`).join("");
    
    const quizSectionHtml = isTeacher ? `
      <section style="margin-top:40px; padding:20px; background:var(--beige); border-radius:12px;">
        <h3 style="margin-top:0; color:var(--navy);">Área do Professor</h3>
        <p class="muted">Você está visualizando a aula como aluno, mas o cronômetro e o quiz estão desativados para você.</p>
      </section>
    ` : `<section id="lesson-exercise"><h2>Vamos praticar?</h2><p>${escapeHtml(lesson.question.prompt)}</p><form id="quiz-form">${options}<div class="form-actions"><button id="submit-quiz" class="btn btn-primary" type="submit" ${elapsedSeconds < MIN_STUDY_SECONDS || !readConfirmed ? "disabled" : ""}>Conferir resposta</button></div></form><div id="quiz-feedback" aria-live="polite"></div></section>`;

    const asideHtml = isTeacher ? `
      <aside class="reader-aside">
        <div class="aside-card">
          <h3>Modo Professor</h3>
          <p class="small muted">O progresso e o cronômetro não são contabilizados para a sua conta.</p>
          <button class="btn btn-primary" style="width:100%; margin-top:10px;" data-subject="${module.subject_id}">Gerenciar Conteúdo</button>
        </div>
      </aside>
    ` : `
      <aside class="reader-aside"><div class="aside-card"><h3>Seu tempo de estudo</h3><div id="study-timer" class="timer">${formatTime(elapsedSeconds)}</div><div class="progress-track"><div id="timer-progress" class="progress-fill" style="width:${Math.min(100, elapsedSeconds / MIN_STUDY_SECONDS * 100)}%"></div></div><p id="study-status" class="timer-hint">${elapsedSeconds >= MIN_STUDY_SECONDS ? "Tempo mínimo alcançado." : "Mantenha esta aula aberta e ativa durante cinco minutos."}</p><p class="timer-hint">O contador pausa quando você sai desta aba.</p></div>
      <div class="aside-card"><h3>Etapas para concluir</h3><label class="read-check"><input id="read-confirmation" type="checkbox" ${readConfirmed ? "checked" : ""} ${elapsedSeconds < MIN_STUDY_SECONDS ? "disabled" : ""}><span>Li o conteúdo e procurei compreender as explicações.</span></label><p class="small muted">A confirmação fica disponível após cinco minutos de estudo ativo.</p><div class="form-actions"><button id="finish-lesson" class="btn btn-gold" data-action="finish-lesson" ${elapsedSeconds < MIN_STUDY_SECONDS || !readConfirmed || !quizPassed ? "disabled" : ""}>Concluir conteúdo</button></div><p class="small muted">${existing.completed_at ? "Esta aula já foi concluída. Você pode revisá-la." : "Para avançar, cumpra as três etapas."}</p></div></aside>
    `;

    app.innerHTML = `${renderHeader()}<main class="container"><button class="text-button" data-module="${module.id}">← Voltar ao módulo</button><div class="reader-layout" style="margin-top:20px"><article class="reader"><p class="eyebrow">Apostila digital • ${escapeHtml(module.title)}</p><h1>${escapeHtml(lesson.title)}</h1><p class="lead">${escapeHtml(lesson.lead)}</p><div class="notice">Leia com calma. Você pode voltar a qualquer trecho e revisar quantas vezes precisar.</div>${sections}<section><h2>O que você precisa guardar</h2><ul>${summary}</ul></section>${quizSectionHtml}</article>
      ${asideHtml}</div></main>`;
      
    if (!isTeacher) {
      updateLessonControls();
      startLessonTimer();
    }
  }

  async function renderTeacherPanel() {
    stopLessonTimer();
    if (currentProfile?.role !== "teacher") return renderHome();
    
    app.innerHTML = `${renderHeader()}<main class="container"><p class="eyebrow">Área de orientação</p><h1 class="page-title">Painel de Acompanhamento</h1><p class="page-intro">Acompanhe o progresso dos estudantes. Para criar novos conteúdos, acesse a página da disciplina desejada.</p><div id="teacher-data" class="content-card" style="margin-top:25px">Carregando...</div></main>`;
    
    if (isDemo) {
      document.getElementById("teacher-data").innerHTML = `<div class="notice warning">Visualização de demonstração.</div>`;
      return;
    }

    const { data: profiles, error: profilesError } = await supabaseClient.from("profiles").select("id, full_name, role, created_at").eq("role", "student").order("created_at", { ascending: false });
    if (profilesError) {
      document.getElementById("teacher-data").innerHTML = `<div class="notice warning">Erro ao carregar estudantes.</div>`;
      return;
    }
    
    const { data: rows, error: rowsError } = await supabaseClient.from("lesson_progress").select("user_id, lesson_id, completed_at, updated_at, elapsed_seconds");
    if (rowsError) return;

    if (!profiles?.length) {
      document.getElementById("teacher-data").innerHTML = '<div class="empty-state">Ainda não há estudantes.</div>';
      return;
    }

    const allLessons = window.getAllLessons();
    const rowsHtml = profiles.map(profile => {
      const userRows = (rows || []).filter(row => row.user_id === profile.id);
      const done = userRows.filter(row => row.completed_at).length;
      const total = allLessons.length;
      const percent = Math.round(done / total * 100);
      
      let lastActivity = "Nunca acessou";
      if (userRows.length > 0) {
        const dates = userRows.map(r => new Date(r.updated_at).getTime());
        const maxDate = new Date(Math.max(...dates));
        lastActivity = `Último acesso: ${maxDate.toLocaleDateString("pt-BR")} às ${maxDate.toLocaleTimeString("pt-BR", {hour: '2-digit', minute:'2-digit'})}`;
      }

      return `<tr>
        <td><strong>${escapeHtml(profile.full_name || "Estudante")}</strong><br><span class="muted" style="font-size:11px;">${lastActivity}</span></td>
        <td>${done} de ${total}</td>
        <td><div style="display:flex;align-items:center;gap:8px"><div class="progress-track" style="width:100px"><div class="progress-fill" style="width:${percent}%"></div></div>${percent}%</div></td>
        <td><button class="btn btn-outline btn-small" data-student="${profile.id}">Ver detalhes</button></td>
      </tr>`;
    }).join("");
    
    document.getElementById("teacher-data").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Estudante</th><th>Aulas concluídas</th><th>Progresso</th><th>Acompanhamento</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
  }

  async function renderStudentDetails(studentId) {
    if (currentProfile?.role !== "teacher" || isDemo) return;
    const { data: profile } = await supabaseClient.from("profiles").select("full_name").eq("id", studentId).single();
    const { data: rows } = await supabaseClient.from("lesson_progress").select("lesson_id, elapsed_seconds, completed_at, updated_at").eq("user_id", studentId);
    
    const completedIds = new Set((rows || []).filter(row => row.completed_at).map(row => row.lesson_id));
    const allLessons = window.getAllLessons();
    const total = allLessons.length;
    const doneCount = completedIds.size;
    const percent = Math.round(doneCount / total * 100);

    const doneLessons = allLessons.filter(l => completedIds.has(l.id));
    const pendingLessons = allLessons.filter(l => !completedIds.has(l.id));

    const doneHtml = doneLessons.map(l => `<li style="color: var(--success); margin-bottom: 5px;">✅ ${escapeHtml(l.title)}</li>`).join("");
    const pendingHtml = pendingLessons.map(l => `<li style="color: var(--muted); margin-bottom: 5px;">⏳ ${escapeHtml(l.title)}</li>`).join("");

    const target = document.getElementById("teacher-data");
    target.innerHTML = `
      <button class="text-button" data-action="teacher">← Voltar ao painel</button>
      
      <div style="display: flex; align-items: center; gap: 20px; margin: 20px 0; padding-bottom: 20px; border-bottom: 1px solid var(--line);">
        <div style="width: 70px; height: 70px; border-radius: 50%; background: var(--blue-soft); color: var(--navy); display: grid; place-items: center; font-size: 28px; font-weight: bold;">
          ${escapeHtml(profile?.full_name ? profile.full_name.charAt(0).toUpperCase() : "E")}
        </div>
        <div>
          <h2 style="margin: 0;">${escapeHtml(profile?.full_name || "Estudante")}</h2>
          <p class="muted" style="margin: 0;">Progresso Geral: <strong>${percent}%</strong> (${doneCount} de ${total} aulas)</p>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">
        <div style="background: #e8f4ee; padding: 15px; border-radius: 12px; border: 1px solid #c3e6d6;">
          <h3 style="color: var(--success); margin-top: 0;">🌟 Indo bem (Concluídas)</h3>
          <ul style="padding-left: 20px; margin: 0; font-size: 14px;">${doneHtml || "<li>Nenhuma aula concluída ainda.</li>"}</ul>
        </div>
        
        <div style="background: #fff5df; padding: 15px; border-radius: 12px; border: 1px solid #f0e2b6;">
          <h3 style="color: #74551c; margin-top: 0;">💡 Precisa de apoio (Pendentes)</h3>
          <ul style="padding-left: 20px; margin: 0; font-size: 14px;">${pendingHtml || "<li>Todas as aulas foram concluídas!</li>"}</ul>
        </div>
      </div>
    `;
  }

  function enterDemo(role = "student") {
    isDemo = true;
    const demoId = role === "teacher" ? "demo-teacher" : "demo-student";
    currentUser = { id: demoId, email: role === "teacher" ? "professora@demo.local" : "estudante@demo.local" };
    currentProfile = { id: demoId, full_name: role === "teacher" ? "Professora demonstração" : "Estudante demonstração", role };
    localStorage.setItem(DEMO_USER_KEY, "true");
    loadDemoProgress();
    renderHome();
    toast("Você entrou no ambiente de demonstração.");
  }

  async function handleAuthSubmit(form) {
    if (!supabaseClient) return toast("Configure o Supabase.", "error");
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const fullName = String(formData.get("fullName") || "").trim();
    const mode = form.dataset.mode || "login";
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      if (mode === "signup") {
        const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
        if (error) throw error;
        if (data.session) {
          currentUser = data.user;
          await loadOnlineProfile();
          await loadCustomContent();
          await loadWall();
          renderHome();
          toast("Conta criada! Boas-vindas ao REAPRENDER.");
        } else {
          toast("Cadastro recebido. Confira seu e-mail.");
          renderAuth("login");
        }
      } else if (mode === "reset") {
        const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (error) throw error;
        toast("Se o e-mail estiver cadastrado, você receberá as instruções.");
      } else if (mode === "new-password") {
        const { error } = await supabaseClient.auth.updateUser({ password });
        if (error) throw error;
        currentUser = (await supabaseClient.auth.getUser()).data.user;
        await loadOnlineProfile();
        await loadCustomContent();
        await loadWall();
        renderHome();
        toast("Senha atualizada com sucesso.");
      } else {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) throw error;
        currentUser = data.user;
        isDemo = false;
        await loadOnlineProfile();
        await loadCustomContent();
        await loadWall();
        renderHome();
        toast("Login realizado. Bons estudos!");
      }
    } catch (error) {
      console.error(error);
      toast(error.message || "Não foi possível concluir a operação.", "error");
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function logout() {
    stopLessonTimer();
    if (isDemo) localStorage.removeItem(DEMO_USER_KEY);
    else if (supabaseClient) await supabaseClient.auth.signOut();
    currentUser = null;
    currentProfile = null;
    progressMap = {};
    isDemo = false;
    renderAuth("login");
  }

  document.addEventListener("click", async event => {
    const target = event.target.closest("button");
    if (!target) return;
    if (target.dataset.authMode) return renderAuth(target.dataset.authMode);
    if (target.dataset.subject) return renderSubject(target.dataset.subject);
    if (target.dataset.module) return renderModule(target.dataset.module);
    if (target.dataset.lesson) return renderLesson(target.dataset.lesson);
    if (target.dataset.student) return renderStudentDetails(target.dataset.student);
    
    // --- ABRIR MÓDULO E AULA PERSONALIZADA ---
    if (target.dataset.customModule) {
      const mod = window.CUSTOM_MODULES.find(m => m.id === Number(target.dataset.customModule));
      const lessons = window.CUSTOM_LESSONS.filter(l => l.module_id === mod.id);
      if(lessons.length > 0) return renderCustomLesson(lessons[0].id);
    }
    if (target.dataset.customLesson) return renderCustomLesson(target.dataset.customLesson);

    const action = target.dataset.action;
    if (action === "home") return renderHome();
    if (action === "logout") return logout();
    if (action === "demo-login") return enterDemo("student");
    if (action === "demo-teacher-login") return enterDemo("teacher");
    if (action === "teacher") return renderTeacherPanel();
    if (action === "continue-learning") {
      const allLessons = window.getAllLessons();
      const firstIncomplete = allLessons.find(lesson => !isLessonComplete(lesson.id) && Number(progressMap[lesson.id]?.elapsed_seconds || 0) > 0) || allLessons.find(lesson => !isLessonComplete(lesson.id));
      if (firstIncomplete) return renderLesson(firstIncomplete.id);
      return toast("Você concluiu todas as aulas disponíveis. Parabéns!");
    }
    if (action === "finish-lesson") {
      if (elapsedSeconds < MIN_STUDY_SECONDS || !readConfirmed || !quizPassed) return toast("Complete o tempo, confirme a leitura e acerte a atividade.", "error");
      try {
        await saveLessonProgress(activeLessonId, { elapsed_seconds: elapsedSeconds, read_confirmed: true, quiz_passed: true, completed_at: new Date().toISOString() });
        const lessonId = activeLessonId;
        activeLessonId = null;
        stopLessonTimer();
        toast("Conteúdo concluído! O próximo passo está liberado.");
        const module = window.findModule(window.REAPRENDER_CATALOG.flatMap(subject => subject.modules).find(item => item.lessons.some(itemLesson => itemLesson.id === lessonId)).id);
        renderModule(module.id);
      } catch (error) {
        toast(error.message || "Não foi possível salvar a conclusão.", "error");
      }
    }

    // --- MURAL (CURTIDAS, EDIÇÃO E EXCLUSÃO) ---
    if (target.dataset.like) {
      const postId = Number(target.dataset.like);
      if (isDemo) { toast("Curtidas disponíveis no modo online."); return; }
      const has = wallLikesSet.has(postId);
      if (has) {
        await supabaseClient.from("wall_likes").delete().match({ post_id: postId, user_id: currentUser.id });
        wallLikesSet.delete(postId);
      } else {
        await supabaseClient.from("wall_likes").insert({ post_id: postId, user_id: currentUser.id });
        wallLikesSet.add(postId);
      }
      renderHome();
    }

    if (target.dataset.replyComment) {
      const commentId = target.dataset.replyComment;
      const commentItem = target.closest('.comment-item');
      const existingForm = commentItem.querySelector('.reply-form');
      if (existingForm) { existingForm.remove(); return; }

      const formHtml = `
        <form class="wall-comment-form reply-form" data-post-id="${commentItem.closest('.wall-post').dataset.postId}" data-parent-id="${commentId}" style="margin-top: 10px;">
          <input name="body" placeholder="Sua resposta..." required maxlength="400" autofocus>
          <button class="btn btn-outline btn-small" type="submit">Enviar</button>
        </form>`;
      commentItem.querySelector('.comment-content').insertAdjacentHTML('beforeend', formHtml);
    }

    if (target.dataset.editPost) {
      const article = target.closest('.wall-post');
      article.querySelector('.post-body-text').style.display = 'none';
      article.querySelector('.post-edit-form').style.display = 'block';
    }
    if (target.dataset.saveEditPost) {
      const postId = Number(target.dataset.saveEditPost);
      const article = target.closest('.wall-post');
      const newBody = article.querySelector('.post-edit-form textarea').value;
      if (!newBody.trim()) return;
      const { error } = await supabaseClient.from("wall_posts").update({ body: newBody }).eq("id", postId);
      if (error) return toast(error.message, "error");
      toast("Publicação atualizada!");
      await loadWall(); renderHome();
    }

    if (target.dataset.deletePost) {
      if (!confirm("Tem certeza que deseja excluir esta publicação?")) return;
      const postId = Number(target.dataset.deletePost);
      const { error } = await supabaseClient.from("wall_posts").delete().eq("id", postId);
      if (error) return toast(error.message, "error");
      toast("Publicação excluída.");
      await loadWall(); renderHome();
    }

    if (target.dataset.editComment) {
      const commentId = target.dataset.editComment;
      const li = target.closest('.comment-item');
      const textSpan = li.querySelector('.comment-text');
      if (li.querySelector('.edit-comment-input')) return;
      
      const currentText = textSpan.textContent;
      textSpan.style.display = 'none';
      target.style.display = 'none';
      const inputHtml = `<div class="edit-comment-input" style="margin-top:5px; display:flex; gap:5px;">
        <input type="text" value="${escapeHtml(currentText)}" style="flex:1; padding:5px; border:1px solid #ccc; border-radius:4px;">
        <button class="btn btn-primary btn-small" data-save-edit-comment="${commentId}">Salvar</button>
      </div>`;
      li.querySelector('.comment-content').insertAdjacentHTML('beforeend', inputHtml);
    }
    if (target.dataset.saveEditComment) {
      const commentId = Number(target.dataset.saveEditComment);
      const li = target.closest('.comment-item');
      const newBody = li.querySelector('.edit-comment-input input').value;
      if (!newBody.trim()) return;
      const { error } = await supabaseClient.from("wall_comments").update({ body: newBody }).eq("id", commentId);
      if (error) return toast(error.message, "error");
      toast("Comentário atualizado!");
      await loadWall(); renderHome();
    }

    if (target.dataset.deleteComment) {
      if (!confirm("Excluir este comentário (e suas respostas)?")) return;
      const commentId = Number(target.dataset.deleteComment);
      const { error } = await supabaseClient.from("wall_comments").delete().eq("id", commentId);
      if (error) return toast(error.message, "error");
      toast("Comentário excluído.");
      await loadWall(); renderHome();
    }

    // --- MÓDULOS DA PROFESSORA (EDIÇÃO, EXCLUSÃO E ORDEM) ---
    if (target.dataset.editMod) {
      const modId = Number(target.dataset.editMod);
      const mod = window.CUSTOM_MODULES.find(m => m.id === modId);
      if (!mod) return;
      
      const newTitle = prompt("Editar título do módulo:", mod.title);
      if (newTitle === null) return;
      const newDesc = prompt("Editar descrição do módulo:", mod.description || "");
      if (newDesc === null) return;

      if (newTitle.trim()) {
        const { error } = await supabaseClient.from("custom_modules").update({ title: newTitle.trim(), description: newDesc.trim() }).eq("id", modId);
        if (error) return toast(error.message, "error");
        toast("Módulo atualizado!");
        await loadCustomContent();
        return renderSubject(mod.subject_id);
      }
    }

    if (target.dataset.deleteMod) {
      if (!confirm("Tem certeza que deseja excluir este módulo? Todas as aulas e quizzes dele serão apagados.")) return;
      const modId = Number(target.dataset.deleteMod);
      const mod = window.CUSTOM_MODULES.find(m => m.id === modId);
      if (!mod) return;
      
      const { error } = await supabaseClient.from("custom_modules").delete().eq("id", modId);
      if (error) return toast(error.message, "error");
      toast("Módulo excluído.");
      await loadCustomContent();
      return renderSubject(mod.subject_id);
    }

    if (target.dataset.moveMod) {
      const modId = Number(target.dataset.moveMod);
      const dir = target.dataset.dir;
      const list = window.CUSTOM_MODULES;
      const currentIndex = list.findIndex(m => m.id === modId);
      const mod = list[currentIndex];
      
      if (dir === "up" && currentIndex > 0) {
        const prevMod = list[currentIndex - 1];
        const tempPos = list[currentIndex].position;
        await supabaseClient.from("custom_modules").update({ position: prevMod.position }).eq("id", modId);
        await supabaseClient.from("custom_modules").update({ position: tempPos }).eq("id", prevMod.id);
      } 
      else if (dir === "down" && currentIndex < list.length - 1) {
        const nextMod = list[currentIndex + 1];
        const tempPos = list[currentIndex].position;
        await supabaseClient.from("custom_modules").update({ position: nextMod.position }).eq("id", modId);
        await supabaseClient.from("custom_modules").update({ position: tempPos }).eq("id", nextMod.id);
      }
      
      toast("Sequência atualizada!");
      await loadCustomContent();
      return renderSubject(mod.subject_id);
    }
  });

  document.addEventListener("submit", async event => {
    if (event.target.id === "auth-form") {
      event.preventDefault();
      await handleAuthSubmit(event.target);
    }
    
    if (event.target.id === "quiz-form") {
      event.preventDefault();
      if (elapsedSeconds < MIN_STUDY_SECONDS || !readConfirmed) return toast("Primeiro conclua os cinco minutos e confirme a leitura.", "error");
      const selected = event.target.querySelector('input[name="lesson-answer"]:checked');
      if (!selected) return toast("Escolha uma alternativa antes de conferir.", "error");
      selectedAnswer = Number(selected.value);
      const lesson = window.findLesson(activeLessonId);
      const feedback = document.getElementById("quiz-feedback");
      if (selectedAnswer === lesson.question.answer) {
        quizPassed = true;
        feedback.className = "quiz-feedback correct";
        feedback.textContent = `Resposta correta! ${lesson.question.explanation}`;
        await saveLessonProgress(activeLessonId, { elapsed_seconds: elapsedSeconds, read_confirmed: true, quiz_passed: true });
      } else {
        quizPassed = false;
        feedback.className = "quiz-feedback incorrect";
        feedback.textContent = "Ainda não é essa resposta. Volte ao conteúdo, releia a explicação e tente novamente. Você consegue!";
      }
      updateLessonControls();
    }

    if (event.target.id === "custom-quiz-form") {
      event.preventDefault();
      const selected = event.target.querySelector('input[name="custom-answer"]:checked');
      if (!selected) return toast("Escolha uma alternativa.", "error");
      
      const correct = Number(event.target.dataset.answer);
      const feedback = document.getElementById("custom-quiz-feedback");
      
      if (Number(selected.value) === correct) {
        feedback.className = "quiz-feedback correct";
        feedback.textContent = "Resposta correta! Parabéns.";
        toast("Você acertou o quiz!");
      } else {
        feedback.className = "quiz-feedback incorrect";
        feedback.textContent = "Resposta incorreta. Tente novamente!";
      }
    }

    if (event.target.id === "form-module") {
      event.preventDefault();
      if (currentProfile?.role !== "teacher") return toast("Apenas a professora pode criar módulos.", "error");
      const f = new FormData(event.target);
      const nextPos = (window.CUSTOM_MODULES?.length || 0) > 0 ? Math.max(...window.CUSTOM_MODULES.map(m => m.position || 0)) + 1 : 1;

      const { error } = await supabaseClient.from("custom_modules").insert({
        subject_id: f.get("subject_id"), title: f.get("title"),
        description: f.get("description") || "", created_by: currentUser.id,
        position: nextPos
      });
      if (error) return toast(error.message, "error");
      toast("Módulo criado!");
      await loadCustomContent();
      return renderSubject(f.get("subject_id"));
    }

    if (event.target.classList.contains("form-lesson")) {
      event.preventDefault();
      const submitBtn = event.target.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = "Salvando...";
      submitBtn.disabled = true;

      const f = new FormData(event.target);
      const sections = [];

      try {
        for (let i = 1; i <= 3; i++) {
          const title = f.get(`sec${i}_title`);
          const text = f.get(`sec${i}_text`);
          const example = f.get(`sec${i}_example`);
          const imageFile = f.get(`sec${i}_image_file`);
          
          let imageUrl = "";

          if (imageFile && imageFile.size > 0) {
            const fileExt = imageFile.name.split('.').pop();
            const fileName = `${Date.now()}_${i}.${fileExt}`;
            const { data: uploadData, error: uploadError } = await supabaseClient.storage
              .from("aulas")
              .upload(fileName, imageFile);
            
            if (uploadError) throw new Error("Erro ao enviar imagem: " + uploadError.message);

            const { data: publicUrlData } = supabaseClient.storage.from("aulas").getPublicUrl(fileName);
            imageUrl = publicUrlData.publicUrl;
          }

          if (title && text) {
            sections.push({ title, paragraphs: [text], example: example || "", image_url: imageUrl });
          }
        }

        const prompt = f.get("q_prompt") ? String(f.get("q_prompt")).trim() : "";
        const optA = prompt ? String(f.get("q_a")).trim() : "";
        const optB = prompt ? String(f.get("q_b")).trim() : "";
        const optC = prompt ? String(f.get("q_c")).trim() : "";
        const optD = prompt ? String(f.get("q_d")).trim() : "";

        const { error } = await supabaseClient.from("custom_lessons").insert({
          module_id: Number(event.target.dataset.moduleId),
          title: f.get("title"), 
          lead: f.get("lead") || "",
          sections_json: sections,
          summary: f.get("summary") || "",
          study_tips: f.get("study_tips") || "",
          content: "",
          video_url: f.get("video_url") || "", 
          extra_link: f.get("extra_link") || "",
          question_prompt: prompt,
          question_option_a: optA,
          question_option_b: optB,
          question_option_c: optC,
          question_option_d: optD,
          question_answer: Number(f.get("q_answer") || 0)
        });
        
        if (error) throw error;
        
        toast("Aula e imagens salvas com sucesso!");
        await loadCustomContent();
        const mod = window.CUSTOM_MODULES.find(m => m.id === Number(event.target.dataset.moduleId));
        return renderSubject(mod.subject_id);

      } catch (error) {
        console.error(error);
        toast(error.message, "error");
      } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    }

    if (event.target.id === "wall-form") {
      event.preventDefault();
      if (!currentUser) return;
      const f = new FormData(event.target);
      if (isDemo) {
        wallPosts.unshift({
          id: Date.now(), author_id: currentUser.id, body: f.get("body"),
          attachment_url: f.get("attachment_url") || "",
          attachment_label: f.get("attachment_label") || "",
          created_at: new Date().toISOString()
        });
        localStorage.setItem("reaprender_demo_wall", JSON.stringify(wallPosts));
      } else {
        const { error } = await supabaseClient.from("wall_posts").insert({
          author_id: currentUser.id, body: f.get("body"),
          attachment_url: f.get("attachment_url") || "",
          attachment_label: f.get("attachment_label") || ""
        });
        if (error) return toast(error.message, "error");
        await loadWall();
      }
      toast("Publicado!");
      renderHome();
    }

    if (event.target.classList.contains("wall-comment-form")) {
      event.preventDefault();
      const postId = Number(event.target.dataset.postId);
      const parentId = event.target.dataset.parentId ? Number(event.target.dataset.parentId) : null;
      const body = new FormData(event.target).get("body");
      
      if (isDemo) {
        wallComments.push({ id: Date.now(), post_id: postId, parent_id: parentId, author_id: currentUser.id, body, created_at: new Date().toISOString() });
      } else {
        const { error } = await supabaseClient.from("wall_comments").insert({ 
          post_id: postId, 
          parent_id: parentId, 
          author_id: currentUser.id, 
          body 
        });
        if (error) return toast(error.message, "error");
        await loadWall();
      }
      toast(parentId ? "Resposta enviada!" : "Comentário enviado!");
      renderHome();
    }
  });

  document.addEventListener("change", async event => {
    if (event.target.id === "read-confirmation") {
      readConfirmed = event.target.checked;
      if (!readConfirmed) quizPassed = false;
      try { await saveLessonProgress(activeLessonId, { elapsed_seconds: elapsedSeconds, read_confirmed: readConfirmed, quiz_passed: quizPassed }); }
      catch (error) { toast("Não foi possível salvar sua confirmação.", "error"); }
      updateLessonControls();
    }
  });

  async function initializeApp() {
    initializeSupabase();
    if (supabaseClient) {
      const { data } = await supabaseClient.auth.getSession();
      if (data.session) {
        currentUser = data.session.user;
        try {
          await loadOnlineProfile();
          await loadCustomContent();
          await loadWall();
          renderHome();
          return;
        } catch (error) {
          console.error("Não foi possível carregar o perfil:", error);
          toast("Não foi possível carregar seu perfil.", "error");
        }
      }
      supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (!session) return;
        currentUser = session.user;
        if (event === "PASSWORD_RECOVERY") renderAuth("new-password");
      });
    }
    renderAuth("login");
  }

  initializeApp();
})();