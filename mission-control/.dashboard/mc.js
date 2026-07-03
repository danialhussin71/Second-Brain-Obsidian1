'use strict';
/*
 * Mission Control — DataviewJS engine
 * -----------------------------------
 * Connects an Obsidian note directly to Supabase (live), renders the premium
 * "mission control" cockpit, a live agent-activity feed, and a vault browser
 * that can read AND update notes stored in Supabase (vault_documents).
 *
 * Usage from a note:
 *   const mc = require(app.vault.adapter.basePath + "/mission-control/.dashboard/mc.js");
 *   await mc.render(dv, this, "mission-control");   // or "activity" | "vault"
 *
 * Live data uses Supabase realtime subscriptions with a polling fallback, so it
 * stays live even if realtime isn't enabled server-side or is blocked.
 */

/* ============================== styling ============================== */
const CSS = `
.mc-root{--ink:#02040a;--cyan:#22d3ee;--violet:#a78bfa;--emerald:#34d399;--amber:#fbbf24;--rose:#fb7185;--fuchsia:#d946ef;--sky:#38bdf8;--crimson:#ED1846;
  position:relative;min-height:calc(100vh - 40px);padding:22px 26px 60px;color:rgba(255,255,255,.85);
  font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;
  background:radial-gradient(130% 90% at 50% 0%, #070c18 0%, #02040a 55%, #010207 100%);overflow:hidden}
.mc-root:before{content:"";position:absolute;inset:0;pointer-events:none;
  background-image:linear-gradient(rgba(34,211,238,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,.05) 1px,transparent 1px);
  background-size:44px 44px;-webkit-mask-image:radial-gradient(80% 60% at 50% 20%,#000,transparent);mask-image:radial-gradient(80% 60% at 50% 20%,#000,transparent)}
.mc-root:after{content:"";position:absolute;left:-140px;top:80px;width:340px;height:340px;border-radius:50%;background:rgba(34,211,238,.07);filter:blur(90px);pointer-events:none}
.mc-wrap{position:relative;z-index:1;max-width:1320px;margin:0 auto}

.mc-topbar{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:20px}
.mc-brand{display:flex;align-items:center;gap:12px}
.mc-brand-mark{width:26px;height:26px;border-radius:7px;background:conic-gradient(from 210deg,#22d3ee,#a78bfa,#22d3ee);box-shadow:0 0 18px rgba(34,211,238,.55);position:relative}
.mc-brand-mark:after{content:"";position:absolute;inset:4px;border-radius:4px;background:#02040a}
.mc-brand-title{font-size:14px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.92)}
.mc-brand-sub{font-size:11px;color:rgba(255,255,255,.4);letter-spacing:.02em;margin-top:1px}
.mc-clock{display:flex;flex-direction:column;align-items:flex-end;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;color:rgba(34,211,238,.8);gap:2px;font-variant-numeric:tabular-nums}
.mc-clock span:first-child{color:rgba(255,255,255,.35)}
.mc-conn{display:flex;align-items:center;gap:7px;font-size:10.5px;text-transform:uppercase;letter-spacing:.16em;color:rgba(255,255,255,.5);margin-left:auto;margin-right:6px}
.mc-dot{width:8px;height:8px;border-radius:50%;background:#64748b;box-shadow:0 0 8px #64748b}
.mc-dot-live,.mc-dot.is-live{background:var(--emerald);box-shadow:0 0 9px 1px rgba(52,211,153,.85);animation:mcPulse 2s infinite}
.mc-dot-warn{background:var(--amber);box-shadow:0 0 9px 1px rgba(251,191,36,.8)}
.mc-dot-err{background:var(--rose);box-shadow:0 0 9px 1px rgba(251,113,133,.8)}

.mc-label{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.2em;color:rgba(255,255,255,.45)}

.mc-panel{position:relative;border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:16px 18px;margin-bottom:16px;
  background:linear-gradient(to bottom,rgba(255,255,255,.05),rgba(255,255,255,.02) 60%,transparent);
  -webkit-backdrop-filter:blur(22px) saturate(1.5);backdrop-filter:blur(22px) saturate(1.5);
  box-shadow:0 28px 70px -40px rgba(0,0,0,.95),inset 0 0 0 1px rgba(255,255,255,.04);
  animation:mcRise .55s cubic-bezier(.22,1,.36,1) both}
.mc-panel:before{content:"";position:absolute;right:-40px;top:-56px;width:170px;height:170px;border-radius:50%;background:var(--accent,#22d3ee);opacity:.10;filter:blur(46px);pointer-events:none}
.mc-panel-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.mc-count{font-size:11px;font-weight:700;color:var(--accent,#22d3ee);background:rgba(255,255,255,.05);padding:2px 9px;border-radius:999px;min-width:20px;text-align:center}
.mc-panel-body{min-height:20px}

.mc-hero{display:grid;grid-template-columns:280px 1fr;gap:18px;margin-bottom:6px;align-items:stretch}
.mc-orb{position:relative;border:1px solid rgba(255,255,255,.08);border-radius:18px;overflow:hidden;min-height:230px;
  background:radial-gradient(80% 80% at 50% 40%,rgba(34,211,238,.08),transparent 70%),#04070e;
  box-shadow:0 28px 70px -44px rgba(0,0,0,.95),inset 0 0 0 1px rgba(255,255,255,.04);animation:mcRise .55s cubic-bezier(.22,1,.36,1) both}
.mc-orb-canvas{position:absolute;inset:0;width:100%;height:100%}
.mc-orb-status{position:absolute;left:0;right:0;bottom:0;padding:14px 16px;background:linear-gradient(to top,rgba(2,4,10,.92),transparent)}
.mc-orb-line{font-size:12px;color:rgba(255,255,255,.72);margin-top:4px;line-height:1.4}
.mc-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.mc-kpi{position:relative;border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:14px 15px 12px;overflow:hidden;
  background:linear-gradient(to bottom,rgba(255,255,255,.05),rgba(255,255,255,.02),transparent);
  box-shadow:0 24px 60px -42px rgba(0,0,0,.9);animation:mcRise .55s cubic-bezier(.22,1,.36,1) both}
.mc-kpi-glow{position:absolute;right:-24px;top:-30px;width:110px;height:110px;border-radius:50%;filter:blur(34px);opacity:.16}
.mc-kpi-val{font-size:27px;font-weight:800;letter-spacing:-.02em;line-height:1.05;margin-top:8px;color:#fff}
.mc-kpi-sub{font-size:11px;color:rgba(255,255,255,.4);margin-top:2px}
.mc-kpi-spark{margin-top:8px;height:30px}
.mc-spark{display:block;width:100%}

.mc-cols{display:grid;grid-template-columns:1.6fr 1fr;gap:18px;margin-top:16px}
.mc-col-main,.mc-col-side{min-width:0}

.mc-agent-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.mc-agent{position:relative;border:1px solid rgba(255,255,255,.07);border-radius:13px;padding:12px 12px 11px;background:rgba(255,255,255,.02);transition:.25s;overflow:hidden}
.mc-agent:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--c) 55%,transparent);box-shadow:0 12px 40px -18px var(--c)}
.mc-agent-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--c);box-shadow:0 0 9px var(--c);animation:mcPulse 2.4s infinite}
.mc-agent-name{font-size:13px;font-weight:600;color:rgba(255,255,255,.92);margin-top:8px}
.mc-agent-role{font-size:10.5px;color:rgba(255,255,255,.45);margin-top:2px;line-height:1.35;min-height:26px}
.mc-agent-status{font-size:9.5px;text-transform:uppercase;letter-spacing:.14em;margin-top:6px}
.mc-agent-status.on{color:var(--emerald)}.mc-agent-status.off{color:rgba(255,255,255,.3)}

.mc-chart{position:relative;height:150px;margin-bottom:12px}
.mc-chart svg{height:150px}
.mc-chart-badge{position:absolute;right:8px;top:6px;font-size:10px;color:rgba(255,255,255,.6);background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.08);padding:2px 8px;border-radius:999px}
.mc-pills{display:flex;gap:10px}
.mc-pill{flex:1;text-align:center;border:1px solid rgba(255,255,255,.07);border-radius:11px;padding:9px 6px;background:rgba(255,255,255,.02);font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:rgba(255,255,255,.45)}
.mc-pill span{display:block;font-size:17px;font-weight:700;color:#fff;letter-spacing:0;margin-bottom:3px}

.mc-meet-next{border:1px solid rgba(34,211,238,.2);background:rgba(34,211,238,.05);border-radius:12px;padding:11px 12px;margin-bottom:11px}
.mc-meet-title{font-size:13px;font-weight:600;color:#fff;margin-top:3px}
.mc-meet-time{font-size:11px;color:var(--cyan);margin-top:2px}
.mc-meet-list,.mc-commit-list,.mc-vault-list{display:flex;flex-direction:column;gap:2px}
.mc-meet-row,.mc-vault-row{display:flex;align-items:center;gap:9px;padding:7px 2px;border-bottom:1px solid rgba(255,255,255,.04);font-size:12.5px}
.mc-meet-dot{width:6px;height:6px;border-radius:50%;background:rgba(34,211,238,.6);flex:none}
.mc-meet-name,.mc-vault-name,.mc-commit-desc{flex:1;color:rgba(255,255,255,.82);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-meet-when,.mc-vault-when,.mc-commit-due{font-size:11px;color:rgba(255,255,255,.4);flex:none}
.mc-commit-row{display:flex;align-items:center;gap:9px;padding:8px 2px;border-bottom:1px solid rgba(255,255,255,.04);font-size:12.5px}
.mc-commit-side{font-size:9px;text-transform:uppercase;letter-spacing:.1em;padding:2px 7px;border-radius:6px;flex:none}
.mc-side-me{background:rgba(34,211,238,.14);color:var(--cyan)}
.mc-side-them{background:rgba(167,139,250,.14);color:var(--violet)}
.mc-commit-due.overdue{color:var(--rose)}
.mc-vault-stat{display:flex;align-items:baseline;gap:10px;margin-bottom:10px}
.mc-vault-num{font-size:26px;font-weight:800;color:#fff}

/* activity feed */
.mc-activity .mc-panel-head,.mc-panel.mc-activity{}
.mc-live{display:flex;align-items:center;gap:7px;font-size:11px;color:rgba(255,255,255,.55)}
.mc-live.is-idle{color:rgba(255,255,255,.4)}
.mc-live.is-live{color:var(--emerald)}
.mc-live .mc-dot{background:#64748b;box-shadow:none}
.mc-live.is-live .mc-dot{background:var(--emerald);box-shadow:0 0 9px 1px rgba(52,211,153,.85);animation:mcPulse 1.6s infinite}
.mc-feed{display:flex;flex-direction:column;gap:1px;max-height:420px;overflow:auto}
.mc-feed-row{display:flex;align-items:center;gap:11px;padding:9px 4px;border-bottom:1px solid rgba(255,255,255,.045);animation:mcFeedIn .4s ease both}
.mc-feed-row.is-head{background:linear-gradient(90deg,rgba(52,211,153,.08),transparent);border-radius:8px;border-bottom-color:transparent}
.mc-feed-icon{width:26px;height:26px;flex:none;display:grid;place-items:center;border-radius:8px;font-size:13px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07)}
.mc-feed-text{flex:1;font-size:13px;color:rgba(255,255,255,.85);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-feed-time{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:rgba(255,255,255,.32);flex:none;font-variant-numeric:tabular-nums}
.mc-k-read .mc-feed-icon,.mc-feed-icon.mc-k-read{border-color:rgba(56,189,248,.3)}
.mc-k-write{color:var(--emerald)}.mc-k-web{color:var(--sky)}.mc-k-agent{color:var(--violet)}.mc-k-run{color:var(--amber)}

/* vault browser */
.mc-vb{display:grid;grid-template-columns:300px 1fr;gap:16px;height:calc(100vh - 130px)}
.mc-vb-list{display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.02);overflow:hidden}
.mc-vb-search{border:none;border-bottom:1px solid rgba(255,255,255,.08);background:transparent;color:#fff;padding:12px 14px;font-size:13px;outline:none}
.mc-vb-items{overflow:auto;flex:1;padding:6px}
.mc-vb-item{padding:9px 11px;border-radius:9px;cursor:pointer;transition:.15s}
.mc-vb-item:hover{background:rgba(255,255,255,.04)}
.mc-vb-item.is-active{background:rgba(34,211,238,.1);box-shadow:inset 0 0 0 1px rgba(34,211,238,.25)}
.mc-vb-iname{font-size:13px;color:rgba(255,255,255,.88);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mc-vb-imeta{display:flex;justify-content:space-between;font-size:10.5px;color:rgba(255,255,255,.38);margin-top:2px}
.mc-vb-editor{display:flex;flex-direction:column;border:1px solid rgba(255,255,255,.08);border-radius:16px;background:rgba(255,255,255,.02);overflow:hidden}
.mc-vb-ehead{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.07)}
.mc-vb-etitle{font-size:14px;font-weight:600;color:#fff}
.mc-vb-epath{padding:6px 16px;font-size:11px;color:rgba(255,255,255,.35)}
.mc-vb-text{flex:1;border:none;background:transparent;color:rgba(255,255,255,.85);padding:14px 16px;font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.6;resize:none;outline:none}
.mc-vb-status{padding:8px 16px;font-size:11px;color:rgba(255,255,255,.45);border-top:1px solid rgba(255,255,255,.06)}
.mc-btn{border:1px solid rgba(34,211,238,.35);background:rgba(34,211,238,.12);color:var(--cyan);font-size:12px;font-weight:600;padding:7px 14px;border-radius:9px;cursor:pointer;transition:.2s}
.mc-btn:hover:not(:disabled){background:rgba(34,211,238,.2)}
.mc-btn:disabled{opacity:.4;cursor:default}

.mc-empty{font-size:12.5px;color:rgba(255,255,255,.4);padding:14px 4px;line-height:1.5}
.mc-error .mc-panel-body{font-size:13px;color:rgba(255,255,255,.7);line-height:1.6}
.mc-error code{background:rgba(255,255,255,.08);padding:1px 6px;border-radius:5px;font-size:12px}
.mono{font-family:ui-monospace,Menlo,monospace}
.mc-skeleton{height:60px;border-radius:10px;background:linear-gradient(90deg,rgba(255,255,255,.03),rgba(255,255,255,.07),rgba(255,255,255,.03));background-size:200% 100%;animation:mcShimmer 1.4s infinite}

@keyframes mcRise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes mcFeedIn{from{opacity:0;transform:translateX(-8px)}to{opacity:1;transform:none}}
@keyframes mcPulse{0%,100%{opacity:1}50%{opacity:.45}}
@keyframes mcShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@media(max-width:900px){.mc-hero{grid-template-columns:1fr}.mc-kpis{grid-template-columns:repeat(2,1fr)}.mc-cols{grid-template-columns:1fr}.mc-vb{grid-template-columns:1fr;height:auto}}
`;

