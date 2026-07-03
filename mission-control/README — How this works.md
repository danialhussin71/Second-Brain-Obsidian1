# Mission Control — how this works

This folder is a small, self-contained **Obsidian dashboard** that shows your AI
"mission control" — live. It reads your data straight from Supabase and shows,
in real time, what Claude Code is doing while it works for you.

It does **not** change or depend on your main Next.js app. It just watches and
displays. Think of it as a cockpit window, not the engine.

---

## How to open it (one time)

1. Open **Obsidian**.
2. Click **Open** → **Open folder as vault**, and choose this `mission-control` folder.
3. Obsidian will say *"This vault contains community plugins."* Click
   **Trust author & enable plugins**. (This turns on Dataview, which draws the dashboards.)
4. Open the note called **Mission Control** from the file list on the left.

That's it. The dashboard appears. Leave Obsidian open beside your Claude Code window.

> If the dashboard shows a "Setup needed" card, see **Updating your keys** below.

---

## The three dashboards (notes)

| Note | What it shows |
|------|----------------|
| **Mission Control** | The full cockpit: a live orb, headline numbers (your second-brain notes, content engagement, agents, pipeline), your agent roster, a content-engagement chart, meetings, commitments, vault status, and the live activity feed. |
| **Agent Activity** | A big, focused, live feed of exactly what Claude Code is doing right now, in plain English ("Reading origin-story.md", "Searched the web for…"). Shows a calm **Idle** state when nothing is running. |
| **Vault Browser** | Browse all your notes stored in Supabase, open any one, **edit it, and save it back to Supabase** — live. |

Everything refreshes on its own. You don't click anything to keep it live.

---

## Where everything lives (plain language)

Everything for the dashboard is inside this `mission-control` folder, plus one
helper the AI uses to report what it's doing.

| File / folder | What it is |
|---------------|-----------|
| `Mission Control.md`, `Agent Activity.md`, `Vault Browser.md` | The dashboard notes you open. Each is tiny — it just calls the engine below. |
| `.dashboard/mc.js` | **The engine.** All the dashboard logic and styling. You never edit this by hand. |
| `.dashboard/lib/supabase.js` | The Supabase connector, bundled locally so nothing is downloaded from the internet. |
| `.dashboard/config.local.json` | **Your private keys** (Supabase address + access key). Stays on your machine, never shared, never committed to git. |
| `.dashboard/activity.jsonl` | The live feed file. Claude Code adds one friendly line here every time it does something. |
| `.dashboard/linkedin.json` | An optional copy of your LinkedIn post data, used to fill the engagement chart. |
| `../.claude/hooks/log-activity.mjs` | The small script that writes the friendly activity lines. (Lives with your project's Claude Code settings, one level up.) |
| `../.claude/settings.json` | Tells Claude Code to run that script after each step. |

---

## The activity feed — and why it's safe

Every time Claude Code uses a tool (reads a file, searches the web, runs a
command…), your project's Claude Code setup runs one tiny script
(`log-activity.mjs`) that appends **one friendly sentence** to
`.dashboard/activity.jsonl`. The dashboards read that file a couple of times a
second and show it.

This is **purely a watcher**:

- It only **writes a line to a file**. It cannot start work, run commands, or
  make Claude do anything.
- The dashboard only **reads and displays**. Opening it never triggers Claude.
- It logs a short *description* of each action, never the actual file contents or
  results — so nothing sensitive is stored in the feed.

You always drive Claude yourself, in your own Claude Code window. The dashboard
just shows you what's happening.

> **Note:** the feed starts working after you **restart Claude Code** once (so it
> picks up the new settings). Until then, the feed simply shows its "waiting"
> state.

---

## Updating your keys (if you ever need to)

Your connection details live in `.dashboard/config.local.json`. It was filled in
automatically from your project's `.env.local`. If you move machines or rotate
keys, just ask Claude Code:

> "Regenerate the mission-control config from .env.local"

or copy `.dashboard/config.example.json` to `.dashboard/config.local.json` and
fill in your own Supabase URL and key.

---

## Turn on true push-updates (optional)

The dashboard is already live — it re-checks Supabase every few seconds. If you
also want instant, push-the-moment-it-changes updates, apply the included
database migration once:

- File: `../supabase/migrations/0011_realtime_dashboard.sql`
- Apply it in the Supabase SQL editor, or with the Supabase CLI.

This is optional. Everything works without it.

---

## Safety & privacy

- `config.local.json` contains a powerful access key. It is **git-ignored** and
  stays on your machine. **Never share it, commit it, or sync it to a public place.**
- If you give this vault to someone else, they should use **their own** Supabase
  keys (their own `.env.local` → regenerate config), not yours.
- The activity feed is observational only, as described above.

---

## Troubleshooting

- **"Setup needed" card** → `config.local.json` is missing. Regenerate it (see above).
- **Dashboards look like plain code blocks** → Dataview isn't enabled. Settings →
  Community plugins → enable **Dataview**; and Settings → Dataview → turn on
  **Enable JavaScript Queries**.
- **Numbers are empty / zero** → those Supabase tables simply have no rows yet
  (e.g. no deals or meetings recorded). Panels fill in automatically as data lands.
  Your notes, agents, engagement, and activity feed will still be populated.
- **Activity feed stays empty** → restart Claude Code once so it loads the new
  hook, then ask it to do something.
- **Not live / "reconnecting"** → check your internet and that the Supabase keys
  in `config.local.json` are correct.
