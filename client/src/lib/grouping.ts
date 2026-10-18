import { addDays, endOfWeek, startOfDay } from "date-fns"
import { fromDueIso } from "./dates"
import { PRIORITIES, priorityLabels, STATUSES, statusLabels } from "./labels"
import type { Task } from "./types"
import type { ListGroup } from "@/stores/ui"

export interface TaskGroup {
  key: string
  label: string
  color?: string
  tone?: "danger"
  tasks: Task[]
}

const dueBuckets = [
  { key: "overdue", label: "En retard", tone: "danger" as const },
  { key: "today", label: "Aujourd'hui" },
  { key: "tomorrow", label: "Demain" },
  { key: "week", label: "Cette semaine" },
  { key: "later", label: "Plus tard" },
  { key: "none", label: "Sans échéance" },
]

function dueBucket(task: Task, now = new Date()) {
  if (!task.dueDate) return "none"
  const due = fromDueIso(task.dueDate).getTime()
  const today = startOfDay(now)
  if (due < today.getTime()) return task.status === "DONE" ? "past" : "overdue"
  if (due < addDays(today, 1).getTime()) return "today"
  if (due < addDays(today, 2).getTime()) return "tomorrow"
  if (due <= endOfWeek(now, { weekStartsOn: 1 }).getTime()) return "week"
  return "later"
}

// Regroupe les tâches (déjà triées par l'API) en conservant l'ordre à l'intérieur de chaque groupe
export function groupTasks(tasks: Task[], group: ListGroup): TaskGroup[] {
  switch (group) {
    case "status":
      return STATUSES.map((s) => ({ key: s, label: statusLabels[s], tasks: tasks.filter((t) => t.status === s) }))

    case "priority":
      return PRIORITIES.map((p) => ({ key: p, label: priorityLabels[p], tasks: tasks.filter((t) => t.priority === p) }))

    case "project": {
      const groups = new Map<string, TaskGroup>()
      for (const task of tasks) {
        const key = task.project?.id ?? "none"
        if (!groups.has(key)) {
          groups.set(key, { key, label: task.project?.name ?? "Sans liste", color: task.project?.color, tasks: [] })
        }
        groups.get(key)!.tasks.push(task)
      }
      return [...groups.values()].sort((a, b) =>
        a.key === "none" ? 1 : b.key === "none" ? -1 : a.label.localeCompare(b.label, "fr"),
      )
    }

    case "dueDate": {
      // Les tâches terminées dont l'échéance est passée ne sont pas « en retard »
      const buckets = [...dueBuckets.slice(0, 1), { key: "past", label: "Passées" }, ...dueBuckets.slice(1)]
      return buckets.map((b) => ({ ...b, tasks: tasks.filter((t) => dueBucket(t) === b.key) }))
    }

    default:
      return [{ key: "all", label: "", tasks }]
  }
}
