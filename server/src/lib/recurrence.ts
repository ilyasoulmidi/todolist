/*
 * Sous-ensemble de RRULE (RFC 5545) suffisant pour une todo-list :
 *   FREQ=DAILY|WEEKLY|MONTHLY|YEARLY ; INTERVAL=n ; BYDAY=MO,TU,… (hebdo) ; BYMONTHDAY=1..31 (mensuel)
 * Les échéances sont des dates calendaires stockées à minuit UTC : tous les calculs se font en UTC.
 */

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface Rule {
  freq: Freq;
  interval: number;
  byDay?: number[]; // 0 = dimanche … 6 = samedi
  byMonthDay?: number;
}

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const DAY_MS = 24 * 60 * 60 * 1000;

export function parseRule(rule: string): Rule | null {
  const parts = new Map<string, string>();
  for (const chunk of rule.trim().toUpperCase().split(";")) {
    if (!chunk) continue;
    const [key, value] = chunk.split("=");
    if (!key || !value) return null;
    parts.set(key, value);
  }

  const freq = parts.get("FREQ");
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null;

  const interval = parts.has("INTERVAL") ? Number(parts.get("INTERVAL")) : 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) return null;

  const result: Rule = { freq: freq as Freq, interval };

  if (parts.has("BYDAY")) {
    if (freq !== "WEEKLY") return null;
    const days = parts.get("BYDAY")!.split(",").map((d) => DAYS.indexOf(d));
    if (days.length === 0 || days.some((d) => d === -1)) return null;
    result.byDay = [...new Set(days)].sort((a, b) => a - b);
  }

  if (parts.has("BYMONTHDAY")) {
    if (freq !== "MONTHLY") return null;
    const day = Number(parts.get("BYMONTHDAY"));
    if (!Number.isInteger(day) || day < 1 || day > 31) return null;
    result.byMonthDay = day;
  }

  const known = new Set(["FREQ", "INTERVAL", "BYDAY", "BYMONTHDAY"]);
  if ([...parts.keys()].some((k) => !known.has(k))) return null;

  return result;
}

export function isValidRule(rule: string) {
  return parseRule(rule) !== null;
}

function utcDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day));
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

// Ajoute des mois en restant dans le mois cible (31 janvier + 1 mois → 28/29 février)
function addMonthsClamped(date: Date, months: number, day = date.getUTCDate()) {
  const total = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  return utcDate(year, month, Math.min(day, daysInMonth(year, month)));
}

function startOfUtcDay(date: Date) {
  return utcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** Prochaine date strictement après `from` (date calendaire à minuit UTC). */
export function nextOccurrence(ruleText: string, from: Date): Date | null {
  const rule = parseRule(ruleText);
  if (!rule) return null;
  const base = startOfUtcDay(from);

  switch (rule.freq) {
    case "DAILY":
      return new Date(base.getTime() + rule.interval * DAY_MS);

    case "WEEKLY": {
      if (!rule.byDay) return new Date(base.getTime() + 7 * rule.interval * DAY_MS);
      // Jours restants de la semaine courante, sinon premier jour de la semaine suivant l'intervalle
      const weekday = base.getUTCDay();
      const later = rule.byDay.find((d) => d > weekday);
      if (later !== undefined) return new Date(base.getTime() + (later - weekday) * DAY_MS);
      // Semaines commençant le lundi : on revient au lundi, on saute l'intervalle, puis on avance au 1er jour choisi
      const mondayOffset = (weekday + 6) % 7;
      const nextMonday = new Date(base.getTime() + (7 * rule.interval - mondayOffset) * DAY_MS);
      const first = [...rule.byDay].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))[0];
      return new Date(nextMonday.getTime() + ((first + 6) % 7) * DAY_MS);
    }

    case "MONTHLY": {
      const day = rule.byMonthDay ?? base.getUTCDate();
      // Même mois si le jour choisi n'est pas encore passé (ex. le 15 → le 31 du même mois)
      const sameMonth = utcDate(base.getUTCFullYear(), base.getUTCMonth(), Math.min(day, daysInMonth(base.getUTCFullYear(), base.getUTCMonth())));
      if (rule.byMonthDay && sameMonth > base) return sameMonth;
      return addMonthsClamped(utcDate(base.getUTCFullYear(), base.getUTCMonth(), 1), rule.interval, day);
    }

    case "YEARLY":
      return addMonthsClamped(base, 12 * rule.interval);
  }
}
