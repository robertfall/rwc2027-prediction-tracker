# Reversible word links

Research date: 2026-10-01. Current code: `8bfd59d`, v3 profiles 1/2. This analysis does not change the production codec or sharing format.

Three words **can** encode a complete 2027 bracket containing only binary winner choices and fixed default outcomes. They cannot encode every scenario supported by the app using a practical English dictionary. The useful distinction is the number of independent choices, rather than the current token's character count.

For **everything the current codec preserves**, the capacity bounds are **170–282 words from the screened EFF long list**, or **123–204 words from the much larger Moby list**, for a fixed 2027 profile. The lower number is a proven necessary worst-case capacity; the upper number is sufficient to enumerate a conservative superset of all supported states. These are neither typical link lengths nor a claim that this word format is implemented. Three EFF words carry 38.757 bits, while the detailed-intent subset alone needs 2,190.064 bits: at least **56.5 times** as much capacity. Even complete coherent scores and tries alone require 95 EFF words or 69 Moby words.

## Dictionary capacity

With an immutable dictionary containing N unique words, three ordered words with repetition have N³ combinations. A reversible encoding assigns each state an integer and writes that integer in base N. A hash would discard information; this model uses direct enumeration and requires no stored scenario lookup.

Downloaded lists were screened with a frozen preliminary policy: lowercase ASCII letters, 3–10 characters, deduplication, and exclusions for obvious profanity, slurs, sexual/violent/medical vocabulary and unsuitable product terms. This is **not a certified family-friendly allowlist**: manual review remains necessary. Hyphens are URL-safe but were excluded to keep separators unambiguous.

Exact counts, source URLs, raw/filtered SHA-256 hashes, excluded terms, length distributions and licensing notes are retained in [the audit](research/word-list-audit.json). Counts below are our measurements of the screened lists, not the publishers' original cardinalities.

