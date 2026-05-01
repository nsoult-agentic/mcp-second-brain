import { z } from "zod";
import { getDb } from "../db.js";

export const BrainGetInput = {
  id: z.number().int().positive().describe("The item ID to retrieve"),
};

export type BrainGetParams = {
  id: number;
};

export async function brainGet(params: BrainGetParams): Promise<string> {
  try {
    const sql = getDb();
    const { id } = params;

    const rows = await sql`
      SELECT id, title, content, category, status, confidence,
             metadata, created_at, updated_at
      FROM items WHERE id = ${id}
    `;

    if (rows.length === 0) {
      return `Item #${id} not found.`;
    }

    const item = rows[0];
    const created = String(item.created_at).slice(0, 10);
    const updated = String(item.updated_at).slice(0, 10);
    const pct = Math.round(Number(item.confidence ?? 0) * 100);
    const meta = item.metadata ? JSON.stringify(item.metadata) : "{}";

    return [
      `#${item.id} — ${item.title ?? "(untitled)"}`,
      `Category: ${item.category} | Status: ${item.status} | Confidence: ${pct}%`,
      `Created: ${created} | Updated: ${updated}`,
      "",
      String(item.content ?? ""),
      "",
      `Metadata: ${meta}`,
    ].join("\n");
  } catch (err) {
    console.error("[brain-get] Fetch failed:", err instanceof Error ? err.message : err);
    return "Failed to retrieve item. Please check the ID and try again.";
  }
}
