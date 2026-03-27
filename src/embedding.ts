const OLLAMA_URL = process.env.OLLAMA_URL!;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "nomic-embed-text";
const OLLAMA_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT ?? "15000", 10);
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY ?? "";
const EXPECTED_DIMENSIONS = 768;

export interface EmbeddingResult {
  embedding: number[];
  dimensions: number;
}

export async function embed(text: string): Promise<EmbeddingResult | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (OLLAMA_API_KEY) {
      headers["Authorization"] = `Bearer ${OLLAMA_API_KEY}`;
    }

    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST",
      headers,
      body: JSON.stringify({ model: OLLAMA_MODEL, input: text }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      console.error(`[embedding] Ollama returned ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { embeddings: number[][] };
    const vec = data.embeddings?.[0];

    if (!vec || vec.length !== EXPECTED_DIMENSIONS) {
      console.error(
        `[embedding] Unexpected dimensions: ${vec?.length ?? 0} (expected ${EXPECTED_DIMENSIONS})`,
      );
      return null;
    }

    if (!vec.every((n) => Number.isFinite(n))) {
      console.error("[embedding] Non-finite values in embedding");
      return null;
    }

    return { embedding: vec, dimensions: vec.length };
  } catch (err) {
    console.error(
      `[embedding] Failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
