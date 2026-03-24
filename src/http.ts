/**
 * MCP server for Second Brain — semantic/fulltext/hybrid search + storage.
 * Deployed via GitHub Actions -> ghcr.io -> Portainer CE GitOps polling.
 *
 * Tools:
 *   brain-search  — Search items by semantic, fulltext, or hybrid (RRF)
 *   brain-store   — Store items with auto-embedding via Ollama
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { BrainSearchInput, brainSearch } from "./tools/brain-search.js";
import { BrainStoreInput, brainStore } from "./tools/brain-store.js";
import { getDb, close } from "./db.js";

const PORT = Number(process.env["PORT"]) || 8904;

function createServer(): McpServer {
  const server = new McpServer({
    name: "mcp-second-brain",
    version: "0.2.0",
  });

  server.tool(
    "brain-search",
    "Search the Second Brain knowledge base. Supports semantic (vector), full-text, and hybrid search across all stored items: ideas, projects, people, tasks, learnings, decisions, research, ratings, work sessions. Use when you need to recall stored knowledge, find past decisions, look up context from previous sessions, or surface research Neil has dropped into the brain.",
    BrainSearchInput,
    async (params) => ({
      content: [{ type: "text" as const, text: await brainSearch(params) }],
    }),
  );

  server.tool(
    "brain-store",
    "Store a new item in the Second Brain. Use for operational facts, infrastructure state, architectural decisions, learnings, or any information that should persist across sessions and be discoverable via semantic search. Automatically generates a vector embedding for future retrieval.",
    BrainStoreInput,
    async (params) => ({
      content: [{ type: "text" as const, text: await brainStore(params) }],
    }),
  );

  return server;
}

// --- Health Check (includes DB connectivity probe) ---

async function healthCheck(): Promise<Response> {
  try {
    const sql = getDb();
    await sql`SELECT 1`;
    return new Response(
      JSON.stringify({ status: "ok", service: "mcp-second-brain", port: PORT, db: "connected" }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch {
    return new Response(
      JSON.stringify({ status: "degraded", service: "mcp-second-brain", port: PORT, db: "unreachable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
}

// --- HTTP Server (stateless mode: one transport+server per request) ---

const httpServer = Bun.serve({
  port: PORT,
  hostname: "0.0.0.0", // Inside container — Docker port mapping handles 127.0.0.1 binding
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return healthCheck();
    }

    if (url.pathname === "/mcp") {
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });
      const server = createServer();
      await server.connect(transport);
      return transport.handleRequest(req);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`mcp-second-brain listening on http://0.0.0.0:${PORT}/mcp`);
console.log("Tools: brain-search, brain-store");

process.on("SIGTERM", async () => {
  httpServer.stop();
  await close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  httpServer.stop();
  await close();
  process.exit(0);
});
