import { tool } from "ai";
import { z } from "zod";
import { DOC_TYPES, type AgentKey, type DocType } from "./knowledge-map";
import {
  listBusinessDocs,
  readBusinessDoc,
  searchBusinessDocs,
} from "./client-knowledge";

/**
 * The knowledge-routing tools every GTM agent gets. They are SCOPED to the
 * agent's knowledge map so the model only looks where it should:
 *
 *   listBusinessDocs   — the manifest: which of the founder's documents exist,
 *                        and what each one answers. Call this FIRST to route.
 *   readBusinessDoc    — the full body of one document by doc_type.
 *   searchBusinessDocs — scoped keyword search across the in-scope documents.
 *
 * `agent` binds the default scope; the model can still name doc_types explicitly.
 */
export function buildBusinessDocTools(agent?: AgentKey) {
  return {
    listBusinessDocs: tool({
      description:
        "List the founder's business documents that are relevant to you (Voice DNA, ICP, Messaging House, Rule of One, Offer Strategy, etc.) — each with a summary and the exact questions it answers. ALWAYS call this FIRST to decide WHERE to look, then readBusinessDoc or searchBusinessDocs.",
      parameters: z.object({}),
      execute: async () => {
        return await listBusinessDocs({ agent });
      },
    }),

    readBusinessDoc: tool({
      description:
        "Read the FULL body of ONE of the founder's business documents by doc_type. Use after listBusinessDocs to pull the document that answers the question (e.g. doc_type 'voice-dna' for how they sound, 'icp-profile' for who to target, 'offer-strategy' for pricing).",
      parameters: z.object({
        doc_type: z.enum(DOC_TYPES as unknown as [DocType, ...DocType[]]),
      }),
      execute: async ({ doc_type }) => {
        return await readBusinessDoc({ docType: doc_type });
      },
    }),

    searchBusinessDocs: tool({
      description:
        "Keyword-search across the founder's in-scope business documents and get ranked excerpts. Use for a pinpoint fact when you don't need a whole document. Optionally narrow to specific doc_types.",
      parameters: z.object({
        query: z.string().describe("Natural-language query or keywords."),
        doc_types: z
          .array(z.enum(DOC_TYPES as unknown as [DocType, ...DocType[]]))
          .optional()
          .describe("Optional: restrict the search to these doc_types."),
        limit: z.number().int().min(1).max(8).default(5),
      }),
      execute: async ({ query, doc_types, limit }) => {
        return await searchBusinessDocs({ query, agent, docTypes: doc_types, limit });
      },
    }),
  };
}
