#!/usr/bin/env node
/**
 * Sync your local Obsidian vault + knowledge map + LanceDB index to Vercel Blob.
 *
 * Run from your laptop whenever you've edited the vault and want production to
 * see the changes.
 *
 *   node scripts/sync-to-blob.mjs                 # full upload + build graph
 *   node scripts/sync-to-blob.mjs --only=ai-danny # just _ai-danny/ folder
 *   node scripts/sync-to-blob.mjs --only=index    # just the LanceDB index
 *   node scripts/sync-to-blob.mjs --only=graph    # just rebuild vault/_graph.json
 *   node scripts/sync-to-blob.mjs --dry           # don't actually upload
 *
 * Reads VAULT_PATH + BLOB_READ_WRITE_TOKEN from .env.local.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "..");

async function loadEnv() {
  try {
    const txt = await fs.readFile(path.join(PROJECT_ROOT, ".env.local"), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

const args = process.argv.slice(2);
function flag(name) {
  // Support both `--only=value` and `--only value` styles
  for (const arg of args) {
    if (arg.startsWith(name + "=")) return arg.slice(name.length + 1);
  }
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}
const only = flag("--only");
const dry = args.includes("--dry");

const VAULT_EXCLUDE = new Set([
  ".obsidian",
  ".trash",
  "node_modules",
  ".git",
  ".DS_Store",
]);

async function walk(dir, root, out = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".env.local") continue;
    if (VAULT_EXCLUDE.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(full, root, out);
    else if (e.isFile() && (e.name.endsWith(".md") || e.name.endsWith(".json"))) {
      out.push({
        absPath: full,
        relPath: path.relative(root, full),
      });
    }
  }
  return out;
}

async function uploadFile(blob, relPath, absPath) {
  const data = await fs.readFile(absPath);
  await blob.put(relPath, data, {
    access: "private",
    contentType: relPath.endsWith(".json")
      ? "application/json"
      : "text/markdown",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

/* ---------- Graph builder ------------------------------------------------- */

