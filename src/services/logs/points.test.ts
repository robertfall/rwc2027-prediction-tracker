import { describe, it, expect } from "vitest";
import { CompleteResult } from "../results/model";
import { getPoints } from "./points";

describe("pool points", () => {
  it.each([
    [20, 13, 3, 3, 4, 1],
    [20, 12, 3, 3, 4, 0],
    [13, 20, 3, 3, 1, 4],
    [12, 20, 3, 3, 0, 4],
    [20, 13, 4, 4, 5, 2],
    [13, 20, 4, 4, 2, 5],
    [20, 12, 4, 4, 5, 1],
    [12, 20, 4, 4, 1, 5],
    [15, 15, 3, 3, 2, 2],
    [20, 20, 4, 4, 3, 3],
    [20, 20, 4, 3, 3, 2],
    [0, 0, 0, 0, 2, 2],
  ])("scores %i:%i, tries %i:%i yield %i:%i pool points", (homeScore, awayScore, homeTries, awayTries, homePoints, awayPoints) => {
    expect(getPoints({ matchNumber: 1, touched: true, homeScore, awayScore, homeTries, awayTries })).toEqual({ homePoints, awayPoints });
  });

  it("rejects incomplete and nonnumeric results at the scoring boundary", () => {
    expect(() => getPoints({ matchNumber: 1, touched: true, homeScore: 20 } as CompleteResult)).toThrow(RangeError);
    expect(() => getPoints({ matchNumber: 1, touched: true, homeScore: "20", awayScore: 13, homeTries: 3, awayTries: 2 } as unknown as CompleteResult)).toThrow(RangeError);
  });
});
