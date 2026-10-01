// Research only: no application codec, URL writer or dependency changes.
// node scripts/analyze-word-links.mjs [newline-separated-word-list]
// node scripts/analyze-word-links.mjs --audited-source moby-single /path/to/single.txt
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createServer } from "vite";

function bits(value) {
  const binary = value.toString(2);
  const leading = binary.slice(0, 53);
  return Math.log2(Number.parseInt(leading, 2)) + binary.length - leading.length;
}

function minimumWords(states, vocabulary) {
  let capacity = 1n;
  let count = 0;
  while (capacity < states) {
    capacity *= BigInt(vocabulary);
    count++;
  }
  return count;
}

function minimumVocabularyForThreeWords(states) {
  let low = 0n;
  let high = 1n << BigInt(Math.ceil(states.toString(2).length / 3));
  while (low + 1n < high) {
    const middle = (low + high) / 2n;
    if (middle ** 3n >= states) high = middle;
    else low = middle;
  }
  return high;
}

const vocabularies = [1286, 2023, 7744, 39000, 100000, 233907];
const intentChoices = 4n * 3n * 257n ** 3n * 17n ** 2n * 3n ** 4n;
const server = await createServer({
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  appType: "custom",
});

try {
  const { createScenarioController, emptyScenario } = await server.ssrLoadModule("/src/state/controller.ts");
  const { encodeScenario, decodeScenario } = await server.ssrLoadModule("/src/state/codec.ts");
  const { getTournament } = await server.ssrLoadModule("/src/domain/tournaments.ts");
  const tournament = getTournament("rwc2027");
  const fixtures = tournament.fixtures.toSorted((a, b) => a.id - b.id);
  const poolCount = fixtures.filter((fixture) => fixture.stage === "pool").length;
  const knockoutCount = fixtures.length - poolCount;
  const binaryStates = 2n ** BigInt(fixtures.length);
  const poolExponent = BigInt(poolCount);
  const knockoutExponent = BigInt(knockoutCount);
  let coherentScoreTryPairs = 0n;
  let coherentDrawResults = 0n;
  for (let score = 0; score <= 255; score++) {
    const tries = BigInt(Math.min(15, Math.floor(score / 5)) + 1);
    coherentScoreTryPairs += tries;
    coherentDrawResults += tries ** 2n;
  }
  const coherentPoolResults = coherentScoreTryPairs ** 2n;
  const nonemptyIntents = intentChoices - 1n;
  const bindingChoices = BigInt(1 + tournament.teams.length * (tournament.teams.length - 1));
  const rangePoolResults = 256n ** 2n * 16n ** 2n;
  const rangeKnockoutResults = 2n * rangePoolResults + 256n * 16n ** 2n;
  const fullStateUpperBound =
    (1n + 2n * nonemptyIntents) ** poolExponent * (1n + bindingChoices * nonemptyIntents) ** knockoutExponent +
    (1n + 2n * nonemptyIntents * (1n + rangePoolResults)) ** poolExponent *
    (1n + bindingChoices * nonemptyIntents * (1n + rangeKnockoutResults)) ** knockoutExponent;
  const states = [
    ["Complete pool winners; no draws; fixed default outcomes", 2n ** BigInt(poolCount)],
    ["Complete tournament winners; no draws; fixed default outcomes", binaryStates],
    ["Complete tournament choices; pool draws allowed; fixed defaults", 3n ** BigInt(poolCount) * 2n ** BigInt(knockoutCount)],
    ["Partial winner/advancement intent patterns; codec family without pins/bindings", 4n ** BigInt(poolCount) * 3n ** BigInt(knockoutCount)],
    ["Pool score pairs alone; codec family without pins/bindings", 256n ** BigInt(poolCount * 2)],
    ["Complete exact scores; inferred tries and canonical intent; coherent lower bound", (256n ** 2n) ** poolExponent * (256n ** 2n + 256n) ** knockoutExponent],
    ["Complete exact scores and tries; canonical intent; coherent lower bound", coherentPoolResults ** poolExponent * (coherentPoolResults + coherentDrawResults) ** knockoutExponent],
    ["All eleven intent fields; codec family without pins/bindings", intentChoices ** BigInt(fixtures.length)],
    ["Full codec structural upper bound; overcounts invalid combinations, not an exact count", fullStateUpperBound],
  ];
  const report = {
    scope: "Fixed current 2027 profile. Counts identify states, not measured entropy of user behavior. Full codec state space is larger than the detailed intent family.",
    node: process.version,
    fixtures: { pool: poolCount, knockout: knockoutCount },
    orderedWordsMayRepeat: true,
    families: states.map(([label, count]) => ({
      label,
      exactStates: count.toString(),
      stateSpaceBits: +bits(count).toFixed(6),
      minimumVocabularyForThreeWords: minimumVocabularyForThreeWords(count).toString(),
      minimumWordsByVocabulary: Object.fromEntries(vocabularies.map((size) => [size, minimumWords(count, size)])),
    })),
    vocabularies: vocabularies.map((size) => ({ size, threeWordStates: (BigInt(size) ** 3n).toString(), threeWordBits: +(3 * Math.log2(size)).toFixed(6) })),
  };

  if (process.argv[2]) {
    let words;
    if (process.argv[2] === "--audited-source") {
      const audit = JSON.parse(await readFile(new URL("../docs/research/word-list-audit.json", import.meta.url), "utf8"));
      const name = process.argv[3];
      const source = audit.lists[name];
      assert(source && process.argv[4], "Provide an audited source name and its downloaded raw file.");
      const rawBytes = await readFile(process.argv[4]);
      assert.equal(createHash("sha256").update(rawBytes).digest("hex"), source.rawSha256, "Source changed: research uses an immutable audited snapshot.");
      const lines = rawBytes.toString("utf8").split(/\r?\n/).map((word) => word.trim()).filter(Boolean);
      const candidates = name.startsWith("eff-") ? lines.map((line) => line.split(/\s+/).at(-1)) : lines;
      const { filter } = audit;
      const exclusions = new Set([...filter.exactBrandExclusions, ...filter.franchiseExclusions, ...filter.spookyExclusions]);
      words = [...new Set(candidates)].filter((word) =>
        /^[a-z]+$/.test(word) && word.length >= 3 && word.length <= 10 &&
        !exclusions.has(word) && !filter.prefixBrandExclusions.some((prefix) => word.startsWith(prefix)));
      assert.equal(words.length, source.filtered.count);
      assert.equal(createHash("sha256").update(`${words.join("\n")}\n`).digest("hex"), source.filteredSha256);
    } else {
      const raw = await readFile(process.argv[2], "utf8");
      words = raw.trim().split(/\r?\n/);
    }
    assert(words.every((word) => /^[a-z]+$/.test(word)), "Use a pre-screened, lowercase ASCII list; this script does not certify family friendliness.");
    assert.equal(new Set(words).size, words.length, "Dictionary entries must be unique.");
    assert(BigInt(words.length) ** 3n >= binaryStates, "This list cannot encode every complete binary tournament in three words.");
    const dictionary = words.toSorted();
    const indices = new Map(dictionary.map((word, index) => [word, BigInt(index)]));
    const base = BigInt(dictionary.length);

    function encodeWords(value) {
      assert(value >= 0n && value < binaryStates);
      return [value / (base * base), value / base % base, value % base]
        .map((index) => dictionary[Number(index)]).join(".");
    }

    function decodeWords(phrase) {
      const parts = phrase.split(".");
      assert.equal(parts.length, 3);
      const value = parts.reduce((total, word) => {
        assert(indices.has(word), "Unknown dictionary word.");
        return total * base + indices.get(word);
      }, 0n);
      assert(value < binaryStates, "This combination is outside the restricted binary profile.");
      return value;
    }

    function scenarioFromMask(mask) {
      const scenario = emptyScenario(tournament.id);
      fixtures.forEach((fixture, index) => {
        const side = mask & 1n << BigInt(index) ? "away" : "home";
        scenario.predictions[fixture.id] = { intent: fixture.stage === "pool" ? { winner: side } : { advancing: side } };
      });
      return createScenarioController(scenario).getState().scenario;
    }

    function maskFromScenario(scenario) {
      let mask = 0n;
      fixtures.forEach((fixture, index) => {
        const intent = scenario.predictions[fixture.id]?.intent;
        assert(intent, "Every fixture must be picked.");
        const side = fixture.stage === "pool" ? intent.winner : intent.advancing;
        assert(side === "home" || side === "away", "Only binary directions are represented.");
        if (side === "away") mask |= 1n << BigInt(index);
      });
      assert.equal(encodeScenario(scenarioFromMask(mask)), encodeScenario(scenario), "Scores, draws, explicit details or noncanonical bindings fall outside this model.");
      return mask;
    }

    const samples = new Set([0n, binaryStates - 1n, base - 1n, base, base * base - 1n, base * base]);
    for (let index = 0; index < fixtures.length; index++) samples.add(1n << BigInt(index));
    let random = 123456789n;
    for (let index = 0; index < 256; index++) {
      random = (6364136223846793005n * random + 1442695040888963407n) % binaryStates;
      samples.add(random);
    }
    const examples = [];
    for (const mask of samples) {
      const original = scenarioFromMask(mask);
      const phrase = encodeWords(maskFromScenario(original));
      const reconstructed = scenarioFromMask(decodeWords(phrase));
      assert.equal(encodeScenario(reconstructed), encodeScenario(original));
      assert.deepEqual(decodeScenario(encodeScenario(reconstructed)), decodeScenario(encodeScenario(original)));
      if (examples.length < 6) examples.push({ mask: mask.toString(), phrase, currentTokenCharacters: encodeScenario(original).length });
    }
    const bytes = Buffer.from(`${dictionary.join("\n")}\n`);
    report.demonstration = {
      scope: "Reversible enumeration of complete binary winner choices under fixed defaults only; no hash and no stored scenario lookup.",
      dictionaryWords: dictionary.length,
      dictionarySha256: createHash("sha256").update(bytes).digest("hex"),
      dictionaryUtf8Bytes: bytes.length,
      dictionaryGzipBytes: gzipSync(bytes, { level: 9 }).length,
      representativeRoundtrips: samples.size,
      examples,
      warning: "Dictionary screening and immutable production format/version/checksum design remain separate work. This is not an application sharing format.",
    };
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
