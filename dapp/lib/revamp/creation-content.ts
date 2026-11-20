const PREFIX = "<!--ckboost-campaign-settings:v1:";
const MAX_METADATA_LENGTH = 2048;

export function validCreationTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100) return false;
  try { new Intl.DateTimeFormat("en-US", {timeZone: value}).format(); return true; } catch { return false; }
}

/** Nonvisual extension: legacy HTML readers still receive the original body. */
export function encodeCreationDescription(description: string, timeZone: string): string {
  if (!validCreationTimeZone(timeZone)) throw new Error("Choose a valid named time zone.");
  const clean = decodeCreationDescription(description).description;
  return `${clean}\n${PREFIX}${encodeURIComponent(JSON.stringify({timeZone}))}-->`;
}

export function decodeCreationDescription(raw: string): {description: string; timeZone?: string} {
  const index = raw.lastIndexOf(PREFIX);
  if (index < 0) return {description: raw};
  const end = raw.indexOf("-->", index + PREFIX.length);
  if (end < 0) return {description: raw};
  const encoded = raw.slice(index + PREFIX.length, end);
  const bodyEnd=index>0&&raw[index-1]==="\n"?index-1:index;
  const description = raw.slice(0, bodyEnd) + raw.slice(end + 3);
  if (encoded.length > MAX_METADATA_LENGTH) return {description};
  try {
    const data = JSON.parse(decodeURIComponent(encoded)) as {timeZone?: unknown};
    return validCreationTimeZone(data?.timeZone) ? {description, timeZone: data.timeZone} : {description};
  } catch { return {description}; }
}

function wallTime(epoch: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23"}).formatToParts(epoch);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

export function creationDateInput(unixSeconds: number, timeZone: string): string {
  if (!validCreationTimeZone(timeZone)) throw new Error("Choose a valid named time zone.");
  return wallTime(unixSeconds * 1000, timeZone);
}

/** Resolve an IANA-zone wall clock without silently shifting DST gaps/overlaps. */
export function creationUnixTime(value: string, timeZone: string): number {
  if (!validCreationTimeZone(timeZone) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Enter a valid date and time.");
  const naive = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0,16) !== value) throw new Error("Enter a valid calendar date.");
  const candidates = new Set<number>();
  // Sampling both sides of the date covers DST offsets and half-hour zones.
  for (const sample of [naive - 86400000, naive, naive + 86400000]) {
    const represented = Date.parse(`${wallTime(sample, timeZone)}:00Z`);
    const candidate = naive - (represented - sample);
    if (wallTime(candidate, timeZone) === value) candidates.add(candidate);
  }
  if (!candidates.size) throw new Error("This time does not exist because the clocks change. Choose another time.");
  if (candidates.size > 1) throw new Error("This time occurs twice because the clocks change. Choose another time or UTC.");
  return Math.floor([...candidates][0] / 1000);
}

export function requiredResponse(subtask: unknown): boolean | undefined {
  if (!subtask || typeof subtask !== "object") return undefined;
  const value = (subtask as {required_response?: unknown}).required_response;
  return typeof value === "boolean" ? value : undefined;
}
