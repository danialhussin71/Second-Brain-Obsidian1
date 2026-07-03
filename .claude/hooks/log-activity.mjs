#!/usr/bin/env node
/*
 * Mission Control — activity logger (PURELY OBSERVATIONAL)
 * ---------------------------------------------------------
 * Claude Code runs this after each tool call (and on session start/stop).
 * It appends ONE friendly, human-readable line to activity.jsonl.
 *
 * Safety: it never prints to stdout and always exits 0, so it cannot block,
 * modify, or re-trigger Claude. It only writes a local file. It does not log
 * tool OUTPUTS (only a short description of the action), so nothing sensitive
 * from results is stored.
 */
import fs from 'node:fs';
import path from 'node:path';

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const outFile = path.join(root, 'mission-control', '.dashboard', 'activity.jsonl');
const MAX_LINES = 250;

let payload = {};
try { payload = JSON.parse(readStdin() || '{}'); } catch { payload = {}; }

const event = payload.hook_event_name || 'Unknown';
const tool = payload.tool_name || '';
const input = payload.tool_input || {};

const clip = (s, n = 52) => {
  if (!s) return '';
  s = String(s).replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};
const baseName = (p) => (p ? String(p).split(/[\\/]/).pop() : '');
const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } };

function describeBash(cmd) {
  const c = (cmd || '').trim();
  const first = c.split(/\s+/)[0] || '';
  const map = {
    git: "Checked the project's changes",
    npm: 'Ran a project command', pnpm: 'Ran a project command', yarn: 'Ran a project command', npx: 'Ran a project tool',
    node: 'Ran a script', python: 'Ran a script', python3: 'Ran a script',
    ls: 'Looked through the files', cat: 'Read a file', grep: 'Searched the files', rg: 'Searched the files',
    find: 'Looked for files', mkdir: 'Created a folder', cp: 'Copied a file', mv: 'Moved a file', rm: 'Removed a file',
    curl: 'Fetched something online', wget: 'Downloaded something', echo: 'Noted something',
  };
  return map[first] || ('Ran a command: ' + clip(c, 40));
}

function describe() {
  if (event === 'SessionStart') return { icon: '\u{1F7E2}', kind: 'session', text: 'Session started — Claude is ready' };
  if (event === 'SessionEnd')   return { icon: '⚪', kind: 'idle',    text: 'Session ended' };
  if (event === 'Stop')         return { icon: '✅', kind: 'idle',    text: 'Finished — waiting for your next request' };

  switch (tool) {
    case 'Read':         return { icon: '\u{1F4D6}', kind: 'read',   text: 'Reading ' + (baseName(input.file_path) || 'a file') };
    case 'Write':        return { icon: '\u{1F58A}️', kind: 'write', text: 'Wrote ' + (baseName(input.file_path) || 'a file') };
    case 'Edit':
    case 'MultiEdit':    return { icon: '✍️', kind: 'write',  text: 'Edited ' + (baseName(input.file_path) || 'a file') };
    case 'NotebookEdit': return { icon: '\u{1F4D3}', kind: 'write',  text: 'Edited a notebook' };
    case 'Bash':         return { icon: '⚡', kind: 'run',    text: describeBash(input.command) };
    case 'Glob':         return { icon: '\u{1F50D}', kind: 'search', text: 'Looked for files' };
    case 'Grep':         return { icon: '\u{1F50D}', kind: 'search', text: 'Searched the code' + (input.pattern ? ' for “' + clip(input.pattern, 30) + '”' : '') };
    case 'WebSearch':    return { icon: '\u{1F310}', kind: 'web',    text: 'Searched the web for “' + clip(input.query, 40) + '”' };
    case 'WebFetch':     return { icon: '\u{1F310}', kind: 'web',    text: 'Read a web page' + (host(input.url) ? ' (' + host(input.url) + ')' : '') };
    case 'Task':         return { icon: '\u{1F916}', kind: 'agent',  text: 'Started a helper agent' + (input.description ? ': ' + clip(input.description, 34) : '') };
    case 'TodoWrite':    return { icon: '\u{1F4CB}', kind: 'plan',   text: 'Updated the to-do list' };
  }
  if (tool.startsWith('mcp__')) {
    const server = tool.split('__')[1] || 'a tool';
    const svcMap = {
      supabase: { icon: '\u{1F5C4}️', text: 'Worked with the Supabase database' },
      apify:    { icon: '\u{1F577}️', text: 'Scraped data from the web' },
      'chrome-devtools': { icon: '\u{1F9ED}', text: 'Controlled the browser' },
    };
    if (svcMap[server]) return { icon: svcMap[server].icon, kind: 'tool', text: svcMap[server].text };
    return { icon: '\u{1F50C}', kind: 'tool', text: 'Used ' + server };
  }
  if (tool) return { icon: '\u{1F6E0}️', kind: 'tool', text: 'Used ' + tool };
  return { icon: '•', kind: 'tool', text: event };
}

const d = describe();
const record = { ts: new Date().toISOString(), icon: d.icon, kind: d.kind, text: d.text, tool: tool || event };

try {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  // Keep the file small: trim to the most recent lines at session start.
  if (event === 'SessionStart' && fs.existsSync(outFile)) {
    const lines = fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean);
    if (lines.length > MAX_LINES) fs.writeFileSync(outFile, lines.slice(-MAX_LINES).join('\n') + '\n');
  }
  fs.appendFileSync(outFile, JSON.stringify(record) + '\n');
} catch {
  /* never fail a tool call — observational only */
}
process.exit(0);
