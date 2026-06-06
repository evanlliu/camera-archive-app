:root {
  color-scheme: dark;
  --bg: #080d19;
  --bg-soft: #0d1424;
  --card: rgba(17, 24, 39, .92);
  --card-strong: #121c31;
  --surface: #172033;
  --surface-2: #1d2940;
  --text: #f8fafc;
  --muted: #9aa8bd;
  --muted-2: #71809a;
  --border: rgba(255,255,255,.10);
  --border-strong: rgba(255,255,255,.16);
  --accent: #3b82f6;
  --accent-2: #2563eb;
  --danger: #ef4444;
  --warn: #f59e0b;
  --ok: #22c55e;
  --shadow: 0 14px 40px rgba(0, 0, 0, .24);
  --radius-xl: 28px;
  --radius-lg: 22px;
  --radius-md: 16px;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; min-height: 100%; }
html { background: var(--bg); }
body {
  padding: env(safe-area-inset-top) 0 max(env(safe-area-inset-bottom), 16px);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
  background:
    radial-gradient(circle at 18% -5%, rgba(59, 130, 246, .18), transparent 34%),
    linear-gradient(180deg, #0a1020 0%, var(--bg) 46%, #070b14 100%);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
}

button, .buttonLike, input, textarea { font: inherit; }
button, .buttonLike {
  border: 1px solid var(--border-strong);
  background: linear-gradient(180deg, var(--surface), var(--card-strong));
  color: var(--text);
  padding: 12px 14px;
  border-radius: var(--radius-md);
  min-height: 48px;
  cursor: pointer;
  text-align: center;
  font-weight: 700;
  letter-spacing: .01em;
  -webkit-tap-highlight-color: transparent;
  box-shadow: inset 0 1px rgba(255,255,255,.05);
}
button:active, .buttonLike:active { transform: translateY(1px); }
button.primary {
  background: linear-gradient(180deg, #4f8df8, var(--accent-2));
  border-color: transparent;
  color: white;
  box-shadow: 0 12px 28px rgba(37, 99, 235, .28);
}
button.danger { background: linear-gradient(180deg, #f05252, #dc2626); border-color: transparent; color: white; }
button:disabled { opacity: .55; cursor: wait; transform: none; }

.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  padding: 14px 16px 12px;
  background: rgba(8,13,25,.82);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-bottom: 1px solid rgba(255,255,255,.06);
}
.brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.brand-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(59,130,246,.28), rgba(59,130,246,.08));
  border: 1px solid rgba(96,165,250,.25);
}
.brand-copy { min-width: 0; }
h1, h2, h3, p { margin: 0; }
h1 { font-size: 22px; line-height: 1.08; letter-spacing: .01em; }
#storageLine {
  margin-top: 5px;
  max-width: 68vw;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.icon-button {
  width: 58px;
  min-width: 58px;
  height: 50px;
  padding: 0;
  border-radius: 18px;
  background: rgba(23,32,51,.88);
}

.app-shell {
  width: min(100%, 920px);
  margin: 0 auto;
  padding: 14px 14px 28px;
}
.hero-card, .content-card, .notice {
  border: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(17,24,39,.95), rgba(13,20,36,.95));
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow);
}
.hero-card {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
  padding: 18px;
  margin-bottom: 12px;
}
.eyebrow {
  color: #93c5fd;
  text-transform: uppercase;
  letter-spacing: .12em;
  font-size: 11px;
  font-weight: 800;
  margin-bottom: 6px;
}
.hero-card h2 {
  font-size: 30px;
  line-height: 1.12;
  word-break: break-word;
}
.muted-line { margin-top: 6px; color: var(--muted); font-size: 14px; }
.capture-main { min-height: 60px; font-size: 20px; border-radius: 20px; }

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin: 12px 0;
}
.stat {
  min-width: 0;
  background: rgba(17, 24, 39, .88);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 13px 8px 12px;
  text-align: center;
}
.stat strong { display: block; font-size: 24px; line-height: 1; }
.stat span { display: block; margin-top: 7px; color: var(--muted); font-size: 12px; white-space: nowrap; }
.pending-card strong { color: #fbbf24; }
.failed-card strong { color: #f87171; }
.trash-card strong { color: #c4b5fd; }
.synced-card strong { color: #86efac; }

.action-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 12px 0;
}
.action-panel button, .action-panel .buttonLike { min-height: 54px; }

.notice {
  margin: 12px 0;
  border-color: rgba(245, 158, 11, .32);
  background: linear-gradient(180deg, rgba(245,158,11,.12), rgba(245,158,11,.06));
  color: #fde68a;
  padding: 14px 16px;
  line-height: 1.55;
  font-weight: 650;
}

.content-card { padding: 16px; margin: 12px 0; }
.path-card { padding-bottom: 12px; }
.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.section-title-row h3 { font-size: 20px; line-height: 1.15; }
.pill {
  color: var(--muted);
  background: rgba(255,255,255,.06);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 7px 10px;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}
.breadcrumbs {
  display: flex;
  overflow-x: auto;
  gap: 8px;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.breadcrumbs::-webkit-scrollbar { display: none; }
.breadcrumbs button {
  flex: 0 0 auto;
  white-space: nowrap;
  padding: 9px 12px;
  min-height: 40px;
  border-radius: 999px;
  color: #dbeafe;
  background: rgba(59,130,246,.12);
  border-color: rgba(147,197,253,.18);
}

.folder-list { display: grid; gap: 10px; }
.folder-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: center;
  background: rgba(23, 32, 51, .82);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 12px;
}
.folder-main { display: flex; align-items: center; gap: 12px; min-width: 0; }
.folder-icon {
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: rgba(59,130,246,.12);
  border: 1px solid rgba(147,197,253,.16);
}
.folder-item .name { font-weight: 850; font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.folder-item .sub { color: var(--muted); font-size: 12px; margin-top: 4px; }
.folder-actions { display: flex; gap: 8px; }
.folder-actions button { min-height: 40px; padding: 8px 10px; border-radius: 14px; font-size: 13px; }

.photo-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.photo-card {
  position: relative;
  aspect-ratio: 1;
  border-radius: 18px;
  overflow: hidden;
  background: var(--card-strong);
  border: 1px solid var(--border);
  padding: 0;
  min-height: 0;
  box-shadow: none;
}
.photo-card img { width: 100%; height: 100%; object-fit: cover; display: block; }
.badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  font-size: 12px;
  font-weight: 800;
  background: rgba(0,0,0,.66);
  color: white;
  border-radius: 999px;
  padding: 5px 9px;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.badge.synced { background: rgba(34,197,94,.88); }
.badge.pending { background: rgba(245,158,11,.9); }
.badge.failed { background: rgba(239,68,68,.9); }

.empty {
  color: var(--muted);
  padding: 18px;
  border: 1px dashed var(--border-strong);
  border-radius: 18px;
  background: rgba(255,255,255,.03);
  line-height: 1.5;
}
.photo-grid .empty { grid-column: 1 / -1; }

/* Dialogs */
dialog {
  border: 0;
  padding: 0;
  border-radius: 24px;
  background: transparent;
  color: var(--text);
  width: min(92vw, 560px);
}
dialog::backdrop { background: rgba(0,0,0,.68); backdrop-filter: blur(4px); }
.dialog-card {
  display: grid;
  gap: 14px;
  background: linear-gradient(180deg, #121c31, #0d1424);
  border: 1px solid var(--border-strong);
  border-radius: 24px;
  padding: 18px;
  box-shadow: var(--shadow);
}
.dialog-card h2 { font-size: 24px; }
.dialog-card label { display: grid; gap: 7px; color: var(--muted); font-weight: 700; }
.dialog-card input, .dialog-card textarea {
  width: 100%;
  border: 1px solid var(--border-strong);
  background: rgba(8,13,25,.9);
  color: var(--text);
  border-radius: 16px;
  padding: 13px;
  outline: none;
}
.dialog-card input:focus, .dialog-card textarea:focus { border-color: rgba(96,165,250,.68); }
.dialog-card textarea { min-height: 96px; resize: vertical; }
.dialog-card menu {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 0;
  margin: 0;
}
.dialog-card menu button:last-child:nth-child(3) { grid-column: 1 / -1; }
.hint { font-size: 13px; line-height: 1.55; color: var(--muted); }
.photo-dialog-card img {
  width: 100%;
  max-height: 58vh;
  object-fit: contain;
  border-radius: 18px;
  background: #000;
  border: 1px solid rgba(255,255,255,.08);
}

@media (min-width: 700px) {
  .app-shell { padding: 22px 18px 40px; }
  .hero-card { grid-template-columns: 1fr 220px; align-items: center; }
  .status-grid { gap: 12px; }
  .action-panel { grid-template-columns: repeat(4, 1fr); }
  .photo-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .folder-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 370px) {
  .app-shell { padding-left: 10px; padding-right: 10px; }
  .stat span { font-size: 11px; }
  .hero-card h2 { font-size: 26px; }
}
