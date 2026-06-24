import { NextResponse } from "next/server";
import { loadClientDocsForBrain } from "@/lib/client-knowledge";
import { isDocType } from "@/lib/knowledge-map";

export const runtime = "nodejs";

/**
 * Re-ingest ONE doc into the queryable mirror (knowledge_docs): re-reads the
 * edited file and upserts its routing metadata so search/routing reflect the
 * change. The body itself is read live from disk by the agent tools, so this
 * keeps the index in sync after an edit. Service-role write (RLS = admin only).
 */
export async function POST(req: Request) {
  const { docType } = (await req.json().catch(() => ({}))) as { docType?: string };
  if (!docType || !isDocType(docType)) {
    return NextResponse.json({ error: "valid docType required" }, { status: 400 });
  }

  const { client, docs } = await loadClientDocsForBrain();
  const doc = docs.find((d) => d.docType === docType);
  if (!doc) return NextResponse.json({ error: "doc not found" }, { status: 404 });

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await admin.from("knowledge_docs").upsert(
      {
        client,
        doc_type: doc.docType,
        title: doc.title,
        authority: doc.authority,
        serves_agents: doc.servesAgents,
        answers: doc.answers,
        summary: doc.summary,
        storage_path: doc.storagePath,
        status: "ingested",
        last_ingested: today,
      },
      { onConflict: "client,doc_type" }
    );
    if (error) throw error;
    return NextResponse.json({ ok: true, reindexed: doc.docType, at: today });
  } catch (e) {
    // Supabase not configured — the edit is still saved to disk and read live.
    return NextResponse.json(
      { ok: true, reindexed: doc.docType, warning: `mirror not updated: ${String(e)}` }
    );
  }
}
