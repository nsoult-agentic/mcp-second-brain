import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const SECRETS_DIR = process.env.SECRETS_DIR || "/secrets";

// --- File-based Secret Loading (no SOPS) ---

function getDbPassword(): string {
  const path = resolve(SECRETS_DIR, "db-password");
  try {
    const pw = readFileSync(path, "utf-8").trim(); // .trim() defends against trailing newline
    if (pw.length === 0) {
      throw new Error("Password file is empty");
    }
    return pw;
  } catch (err) {
    // Generic error — never expose file paths in output
    throw new Error("Failed to load DB password. Check secrets mount.");
  }
}

// --- Connection Pool (lazy singleton — created on first use) ---

let sql: ReturnType<typeof postgres> | null = null;

export function getDb(): ReturnType<typeof postgres> {
  if (sql) return sql;

  sql = postgres({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: parseInt(process.env.DB_PORT ?? "5432", 10),
    database: process.env.DB_NAME ?? "second_brain",
    username: process.env.DB_USER ?? "pai",
    password: getDbPassword(),
    max: 3,
    idle_timeout: 60,
    connect_timeout: 10,
  });

  return sql;
}

export async function close(): Promise<void> {
  if (sql) {
    await sql.end();
    sql = null;
  }
}

export type Sql = ReturnType<typeof postgres>;
