import { z } from "zod";
import { getDb } from "../db.js";

export const BrainErrorsInput = {
  hours: z
    .number()
    .min(1)
    .max(720)
    .default(24)
    .describe("Look back N hours (default: 24, max: 720 = 30 days)"),
  source: z
    .string()
    .optional()
    .describe("Filter by source prefix (e.g., 'hook:', 'mcp:', 'health:')"),
  level: z
    .string()
    .optional()
    .describe("Filter by level: critical, error, warn, info"),
  limit: z
    .number()
    .min(1)
    .max(100)
    .default(20)
    .describe("Max results (default: 20)"),
};

export type BrainErrorsParams = {
  hours: number;
  source?: string;
  level?: string;
  limit: number;
};

export async function brainErrors(params: BrainErrorsParams): Promise<string> {
  try {
    const sql = getDb();
    const { hours, source, level, limit } = params;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    // Query errors from the items table (category = 'error')
    // Metadata contains structured error fields: level, source, exit_code, etc.
    let rows;

    if (source && level) {
      rows = await sql`
        SELECT id, title, summary, metadata, created_at
        FROM items
        WHERE category = 'error'
          AND created_at >= ${since}
          AND metadata::text ILIKE ${'%"source":"' + source + '%'}
          AND metadata::text ILIKE ${'%"level":"' + level + '%'}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else if (source) {
      rows = await sql`
        SELECT id, title, summary, metadata, created_at
        FROM items
        WHERE category = 'error'
          AND created_at >= ${since}
          AND metadata::text ILIKE ${'%"source":"' + source + '%'}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else if (level) {
      rows = await sql`
        SELECT id, title, summary, metadata, created_at
        FROM items
        WHERE category = 'error'
          AND created_at >= ${since}
          AND metadata::text ILIKE ${'%"level":"' + level + '%'}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else {
      rows = await sql`
        SELECT id, title, summary, metadata, created_at
        FROM items
        WHERE category = 'error'
          AND created_at >= ${since}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    }

    if (rows.length === 0) {
      return `No errors found in the last ${hours} hour(s).`;
    }

    // Count totals by level
    const counts = await sql`
      SELECT
        (metadata->>'level') as level,
        COUNT(*) as count
      FROM items
      WHERE category = 'error'
        AND created_at >= ${since}
      GROUP BY metadata->>'level'
      ORDER BY count DESC
    `;

    const countSummary = counts.map((r: { level: string; count: string }) =>
      `${r.level}: ${r.count}`
    ).join(", ");

    // Format output
    const lines = rows.map((row: { id: number; title: string; summary: string; metadata: string; created_at: string }, i: number) => {
      let meta: Record<string, unknown> = {};
      try {
        meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata;
      } catch { /* ignore parse errors */ }

      const level = (meta.level as string) || "unknown";
      const source = (meta.source as string) || "unknown";
      const ts = new Date(row.created_at).toISOString().slice(0, 19);

      return `[${i + 1}] #${row.id} — ${row.title} (${ts})\n    Level: ${level} | Source: ${source}\n    ${row.summary.slice(0, 200)}`;
    });

    return `Errors in last ${hours}h (${countSummary}):\n\n${lines.join("\n\n")}`;
  } catch (err) {
    console.error("[brain-errors] Query failed:", err instanceof Error ? err.message : err);
    return "Failed to query errors. Check database connection.";
  }
}
