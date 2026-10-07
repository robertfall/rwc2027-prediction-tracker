/** One layout contract for browser export and bounded image publication. */
export const POOL_POSTER_DIMENSIONS = {
  rwc2027: { width: 1080, height: 1808 },
  rwc2023: { width: 1080, height: 2216 },
} as const;

export const POOL_POSTER_GRID = {
  firstCard: 452,
  cardHeight: 384,
  cardGap: 24,
  outerPadding: 24,
  flagWidth: 180,
  flagFrame: 4,
  separator: 256,
  dateInkBottom: 312,
  // Actual ink extents of the embedded fonts, measured at these export sizes.
  abbreviation: { size: 76, ascent: 55, descent: 1 },
  date: { size: 40, ascent: 27, descent: 1 },
  venue: { size: 32, ascent: 24, descent: 7 },
} as const;
