import { z } from "zod";
import { getDb } from "../db.js";
import { embed } from "../embedding.js";
import { toVectorLiteral } from "../vector.js";

export const BrainUpdateInput = {
  id: z.number().int().positive().describe("The item ID to update"),
  text: z
    .string()
    .min(1)
    .max(100000)
    .optional()
    .describe("New text content (replaces existing)"),
  title: z.string().optional().describe("New title"),
  category: z
    .string()
    .optional()
    .describe(
      "New category: person, project, idea, task, rating, learning, research, work_session, decision",
    ),
  status: z
    .string()
    .optional()
    .describe(
      "New status: active, waiting, blocked, someday, done, archived, captured",
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("New confidence score (0.0-1.0)"),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe("Metadata to merge (existing keys preserved unless overwritten)"),
  reembed: z
    .boolean()
    .default(false)
    .describe(
      "Force re-generation of the embedding vector. Use to backfill items stored without embeddings.",
    ),
};

export type BrainUpdateParams = {
  id: number;
  text?: string;
  title?: string;
  category?: string;
  status?: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
  reembed: boolean;
};

export async function brainUpdate(params: BrainUpdateParams): Promise<string> {
  try {
    const sql = getDb();
    const { id, text, title, category, status, confidence, metadata, reembed } =
      params;

    // Fetch existing item
    const existing = await sql`SELECT * FROM items WHERE id = ${id}`;
    if (existing.length === 0) {
      return `Item #${id} not found.`;
    }

    const item = existing[0];

    // Build update fields
    const updates: Record<string, unknown> = { updated_at: sql`NOW()` };

    if (text !== undefined) {
      updates.content = text;
    }
    if (title !== undefined) updates.title = title.slice(0, 500);
    if (category !== undefined) updates.category = category;
    if (status !== undefined) updates.status = status;
    if (confidence !== undefined) updates.confidence = confidence;

    if (metadata !== undefined) {
      const merged = { ...(JSON.parse(String(item.metadata || "{}")) as Record<string, unknown>), ...metadata };
      updates.metadata = JSON.stringify(merged);
    }

    // Re-embed if requested or if content changed
    const needsEmbed = reembed || text !== undefined || title !== undefined;
    if (needsEmbed) {
      const embedTitle = title ?? String(item.title ?? "");
      const embedContent = text ?? String(item.content ?? "");
      const embedText = embedTitle + "\n" + embedContent;

      const embResult = await embed(embedText);
      if (embResult) {
        const vecLiteral = toVectorLiteral(embResult.embedding);
        // Update with embedding in a separate query (vector literal needs raw SQL)
        await sql`
          UPDATE items SET embedding = ${vecLiteral}::vector WHERE id = ${id}
        `;
      }
    }

    // Apply non-embedding updates
    const setClauses = Object.entries(updates);
    if (setClauses.length > 0) {
      // Build dynamic SET clause
      await sql`
        UPDATE items SET
          title = ${(updates.title as string) ?? item.title},
          content = ${(updates.content as string) ?? item.content},
          category = ${(updates.category as string) ?? item.category},
          status = ${(updates.status as string) ?? item.status},
          confidence = ${(updates.confidence as number) ?? item.confidence},
          metadata = ${(updates.metadata as string) ?? JSON.stringify(item.metadata ?? {})},
          updated_at = NOW()
        WHERE id = ${id}
      `;
    }

    const embedded = needsEmbed ? "(re-embedded)" : "";
    return `Updated item #${id} ${embedded}. Fields changed: ${Object.keys(updates).filter((k) => k !== "updated_at").join(", ") || "embedding only"}`;
  } catch (err) {
    console.error(
      "[brain-update] Update failed:",
      err instanceof Error ? err.message : err,
    );
    return "Failed to update item. Please check your parameters and try again.";
  }
}
