import { CompleteResult, isCompleteResult } from "../results/model";

export function getPoints(result: CompleteResult) {
  if (!isCompleteResult(result)) throw new RangeError("Pool points require a complete, valid result.");
  const { homeScore, homeTries, awayScore, awayTries } = result;

  let homePoints = homeTries >= 4 ? 1 : 0;
  let awayPoints = awayTries >= 4 ? 1 : 0;

  if (homeScore > awayScore) {
    homePoints += 4;
    if (homeScore - awayScore <= 7) awayPoints += 1;
  } else if (awayScore > homeScore) {
    awayPoints += 4;
    if (awayScore - homeScore <= 7) homePoints += 1;
  } else {
    homePoints += 2;
    awayPoints += 2;
  }

  return { homePoints, awayPoints };
}
