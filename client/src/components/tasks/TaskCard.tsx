import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { AlignLeftIcon, CalendarIcon, ListChecksIcon, RepeatIcon } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { formatDue, isOverdue } from "@/lib/dates"
import { priorityLabels, priorityStyles } from "@/lib/labels"
import { useUpdateTask } from "@/lib/queries"
import type { Task } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useUi } from "@/stores/ui"

export function TaskCard({ task, overlay = false }: { task: Task; overlay?: boolean }) {
  const openTask = useUi((s) => s.openTask)
  const updateTask = useUpdateTask()
  const done = task.status === "DONE"
  const overdue = isOverdue(task.dueDate, task.status)
  const subtasksDone = task.subtasks.filter((s) => s.done).length

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openTask(task.id)}
      onKeyDown={(e) => e.key === "Enter" && openTask(task.id)}
      className={cn(
        "group flex cursor-pointer flex-col gap-2 rounded-lg border bg-card p-3 text-sm shadow-xs transition hover:border-foreground/20 hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        overlay && "rotate-2 cursor-grabbing shadow-lg ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-start gap-2">
        <span onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} className="pt-0.5">
          <Checkbox
            checked={done}
            onCheckedChange={(checked) => updateTask.mutate({ id: task.id, status: checked ? "DONE" : "TODO" })}
            aria-label={done ? "Marquer comme à faire" : "Marquer comme faite"}
          />
        </span>
        <span className={cn("flex-1 leading-snug font-medium break-words", done && "text-muted-foreground line-through")}>
          {task.title}
        </span>
      </div>

      {task.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded px-1.5 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: `${tag.color}22`, color: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
        <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", priorityStyles[task.priority])}>
          {priorityLabels[task.priority]}
        </span>
        {task.dueDate && (
          <span className={cn("flex items-center gap-1", overdue && "font-medium text-destructive")}>
            <CalendarIcon className="size-3.5" />
            {formatDue(task.dueDate)}
          </span>
        )}
        {task.subtasks.length > 0 && (
          <span className={cn("flex items-center gap-1", subtasksDone === task.subtasks.length && "text-emerald-600 dark:text-emerald-400")}>
            <ListChecksIcon className="size-3.5" />
            {subtasksDone}/{task.subtasks.length}
          </span>
        )}
        {task.description && <AlignLeftIcon className="size-3.5" aria-label="A une description" />}
        {task.recurrenceRule && <RepeatIcon className="size-3.5" aria-label="Récurrente" />}
        {task.project && (
          <span className="ml-auto flex max-w-[45%] items-center gap-1">
            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: task.project.color }} />
            <span className="truncate">{task.project.name}</span>
          </span>
        )}
      </div>
    </div>
  )
}

export function SortableTaskCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task" },
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("touch-manipulation", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
      // Les attributs de dnd-kit mettent role="button" : on garde celui de la carte
      role={undefined}
      tabIndex={-1}
    >
      <TaskCard task={task} />
    </div>
  )
}
