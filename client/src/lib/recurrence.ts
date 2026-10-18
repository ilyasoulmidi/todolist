// Côté client : construction et description en français des règles RRULE gérées par l'API

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"

export interface Rule {
  freq: Freq
  interval: number
  byDay: string[] // "MO", "TU"…
  byMonthDay?: number
}

export const WEEKDAYS = [
  { code: "MO", short: "L", label: "lundi" },
  { code: "TU", short: "M", label: "mardi" },
  { code: "WE", short: "M", label: "mercredi" },
  { code: "TH", short: "J", label: "jeudi" },
  { code: "FR", short: "V", label: "vendredi" },
  { code: "SA", short: "S", label: "samedi" },
  { code: "SU", short: "D", label: "dimanche" },
]

const WORKDAYS = ["MO", "TU", "WE", "TH", "FR"]
const JS_DAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]

export function parseRule(text: string | null | undefined): Rule | null {
  if (!text) return null
  const parts = Object.fromEntries(text.split(";").map((p) => p.split("=")))
  if (!parts.FREQ) return null
  return {
    freq: parts.FREQ as Freq,
    interval: Number(parts.INTERVAL ?? 1),
    byDay: parts.BYDAY ? parts.BYDAY.split(",") : [],
    byMonthDay: parts.BYMONTHDAY ? Number(parts.BYMONTHDAY) : undefined,
  }
}

export function buildRule(rule: Rule): string {
  const parts = [`FREQ=${rule.freq}`]
  if (rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`)
  if (rule.freq === "WEEKLY" && rule.byDay.length) {
    const order = WEEKDAYS.map((d) => d.code)
    parts.push(`BYDAY=${[...rule.byDay].sort((a, b) => order.indexOf(a) - order.indexOf(b)).join(",")}`)
  }
  if (rule.freq === "MONTHLY" && rule.byMonthDay) parts.push(`BYMONTHDAY=${rule.byMonthDay}`)
  return parts.join(";")
}

export type Preset = "none" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "yearly" | "custom"

// Les préréglages s'appuient sur la date de référence (échéance, sinon aujourd'hui)
export function presetRule(preset: Preset, ref: Date): string | null {
  const day = JS_DAY_CODES[ref.getDay()]
  switch (preset) {
    case "daily":
      return "FREQ=DAILY"
    case "weekdays":
      return `FREQ=WEEKLY;BYDAY=${WORKDAYS.join(",")}`
    case "weekly":
      return `FREQ=WEEKLY;BYDAY=${day}`
    case "biweekly":
      return `FREQ=WEEKLY;INTERVAL=2;BYDAY=${day}`
    case "monthly":
      return `FREQ=MONTHLY;BYMONTHDAY=${ref.getDate()}`
    case "yearly":
      return "FREQ=YEARLY"
    default:
      return null
  }
}

export function detectPreset(rule: string | null | undefined, ref: Date): Preset {
  if (!rule) return "none"
  const presets: Preset[] = ["daily", "weekdays", "weekly", "biweekly", "monthly", "yearly"]
  return presets.find((p) => presetRule(p, ref) === rule) ?? "custom"
}

export function describeRule(text: string | null | undefined): string {
  const rule = parseRule(text)
  if (!rule) return "Ne se répète pas"
  const n = rule.interval

  switch (rule.freq) {
    case "DAILY":
      return n === 1 ? "Tous les jours" : `Tous les ${n} jours`
    case "WEEKLY": {
      if (rule.byDay.length === 5 && WORKDAYS.every((d) => rule.byDay.includes(d)) && n === 1) {
        return "Tous les jours ouvrés"
      }
      const days = WEEKDAYS.filter((d) => rule.byDay.includes(d.code)).map((d) => d.label)
      const every = n === 1 ? "Chaque semaine" : `Toutes les ${n} semaines`
      return days.length ? `${every}, le ${joinFr(days)}` : every
    }
    case "MONTHLY": {
      const every = n === 1 ? "Tous les mois" : `Tous les ${n} mois`
      return rule.byMonthDay ? `${every}, le ${rule.byMonthDay === 1 ? "1er" : rule.byMonthDay}` : every
    }
    case "YEARLY":
      return n === 1 ? "Tous les ans" : `Tous les ${n} ans`
  }
}

function joinFr(items: string[]) {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`
}
