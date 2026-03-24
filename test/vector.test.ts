import { describe, test, expect } from "bun:test";
import { toVectorLiteral } from "../src/vector.js";

describe("toVectorLiteral", () => {
  test("formats valid 768d vector", () => {
    const vec = Array.from({ length: 768 }, (_, i) => i * 0.001);
    const result = toVectorLiteral(vec);
    expect(result).toStartWith("[0,0.001,0.002");
    expect(result).toEndWith("]");
  });

  test("rejects wrong dimensions", () => {
    expect(() => toVectorLiteral([1, 2, 3])).toThrow("exactly 768 dimensions");
  });

  test("rejects NaN values", () => {
    const vec = Array.from({ length: 768 }, () => 0.5);
    vec[100] = NaN;
    expect(() => toVectorLiteral(vec)).toThrow("non-finite value at index 100");
  });

  test("rejects Infinity", () => {
    const vec = Array.from({ length: 768 }, () => 0.5);
    vec[0] = Infinity;
    expect(() => toVectorLiteral(vec)).toThrow("non-finite value at index 0");
  });

  test("rejects non-number values", () => {
    const vec = Array.from({ length: 768 }, () => 0.5);
    (vec as any)[50] = "evil";
    expect(() => toVectorLiteral(vec)).toThrow("non-finite value at index 50");
  });

  test("rejects empty array", () => {
    expect(() => toVectorLiteral([])).toThrow("exactly 768 dimensions");
  });
});
