import { useMemo, useState } from "react"
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { fr } from "date-fns/locale"
import { CalendarOffIcon, ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useScope } from "@/hooks/useScope"
import { fromDueIso, toDueIso } from "@/lib/dates"
import { priorityLabels } from "@/lib/labels"
import { useTasks, useUpdateTask } from "@/lib/queries"
import type { Priority, Task } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useUi } from "@/stores/ui"

type Mode = "month" | "week"

const WEEK = { weekStartsOn: 1 as const }
const NO_DATE = "sans-echeance"

// Couleur de la bordure des pastilles quand la tâche n'a pas de liste
const priorityColors: Record<Priority, string> = {
  LOW: "#94a3b8",
  MEDIUM: "#0ea5e9",
  HIGH: "#f59e0b",
  URGENT: "#ef4444",
}

const dayKey = (date: Date) => format(date, "yyyy-MM-dd")

// Dépose sous le curseur (plus intuitif qu'à la surface de la carte) ; repli pour le clavier
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length ? hits : rectIntersection(args)
}

export function CalendarPage() {
  const { filters } = useScope()
  const openNewTask = useUi((s) => s.openNewTask)
  const updateTask = useUpdateTask()

  const [mode, setMode] = useState<Mode>("month")
  const [cursor, setCursor] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(() => new Date())
  const [activeTask, setActiveTask] = useState<Task | null>(null)

  const days = useMemo(() => {
    const start = mode === "month" ? startOfWeek(startOfMonth(cursor), WEEK) : startOfWeek(cursor, WEEK)
    const end = mode === "month" ? endOfWeek(endOfMonth(cursor), WEEK) : endOfWeek(cursor, WEEK)
    return eachDayOfInterval({ start, end })
  }, [cursor, mode])

  // Le calendrier impose sa propre plage de dates ; on garde les autres filtres du périmètre
  const { dueFrom: _f, dueTo: _t, ...scopeFilters } = filters
  const { data: tasks = [] } = useTasks({
    ...scopeFilters,
    dueFrom: toDueIso(days[0]),
    dueTo: toDueIso(addDays(days[days.length - 1], 1)),
    sort: "priority",
    order: "desc",
  })
  const { data: unscheduled = [] } = useTasks({
    ...scopeFilters,
    noDue: true,
    status: scopeFilters.status ?? ["TODO", "IN_PROGRESS"],
    sort: "priority",
    order: "desc",
  })

  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const task of tasks) {
      const key = dayKey(fromDueIso(task.dueDate!))
      map.set(key, [...(map.get(key) ?? []), task])
    }
    return map
  }, [tasks])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )

  function onDragStart({ active }: DragStartEvent) {
    setActiveTask([...tasks, ...unscheduled].find((t) => t.id === active.id) ?? null)
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveTask(null)
    if (!over) return
    const task = [...tasks, ...unscheduled].find((t) => t.id === active.id)
    if (!task) return

    const dueDate = over.id === NO_DATE ? null : toDueIso(new Date(`${over.id}T00:00:00`))
    if (dueDate !== task.dueDate) updateTask.mutate({ id: task.id, dueDate })
  }

  const move = (direction: 1 | -1) => setCursor((c) => (mode === "month" ? addMonths(c, direction) : addWeeks(c, direction)))

  const title =
    mode === "month"
      ? format(cursor, "MMMM yyyy", { locale: fr })
      : `${format(days[0], "d MMM", { locale: fr })} – ${format(days[6], "d MMM yyyy", { locale: fr })}`

  const selectedTasks = byDay.get(dayKey(selectedDay)) ?? []

  return (
    <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveTask(null)}>
      <div className="flex h-full min-h-0 gap-4 p-4 md:p-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-lg font-semibold first-letter:uppercase">{title}</h2>
            <div className="flex rounded-lg bg-muted p-0.5 text-sm" role="tablist" aria-label="Affichage">
              {(["month", "week"] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-muted-foreground transition",
                    mode === m && "bg-background font-medium text-foreground shadow-xs",
                  )}
                >
                  {m === "month" ? "Mois" : "Semaine"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => move(-1)} aria-label="Période précédente">
                <ChevronLeftIcon />
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setCursor(new Date())
                  setSelectedDay(new Date())
                }}
              >
                Aujourd'hui
              </Button>
              <Button variant="outline" size="icon" onClick={() => move(1)} aria-label="Période suivante">
                <ChevronRightIcon />
              </Button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card select-none max-sm:flex-none">
            <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
              {days.slice(0, 7).map((d) => (
                <div key={d.toISOString()} className="py-2 first-letter:uppercase">
                  <span className="sm:hidden">{format(d, "EEEEE", { locale: fr })}</span>
                  <span className="hidden sm:inline">{format(d, "EEE", { locale: fr })}</span>
                </div>
              ))}
            </div>
            <div
              className={cn("grid flex-1 grid-cols-7", mode === "week" ? "grid-rows-1" : "auto-rows-fr")}
            >
              {days.map((day) => (
                <DayCell
                  key={day.toISOString()}
                  day={day}
                  tasks={byDay.get(dayKey(day)) ?? []}
                  outside={mode === "month" && !isSameMonth(day, cursor)}
                  selected={isSameDay(day, selectedDay)}
                  maxVisible={mode === "week" ? 20 : 3}
                  onSelect={() => setSelectedDay(day)}
                  onAdd={() => openNewTask({ dueDate: toDueIso(day) })}
                />
              ))}
            </div>
          </div>

          {/* Sur mobile, les cases sont trop petites : la liste du jour sélectionné s'affiche dessous */}
          <div className="flex flex-col gap-2 sm:hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold first-letter:uppercase">
                {format(selectedDay, "EEEE d MMMM", { locale: fr })}
              </h3>
              <Button size="sm" variant="ghost" onClick={() => openNewTask({ dueDate: toDueIso(selectedDay) })}>
                <PlusIcon /> Ajouter
              </Button>
            </div>
            {selectedTasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune tâche ce jour-là.</p>
            ) : (
              selectedTasks.map((task) => <TaskChip key={task.id} task={task} large />)
            )}
          </div>
        </div>

        <UnscheduledPanel tasks={unscheduled} />
      </div>

      <DragOverlay dropAnimation={null}>{activeTask && <ChipBody task={activeTask} overlay />}</DragOverlay>
    </DndContext>
  )
}

