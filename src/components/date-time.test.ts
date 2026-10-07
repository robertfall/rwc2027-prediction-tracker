import { describe, expect, it } from "vitest";
import { defaultTournament, tournament2023 } from "../domain/tournaments";
import { dateTimeFormat, localDateKey } from "./date-time";
import { timelineGroups } from "./tournament-view-model";

describe("Timezone presentation", () => {
  it("uses the selected calendar day and observes daylight-saving changes at the fixture date", () => {
    const kickoff = new Date("2027-10-03T03:45:00Z");
    expect(localDateKey(kickoff, "America/New_York")).toBe("2027-10-02");
    expect(localDateKey(kickoff, "Africa/Johannesburg")).toBe("2027-10-03");
    expect(dateTimeFormat("time", "America/New_York").format(kickoff)).toBe("23:45");
    const sydney = dateTimeFormat("time", "Australia/Sydney");
    expect(sydney.format(new Date("2027-10-02T15:30:00Z"))).toBe("01:30");
    expect(sydney.format(new Date("2027-10-02T16:30:00Z"))).toBe("03:30");
  });

  it("regroups legacy calendar weeks by the chosen timezone without changing fixtures", () => {
    const original = tournament2023.fixtures[0].kickoff;
    const fixtures = tournament2023.fixtures.slice(0, 2).map((fixture, index) => ({
      ...fixture, kickoff: index === 0 ? "2023-10-02T00:30:00Z" : "2023-10-02T10:30:00Z",
    }));
    const tournament = { ...tournament2023, fixtures };
    const utc = timelineGroups(tournament, "pools", "all", "UTC");
    expect(utc.map((group) => group.key)).toEqual(["week-2023-10-02"]);
    expect(utc[0].days).toHaveLength(1);
    const newYork = timelineGroups(tournament, "pools", "all", "America/New_York");
    expect(newYork.map((group) => group.key)).toEqual(["week-2023-09-25", "week-2023-10-02"]);
    expect(newYork.flatMap((group) => group.days.map((day) => day.key))).toEqual(["2023-10-01", "2023-10-02"]);
    expect(newYork.flatMap((group) => group.fixtureIds)).toEqual(fixtures.map((fixture) => fixture.id));
    expect(tournament2023.fixtures[0].kickoff).toBe(original);
  });

  it("keeps 2027 appearance rounds and pool filtering stable while their calendar days move", () => {
    const utc = timelineGroups(defaultTournament, "pools", "B", "UTC");
    const newYork = timelineGroups(defaultTournament, "pools", "B", "America/New_York");
    expect(newYork.map((group) => ({ key: group.key, ids: group.fixtureIds })))
      .toEqual(utc.map((group) => ({ key: group.key, ids: group.fixtureIds })));
    expect(utc[0].days.find((day) => day.fixtureIds.includes(7))!.key).toBe("2027-10-03");
    expect(newYork[0].days.find((day) => day.fixtureIds.includes(7))!.key).toBe("2027-10-02");
  });
});
