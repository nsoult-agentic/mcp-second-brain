import { z } from "zod";
import { getDb } from "../db.js";
import { embed } from "../embedding.js";
import { toVectorLiteral } from "../vector.js";

export const BrainStoreInput = {
  text: z.string().min(1).max(100000).describe("The text content to store"),
  title: z
    .string()
    .optional()
    .describe("Optional title. If omitted, first 80 chars of text are used."),
  category: z
    .string()
    .default("idea")
    .describe("Category: person, project, idea, task, rating, learning, research, work_session, decision"),
  metadata: z
    .record(z.unknown())
    .optional()
    .describe("Optional JSON metadata object"),
  status: z
    .string()
    .default("active")
    .describe("Item status: active, waiting, blocked, someday, done, archived, captured"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .default(1.0)
    .describe("Confidence score (0.0-1.0). Defaults to 1.0 for manually stored items."),
};

export type BrainStoreParams = {
  text: string;
  title?: string;
  category: string;
  metadata?: Record<string, unknown>;
  status: string;
  confidence: number;
};

export async function brainStore(params: BrainStoreParams): Promise<string> {
  try {
    const sql = getDb();
    const { text, title: titleParam, category, metadata, status, confidence } = params;

    const title = (titleParam ?? text.slice(0, 80)).slice(0, 500);

    // Generate embedding
    const embeddingText = title + "\n" + text;
    const embResult = await embed(embeddingText);

    let vecParam: string | null = null;
    if (embResult) {
      vecParam = toVectorLiteral(embResult.embedding);
    }

    const rows = await sql`
      INSERT INTO items (
        category, confidence, title, summary, content,
        metadata, source, status
        ${vecParam ? sql`, embedding` : sql``}
      ) VALUES (
        ${category},
        ${confidence},
        ${title},
        ${text.slice(0, 1000)},
        ${text},
        ${JSON.stringify(metadata ?? {})},
        'mcp',
        ${status}
        ${vecParam ? sql`, ${vecParam}::vector` : sql``}
      )
      RETURNING id, created_at
    `;

    const item = rows[0];
    const embedded = vecParam ? "yes" : "no (Ollama unavailable)";

    return `Stored as item #${item.id} (category: ${category}, confidence: ${(confidence * 100).toFixed(0)}%, embedded: ${embedded}, created: ${item.created_at})`;
  } catch (err) {
    console.error("[brain-store] Store failed:", err instanceof Error ? err.message : err);
    return "Failed to store item. Please check your parameters and try again.";
  }
}
