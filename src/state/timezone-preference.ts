const storageKey = "rwc2027.timezone.v1";

const fallbackZones = [
  "Africa/Cairo", "Africa/Casablanca", "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi",
  "America/Argentina/Buenos_Aires", "America/Bogota", "America/Chicago", "America/Denver",
  "America/Los_Angeles", "America/Mexico_City", "America/New_York", "America/Sao_Paulo",
  "America/Toronto", "America/Vancouver", "Asia/Dubai", "Asia/Hong_Kong", "Asia/Kolkata",
  "Asia/Seoul", "Asia/Shanghai", "Asia/Singapore", "Asia/Tokyo", "Australia/Adelaide",
  "Australia/Brisbane", "Australia/Darwin", "Australia/Hobart", "Australia/Melbourne",
  "Australia/Perth", "Australia/Sydney", "Europe/Berlin", "Europe/Dublin", "Europe/London",
  "Europe/Madrid", "Europe/Paris", "Europe/Rome", "Pacific/Auckland", "Pacific/Fiji", "Pacific/Honolulu",
];

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || timeZone.length > 128) return false;
  try { new Intl.DateTimeFormat("en", { timeZone }); return true; }
  catch { return false; }
}

export function systemTimeZone(): string {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(timeZone) ? timeZone : "UTC";
  } catch { return "UTC"; }
}

/** An undefined preference follows the device timezone. */
export function readTimeZone(): string | undefined {
  try {
    const saved = window.localStorage.getItem(storageKey);
    return saved && isValidTimeZone(saved) ? saved : undefined;
  } catch { return undefined; }
}

export function rememberTimeZone(timeZone?: string): void {
  try {
    if (timeZone) {
      if (isValidTimeZone(timeZone)) window.localStorage.setItem(storageKey, timeZone);
    } else window.localStorage.removeItem(storageKey);
  } catch { /* Keep the current selection when storage is unavailable. */ }
}

export function listTimeZones(selected?: string): string[] {
  let zones: string[];
  try {
    const supportedValuesOf = (Intl as typeof Intl & {
      supportedValuesOf?: (key: "timeZone") => string[];
    }).supportedValuesOf;
    zones = supportedValuesOf ? supportedValuesOf("timeZone") : fallbackZones.filter(isValidTimeZone);
  } catch { zones = fallbackZones.filter(isValidTimeZone); }
  if (selected && isValidTimeZone(selected)) zones = [...zones, selected];
  return ["UTC", ...[...new Set(zones)].filter((zone) => zone !== "UTC")
    .sort((first, second) => first.replaceAll("_", " ").localeCompare(second.replaceAll("_", " "), "en"))];
}
