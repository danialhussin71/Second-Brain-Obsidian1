# Deploy log

## 2026-06-24 — live dashboard, brain repair, single-client, carousel polish

Shipping:
- **Dashboard live data:** rebuilt the Zapier MCP pipeline for the dynamic `execute_zapier_read_action` flow (list apps → drill read-action keys → execute → shape). Fetches real data, no more 502, client-side cached (only Refresh re-runs). `?debug=1` exposes the plan + raw results.
- **Brain:** ingestion-halt fixed (INSERT_BATCH 100→20); all 1,850 docs / 71,576 chunks seeded; retrieval verified.
- **Single-tenant client:** unified everything on `APP_CLIENT = "danny"` (src/lib/client.ts) — no `KNOWLEDGE_CLIENT`/`VAULT_CLIENT` env needed; vault migrated + `match_vault_chunks`/`vault_stats` filter by document client (migration `0010`).
- **Carousels:** 4:5 (1088×1360), header/footer/font locked to the reference image, repeatable elements specced exactly, high-quality output.
- **npm-only:** removed pnpm config (`vercel.json` installCommand → `npm install`).

<!-- bump this line to force a redeploy: deploy-trigger 1 -->