function injectCss() {
  if (document.getElementById('mc-styles')) return;
  const s = document.createElement('style');
  s.id = 'mc-styles';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/* ============================== helpers ============================== */
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function baseName(p) { return p ? String(p).split(/[\\/]/).pop() : ''; }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function timeAgo(ts) {
  const t = typeof ts === 'string' ? Date.parse(ts) : ts;
  if (!t || isNaN(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return Math.floor(s) + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function money(n) { n = Number(n) || 0; const a = Math.abs(n); if (a >= 1e6) return '$' + (n / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M'; if (a >= 1e3) return '$' + (n / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k'; return '$' + Math.round(n); }
function num(n) { n = Number(n) || 0; const a = Math.abs(n); if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M'; if (a >= 1e3) return (n / 1e3).toFixed(1) + 'k'; return String(Math.round(n)); }
function fmtDate(s) { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function fmtDateTime(s) { if (!s) return ''; const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }); }

function sparkline(values, color, w, h) {
  w = w || 140; h = h || 30;
  const v = (values || []).map(Number).filter(x => !isNaN(x));
  if (v.length < 2) return '';
  const min = Math.min(...v), max = Math.max(...v), rng = (max - min) || 1;
  const step = w / (v.length - 1);
  const pts = v.map((y, i) => [i * step, h - 2 - ((y - min) / rng) * (h - 4)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ` L ${w} ${h} L 0 ${h} Z`;
  const id = 'g' + Math.floor(Math.random() * 1e9);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="mc-spark">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${id})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* rotating particle orb (canvas 2D approximation of KRONOS) */
function startOrb(canvas, opts) {
  const ctx = canvas.getContext('2d');
  const color = (opts && opts.color) || '#22d3ee';
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  let raf = 0, running = true, ang = 0;
  function resize() { const r = canvas.getBoundingClientRect(); canvas.width = Math.max(1, r.width * DPR); canvas.height = Math.max(1, r.height * DPR); }
  resize();
  const N = 460, pts = [];
  for (let i = 0; i < N; i++) { const y = 1 - (i / (N - 1)) * 2; const rr = Math.sqrt(Math.max(0, 1 - y * y)); const th = i * 2.399963; pts.push([Math.cos(th) * rr, y, Math.sin(th) * rr]); }
  function frame() {
    if (!running) return;
    ang += 0.0045;
    const w = canvas.width, h = canvas.height, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.34;
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.7);
    g.addColorStop(0, color + '55'); g.addColorStop(0.4, color + '18'); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 1.7, 0, 7); ctx.fill();
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (const p of pts) {
      const x = p[0] * ca - p[2] * sa, z = p[0] * sa + p[2] * ca, y = p[1];
      const depth = (z + 1) / 2, sx = cx + x * R, sy = cy + y * R;
      ctx.globalAlpha = 0.12 + depth * 0.78;
      ctx.beginPath(); ctx.arc(sx, sy, (0.5 + depth * 1.7) * DPR, 0, 7); ctx.fillStyle = color; ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.strokeStyle = color + '33'; ctx.lineWidth = DPR;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(cx, cy, R * (1.06 + k * 0.13), R * (0.28 + 0.06 * k), 0, 0, 7); ctx.stroke(); }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  // ResizeObserver corrects the canvas size once Obsidian lays the panel out
  // (reading view can render at 0-width initially) and on any later resize.
  let ro = null;
  try { ro = new ResizeObserver(() => resize()); ro.observe(canvas); } catch (e) { window.addEventListener('resize', resize); }
  return () => { running = false; cancelAnimationFrame(raf); if (ro) ro.disconnect(); else window.removeEventListener('resize', resize); };
}

/* ============================== config + client ============================== */
// The .dashboard folder is vault-relative. This works whether the opened vault
// is the `mission-control` folder itself or the whole repo root.
let _dashDir = null;
async function dashRead(app, rel) {
  const candidates = _dashDir ? [_dashDir] : ['.dashboard/', 'mission-control/.dashboard/'];
  for (const d of candidates) {
    try { const v = await app.vault.adapter.read(d + rel); _dashDir = d; return v; } catch (e) { /* try next */ }
  }
  throw new Error('Could not read .dashboard/' + rel);
}
async function loadConfig(app) {
  return JSON.parse(await dashRead(app, 'config.local.json'));
}
async function loadSupabase(app) {
  if (window.__MC_SUPA__) return window.__MC_SUPA__;
  // The bundled file is a browser-global UMD (`var supabase = (function(){…})()`),
  // which never assigns module.exports — so we evaluate its source and capture
  // the `supabase` namespace directly. Self-contained, no network, no CSP issues.
  const code = await dashRead(app, 'lib/supabase.js');
  const lib = new Function(code + '\n;return supabase;')();
  window.__MC_SUPA__ = lib;
  return lib;
}
async function getClient(app, cfg) {
  const w = window;
  if (w.__MC__ && w.__MC__.mode === cfg.authMode && w.__MC__.url === cfg.supabaseUrl) return w.__MC__.client;
  const { createClient } = await loadSupabase(app);
  const key = (cfg.authMode === 'service_role' && cfg.serviceRoleKey) ? cfg.serviceRoleKey : cfg.supabaseAnonKey;
  const client = createClient(cfg.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  if (cfg.authMode === 'owner_password' && cfg.owner && cfg.owner.password) {
    try { await client.auth.signInWithPassword({ email: cfg.owner.email, password: cfg.owner.password }); } catch (e) { /* fall back to anon */ }
  }
  w.__MC__ = { client, mode: cfg.authMode, url: cfg.supabaseUrl };
  return client;
}

/* ============================== shared UI pieces ============================== */
function topbar(title, subtitle) {
  const e = el('div', 'mc-topbar');
  e.innerHTML = `<div class="mc-brand"><div class="mc-brand-mark"></div>
    <div><div class="mc-brand-title">${escapeHtml(title)}</div><div class="mc-brand-sub">${escapeHtml(subtitle || '')}</div></div></div>
    <div class="mc-clock"><span data-date></span><span data-time></span></div>`;
  function setClock() { const d = new Date(); e.querySelector('[data-date]').textContent = d.toISOString().slice(0, 10); e.querySelector('[data-time]').textContent = d.toTimeString().slice(0, 8); }
  setClock();
  return { el: e, setClock };
}
function panelShell(title, cls, accent) {
  const panel = el('div', 'mc-panel ' + cls);
  panel.style.setProperty('--accent', accent || '#22d3ee');
  panel.innerHTML = `<div class="mc-panel-head"><span class="mc-label">${escapeHtml(title)}</span><span class="mc-count" data-count></span></div><div class="mc-panel-body" data-body><div class="mc-skeleton"></div></div>`;
  return { panel, body: panel.querySelector('[data-body]'), setCount: (n) => { const c = panel.querySelector('[data-count]'); if (c) c.textContent = (n || n === 0) ? String(n) : ''; } };
}
function emptyMsg(t) { return `<div class="mc-empty">${escapeHtml(t)}</div>`; }
function errorCard(title, html) { const e = el('div', 'mc-panel mc-error'); e.style.setProperty('--accent', '#fb7185'); e.innerHTML = `<div class="mc-panel-head"><span class="mc-label">${escapeHtml(title)}</span></div><div class="mc-panel-body">${html}</div>`; return e; }

function activityPanel() {
  const panel = el('div', 'mc-panel mc-activity');
  panel.style.setProperty('--accent', '#34d399');
  panel.innerHTML = `<div class="mc-panel-head"><span class="mc-label">Live Activity</span>
    <span class="mc-live" data-live><span class="mc-dot"></span><span data-livetext>connecting…</span></span></div>
    <div class="mc-feed" data-feed><div class="mc-skeleton"></div></div>`;
  return panel;
}
function updateActivity(panel, records) {
  const feed = panel.querySelector('[data-feed]');
  const liveText = panel.querySelector('[data-livetext]');
  const liveWrap = panel.querySelector('[data-live]');
  const last = records[records.length - 1];
  const idle = !last || last.kind === 'idle' || (Date.now() - Date.parse(last.ts) > 12000);
  liveWrap.classList.toggle('is-idle', idle);
  liveWrap.classList.toggle('is-live', !idle);
  liveText.textContent = idle ? 'Idle — waiting for a request' : (last ? last.text : 'working…');
  const recent = records.slice(-60).reverse();
  if (!recent.length) { feed.innerHTML = emptyMsg('No activity yet. Ask Claude Code to do something and watch it appear here, live.'); return; }
  feed.innerHTML = recent.map((r, i) => `<div class="mc-feed-row mc-k-${escapeHtml(r.kind || 'tool')}${i === 0 && !idle ? ' is-head' : ''}" style="animation-delay:${Math.min(i * 16, 320)}ms">
      <span class="mc-feed-icon">${r.icon || '•'}</span>
      <span class="mc-feed-text">${escapeHtml(r.text || '')}</span>
      <span class="mc-feed-time">${timeAgo(r.ts)}</span></div>`).join('');
}
async function readActivity(app) {
  let raw = '';
  try { raw = await dashRead(app, 'activity.jsonl'); } catch (e) { return []; }
  const out = [];
  for (const line of raw.split('\n')) { const l = line.trim(); if (!l) continue; try { out.push(JSON.parse(l)); } catch (e) { } }
  return out;
}

/* ============================== data layer ============================== */
async function fetchAll(client, cfg) {
  const q = (p) => p.then(r => r).catch(() => ({ data: null, count: 0, error: true }));
  let vaultRecent = client.from('vault_documents').select('path,title,folder,updated_at,char_count').order('updated_at', { ascending: false }).limit(24);
  let vaultCount = client.from('vault_documents').select('*', { count: 'exact', head: true });
  if (cfg.vaultClient) { vaultRecent = vaultRecent.eq('client', cfg.vaultClient); vaultCount = vaultCount.eq('client', cfg.vaultClient); }
  const [agents, deals, revenue, posts, meetings, commitments, memCount, vRecent, vCount, convCount] = await Promise.all([
    q(client.from('agents').select('key,name,role,color,icon,enabled,handle').order('sort', { ascending: true })),
    q(client.from('deals').select('stage,value,currency,probability,expected_close,closed_at,created_at')),
    q(client.from('revenue_events').select('amount,currency,kind,occurred_on').order('occurred_on', { ascending: true })),
    q(client.from('content_posts').select('platform,posted_at,impressions,likes,comments,shares,leads').order('posted_at', { ascending: true }).limit(300)),
    q(client.from('meetings').select('title,started_at,ended_at,duration_min,category').order('started_at', { ascending: false }).limit(20)),
    q(client.from('commitments').select('description,owner_side,due_date,status,created_at').order('created_at', { ascending: false }).limit(80)),
    q(client.from('memories').select('*', { count: 'exact', head: true })),
    q(vaultRecent), q(vaultCount),
    q(client.from('conversations').select('*', { count: 'exact', head: true })),
  ]);
  return {
    agents: agents.data || [], deals: deals.data || [], revenue: revenue.data || [], posts: posts.data || [],
    meetings: meetings.data || [], commitments: commitments.data || [],
    memoriesCount: memCount.count || 0, conversationsCount: convCount.count || 0,
    vault: { recent: vRecent.data || [], count: vCount.count || 0 },
  };
}
function monthlySeries(rows) { const m = {}; for (const r of rows) { if (!r.t) continue; const k = String(r.t).slice(0, 7); m[k] = (m[k] || 0) + r.v; } return Object.keys(m).sort().map(k => m[k]); }

// Optional real LinkedIn data (copied to the vault at setup as linkedin.json).
function computeLinkedIn(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  const posts = rows.map(p => {
    const e = p.engagement || {};
    const likes = +e.likes || 0, comments = +e.comments || 0, shares = +e.shares || 0;
    const ts = (p.postedAt && p.postedAt.timestamp) || Date.parse((p.postedAt && p.postedAt.date) || p.postedAt || '') || 0;
    return { ts, eng: likes + comments + shares, likes, comments, shares };
  }).filter(p => p.ts).sort((a, b) => a.ts - b.ts);
  if (!posts.length) return null;
  return {
    count: posts.length,
    totalEngagement: posts.reduce((s, p) => s + p.eng, 0),
    likes: posts.reduce((s, p) => s + p.likes, 0),
    comments: posts.reduce((s, p) => s + p.comments, 0),
    shares: posts.reduce((s, p) => s + p.shares, 0),
    series: posts.slice(-28).map(p => p.eng),
  };
}
async function loadLinkedIn(app) {
  try {
    const raw = await dashRead(app, 'linkedin.json');
    const arr = JSON.parse(raw);
    return computeLinkedIn(Array.isArray(arr) ? arr : (arr.posts || arr.items || arr.data || []));
  } catch (e) { return null; }
}

/* ============================== renderers ============================== */
function renderKpis(node, d, li) {
  const openStages = ['lead', 'discovery', 'proposal', 'negotiation'];
  const pipeline = d.deals.filter(x => openStages.includes(String(x.stage || '').toLowerCase())).reduce((s, x) => s + (Number(x.value) || 0), 0);
  const mrr = d.revenue.filter(x => x.kind === 'recurring').reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const revSeries = monthlySeries(d.revenue.map(r => ({ t: r.occurred_on, v: Number(r.amount) || 0 })));
  const dbImpressions = d.posts.reduce((s, x) => s + (Number(x.impressions) || 0), 0);
  // Prefer real LinkedIn engagement for the content cards; fall back to content_posts.
  const reachVal = li ? num(li.totalEngagement) : num(dbImpressions);
  const reachSub = li ? 'LinkedIn reactions+comments+reposts' : (d.posts.length + ' posts');
  const reachSpark = li ? li.series : d.posts.slice(-24).map(p => Number(p.impressions) || 0);
  const postCount = li ? li.count : d.posts.length;
  // Lead with metrics that have data so the band reads as intentional, not empty.
  const cards = [
    { label: 'Second Brain', value: num(d.vault.count), color: '#a78bfa', sub: 'notes synced' },
    { label: 'Content Engagement', value: reachVal, color: '#d946ef', sub: reachSub, spark: reachSpark },
    { label: 'Posts Published', value: num(postCount), color: '#38bdf8', sub: 'tracked' },
    { label: 'Agents Online', value: num(d.agents.length), color: '#22d3ee', sub: 'departments' },
    { label: 'Open Pipeline', value: money(pipeline), color: '#34d399', sub: d.deals.length + ' deals', spark: revSeries },
    { label: 'Memories', value: num(d.memoriesCount), color: '#fbbf24', sub: 'facts learned' },
  ];
  node.innerHTML = cards.map((c, i) => `<div class="mc-kpi" style="animation-delay:${i * 55}ms">
      <div class="mc-kpi-glow" style="background:${c.color}"></div>
      <div class="mc-label">${c.label}</div>
      <div class="mc-kpi-val" style="text-shadow:0 0 22px ${c.color}44">${c.value}</div>
      <div class="mc-kpi-sub">${escapeHtml(c.sub || '')}</div>
      <div class="mc-kpi-spark">${c.spark ? sparkline(c.spark, c.color, 150, 30) : ''}</div></div>`).join('');
}
function renderAgents(shell, agents) {
  if (!agents.length) { shell.body.innerHTML = emptyMsg('No agents configured yet.'); return; }
  shell.setCount(agents.length);
  shell.body.innerHTML = '<div class="mc-agent-grid">' + agents.map(a => {
    const c = a.color || '#22d3ee';
    return `<div class="mc-agent" style="--c:${c}"><span class="mc-agent-dot"></span>
      <div class="mc-agent-name">${escapeHtml(a.name || a.key)}</div>
      <div class="mc-agent-role">${escapeHtml(a.role || '')}</div>
      <div class="mc-agent-status ${a.enabled === false ? 'off' : 'on'}">${a.enabled === false ? 'offline' : 'online'}</div></div>`;
  }).join('') + '</div>';
}
function engagementHtml(series, reactions, comments, shares, unit) {
  const avg = Math.round(series.reduce((s, x) => s + x, 0) / (series.length || 1));
  return `<div class="mc-chart">${sparkline(series, '#d946ef', 640, 150)}<div class="mc-chart-badge">avg ${num(avg)} ${unit}</div></div>
    <div class="mc-pills"><div class="mc-pill"><span>${num(reactions)}</span>reactions</div>
    <div class="mc-pill"><span>${num(comments)}</span>comments</div><div class="mc-pill"><span>${num(shares)}</span>reposts</div></div>`;
}
function renderEngagement(shell, posts, li) {
  if (posts && posts.length) {
    const series = posts.slice(-28).map(p => Number(p.impressions) || 0);
    const reactions = posts.reduce((s, p) => s + (Number(p.likes) || 0), 0);
    const comments = posts.reduce((s, p) => s + (Number(p.comments) || 0), 0);
    const shares = posts.reduce((s, p) => s + (Number(p.shares) || 0), 0);
    shell.body.innerHTML = engagementHtml(series, reactions, comments, shares, 'impr/post');
    return;
  }
  if (li) { shell.setCount(li.count); shell.body.innerHTML = engagementHtml(li.series, li.likes, li.comments, li.shares, 'eng/post'); return; }
  shell.body.innerHTML = emptyMsg('No content posts yet.');
}
function renderMeetings(shell, meetings) {
  if (!meetings.length) { shell.body.innerHTML = emptyMsg('No meetings recorded.'); return; }
  const now = Date.now();
  const upcoming = meetings.filter(m => Date.parse(m.started_at) > now).sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  const past = meetings.filter(m => Date.parse(m.started_at) <= now);
  const next = upcoming[0];
  let html = '';
  if (next) html += `<div class="mc-meet-next"><div class="mc-label">Next</div><div class="mc-meet-title">${escapeHtml(next.title || 'Meeting')}</div><div class="mc-meet-time">${fmtDateTime(next.started_at)}</div></div>`;
  const list = upcoming.slice(next ? 1 : 0, 5).concat(past.slice(0, 4));
  html += '<div class="mc-meet-list">' + list.map(m => `<div class="mc-meet-row"><span class="mc-meet-dot"></span><span class="mc-meet-name">${escapeHtml(m.title || 'Meeting')}</span><span class="mc-meet-when">${fmtDate(m.started_at)}</span></div>`).join('') + '</div>';
  shell.body.innerHTML = html;
}
function renderCommitments(shell, commitments) {
  const open = commitments.filter(c => (c.status || 'open') === 'open');
  shell.setCount(open.length);
  if (!open.length) { shell.body.innerHTML = emptyMsg('No open commitments. 🎉'); return; }
  shell.body.innerHTML = '<div class="mc-commit-list">' + open.slice(0, 10).map(c => {
    const overdue = c.due_date && Date.parse(c.due_date) < Date.now();
    return `<div class="mc-commit-row"><span class="mc-commit-side mc-side-${(c.owner_side || 'me') === 'me' ? 'me' : 'them'}">${(c.owner_side || 'me') === 'me' ? 'You' : 'Them'}</span>
      <span class="mc-commit-desc">${escapeHtml(c.description || '')}</span>${c.due_date ? `<span class="mc-commit-due ${overdue ? 'overdue' : ''}">${fmtDate(c.due_date)}</span>` : ''}</div>`;
  }).join('') + '</div>';
}
function renderVault(shell, vault) {
  shell.setCount(vault.count);
  shell.body.innerHTML = `<div class="mc-vault-stat"><span class="mc-vault-num">${num(vault.count)}</span><span class="mc-label">notes synced</span></div>
    <div class="mc-vault-list">` + (vault.recent || []).slice(0, 8).map(d => `<div class="mc-vault-row"><span class="mc-vault-name">${escapeHtml(d.title || baseName(d.path) || 'note')}</span><span class="mc-vault-when">${timeAgo(d.updated_at)}</span></div>`).join('') + '</div>';
}
function orbLine(d) {
  const bits = [];
  if (d.vault && d.vault.count) bits.push(d.vault.count + ' notes');
  if (d.memoriesCount) bits.push(d.memoriesCount + ' memories');
  if (d.agents && d.agents.length) bits.push(d.agents.length + ' agents online');
  return bits.length ? ('Watching ' + bits.join(' · ')) : 'Reading your second brain…';
}

/* ============================== views ============================== */
async function renderMissionControl(app, root, cfg, register) {
  const client = await getClient(app, cfg);
  const li = await loadLinkedIn(app); // optional real LinkedIn data (static, load once)
  const wrap = el('div', 'mc-wrap');
  const bar = topbar('Second Brain · Mission Control', 'Your AI operating cockpit — live from Supabase');
  const conn = el('span', 'mc-conn'); conn.innerHTML = '<span class="mc-dot"></span><span data-conn>connecting…</span>';
  bar.el.querySelector('.mc-clock').before(conn);
  wrap.appendChild(bar.el);

  const hero = el('div', 'mc-hero');
  const orbBox = el('div', 'mc-orb');
  const canvas = document.createElement('canvas'); canvas.className = 'mc-orb-canvas'; orbBox.appendChild(canvas);
  orbBox.appendChild(el('div', 'mc-orb-status', '<span class="mc-label">KRONOS</span><div class="mc-orb-line" data-orbline>Reading your second brain…</div>'));
  const kpis = el('div', 'mc-kpis');
  hero.appendChild(orbBox); hero.appendChild(kpis); wrap.appendChild(hero);

  const cols = el('div', 'mc-cols'); const main = el('div', 'mc-col-main'); const side = el('div', 'mc-col-side');
  cols.appendChild(main); cols.appendChild(side); wrap.appendChild(cols);

  const agentsPanel = panelShell('Departments & Agents', 'mc-agents', '#22d3ee');
  const engagePanel = panelShell('Content Engagement', 'mc-engage', '#d946ef');
  const feedPanel = activityPanel();
  const meetingsP = panelShell('Meetings', 'mc-meetings', '#22d3ee');
  const commitP = panelShell('Open Commitments', 'mc-commit', '#fbbf24');
  const vaultP = panelShell('Second Brain Vault', 'mc-vault', '#a78bfa');
  main.appendChild(agentsPanel.panel); main.appendChild(engagePanel.panel); main.appendChild(feedPanel);
  side.appendChild(meetingsP.panel); side.appendChild(commitP.panel); side.appendChild(vaultP.panel);
  root.appendChild(wrap);

  register(startOrb(canvas, { color: '#22d3ee' }));

  const clockId = window.setInterval(() => bar.setClock(), 1000); register(() => clearInterval(clockId));
  const paintActivity = async () => updateActivity(feedPanel, await readActivity(app));
  await paintActivity();
  const actId = window.setInterval(paintActivity, cfg.activityRefreshMs || 1500); register(() => clearInterval(actId));

  const setConn = (state, text) => { conn.querySelector('.mc-dot').className = 'mc-dot mc-dot-' + state; conn.querySelector('[data-conn]').textContent = text; };

  async function refresh() {
    try {
      const data = await fetchAll(client, cfg);
      renderKpis(kpis, data, li); renderAgents(agentsPanel, data.agents); renderEngagement(engagePanel, data.posts, li);
      renderMeetings(meetingsP, data.meetings); renderCommitments(commitP, data.commitments); renderVault(vaultP, data.vault);
      orbBox.querySelector('[data-orbline]').textContent = orbLine(data);
      setConn('live', cfg.realtime ? 'live' : 'polling');
    } catch (e) { setConn('warn', 'reconnecting…'); }
  }
  await refresh();
  const pollId = window.setInterval(refresh, cfg.pollMs || 4000); register(() => clearInterval(pollId));

  if (cfg.realtime) {
    try {
      const scheduleRefresh = debounce(refresh, 300);
      const TABLES = ['agents', 'deals', 'revenue_events', 'content_posts', 'meetings', 'commitments', 'memories', 'vault_documents', 'conversations'];
      const ch = client.channel('mc-dashboard');
      for (const t of TABLES) ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, scheduleRefresh);
      ch.subscribe((status) => { if (status === 'SUBSCRIBED') setConn('live', 'live'); });
      register(() => { try { client.removeChannel(ch); } catch (e) { } });
    } catch (e) { /* polling covers it */ }
  }
}

function renderActivityView(app, root, cfg, register) {
  const wrap = el('div', 'mc-wrap');
  const bar = topbar('Agent Activity', 'A live, human-friendly feed of what Claude Code is doing right now');
  wrap.appendChild(bar.el);
  const panel = activityPanel(); wrap.appendChild(panel); root.appendChild(wrap);
  const tick = async () => { updateActivity(panel, await readActivity(app)); bar.setClock(); };
  tick();
  const id = window.setInterval(tick, cfg.activityRefreshMs || 1500); register(() => clearInterval(id));
}

async function renderVaultView(app, root, cfg, register) {
  const client = await getClient(app, cfg);
  const wrap = el('div', 'mc-wrap');
  const bar = topbar('Vault Browser', 'Read & edit your second-brain notes — live from Supabase');
  wrap.appendChild(bar.el);
  const pane = el('div', 'mc-vb');
  pane.innerHTML = `<div class="mc-vb-list"><input class="mc-vb-search" placeholder="Search notes…" data-search />
      <div class="mc-vb-items" data-items><div class="mc-skeleton"></div></div></div>
    <div class="mc-vb-editor"><div class="mc-vb-ehead"><div class="mc-vb-etitle" data-etitle>Select a note</div>
      <button class="mc-btn" data-save disabled>Save to Supabase</button></div>
      <div class="mc-vb-epath mono" data-epath></div>
      <textarea class="mc-vb-text" data-text placeholder="Note content will appear here…" spellcheck="false"></textarea>
      <div class="mc-vb-status" data-status>Pick a note on the left to read or edit it.</div></div>`;
  wrap.appendChild(pane); root.appendChild(wrap);
  const $ = (s) => pane.querySelector(s);
  const itemsEl = $('[data-items]'), searchEl = $('[data-search]'), titleEl = $('[data-etitle]'),
    pathEl = $('[data-epath]'), textEl = $('[data-text]'), saveBtn = $('[data-save]'), statusEl = $('[data-status]');
  let docs = [], current = null, filter = '';

  function listQuery() {
    let q = client.from('vault_documents').select('id,path,title,folder,updated_at,char_count').order('updated_at', { ascending: false }).limit(500);
    if (cfg.vaultClient) q = q.eq('client', cfg.vaultClient);
    return q;
  }
  async function loadList() { const { data } = await listQuery().then(r => r).catch(() => ({ data: [] })); docs = data || []; renderList(); }
  function renderList() {
    const f = filter.toLowerCase();
    const shown = docs.filter(d => !f || ((d.title || '') + (d.path || '')).toLowerCase().includes(f));
    if (!shown.length) { itemsEl.innerHTML = emptyMsg('No notes' + (filter ? ' match “' + escapeHtml(filter) + '”' : ' found') + '.'); return; }
    itemsEl.innerHTML = shown.slice(0, 300).map(d => `<div class="mc-vb-item${current && current.id === d.id ? ' is-active' : ''}" data-id="${d.id}">
        <div class="mc-vb-iname">${escapeHtml(d.title || baseName(d.path) || 'note')}</div>
        <div class="mc-vb-imeta"><span>${escapeHtml(d.folder || '')}</span><span>${timeAgo(d.updated_at)}</span></div></div>`).join('');
    itemsEl.querySelectorAll('.mc-vb-item').forEach(it => it.addEventListener('click', () => openDoc(it.getAttribute('data-id'))));
  }
  async function openDoc(id) {
    statusEl.textContent = 'Loading…';
    const { data, error } = await client.from('vault_documents').select('id,path,title,content,char_count').eq('id', id).single().then(r => r).catch(() => ({ error: true }));
    if (error || !data) { statusEl.textContent = 'Could not load this note.'; return; }
    current = data; renderList();
    titleEl.textContent = data.title || baseName(data.path) || 'note'; pathEl.textContent = data.path || '';
    textEl.value = data.content || ''; saveBtn.disabled = false; statusEl.textContent = (data.content || '').length + ' characters';
  }
  async function save() {
    if (!current) return;
    saveBtn.disabled = true; statusEl.textContent = 'Saving to Supabase…';
    const content = textEl.value;
    const { error } = await client.from('vault_documents').update({ content, char_count: content.length, updated_at: new Date().toISOString() }).eq('id', current.id).then(r => r).catch((e) => ({ error: e }));
    if (error) { statusEl.textContent = 'Save failed: ' + (error.message || 'unknown error'); saveBtn.disabled = false; return; }
    statusEl.textContent = 'Saved ✓ ' + new Date().toLocaleTimeString(); saveBtn.disabled = false; loadList();
  }
  searchEl.addEventListener('input', () => { filter = searchEl.value; renderList(); });
  saveBtn.addEventListener('click', save);
  await loadList();

  if (cfg.realtime) {
    try { const ch = client.channel('mc-vault').on('postgres_changes', { event: '*', schema: 'public', table: 'vault_documents' }, () => loadList()); ch.subscribe(); register(() => { try { client.removeChannel(ch); } catch (e) { } }); } catch (e) { }
  }
  const id = window.setInterval(loadList, Math.max(6000, cfg.pollMs || 4000)); register(() => clearInterval(id));
  const clockId = window.setInterval(bar.setClock, 1000); register(() => clearInterval(clockId));
}

/* ============================== entry ============================== */
async function render(dv, component, view) {
  injectCss();
  const app = dv.app;
  const root = el('div', 'mc-root mc-view-' + (view || 'mission-control'));
  dv.container.appendChild(root);
  const cleanups = [];
  const register = (fn) => { if (typeof fn === 'function') cleanups.push(fn); };
  const comp = component || dv.component;
  if (comp && comp.register) comp.register(() => cleanups.forEach(fn => { try { fn(); } catch (e) { } }));

  let cfg;
  try { cfg = await loadConfig(app); }
  catch (e) {
    root.appendChild(errorCard('Setup needed', 'Could not read <code>mission-control/.dashboard/config.local.json</code>.<br/>Ask Claude Code to run the setup step, or copy <code>config.example.json</code> to <code>config.local.json</code> and fill in your Supabase details.'));
    return;
  }
  try {
    if (view === 'activity') return renderActivityView(app, root, cfg, register);
    if (view === 'vault') return renderVaultView(app, root, cfg, register);
    return await renderMissionControl(app, root, cfg, register);
  } catch (e) {
    root.appendChild(errorCard('Something went wrong', escapeHtml(String(e && e.message || e))));
  }
}

module.exports = { render };
