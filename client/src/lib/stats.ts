import { addDays, format, startOfDay, startOfWeek, subDays } from "date-fns"
import { fromDueIso } from "./dates"
import { PRIORITIES, priorityLabels } from "./labels"
import type { Priority, TaskStatus } from "./types"

export interface StatsResponse {
  completedAt: string[]
  createdAt: string[]
  open: {
    status: TaskStatus
    priority: Priority
    dueDate: string | null
    project: { id: string; name: string; color: string } | null
  }[]
  pomodoros: { startedAt: string; durationMin: number; type: "WORK" | "SHORT_BREAK" | "LONG_BREAK"; completed: boolean }[]
  totals: { done: number; all: number }
}

export const dayKey = (date: Date) => format(date, "yyyy-MM-dd")

// Regroupe des horodatages par jour calendaire LOCAL
function countByDay(isos: string[]) {
  const map = new Map<string, number>()
  for (const iso of isos) {
    const key = dayKey(new Date(iso))
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return map
}

export interface DayValue {
  date: Date
  key: string
  value: number
}

function lastDays(map: Map<string, number>, days: number, today = new Date()): DayValue[] {
  return Array.from({ length: days }, (_, i) => {
    const date = subDays(startOfDay(today), days - 1 - i)
    const key = dayKey(date)
    return { date, key, value: map.get(key) ?? 0 }
  })
}

// Série : jours consécutifs avec au moins une tâche terminée (aujourd'hui ne casse pas la série tant qu'il n'est pas fini)
function streaks(map: Map<string, number>, today = new Date()) {
  let current = 0
  let cursor = startOfDay(today)
  if (!map.get(dayKey(cursor))) cursor = subDays(cursor, 1)
  while (map.get(dayKey(cursor))) {
    current++
    cursor = subDays(cursor, 1)
  }

  const days = [...map.keys()].sort()
  let best = 0
  let run = 0
  let previous: string | null = null
  for (const key of days) {
    run = previous && dayKey(addDays(new Date(`${previous}T00:00:00`), 1)) === key ? run + 1 : 1
    best = Math.max(best, run)
    previous = key
  }
  return { current, best: Math.max(best, current) }
}

function sumInRange<T>(items: T[], getDate: (item: T) => string, from: Date, to: Date, weight: (item: T) => number = () => 1) {
  return items.reduce((sum, item) => {
    const d = new Date(getDate(item))
    return d >= from && d < to ? sum + weight(item) : sum
  }, 0)
}

export function computeStats(data: StatsResponse, now = new Date()) {
  const today = startOfDay(now)
  const tomorrow = addDays(today, 1)
  const weekAgo = subDays(tomorrow, 7)
  const twoWeeksAgo = subDays(tomorrow, 14)

  const completedByDay = countByDay(data.completedAt)

  const doneThisWeek = sumInRange(data.completedAt, (d) => d, weekAgo, tomorrow)
  const donePreviousWeek = sumInRange(data.completedAt, (d) => d, twoWeeksAgo, weekAgo)

  const work = data.pomodoros.filter((p) => p.type === "WORK")
  const focusMinutesWeek = sumInRange(work, (p) => p.startedAt, weekAgo, tomorrow, (p) => p.durationMin)
  const focusSessionsWeek = sumInRange(work.filter((p) => p.completed), (p) => p.startedAt, weekAgo, tomorrow)

  const overdue = data.open.filter((t) => t.dueDate && fromDueIso(t.dueDate) < today).length

  const byPriority = PRIORITIES.map((p) => ({
    key: p,
    label: priorityLabels[p],
    value: data.open.filter((t) => t.priority === p).length,
  }))

  const projects = new Map<string, { key: string; label: string; color?: string; value: number }>()
  for (const t of data.open) {
    const key = t.project?.id ?? "none"
    const entry = projects.get(key) ?? { key, label: t.project?.name ?? "Sans liste", color: t.project?.color, value: 0 }
    entry.value++
    projects.set(key, entry)
  }
  const byProject = [...projects.values()].sort((a, b) => b.value - a.value)

  // Grille de la heatmap : 26 semaines complètes (lundi → dimanche) se terminant cette semaine
  const heatStart = startOfWeek(subDays(today, 25 * 7), { weekStartsOn: 1 })
  const heatDays: DayValue[] = []
  for (let d = heatStart; d < addDays(startOfWeek(today, { weekStartsOn: 1 }), 7); d = addDays(d, 1)) {
    heatDays.push({ date: d, key: dayKey(d), value: d > today ? -1 : (completedByDay.get(dayKey(d)) ?? 0) })
  }

  return {
    doneThisWeek,
    weekDelta: doneThisWeek - donePreviousWeek,
    streak: streaks(completedByDay, now),
    openCount: data.open.length,
    overdue,
    focusMinutesWeek,
    focusSessionsWeek,
    completionRate: data.totals.all ? Math.round((data.totals.done / data.totals.all) * 100) : 0,
    totals: data.totals,
    daily: lastDays(completedByDay, 30, now),
    heatDays,
    byPriority,
    byProject,
  }
}

export function formatMinutes(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`
}
