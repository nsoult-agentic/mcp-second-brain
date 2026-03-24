import { describe, test, expect } from "bun:test";

describe("brain-store", () => {
  test("BrainStoreInput schema has required fields", async () => {
    const { BrainStoreInput } = await import("../src/tools/brain-store.js");
    expect(BrainStoreInput.text).toBeDefined();
    expect(BrainStoreInput.title).toBeDefined();
    expect(BrainStoreInput.category).toBeDefined();
    expect(BrainStoreInput.metadata).toBeDefined();
    expect(BrainStoreInput.status).toBeDefined();
  });

  test("category defaults to idea", async () => {
    const { BrainStoreInput } = await import("../src/tools/brain-store.js");
    const parsed = BrainStoreInput.category.parse(undefined);
    expect(parsed).toBe("idea");
  });

  test("status defaults to active", async () => {
    const { BrainStoreInput } = await import("../src/tools/brain-store.js");
    const parsed = BrainStoreInput.status.parse(undefined);
    expect(parsed).toBe("active");
  });

  test("title is optional", async () => {
    const { BrainStoreInput } = await import("../src/tools/brain-store.js");
    const parsed = BrainStoreInput.title.parse(undefined);
    expect(parsed).toBeUndefined();
  });

  test("metadata accepts arbitrary objects", async () => {
    const { BrainStoreInput } = await import("../src/tools/brain-store.js");
    const parsed = BrainStoreInput.metadata.parse({ key: "value", nested: { a: 1 } });
    expect(parsed).toEqual({ key: "value", nested: { a: 1 } });
  });

  test("confidence defaults to 1.0", async () => {
    const { BrainStoreInput } = await import("../src/tools/brain-store.js");
    const parsed = BrainStoreInput.confidence.parse(undefined);
    expect(parsed).toBe(1.0);
  });

  test("confidence accepts valid range", async () => {
    const { BrainStoreInput } = await import("../src/tools/brain-store.js");
    expect(BrainStoreInput.confidence.parse(0)).toBe(0);
    expect(BrainStoreInput.confidence.parse(0.75)).toBe(0.75);
    expect(BrainStoreInput.confidence.parse(1)).toBe(1);
  });

  test("confidence rejects out-of-range values", async () => {
    const { BrainStoreInput } = await import("../src/tools/brain-store.js");
    expect(() => BrainStoreInput.confidence.parse(-0.1)).toThrow();
    expect(() => BrainStoreInput.confidence.parse(1.1)).toThrow();
  });
});
