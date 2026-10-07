type Format = "date" | "time" | "day" | "weekday" | "month" | "dayKey";
const options: Record<Format, Intl.DateTimeFormatOptions> = {
  date: { day: "numeric", month: "short" },
  time: { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
  day: { day: "2-digit" },
  weekday: { weekday: "short" },
  month: { month: "short" },
  dayKey: { year: "numeric", month: "2-digit", day: "2-digit", calendar: "gregory", numberingSystem: "latn" },
};
const formats = new Map<string, Intl.DateTimeFormat>();

/** Reuse formatters across match views; bound the cache as settings change. */
export function dateTimeFormat(kind: Format, timeZone?: string): Intl.DateTimeFormat {
  const key = `${timeZone ?? "system"}/${kind}`;
  let format = formats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(kind === "dayKey" ? "en" : undefined, { ...options[kind], timeZone });
    if (formats.size >= 48) formats.delete(formats.keys().next().value!);
    formats.set(key, format);
  }
  return format;
}

export function localDateKey(date: Date, timeZone?: string): string {
  const parts = dateTimeFormat("dayKey", timeZone).formatToParts(date);
  const part = (type: string) => parts.find((candidate) => candidate.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
