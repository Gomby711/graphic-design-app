let LESSONS = [];
let activeId = null;

const ICON_PS = `<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#001E36"/><text x="16" y="22.5" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#31A8FF" text-anchor="middle">Ps</text></svg>`;
const ICON_ADVANCED = `<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#241902"/><text x="16" y="23" font-family="Georgia, 'Times New Roman', serif" font-size="19" font-weight="700" fill="#FFD447" text-anchor="middle">A</text></svg>`;
const ICON_AE = `<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#00005B"/><text x="16" y="22.5" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" fill="#9999FF" text-anchor="middle">Ae</text></svg>`;
const ICON_FIGMA = `<svg viewBox="0 0 38 57"><path d="M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38C23.2533 38 19 33.7467 19 28.5Z" fill="#1ABCFE"/><path d="M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z" fill="#0ACF83"/><path d="M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.25329 33.7467 0 28.5 0H19Z" fill="#FF7262"/><path d="M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.25329 0 9.5Z" fill="#F24E1E"/><path d="M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z" fill="#A259FF"/></svg>`;

const GROUPS = [
  { id: "fundamentals", label: "Fundamentals", icon: "📐", match: l => isRoman(l.tab) },
  { id: "lessons", label: "Photoshop Lessons", icon: ICON_PS, match: l => !isRoman(l.tab) && !l.category },
  { id: "advanced-photoshop", label: "Advanced Photoshop Lessons", icon: ICON_ADVANCED, match: l => l.category === "advanced-photoshop" },
  { id: "ae", label: "Motion Design in Adobe After Effects", icon: ICON_AE, match: l => l.category === "ae" },
  { id: "figma", label: "Figma Lessons", icon: ICON_FIGMA, match: l => l.category === "figma" },
  { id: "photo", label: "Aspect Ratio / Photography / Lenses", icon: "📷", match: l => l.category === "photo" },
  { id: "colorspace", label: "Colorspaces", icon: "🌈", match: l => l.category === "colorspace" },
  { id: "ai", label: "AI Lessons", icon: "🤖", match: l => l.category === "ai" },
];

let sidebarCollapsed = localStorage.getItem("sidebarCollapsed") === "1";

function applySidebarCollapsed() {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("sidebar-toggle");
  sidebar.classList.toggle("collapsed", sidebarCollapsed);
  toggle.querySelector(".chevron").textContent = sidebarCollapsed ? "»" : "«";
  toggle.title = sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar";
}

function toggleSidebarCollapsed() {
  sidebarCollapsed = !sidebarCollapsed;
  localStorage.setItem("sidebarCollapsed", sidebarCollapsed ? "1" : "0");
  applySidebarCollapsed();
}

function expandSidebarAndGroup(groupId) {
  if (sidebarCollapsed) {
    sidebarCollapsed = false;
    localStorage.setItem("sidebarCollapsed", "0");
    applySidebarCollapsed();
  }
  collapsedGroups.delete(groupId);
  saveCollapsedGroups();
  renderSidebar();
}

let collapsedGroups = new Set();
const storedCollapsed = localStorage.getItem("collapsedGroups");
if (storedCollapsed === null) {
  // first visit: keep only the first group open so the sidebar isn't overwhelming
  collapsedGroups = new Set(GROUPS.slice(1).map(g => g.id));
} else {
  try {
    collapsedGroups = new Set(JSON.parse(storedCollapsed));
  } catch (e) { collapsedGroups = new Set(); }
}

