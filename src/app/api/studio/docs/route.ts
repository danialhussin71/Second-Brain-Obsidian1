import { NextResponse } from "next/server";
import { loadClientDocsForBrain, writeBusinessDoc } from "@/lib/client-knowledge";
import { isDocType } from "@/lib/knowledge-map";

export const runtime = "nodejs";

/** List the founder's uploaded business docs (with body) for the settings editor. */
export async function GET() {
  try {
    const { client, docs } = await loadClientDocsForBrain();
    return NextResponse.json({
      client,
      docs: docs.map((d) => ({
        docType: d.docType,
        title: d.title,
        summary: d.summary,
        authority: d.authority,
        body: d.body,
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** Save an edited doc body (frontmatter preserved). */
export async function PUT(req: Request) {
  const { docType, body } = (await req.json().catch(() => ({}))) as {
    docType?: string;
    body?: string;
  };
  if (!docType || !isDocType(docType) || typeof body !== "string") {
    return NextResponse.json({ error: "docType + body required" }, { status: 400 });
  }
  try {
    const result = await writeBusinessDoc({ docType, body });
    if (!result.ok) return NextResponse.json({ error: "doc not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
