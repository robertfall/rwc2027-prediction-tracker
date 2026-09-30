// Transcribed from World Rugby's published RWC2027_Best-Third-Permutations graphic.
// Values identify opponents for pool winners A, B, C and D, respectively.
const permutations: Record<string, readonly [string, string, string, string]> = {
  ABCD: ["C", "D", "A", "B"],
  ABCE: ["C", "E", "A", "B"],
  ABCF: ["C", "F", "A", "B"],
  ABDE: ["E", "D", "A", "B"],
  ABDF: ["F", "D", "A", "B"],
  ABEF: ["E", "F", "A", "B"],
  ACDE: ["C", "D", "A", "E"],
  ACDF: ["C", "D", "A", "F"],
  ACEF: ["C", "E", "A", "F"],
  ADEF: ["E", "D", "A", "F"],
  BCDE: ["C", "D", "E", "B"],
  BCDF: ["C", "D", "F", "B"],
  BCEF: ["C", "E", "F", "B"],
  BDEF: ["E", "D", "F", "B"],
  CDEF: ["C", "D", "E", "F"],
};

export function thirdPlaceAssignments(pools: string[]): Record<string, string> | undefined {
  if (pools.length !== 4 || new Set(pools).size !== 4) return undefined;
  const opponents = permutations[[...pools].sort().join("")];
  return opponents ? Object.fromEntries(["A", "B", "C", "D"].map((pool, index) => [pool, opponents[index]])) : undefined;
}
