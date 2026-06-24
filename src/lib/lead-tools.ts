import { tool } from "ai";
import { z } from "zod";
import { scrapeLinkedInLeads, MAX_LEADS, type Lead } from "./lead-scraper";
import { enrichLeads } from "./lead-enrichment";

/**
 * The Sales / Outreach lead-generation tool.
 *
 * `scrapeLeads` is the real thing: it runs a filtered LinkedIn people-search via
 * Apify and returns actual prospects. The agent's job is to read the ICP first
 * (readBusinessDoc('icp-profile')) and translate it into these filters, then
 * call this with the count the user asked for. Human-readable enums map to
 * LinkedIn's internal filter ids inside lead-scraper.ts.
 */

const SENIORITY = [
  "In Training",
  "Entry Level",
  "Senior",
  "Strategic",
  "Entry Level Manager",
  "Experienced Manager",
  "Director",
  "Vice President",
  "CXO",
  "Owner / Partner",
] as const;

const FUNCTIONS = [
  "Accounting",
  "Administrative",
  "Arts and Design",
  "Business Development",
  "Community and Social Services",
  "Consulting",
  "Education",
  "Engineering",
  "Entrepreneurship",
  "Finance",
  "Healthcare Services",
  "Human Resources",
  "Information Technology",
  "Legal",
  "Marketing",
  "Media and Communication",
  "Military and Protective Services",
  "Operations",
  "Product Management",
  "Program and Project Management",
  "Purchasing",
  "Quality Assurance",
  "Real Estate",
  "Research",
  "Sales",
  "Customer Success and Support",
] as const;

const COMPANY_SIZE = [
  "Self-Employed",
  "1-10",
  "11-50",
  "51-200",
  "201-500",
  "501-1000",
  "1001-5000",
  "5001-10000",
  "10001+",
] as const;

export function buildLeadTools() {
  return {
    scrapeLeads: tool({
      description:
        "Scrape REAL prospects from LinkedIn that match the founder's ICP, using the harvestapi/linkedin-profile-search Apify actor (no LinkedIn login needed). " +
        "Call this AFTER reading the ICP (readBusinessDoc('icp-profile')) and turning it into concrete search filters. " +
        "Returns real people: name, current title, company, location, LinkedIn URL, and (when findEmails is true) a work email. " +
        "Pass the exact number of prospects the user asked for as `count` (e.g. 50). " +
        "If APIFY_TOKEN is not set it returns configured:false — in that case still deliver the targeting plan and qualification rules and tell the user to add APIFY_TOKEN.",
      parameters: z.object({
        searchQuery: z
          .string()
          .optional()
          .describe(
            "Free-text LinkedIn people search combining the role and niche, e.g. 'Head of Growth B2B SaaS'. Supports LinkedIn search operators (AND/OR/quotes). Always provide this."
          ),
        jobTitles: z
          .array(z.string())
          .optional()
          .describe("Exact current job titles to target, e.g. ['VP of Sales','Head of Revenue','CRO']."),
        locations: z
          .array(z.string())
          .optional()
          .describe("Locations to include. Use full country names ('United Kingdom', not 'UK'), e.g. ['United States','London']."),
        seniority: z.array(z.enum(SENIORITY)).optional().describe("Seniority levels to include."),
        functions: z.array(z.enum(FUNCTIONS)).optional().describe("Job functions / departments to include."),
        companySize: z.array(z.enum(COMPANY_SIZE)).optional().describe("Company headcount bands to target."),
        recentlyChangedJobs: z
          .boolean()
          .optional()
          .describe("Only people who changed jobs in the last 90 days — a strong buying signal."),
        count: z
          .number()
          .int()
          .min(1)
          .max(MAX_LEADS)
          .default(25)
          .describe(`How many prospects to return. Use the number the user asked for (capped at ${MAX_LEADS}).`),
        findEmails: z
          .boolean()
          .default(false)
          .describe("Also resolve a work email for each profile. Costs more per lead; set true only when the user wants emails for outreach."),
      }),
      execute: async (args) => {
        const r = await scrapeLinkedInLeads(args);
        return {
          configured: r.configured,
          ok: r.ok,
          actor: r.actor,
          requested: r.requested,
          returned: r.returned,
          withEmail: r.withEmail,
          estimatedCostUsd: r.costEstimateUsd,
          note: r.note,
          leads: r.leads,
        };
      },
    }),

    enrichLeads: tool({
      description:
        "Enrich already-scraped LinkedIn prospects into OUTREACH-READY records, via the Apify enrichment chain: deep profile (apimaestro/linkedin-profile-detail — about, experience, skills), recent activity (harvestapi/linkedin-profile-posts — latest posts for personalization), and work-email find (snipercoder/bulk-linkedin-email-finder) + verify (nexgendata/email-verification-tool). " +
        "Pass the prospects from a prior scrapeLeads call (their linkedinUrl is required). Returns each lead with an `enrichment` object + an `emailStatus`. " +
        "Needs APIFY_TOKEN; without it returns configured:false and the leads unchanged.",
      parameters: z.object({
        leads: z
          .array(
            z.object({
              name: z.string().optional(),
              linkedinUrl: z.string().describe("The prospect's LinkedIn profile URL — required to enrich."),
              email: z.string().optional(),
              title: z.string().optional(),
              company: z.string().optional(),
              location: z.string().optional(),
            })
          )
          .describe("The prospects to enrich (from scrapeLeads)."),
        deepProfile: z.boolean().default(true).describe("Pull about / experience / skills / education."),
        recentActivity: z.boolean().default(true).describe("Pull the latest posts for personalization angles."),
        verifyEmail: z.boolean().default(true).describe("Find missing work emails and verify deliverability."),
      }),
      execute: async (args) => {
        const leads: Lead[] = args.leads.map((l) => ({
          name: l.name ?? "",
          firstName: "",
          lastName: "",
          headline: "",
          title: l.title ?? "",
          company: l.company ?? "",
          companyUrl: "",
          location: l.location ?? "",
          linkedinUrl: l.linkedinUrl,
          email: l.email ?? "",
          pictureUrl: "",
          id: l.linkedinUrl,
        }));
        const r = await enrichLeads(leads, { deepProfile: args.deepProfile, recentActivity: args.recentActivity, verifyEmail: args.verifyEmail });
        return {
          configured: r.configured,
          enriched: r.enrichedCount,
          withEmail: r.withEmail,
          verifiedEmail: r.verifiedEmail,
          withActivity: r.withActivity,
          estimatedCostUsd: r.costEstimateUsd,
          actors: r.actorsUsed,
          note: r.note,
          leads: r.leads,
        };
      },
    }),
  };
}
