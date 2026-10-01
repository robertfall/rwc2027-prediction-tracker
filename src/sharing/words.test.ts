import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { generateShareAlias, isShareAlias, SHARE_WORDS } from "./words";

describe("Frozen share vocabulary", () => {
  it("has exactly128 unique readable ASCII words and a bounded alias length", () => {
    expect(SHARE_WORDS).toHaveLength(128);
    expect(new Set(SHARE_WORDS).size).toBe(128);
    expect(SHARE_WORDS.every((word) => /^[a-z]{3,9}$/.test(word))).toBe(true);
    expect(Object.isFrozen(SHARE_WORDS)).toBe(true);
    expect(Math.max(...SHARE_WORDS.map((word) => word.length)) * 3 + 2).toBeLessThanOrEqual(32);
  });

  it("uses all128 indices without bias or punctuation ambiguity", () => {
    for (let index = 0; index < SHARE_WORDS.length; index++) {
      const alias = generateShareAlias((values) => { values.set([index, index + 128, 0xffff_ff80 + index]); return values; });
      expect(alias).toBe(`${SHARE_WORDS[index]}.${SHARE_WORDS[index]}.${SHARE_WORDS[index]}`);
      expect(isShareAlias(alias)).toBe(true);
    }
  });

  it("accepts only exact triples from the frozen vocabulary", () => {
    fc.assert(fc.property(fc.tuple(
      fc.constantFrom(...SHARE_WORDS), fc.constantFrom(...SHARE_WORDS), fc.constantFrom(...SHARE_WORDS),
    ), (words) => {
      expect(isShareAlias(words.join("."))).toBe(true);
      expect(isShareAlias(words.join("-"))).toBe(false);
      expect(isShareAlias(`${words.join(".")}.`)).toBe(false);
      expect(isShareAlias(words.join(".").toUpperCase())).toBe(false);
    }));
    for (const value of [null, 1, "acorn.alder", "acorn.alder.unknown", "acorn/alder/amber", " acorn.alder.amber", "acorn..amber"]) {
      expect(isShareAlias(value)).toBe(false);
    }
  });
});
