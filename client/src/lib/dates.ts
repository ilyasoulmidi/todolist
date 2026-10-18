import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  isPast,
  isToday,
  isTomorrow,
  isYesterday,
  startOfDay,
} from "date-fns"
import { fr } from "date-fns/locale"
import type { TaskFilters, TaskStatus } from "./types"

export type SmartView = "all" | "today" | "week" | "overdue"

export const smartViewLabels: Record<SmartView, string> = {
  all: "Toutes les tâches",
  today: "Aujourd'hui",
  week: "Cette semaine",
  overdue: "En retard",
}

/*
 * Une échéance « jour entier » est une date calendaire, pas un instant : on la stocke à minuit UTC
 * (2026-10-19 → "2026-10-19T00:00:00.000Z") et on la relit avec les composantes UTC.
 * Ainsi le jour affiché ne dépend ni du fuseau ni des changements d'heure.
 */
export function toDueIso(localDate: Date) {
  return new Date(Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate())).toISOString()
}

export function fromDueIso(iso: string) {
  const d = new Date(iso)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

// Intervalles [dueFrom, dueTo[ basés sur le jour calendaire local de l'utilisateur
export function smartViewFilters(view: SmartView, now = new Date()): TaskFilters {
  const today = startOfDay(now)
  switch (view) {
    case "today":
      return { dueFrom: toDueIso(today), dueTo: toDueIso(addDays(today, 1)) }
    case "week":
      return {
        dueFrom: toDueIso(today),
        dueTo: toDueIso(addDays(endOfWeek(now, { weekStartsOn: 1 }), 1)),
      }
    case "overdue":
      return { dueTo: toDueIso(today), status: ["TODO", "IN_PROGRESS"] }
    default:
      return {}
  }
}

export function formatDue(iso: string) {
  const date = fromDueIso(iso)
  if (isToday(date)) return "Aujourd'hui"
  if (isTomorrow(date)) return "Demain"
  if (isYesterday(date)) return "Hier"
  const diff = differenceInCalendarDays(date, new Date())
  if (diff > 0 && diff < 7) return format(date, "EEEE", { locale: fr })
  return format(date, date.getFullYear() === new Date().getFullYear() ? "d MMM" : "d MMM yyyy", {
    locale: fr,
  })
}

export function isOverdue(iso: string | null, status: TaskStatus) {
  if (!iso || status === "DONE") return false
  return isPast(addDays(fromDueIso(iso), 1))
}

export function formatLong(iso: string) {
  return format(fromDueIso(iso), "EEEE d MMMM yyyy", { locale: fr })
}
