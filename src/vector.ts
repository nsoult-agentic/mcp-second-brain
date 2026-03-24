const EXPECTED_DIMENSIONS = 768;

/**
 * Validates and formats a number array as a PostgreSQL vector literal string.
 * This string is passed as a parameterized value to the postgres tagged template,
 * which sends it as a $N parameter. PostgreSQL then casts it via ::vector.
 *
 * Defense-in-depth: validates all values are finite numbers and array length
 * matches expected dimensions, even though embedding.ts also validates.
 * This ensures no malformed data reaches the query regardless of caller.
 */
export function toVectorLiteral(vec: number[]): string {
  if (!Array.isArray(vec) || vec.length !== EXPECTED_DIMENSIONS) {
    throw new Error(
      `Vector must have exactly ${EXPECTED_DIMENSIONS} dimensions, got ${vec?.length ?? 0}`,
    );
  }

  for (let i = 0; i < vec.length; i++) {
    if (typeof vec[i] !== "number" || !Number.isFinite(vec[i])) {
      throw new Error(
        `Vector contains non-finite value at index ${i}: ${vec[i]}`,
      );
    }
  }

  return `[${vec.join(",")}]`;
}
