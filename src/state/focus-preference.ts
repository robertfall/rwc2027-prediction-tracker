import type { Team } from "../domain/types";

const storageKey = "rwc2027.focus-team.v1";

/** A shared destination overrides this view without overwriting the device preference. */
export function focusedTeamFromSearch(search: string, teams: readonly Team[]): string | undefined {
  const values = new URLSearchParams(search).getAll("focus");
  return values.length === 1 && teams.some((team) => team.id === values[0]) ? values[0] : undefined;
}

/** Focus is an optional device preference, independent of prediction links. */
export function readFocusedTeam(teams: readonly Team[]): string | undefined {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return teams.some((team) => team.id === saved) ? saved! : undefined;
  } catch { return undefined; }
}

export function rememberFocusedTeam(teamId?: string): void {
  try {
    if (teamId) window.localStorage.setItem(storageKey, teamId);
    else window.localStorage.removeItem(storageKey);
  } catch { /* Keep the current selection when storage is unavailable. */ }
}
