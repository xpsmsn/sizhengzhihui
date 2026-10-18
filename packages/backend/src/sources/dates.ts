// AI生成
// Published dates as list pages, articles and JSON lists print them, read the same on every host.
import type { SourceRow } from "./types.ts";

/** The offset a source's article pages print their dates in: its detail rules' own, else its listing's. */
export function articleUtcOffset(config: SourceRow["config"]): string | undefined {
  return config.detail?.publishedAtUtcOffset ?? config.publishedAtUtcOffset;
}

/**
 * A time followed by its zone: "10:00Z", "10:00:00+08:00", "10:00:00 +0000", "10:00 PM GMT", "10:00 EST".
 * CST is no zone here: Date.parse reads US Central, Chinese pages mean China, so it is read in the source's offset.
 */
const EXPLICIT_ZONE = /\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:[AP]M\s*)?(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC?|[EMP][SD]T|CDT)\b/i;

function calendarDay(y: string | number, mo: string | number, d: string | number): boolean {
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(mo) - 1 && date.getUTCDate() === Number(d);
}

function atOffset(y: string | number, mo: string | number, d: string | number, h: string | number, mi: string | number, s: string | number, utcOffset: string): Date | null {
  if (!calendarDay(y, mo, d) || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
  const p = (n: string | number) => String(n).padStart(2, "0");
  const t = Date.parse(`${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}:${p(s)}${utcOffset}`);
  return Number.isFinite(t) ? new Date(t) : null;
}

/**
 * A published date as a source prints it. Date.parse is kept only where it reads the same
 * on every host: a time that carries its own zone. Everything else — a bare date, or a date with a
 * wall-clock time (a space or dash between them) — is read in the source's offset, so a Chinese
 * listing's "2026-10-09" is midnight in China, not UTC midnight (which would show as 08:00).
 */
export function parseLooseDate(value: string | null | undefined, utcOffset = "+08:00"): Date | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  const numeric = /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:(?:T|\s*|-)(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(v);
  if (numeric && !calendarDay(numeric[1]!, numeric[2]!, numeric[3]!)) return null;
  const english = /\b([a-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})\b/i.exec(v)
    ?? /\b(\d{1,2})\s+([a-z]{3,9})\s+(\d{4})\b/i.exec(v)?.map((part, i, match) => i === 1 ? match[2]! : i === 2 ? match[1]! : part);
  if (english) {
    const month = Date.parse(`${english[1]} 1, ${english[3]} 00:00:00 GMT`);
    if (!Number.isFinite(month) || !calendarDay(english[3]!, new Date(month).getUTCMonth() + 1, english[2]!)) return null;
  }
  if (!numeric && !english) return null;
  const text = v.replace(/(\d)(st|nd|rd|th)\b/gi, "$1");
  if (EXPLICIT_ZONE.test(v)) {
    const direct = Date.parse(text);
    if (Number.isFinite(direct)) return new Date(direct);
    if (!numeric) return null;
  }
  // 2026-09-26 / 2026/09/26 / 2026-09-26T10:00 / 2026年9月26日 (+ optional time), interpreted in the given offset.
  const m = numeric;
  if (m) {
    const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
    return atOffset(y!, mo!, d!, h, mi, s, utcOffset);
  }
  // Parse English wall-clock fields in UTC so the host's daylight-saving rules cannot shift them.
  const en = Date.parse(`${text} GMT`);
  if (!Number.isFinite(en)) return null;
  const utc = new Date(en);
  return atOffset(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate(), utc.getUTCHours(), utc.getUTCMinutes(), utc.getUTCSeconds(), utcOffset);
}

/**
 * A publication time as a feed's pubDate / dc:date / published / updated prints it. Same reading on
 * every host: a time without a zone is read in the source's offset (Date.parse would take it in the
 * server's zone, so a Chinese feed's "2026-10-16 21:30" on Docker (UTC) became 21:30 UTC — the 17th
 * 05:30 Beijing, and evening news listed under the next day), while a time that carries its own zone
 * keeps it. Only a shape neither a date nor a date with a wall-clock time ("10/16/2026") falls back to
 * Date.parse, which the host reads in its own zone.
 */
export function parseFeedDate(value: string | null | undefined, utcOffset?: string): Date | null {
  // RFC 822 variants print a Chinese weekday; it carries no zone and only confuses the parsers.
  const v = value?.replace(/星期[一二三四五六日天][,，、]?\s*/, "").replace(/\s+/g, " ").trim();
  if (!v) return null;
  const loose = parseLooseDate(v, utcOffset);
  if (loose) return loose;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t) : null;
}

