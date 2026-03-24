import { z } from "zod";
import { getDb, type Sql } from "../db.js";
import { embed } from "../embedding.js";
import { toVectorLiteral } from "../vector.js";

export const BrainSearchInput = {
  query: z.string().describe("The search query text"),
  mode: z
    .enum(["semantic", "fulltext", "hybrid"])
    .default("hybrid")
    .describe("Search mode: semantic (vector), fulltext (tsvector), hybrid (both combined)"),
  category: z
    .string()
    .optional()
    .describe("Filter by category: person, project, idea, task, rating, learning, research, work_session, decision"),
  status: z
    .string()
    .optional()
    .describe("Filter by status: active, waiting, blocked, someday, done, archived, captured"),
  min_confidence: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Minimum confidence threshold (0.0-1.0)"),
  after: z
    .string()
    .optional()
    .describe("Only items created after this date (ISO 8601, e.g. 2026-01-01)"),
  before: z
    .string()
    .optional()
    .describe("Only items created before this date (ISO 8601)"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .describe("Maximum results to return (1-50, default 10)"),
};

export type BrainSearchParams = {
  query: string;
  mode: "semantic" | "fulltext" | "hybrid";
  category?: string;
  status?: string;
  min_confidence?: number;
  after?: string;
  before?: string;
  limit: number;
};

interface SearchRow {
  id: number;
  title: string;
  summary: string | null;
  content: string | null;
  category: string;
  confidence: number;
  status: string;
  created_at: Date;
  metadata: Record<string, unknown>;
  similarity?: number;
  fts_rank?: number;
  combined_score?: number;
}

function formatResults(rows: SearchRow[]): string {
  if (rows.length === 0) return "No results found.";

  const mainLines: string[] = [];
  const debugLines: string[] = [];

  rows.forEach((r, i) => {
    const idx = i + 1;
    const parts = [
      `[${idx}] #${r.id} — ${r.title}`,
      `    Category: ${r.category} | Status: ${r.status}`,
      `    Created: ${new Date(r.created_at).toISOString().slice(0, 10)}`,
    ];

    if (r.summary) {
      parts.push(`    ${r.summary.slice(0, 200)}`);
    }

    const metaKeys = Object.keys(r.metadata ?? {});
    if (metaKeys.length > 0) {
      parts.push(`    Metadata: ${JSON.stringify(r.metadata).slice(0, 150)}`);
    }

    mainLines.push(parts.join("\n"));

    // Collect score details for debug envelope
    const scores: string[] = [];
    scores.push(`confidence=${(Number(r.confidence) * 100).toFixed(0)}%`);
    if (r.similarity != null) scores.push(`similarity=${(Number(r.similarity) * 100).toFixed(1)}%`);
    if (r.fts_rank != null) scores.push(`fts=${Number(r.fts_rank).toFixed(4)}`);
    if (r.combined_score != null) scores.push(`rrf=${Number(r.combined_score).toFixed(4)}`);
    debugLines.push(`  [${idx}] #${r.id}: ${scores.join(", ")}`);
  });

  const main = mainLines.join("\n\n");
  const debug = `\n\n--- scores ---\n${debugLines.join("\n")}`;

  return main + debug;
}

// --- Semantic Search (vector cosine similarity) ---

async function semanticSearch(
  sql: Sql,
  queryVec: number[],
  params: BrainSearchParams,
): Promise<SearchRow[]> {
  const vecParam = toVectorLiteral(queryVec);
  const { category, status, min_confidence, after, before, limit } = params;

  return (await sql`
    SELECT
      id, title, summary, content, category, confidence, status,
      created_at, metadata,
      1 - (embedding <=> ${vecParam}::vector) AS similarity
    FROM items
    WHERE embedding IS NOT NULL
      ${category ? sql`AND category = ${category}` : sql``}
      ${status ? sql`AND status = ${status}` : sql``}
      ${min_confidence != null ? sql`AND confidence >= ${min_confidence}` : sql``}
      ${after ? sql`AND created_at >= ${after}::timestamptz` : sql``}
      ${before ? sql`AND created_at <= ${before}::timestamptz` : sql``}
    ORDER BY embedding <=> ${vecParam}::vector ASC
    LIMIT ${limit}
  `) as unknown as SearchRow[];
}

// --- Full-Text Search (tsvector) ---

async function fulltextSearch(
  sql: Sql,
  query: string,
  params: BrainSearchParams,
): Promise<SearchRow[]> {
  const { category, status, min_confidence, after, before, limit } = params;

  return (await sql`
    SELECT
      id, title, summary, content, category, confidence, status,
      created_at, metadata,
      ts_rank_cd(search_vector, websearch_to_tsquery('english', ${query})) AS fts_rank
    FROM items
    WHERE search_vector @@ websearch_to_tsquery('english', ${query})
      ${category ? sql`AND category = ${category}` : sql``}
      ${status ? sql`AND status = ${status}` : sql``}
      ${min_confidence != null ? sql`AND confidence >= ${min_confidence}` : sql``}
      ${after ? sql`AND created_at >= ${after}::timestamptz` : sql``}
      ${before ? sql`AND created_at <= ${before}::timestamptz` : sql``}
    ORDER BY fts_rank DESC
    LIMIT ${limit}
  `) as unknown as SearchRow[];
}

// --- Hybrid Search (RRF: Reciprocal Rank Fusion) ---

async function hybridSearch(
  sql: Sql,
  query: string,
  queryVec: number[],
  params: BrainSearchParams,
): Promise<SearchRow[]> {
  const vecParam = toVectorLiteral(queryVec);
  const { category, status, min_confidence, after, before, limit } = params;
  const candidateLimit = limit * 10;

  return (await sql`
    WITH semantic AS (
      SELECT
        id,
        ROW_NUMBER() OVER (ORDER BY embedding <=> ${vecParam}::vector ASC) AS sem_rank,
        1 - (embedding <=> ${vecParam}::vector) AS similarity
      FROM items
      WHERE embedding IS NOT NULL
        ${category ? sql`AND category = ${category}` : sql``}
        ${status ? sql`AND status = ${status}` : sql``}
        ${min_confidence != null ? sql`AND confidence >= ${min_confidence}` : sql``}
        ${after ? sql`AND created_at >= ${after}::timestamptz` : sql``}
        ${before ? sql`AND created_at <= ${before}::timestamptz` : sql``}
      ORDER BY embedding <=> ${vecParam}::vector ASC
      LIMIT ${candidateLimit}
    ),
    fts AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          ORDER BY ts_rank_cd(search_vector, websearch_to_tsquery('english', ${query})) DESC
        ) AS fts_rank_pos,
        ts_rank_cd(search_vector, websearch_to_tsquery('english', ${query})) AS fts_rank
      FROM items
      WHERE search_vector @@ websearch_to_tsquery('english', ${query})
        ${category ? sql`AND category = ${category}` : sql``}
        ${status ? sql`AND status = ${status}` : sql``}
        ${min_confidence != null ? sql`AND confidence >= ${min_confidence}` : sql``}
        ${after ? sql`AND created_at >= ${after}::timestamptz` : sql``}
        ${before ? sql`AND created_at <= ${before}::timestamptz` : sql``}
      ORDER BY fts_rank DESC
      LIMIT ${candidateLimit}
    ),
    combined AS (
      SELECT id, sem_rank, NULL::bigint AS fts_rank_pos FROM semantic
      UNION ALL
      SELECT id, NULL::bigint, fts_rank_pos FROM fts
    ),
    scored AS (
      SELECT
        id,
        SUM(CASE WHEN sem_rank IS NOT NULL THEN 1.0 / (60 + sem_rank) ELSE 0 END) +
        SUM(CASE WHEN fts_rank_pos IS NOT NULL THEN 1.0 / (60 + fts_rank_pos) ELSE 0 END)
          AS combined_score
      FROM combined
      GROUP BY id
    )
    SELECT
      i.id, i.title, i.summary, i.content, i.category, i.confidence, i.status,
      i.created_at, i.metadata,
      sem.similarity,
      fts.fts_rank,
      sc.combined_score
    FROM scored sc
    JOIN items i ON i.id = sc.id
    LEFT JOIN semantic sem ON sem.id = sc.id
    LEFT JOIN fts ON fts.id = sc.id
    ORDER BY sc.combined_score DESC
    LIMIT ${limit}
  `) as unknown as SearchRow[];
}

// --- Ghost items count (NULL embedding) ---

async function countGhostItems(sql: Sql): Promise<number> {
  const rows = await sql`SELECT COUNT(*)::int AS count FROM items WHERE embedding IS NULL`;
  return rows[0].count;
}

// --- Main search function ---

export async function brainSearch(params: BrainSearchParams): Promise<string> {
  const sql = getDb();
  const { query, mode } = params;

  let queryEmbedding: number[] | null = null;

  if (mode === "semantic" || mode === "hybrid") {
    const embResult = await embed(query);
    if (embResult) {
      queryEmbedding = embResult.embedding;
    } else if (mode === "semantic") {
      return "Error: Could not generate embedding for query. Ollama may be unavailable. Try mode='fulltext'.";
    }
  }

  let rows: SearchRow[];

  if (mode === "semantic" && queryEmbedding) {
    rows = await semanticSearch(sql, queryEmbedding, params);
  } else if (mode === "fulltext" || (mode === "hybrid" && !queryEmbedding)) {
    rows = await fulltextSearch(sql, query, params);
  } else {
    rows = await hybridSearch(sql, query, queryEmbedding!, params);
  }

  const header =
    mode === "hybrid" && !queryEmbedding
      ? `[Hybrid degraded to fulltext — Ollama unavailable]\n\n`
      : "";

  let footer = "";
  if (mode === "semantic" || mode === "hybrid") {
    const ghostCount = await countGhostItems(sql);
    if (ghostCount > 0) {
      footer = `\n\n⚠ ${ghostCount} item(s) have no embedding and are excluded from semantic search. Run backfill-embeddings.ts to fix.`;
    }
  }

  return header + formatResults(rows) + footer;
}