const WIKILINK_RE = /\[\[([^\]\|#]+)(?:#[^\]\|]+)?(?:\|[^\]]+)?\]\]/g;

function noteIdFromPath(p) {
  return p.replace(/\.md$/i, "");
}

/**
 * Build the brain graph JSON from .md files on disk.
 * Mirrors the logic in src/lib/vault.ts so the API can read a single
 * pre-built file instead of fetching 2,500+ individual blobs.
 */
async function buildGraph(vaultPath, mdFiles) {
  const byTitle = new Map();
  const notes = [];

  for (const f of mdFiles) {
    if (!f.relPath.endsWith(".md")) continue;
    try {
      const raw = await fs.readFile(f.absPath, "utf8");
      const stat = await fs.stat(f.absPath);
      const folder = path.dirname(f.relPath);
      const title = path.basename(f.relPath, ".md");
      const links = [...raw.matchAll(WIKILINK_RE)].map((m) => m[1].trim());
      const note = {
        id: noteIdFromPath(f.relPath),
        title,
        folder: folder === "." ? "(root)" : folder,
        links,
        mtime: stat.mtimeMs,
      };
      notes.push(note);
      byTitle.set(title.toLowerCase(), note);
    } catch {
      // skip unreadable
    }
  }

  const folders = [...new Set(notes.map((n) => n.folder))].sort();
  const folderIdx = new Map(folders.map((f, i) => [f, i]));
  const graphLinks = [];
  const degree = new Map();

  for (const n of notes) {
    for (const target of n.links) {
      const t = byTitle.get(target.toLowerCase());
      if (t && t.id !== n.id) {
        graphLinks.push({ source: n.id, target: t.id });
        degree.set(n.id, (degree.get(n.id) || 0) + 1);
        degree.set(t.id, (degree.get(t.id) || 0) + 1);
      }
    }
  }

  const nodes = notes.map((n) => {
    const d = degree.get(n.id) || 0;
    return {
      id: n.id,
      name: n.title,
      folder: n.folder,
      val: 1 + Math.log2(d + 1),
      degree: d,
      group: folderIdx.get(n.folder) ?? 0,
      tags: [],
    };
  });

  const lastEdited = notes.reduce((max, n) => Math.max(max, n.mtime), 0);

  return { nodes, links: graphLinks, folders, noteCount: notes.length, lastEdited };
}

async function main() {
  await loadEnv();
  const vaultPath = process.env.VAULT_PATH;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!vaultPath) {
    console.error("VAULT_PATH not set in .env.local");
    process.exit(1);
  }
  if (!token && !dry) {
    console.error(
      "BLOB_READ_WRITE_TOKEN not set. Run `vercel storage create blob ai-danny-vault` to get one,"
    );
    console.error("then paste it into .env.local. Or run with --dry to preview.");
    process.exit(1);
  }

  let blob;
  if (!dry) {
    const pkg = await import("@vercel/blob");
    blob = {
      put: (key, data, opts) => pkg.put(key, data, { token, ...opts }),
    };
  }

  // Inventory
  console.log(`Scanning ${vaultPath}…`);
  const files = await walk(vaultPath, vaultPath);
  console.log(`  Found ${files.length} files\n`);

  // --only=graph: just build + upload the pre-built graph JSON and exit
  if (only === "graph") {
    console.log("Building brain graph…");
    const mdFiles = files.filter((f) => f.relPath.endsWith(".md"));
    const graph = await buildGraph(vaultPath, mdFiles);
    console.log(`  ${graph.nodes.length} nodes · ${graph.links.length} links`);
    if (!dry) {
      const json = JSON.stringify(graph);
      await blob.put("vault/_graph.json", Buffer.from(json), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      console.log(`✓ Uploaded vault/_graph.json (${(json.length / 1024).toFixed(0)} KB)`);
    } else {
      console.log("[DRY] Would upload vault/_graph.json");
    }
    return;
  }

  let filtered = files;
  if (only === "ai-danny") {
    filtered = files.filter((f) => f.relPath.startsWith("_ai-danny/"));
  } else if (only === "vault") {
    filtered = files.filter((f) => !f.relPath.startsWith("_ai-danny/"));
  } else if (only === "knowledge") {
    filtered = files.filter((f) =>
      f.relPath.startsWith("_ai-danny/knowledge/")
    );
  }

  const total = filtered.length;
  console.log(`Uploading ${total} files${only ? ` (only=${only})` : ""}${dry ? " [DRY RUN]" : ""}…`);
  let done = 0;
  let bytes = 0;
  const start = Date.now();

  const CONCURRENCY = 6;
  for (let i = 0; i < filtered.length; i += CONCURRENCY) {
    const batch = filtered.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (f) => {
        const blobKey = `vault/${f.relPath}`;
        if (dry) {
          // Just print
        } else {
          await uploadFile(blob, blobKey, f.absPath);
        }
        const stat = await fs.stat(f.absPath);
        bytes += stat.size;
        done++;
      })
    );
    process.stdout.write(`\r  ${done}/${total} · ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  }

  console.log(`\n\n✓ Synced ${done} files (${(bytes / 1024 / 1024).toFixed(1)} MB) in ${Math.ceil((Date.now() - start) / 1000)}s`);

  // On a full sync, also rebuild the pre-built graph JSON
  if (!only) {
    console.log("\nBuilding brain graph…");
    const mdFiles = files.filter((f) => f.relPath.endsWith(".md"));
    const graph = await buildGraph(vaultPath, mdFiles);
    console.log(`  ${graph.nodes.length} nodes · ${graph.links.length} links`);
    if (!dry) {
      const json = JSON.stringify(graph);
      await blob.put("vault/_graph.json", Buffer.from(json), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      console.log(`✓ Uploaded vault/_graph.json (${(json.length / 1024).toFixed(0)} KB)`);
    }
  }

  if (only === "index" || !only) {
    console.log(
      "\nNOTE: The LanceDB index isn't uploaded by this script (it's binary). " +
        "Production calls /api/brain/reindex once after deploy to rebuild from the synced .md files."
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
