import { describe, test, expect } from "bun:test";

// Test the format and query logic without a live DB

describe("brain-search", () => {
  test("BrainSearchInput schema has required fields", async () => {
    const { BrainSearchInput } = await import("../src/tools/brain-search.js");
    expect(BrainSearchInput.query).toBeDefined();
    expect(BrainSearchInput.mode).toBeDefined();
    expect(BrainSearchInput.category).toBeDefined();
    expect(BrainSearchInput.limit).toBeDefined();
  });

  test("mode defaults to hybrid", async () => {
    const { BrainSearchInput } = await import("../src/tools/brain-search.js");
    const parsed = BrainSearchInput.mode.parse(undefined);
    expect(parsed).toBe("hybrid");
  });

  test("limit defaults to 10", async () => {
    const { BrainSearchInput } = await import("../src/tools/brain-search.js");
    const parsed = BrainSearchInput.limit.parse(undefined);
    expect(parsed).toBe(10);
  });

  test("limit rejects values over 50", async () => {
    const { BrainSearchInput } = await import("../src/tools/brain-search.js");
    expect(() => BrainSearchInput.limit.parse(100)).toThrow();
  });

  test("min_confidence rejects values over 1", async () => {
    const { BrainSearchInput } = await import("../src/tools/brain-search.js");
    expect(() => BrainSearchInput.min_confidence.parse(1.5)).toThrow();
  });

  test("mode rejects invalid values", async () => {
    const { BrainSearchInput } = await import("../src/tools/brain-search.js");
    expect(() => BrainSearchInput.mode.parse("invalid")).toThrow();
  });
});