| Source | Original entries | Screened words | Three-word combinations | Capacity in bits | Words for 52 binary choices |
|---|---:|---:|---:|---:|---:|
| [EFF short #1](https://www.eff.org/dice) | 1,296 | 1,286 | 2,126,781,656 | 30.986 | 6 |
| [BIP39 English](https://github.com/bitcoin/bips/blob/master/bip-0039/english.txt) | 2,048 | 2,023 | 8,279,186,167 | 32.947 | 5 |
| [EFF long](https://www.eff.org/dice) | 7,776 | 7,744 | 464,404,086,784 | 38.757 | 5 |
| [Moby common](https://www.gutenberg.org/files/3201/files/common.txt) | 74,550 | 39,000 | 59,319,000,000,000 | 45.754 | 4 |
| [Moby single](https://www.gutenberg.org/files/3201/files/single.txt) | 354,983 | 233,907 | 12,797,633,146,793,643 | 53.507 | 3 |

EFF offers memorable words and permits reuse of its original material under [CC BY 4.0](https://www.eff.org/copyright). The [BIP39 specification](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki) is MIT licensed; using a modified vocabulary would be our own word encoding, rather than a compatible wallet mnemonic. Moby's author explicitly [granted the database to the public domain](https://www.gutenberg.org/files/3201/3201-0.txt).

The [MIT-licensed adjective–colour–animal lists](https://github.com/csmith/aca) produce attractive identifiers such as `happy.blue.otter`, but their screened categories have 1,049 × 128 × 349 = **46,860,928** combinations, only 25.482 bits. Separate grammatical categories reduce capacity compared with allowing every word in every position.

Other audited candidates: Google's no-swears list yielded 8,660 screened entries, but its [license notice](https://github.com/first20hours/google-10000-english/blob/master/LICENSE.md) raises commercial-use restrictions. dwyl yielded 247,407, but its [README's original-provider copyright note](https://github.com/dwyl/english-words) conflicts with the repository's Unlicense label. Neither improves the practical case enough to resolve those provenance questions here.

## State capacity in the current code

The 2027 tournament has 36 pool and 16 knockout fixtures. These counts hold tournament, dataset, rules and completion versions fixed. "Bits" means log₂(number of states), not measured entropy of user behavior.

| State family | Exact count/formula | Bits | Minimum vocabulary for three words | Minimum EFF-long words |
|---|---:|---:|---:|---:|
| Complete pool winners, no draws, fixed defaults | 2³⁶ = 68,719,476,736 | 36 | 4,096 | 3 |
| Complete tournament winners, no draws, fixed defaults | 2⁵² = 4,503,599,627,370,496 | 52 | **165,141** | 5 |
| Complete tournament, pool draws allowed, fixed defaults | 3³⁶ × 2¹⁶ = 9,836,602,018,824,134,393,856 | 73.059 | **21,426,359** | 6 |
| Partial winner/advancement intent patterns, no pins/bindings | 4³⁶ × 3¹⁶ = 203,282,392,447,840,896,882,957,090,816 | 97.359 | **5,879,854,614** | 8 |
| Explicit pool score pairs alone, no pins/bindings | 256⁷² = 2⁵⁷⁶ | 576 | 2¹⁹² ≈ 6.28 × 10⁵⁷ | 45 |
| All eleven intent fields, no pins/bindings | M⁵² ≈ 1.883 × 10⁶⁵⁹ | 2,190.064 | ≈ 5.73 × 10²¹⁹ | 170 |

The complete winner families use one canonical intent per fixture: pool winner or knockout advancing side. Completed scores, tries, qualification and participants come from retained defaults and preceding choices, so those derived values add no independent bits.

The partial family is an exact accepted **codec** family: pool absent/home/away/draw and knockout absent/home/away advancement. The UI initially gates pending knockout picks; this row does not claim that every unbound pattern can be entered through fresh-screen clicks. Retained dormant bindings and outcomes enlarge the full state beyond this family.

The detailed family follows the actual eleven-field ranges in `PredictionIntent` and `validateIntent`:

```
M = 4 × 3 × 257³ × 17² × 3⁴ = 4,768,298,970,444
```

Winner has absent/home/away/draw, advancement absent/home/away, scores and margin each absent or 0–255, tries each absent or 0–15, and four bonuses each absent/false/true. The all-absent combination means an untouched fixture. Conflicting range-valid intent is deliberately accepted and preserved without a saved result; pool advancement is also a representable conflict. Therefore M⁵² is an exact restricted family and a **lower bound** on the full codec state space. It fits the current frame limit: even maximal intent-only records require only 399 bytes.

This is not an exact total for every scenario. Saved outcomes and dormant participant bindings depend on preceding choices and add further states. A conservative range/structure bound places the full 2027 regular serializable state space between M⁵² and fewer than 2³⁶³⁶ states; rejected intent/result and participant combinations make that upper bound loose. Neither wire length nor the 1,024-byte safety limit is being counted as independent information.

The upper bound, reproduced by the modelling script, uses I = M − 1 nonempty intents, B = 553 absent/ordered distinct-team knockout bindings, Rp = 16,777,216 range-valid pool pins and Rk = 33,619,968 range-valid knockout pins. It counts absent and present resolved maps separately:

```
U = (1 + 2I)³⁶(1 + BI)¹⁶
  + (1 + 2I(1 + Rp))³⁶(1 + BI(1 + Rk))¹⁶
log₂(U) = 3635.887030
```

Even restricting to coherent completed scores and tries is enormous. There are 3,496 score/try pairs per side satisfying the app's `score >= 5 × tries` check, 12,222,016 pool result combinations and 52,536 drawn combinations. Knockout draws add a separate advancing choice. That gives 12,222,016³⁶ × 12,274,552¹⁶ states, or **1,224.334 bits**, before distinct explicit-intent forms. The impossibility for full detailed scenarios therefore does not depend on counting conflicts.

Legacy 2023 has 40 pool and eight knockout fixtures. Its complete binary family has 2⁴⁸ states; covering both tournaments' complete binary families requires at least 168,512 words for a three-word format. Version/profile context and any checksum need capacity of their own unless carried separately.

## Actual reversible prototype

[The modelling script](../scripts/analyze-word-links.mjs) constructs canonical scenarios using the existing controller and verifies them through the existing v3 codec. It treats fixture IDs in ascending order as a 52-bit choice mask. For a dictionary of N words, the three word indices are:

```
i0 = floor(mask / N²)
i1 = floor(mask / N) mod N
i2 = mask mod N
mask = i0 × N² + i1 × N + i2
```

Using the screened Moby list, **314 boundary, individual-bit and deterministic random masks round-tripped to exactly the same v3 token and decoded scenario**, including default scores and bound bracket participants. Every current token was 129 characters. The mapping is injective by positional arithmetic; the samples check implementation wiring rather than exhaustively testing 2⁵² states. Unused combinations are rejected.

This proves the narrow three-word case works. It also exposes the UX cost: `gauntree.unoutraged.scho` is an actual prototype phrase. The screened vocabulary averages 7.83 letters; a three-word phrase averages about 25.49 characters. Its dictionary costs **638,000 bytes gzipped** (2,065,530 bytes raw), before the lookup's runtime allocations. The Python audit measures 636,092 gzip bytes for the same dictionary bytes; Node and Python use different zlib implementations. Limiting Moby words to eight letters leaves only 140,023 entries, below the 165,141 threshold. Further curation could reduce capacity again.

EFF long is about **24.6 KB gzipped**. Five words suffice for the same complete binary bracket and average about 39 characters including separators. These are format-model lengths, excluding hostname, version and checksum; they are not promises for draws or custom results. A word encoding of an existing arbitrary binary token would be longer than base64url unless a new semantic representation also removes redundant data.

A fixed ranking-generated baseline is only one deterministic scenario once its generator and snapshot are fixed. Its current 354-character token does not imply that it contains 2,104 independent choice bits. This report does not attempt to change the engine/URL contract or replace the requested word mapping with a preset feature.

## Reproduce

With the repository's pinned Node version and installed dependencies:

```sh
# Exact state arithmetic and vocabulary matrix; no download needed.
node scripts/analyze-word-links.mjs

# Download the audited public-domain source, then reproduce screening and roundtrips.
curl -fsSL https://www.gutenberg.org/files/3201/files/single.txt -o /tmp/rwc-moby-single.txt
node scripts/analyze-word-links.mjs --audited-source moby-single /tmp/rwc-moby-single.txt
```

The raw-source and filtered-source hashes must match the frozen audit. A different dictionary is a different encoding and needs an immutable decoder version. A production proposal also needs manual vocabulary approval, error detection, old-link compatibility and a decision about representing partial/deep scenarios; none has been deployed by this research.