function isRoman(tab) {
  return /^[IVX]+$/.test(tab);
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function groupForLesson(lesson) {
  return GROUPS.find(g => g.match(lesson));
}

function saveCollapsedGroups() {
  localStorage.setItem("collapsedGroups", JSON.stringify([...collapsedGroups]));
}

function toggleGroup(groupId) {
  if (collapsedGroups.has(groupId)) collapsedGroups.delete(groupId);
  else collapsedGroups.add(groupId);
  saveCollapsedGroups();
  renderSidebar();
}

function renderSidebar() {
  const wrap = document.getElementById("sidebar-groups");
  wrap.innerHTML = "";

  for (const group of GROUPS) {
    const lessons = LESSONS.filter(group.match);
    if (!lessons.length) continue;

    const groupEl = document.createElement("div");
    groupEl.className = "sidebar-group";
    const isCollapsed = collapsedGroups.has(group.id);

    const header = document.createElement("div");
    header.className = "sidebar-group-header";
    header.title = group.label;
    header.innerHTML = `<span class="group-chevron">${isCollapsed ? "▸" : "▾"}</span>
      <span class="sidebar-group-icon">${group.icon || "•"}</span>
      <span class="sidebar-group-label">${escapeHtml(group.label)}</span>
      <span class="group-count">${lessons.length}</span>`;
    header.addEventListener("click", () => {
      if (sidebarCollapsed) expandSidebarAndGroup(group.id);
      else toggleGroup(group.id);
    });
    groupEl.appendChild(header);

    const body = document.createElement("div");
    body.className = "sidebar-group-body" + (isCollapsed ? " collapsed" : "");
    const ul = document.createElement("ul");
    ul.className = "tab-list";
    for (const lesson of lessons) {
      const li = document.createElement("li");
      li.className = "tab-item" + (lesson.id === activeId ? " active" : "");
      li.dataset.id = lesson.id;
      li.innerHTML = `<span class="tab-badge">${lesson.tab}</span><span>${escapeHtml(lesson.title)}</span>`;
      li.addEventListener("click", () => selectLesson(lesson.id));
      ul.appendChild(li);
    }
    body.appendChild(ul);
    groupEl.appendChild(body);
    wrap.appendChild(groupEl);
  }
}

function youtubeEmbedUrl(video) {
  const start = video.start ? `?start=${video.start}` : "";
  return `https://www.youtube.com/embed/${video.id}${start}`;
}

function openLightbox(src) {
  let lb = document.getElementById("lightbox");
  if (!lb) {
    lb = document.createElement("div");
    lb.id = "lightbox";
    lb.innerHTML = `<button id="lightbox-close">&times;</button><img id="lightbox-img">`;
    lb.addEventListener("click", () => lb.remove());
    document.body.appendChild(lb);
  }
  lb.querySelector("#lightbox-img").src = src;
}

function updateTopbar(group, lesson) {
  const crumb = document.getElementById("crumb-category");
  const counter = document.getElementById("crumb-counter");
  if (!group || !lesson) {
    crumb.innerHTML = `<span class="crumb-group">Tools</span>
      <span class="crumb-sep">&rsaquo;</span>
      <span class="crumb-lesson">Color Theory Studio</span>`;
    counter.textContent = "";
    return;
  }
  crumb.innerHTML = `<span class="crumb-group">${escapeHtml(group.label)}</span>
    <span class="crumb-sep">&rsaquo;</span>
    <span class="crumb-lesson">${escapeHtml(lesson.title)}</span>`;
  const lessons = LESSONS.filter(group.match);
  const idx = lessons.findIndex(l => l.id === lesson.id);
  counter.textContent = `Lesson ${idx + 1} / ${lessons.length}`;
}

function renderLessonNav(group, lesson) {
  const lessons = LESSONS.filter(group.match);
  const idx = lessons.findIndex(l => l.id === lesson.id);
  const prev = lessons[idx - 1];
  const next = lessons[idx + 1];
  return `<div class="lesson-nav">
    <button class="lesson-nav-btn lesson-nav-prev" id="lesson-prev-btn" ${prev ? "" : "disabled"}>
      &larr; ${prev ? `<span>${escapeHtml(prev.title)}</span>` : "<span>Start of section</span>"}
    </button>
    <button class="lesson-nav-btn lesson-nav-next" id="lesson-next-btn" ${next ? "" : "disabled"}>
      ${next ? `<span>${escapeHtml(next.title)}</span>` : "<span>End of section</span>"} &rarr;
    </button>
  </div>`;
}

function renderLesson(lesson) {
  const pane = document.getElementById("content-pane");
  const group = groupForLesson(lesson);
  updateTopbar(group, lesson);

  let html = `<div id="content-inner"><h1 class="lesson-title">${lesson.tab}. ${escapeHtml(lesson.title)}</h1>`;
  if (lesson.intro) {
    html += `<p class="lesson-intro">${escapeHtml(lesson.intro)}</p>`;
  }
  if (lesson.video) {
    html += `<div class="video-embed"><iframe src="${youtubeEmbedUrl(lesson.video)}"
      title="Video for ${escapeHtml(lesson.title)}" allowfullscreen
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"></iframe></div>`;
  }
  if (lesson.tool_preview) {
    html += `<div class="tool-preview-wrap">
      <iframe src="${lesson.tool_preview.src}" title="${escapeHtml(lesson.tool_preview.title)}"></iframe>
      <div class="tool-preview-cta">
        <span>${escapeHtml(lesson.tool_preview.caption)}</span>
        <button class="tool-open-btn" id="open-tool-btn">Open full tool &rarr;</button>
      </div>
    </div>`;
  }

  for (const section of lesson.sections) {
    html += `<div class="section-block"><h2 class="section-heading">${escapeHtml(section.heading)}</h2>`;
    section.bullets.forEach((bullet, i) => {
      const gif = section.bullet_gifs && section.bullet_gifs[i];
      html += `<div class="bullet-row">
        <div class="bullet-text">${escapeHtml(bullet)}</div>
        ${gif ? `<div class="bullet-gif-wrap" data-gif="${gif}"><img src="${gif}" loading="lazy" alt="Demonstration gif">
          <div class="bullet-gif-label">demo &mdash; click to enlarge</div></div>` : ""}
      </div>`;
    });
    html += `</div>`;
  }

  if (group) html += renderLessonNav(group, lesson);

  html += `</div>`;
  pane.innerHTML = html;
  const openToolBtn = document.getElementById("open-tool-btn");
  if (openToolBtn) openToolBtn.addEventListener("click", () => selectTool("color-wheel"));

  if (group) {
    const lessons = LESSONS.filter(group.match);
    const idx = lessons.findIndex(l => l.id === lesson.id);
    const prevBtn = document.getElementById("lesson-prev-btn");
    const nextBtn = document.getElementById("lesson-next-btn");
    if (prevBtn && lessons[idx - 1]) prevBtn.addEventListener("click", () => selectLesson(lessons[idx - 1].id));
    if (nextBtn && lessons[idx + 1]) nextBtn.addEventListener("click", () => selectLesson(lessons[idx + 1].id));
  }

  pane.querySelectorAll(".bullet-gif-wrap").forEach(el => {
    el.addEventListener("click", () => openLightbox(el.dataset.gif));
    const img = el.querySelector("img");
    const forceLandscape = lesson.id === "2-object-shadow";
    const applyOrientation = () => {
      if (forceLandscape) {
        el.classList.add("orientation-landscape");
        return;
      }
      if (img.naturalWidth && img.naturalHeight) {
        el.classList.add(img.naturalWidth >= img.naturalHeight ? "orientation-landscape" : "orientation-portrait");
      }
    };
    if (img.complete) applyOrientation();
    else img.addEventListener("load", applyOrientation);
  });
}

function renderTool(toolId) {
  const pane = document.getElementById("content-pane");
  if (toolId === "color-wheel") {
    pane.innerHTML = `<div id="tool-frame-wrap"><iframe id="tool-frame" src="color-wheel-tool/index.html" title="Color Theory Studio"></iframe></div>`;
  }
}

function expandGroupFor(lessonId) {
  const lesson = LESSONS.find(l => l.id === lessonId);
  if (!lesson) return;
  const group = groupForLesson(lesson);
  if (group && collapsedGroups.has(group.id)) {
    collapsedGroups.delete(group.id);
    saveCollapsedGroups();
  }
}

function selectLesson(id) {
  activeId = id;
  document.getElementById("tab-color-wheel-tool").classList.remove("active");
  expandGroupFor(id);
  renderSidebar();
  const lesson = LESSONS.find(l => l.id === id);
  if (lesson) renderLesson(lesson);
}

function selectTool(toolId) {
  activeId = null;
  renderSidebar();
  document.getElementById("tab-color-wheel-tool").classList.add("active");
  updateTopbar(null, null);
  renderTool(toolId);
}

const GITHUB_REPO = "Gomby711/graphic-design-app";
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

async function checkForUpdate() {
  const btn = document.getElementById("update-btn");
  try {
    const [verRes, relRes] = await Promise.all([
      fetch("/api/version"),
      fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`),
    ]);
    if (!verRes.ok || !relRes.ok) return;
    const { version, frozen } = await verRes.json();
    const release = await relRes.json();
    const latest = (release.tag_name || "").replace(/^v/, "");
    if (!latest || latest === version) return;

    btn.textContent = `Update to v${latest}`;
    btn.hidden = false;
    btn.disabled = false;
    btn.onclick = () => runUpdate(btn, frozen);
  } catch (e) {
    // offline, rate-limited, or no releases yet — skip silently
  }
}

async function runUpdate(btn, frozen) {
  if (!frozen) {
    window.open(`https://github.com/${GITHUB_REPO}/releases/latest`, "_blank");
    return;
  }
  btn.disabled = true;
  btn.textContent = "Updating…";
  try {
    const res = await fetch("/api/update", { method: "POST" });
    if (!res.ok) throw new Error("update request failed");
    btn.textContent = "Restarting…";
  } catch (e) {
    btn.disabled = false;
    btn.textContent = "Update failed — retry";
  }
}

async function showVersionAndChangelog() {
  const versionBtn = document.getElementById("app-version");
  try {
    const verRes = await fetch("/api/version");
    if (verRes.ok) {
      const { version } = await verRes.json();
      if (version && version !== "dev") {
        versionBtn.textContent = `v${version}`;
        versionBtn.hidden = false;
      }
    }
  } catch (e) {
    // offline or dev mode — leave the version pill hidden
  }
}

async function init() {
  const res = await fetch("/api/lessons");
  LESSONS = await res.json();
  renderSidebar();
  applySidebarCollapsed();
  document.getElementById("sidebar-toggle").addEventListener("click", toggleSidebarCollapsed);
  document.getElementById("tab-color-wheel-tool").addEventListener("click", () => selectTool("color-wheel"));
  if (LESSONS.length) selectLesson(LESSONS[0].id);

  showVersionAndChangelog();
  checkForUpdate();
  setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);
}

init();
