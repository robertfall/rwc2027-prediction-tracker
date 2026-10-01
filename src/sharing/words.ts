// Original, manually reviewed nature/sport/positive vocabulary. Keep every word
// available for existing aliases; these public names are not access credentials.
export const SHARE_WORDS = Object.freeze([
  "acorn", "alder", "amber", "apple", "aspen", "atlas", "azure", "bamboo",
  "birch", "bloom", "blossom", "brook", "cedar", "cherry", "clover", "coral",
  "creek", "daisy", "dawn", "delta", "dune", "elm", "evergreen", "fern",
  "field", "finch", "flora", "forest", "frost", "garden", "glade", "grove",
  "hazel", "heather", "hill", "iris", "ivy", "jade", "jasmine", "juniper",
  "lake", "laurel", "leaf", "lily", "lotus", "maple", "meadow", "mist",
  "moss", "oak", "ocean", "olive", "orchid", "pebble", "petal", "pine",
  "plum", "pond", "poppy", "prism", "rain", "rainbow", "reed", "river",
  "robin", "rose", "sage", "sand", "shell", "shore", "sky", "snow",
  "solar", "sparrow", "spring", "spruce", "star", "stone", "stream", "summit",
  "sunny", "sunbeam", "tide", "tulip", "valley", "violet", "wave", "willow",
  "wind", "wing", "wood", "wren", "breeze", "cloud", "compass", "coast",
  "agile", "assist", "bounce", "cheer", "coach", "court", "dash", "fair",
  "finish", "focus", "goal", "grace", "happy", "joyful", "kind", "lucky",
  "pace", "pass", "play", "rally", "ready", "relay", "rise", "rugby",
  "score", "shine", "skill", "smile", "sprint", "steady", "swift", "thrive",
] as const);

const vocabulary = new Set<string>(SHARE_WORDS);
type RandomWords = (values: Uint32Array<ArrayBuffer>) => Uint32Array<ArrayBuffer>;

export function generateShareAlias(random: RandomWords = (values) => crypto.getRandomValues(values)): string {
  // 128 is a power of two, so the lower seven cryptographic bits are unbiased.
  const values = random(new Uint32Array(3));
  return Array.from(values, (value) => SHARE_WORDS[value & 127]).join(".");
}

export function isShareAlias(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 32) return false;
  const words = value.split(".");
  return words.length === 3 && words.every((word) => vocabulary.has(word));
}