function DayCell({
  day,
  tasks,
  outside,
  selected,
  maxVisible,
  onSelect,
  onAdd,
}: {
  day: Date
  tasks: Task[]
  outside: boolean
  selected: boolean
  maxVisible: number
  onSelect: () => void
  onAdd: () => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey(day) })
  const today = isToday(day)
  const hidden = tasks.length - maxVisible

  return (
    <div
      ref={setNodeRef}
      onClick={onSelect}
      className={cn(
        "group relative flex min-h-16 min-w-0 flex-col gap-1 border-r border-b p-1 transition-colors nth-[7n]:border-r-0 sm:min-h-24 sm:p-1.5",
        outside && "bg-muted/30 text-muted-foreground",
        isOver && "bg-primary/10",
        selected && "max-sm:bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs",
            today && "bg-primary font-semibold text-primary-foreground",
            selected && !today && "max-sm:ring-1 max-sm:ring-primary",
          )}
        >
          {format(day, "d")}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAdd()
          }}
          aria-label={`Ajouter une tâche le ${format(day, "d MMMM", { locale: fr })}`}
          className="hidden size-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted focus-visible:opacity-100 sm:flex"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>

      {/* Mobile : de simples points */}
      <div className="flex flex-wrap gap-0.5 sm:hidden">
        {tasks.slice(0, 4).map((t) => (
          <span
            key={t.id}
            className={cn("size-1.5 rounded-full", t.status === "DONE" && "opacity-40")}
            style={{ backgroundColor: t.project?.color ?? priorityColors[t.priority] }}
          />
        ))}
      </div>

      <div className="hidden min-w-0 flex-col gap-1 sm:flex">
        {tasks.slice(0, maxVisible).map((task) => (
          <TaskChip key={task.id} task={task} />
        ))}
        {hidden > 0 && (
          <Popover>
            <PopoverTrigger
              onClick={(e) => e.stopPropagation()}
              className="rounded px-1 text-left text-xs text-muted-foreground hover:bg-muted"
            >
              + {hidden} de plus
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <p className="text-sm font-semibold first-letter:uppercase">{format(day, "EEEE d MMMM", { locale: fr })}</p>
              {tasks.map((task) => (
                <TaskChip key={task.id} task={task} />
              ))}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  )
}

function TaskChip({ task, large = false }: { task: Task; large?: boolean }) {
  const openTask = useUi((s) => s.openTask)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation()
        openTask(task.id)
      }}
      className={cn("touch-manipulation", isDragging && "opacity-30")}
    >
      <ChipBody task={task} large={large} />
    </div>
  )
}

function ChipBody({ task, large = false, overlay = false }: { task: Task; large?: boolean; overlay?: boolean }) {
  const done = task.status === "DONE"
  return (
    <div
      title={`${task.title} · priorité ${priorityLabels[task.priority].toLowerCase()}`}
      className={cn(
        "cursor-pointer truncate rounded border-l-[3px] bg-muted/70 px-1.5 py-0.5 text-xs transition hover:bg-muted",
        large && "px-3 py-2 text-sm",
        done && "text-muted-foreground line-through opacity-70",
        overlay && "w-40 cursor-grabbing bg-popover shadow-lg ring-1 ring-foreground/10",
      )}
      style={{ borderLeftColor: task.project?.color ?? priorityColors[task.priority] }}
    >
      {task.title}
    </div>
  )
}

function UnscheduledPanel({ tasks }: { tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: NO_DATE })

  return (
    <aside
      ref={setNodeRef}
      aria-label="Tâches sans échéance"
      className={cn(
        "hidden w-60 shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border bg-muted/30 p-3 transition-colors lg:flex",
        isOver && "bg-primary/10",
      )}
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <CalendarOffIcon className="size-4 text-muted-foreground" />
        Sans échéance
        <span className="font-normal text-muted-foreground">{tasks.length}</span>
      </h3>
      <p className="text-xs text-muted-foreground">Glisse une tâche sur un jour pour la planifier, ou ici pour retirer son échéance.</p>
      {tasks.map((task) => (
        <TaskChip key={task.id} task={task} large />
      ))}
    </aside>
  )
}
