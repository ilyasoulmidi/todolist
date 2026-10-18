import { useMemo, useState } from "react"
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { ArchiveIcon, SearchXIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { QuickAdd } from "@/components/tasks/QuickAdd"
import { SortableTaskCard, TaskCard } from "@/components/tasks/TaskCard"
import { Skeleton } from "@/components/ui/skeleton"
import { useScope } from "@/hooks/useScope"
import { STATUSES, statusDotStyles, statusLabels } from "@/lib/labels"
import { useArchiveDone, useTasks, useUpdateTask } from "@/lib/queries"
import type { Task, TaskStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

type Columns = Record<TaskStatus, Task[]>

function groupByStatus(tasks: Task[]): Columns {
  const columns: Columns = { TODO: [], IN_PROGRESS: [], DONE: [] }
  for (const task of tasks) columns[task.status].push(task)
  for (const status of STATUSES) columns[status].sort((a, b) => a.position - b.position)
  return columns
}

function findColumn(columns: Columns, id: string): TaskStatus | null {
  if ((STATUSES as string[]).includes(id)) return id as TaskStatus
  return STATUSES.find((s) => columns[s].some((t) => t.id === id)) ?? null
}

// Position (flottante) entre les deux voisines : évite de renuméroter toute la colonne
function positionBetween(before?: Task, after?: Task) {
  if (!before && !after) return 0
  if (!before) return after!.position - 1
  if (!after) return before.position + 1
  return (before.position + after.position) / 2
}

export function KanbanPage() {
  const { filters, defaults, projectId } = useScope()
  const { data: tasks, isLoading } = useTasks({ ...filters, sort: "position" })
  const updateTask = useUpdateTask()

  const serverColumns = useMemo(() => groupByStatus(tasks ?? []), [tasks])
  // Pendant un glisser-déposer, on travaille sur une copie locale des colonnes
  const [dragColumns, setDragColumns] = useState<Columns | null>(null)
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const columns = dragColumns ?? serverColumns

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function onDragStart({ active }: DragStartEvent) {
    setDragColumns(serverColumns)
    setActiveTask(tasks?.find((t) => t.id === active.id) ?? null)
  }

  // Passage d'une colonne à une autre : on déplace la carte dans la copie locale
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || !dragColumns) return
    const from = findColumn(dragColumns, String(active.id))
    const to = findColumn(dragColumns, String(over.id))
    if (!from || !to || from === to) return

    setDragColumns((cols) => {
      if (!cols) return cols
      const moving = cols[from].find((t) => t.id === active.id)!
      const target = cols[to]
      const overIndex = target.findIndex((t) => t.id === over.id)
      const index = overIndex === -1 ? target.length : overIndex
      return {
        ...cols,
        [from]: cols[from].filter((t) => t.id !== active.id),
        [to]: [...target.slice(0, index), { ...moving, status: to }, ...target.slice(index)],
      }
    })
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    const cols = dragColumns
    setActiveTask(null)
    setDragColumns(null)
    if (!over || !cols) return

    const status = findColumn(cols, String(active.id))
    if (!status) return
    let list = cols[status]
    const oldIndex = list.findIndex((t) => t.id === active.id)
    const overIndex = list.findIndex((t) => t.id === over.id)
    if (overIndex !== -1 && overIndex !== oldIndex) list = arrayMove(list, oldIndex, overIndex)

    const index = list.findIndex((t) => t.id === active.id)
    const original = tasks?.find((t) => t.id === active.id)
    if (!original) return

    const statusChanged = original.status !== status
    const moved = statusChanged || index !== serverColumns[status].findIndex((t) => t.id === active.id)
    if (!moved) return

    updateTask.mutate({ id: original.id, status, position: positionBetween(list[index - 1], list[index + 1]) })
  }

  if (isLoading) return <BoardSkeleton />

  const isFiltered = !!(filters.q || filters.priority || filters.tagId)
  const empty = tasks?.length === 0

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => (setDragColumns(null), setActiveTask(null))}
    >
      {empty && isFiltered && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground md:mx-6">
          <SearchXIcon className="size-4" /> Aucune tâche ne correspond à ta recherche ou à tes filtres.
        </div>
      )}
      <div className="flex h-full snap-x snap-mandatory gap-4 overflow-x-auto p-4 md:snap-none md:p-6">
        {STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={columns[status]}
            defaults={{ ...defaults, status }}
            archiveProjectId={projectId === "none" ? null : (projectId ?? undefined)}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
        {activeTask && <TaskCard task={activeTask} overlay />}
      </DragOverlay>
    </DndContext>
  )
}

function Column({
  status,
  tasks,
  defaults,
  archiveProjectId,
}: {
  status: TaskStatus
  tasks: Task[]
  defaults: Parameters<typeof QuickAdd>[0]["defaults"]
  archiveProjectId?: string | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const archiveDone = useArchiveDone()

  return (
    <section
      aria-label={statusLabels[status]}
      className="flex w-[85vw] max-w-sm shrink-0 snap-center flex-col rounded-xl bg-muted/50 sm:w-80"
    >
      <header className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span className={cn("size-2 rounded-full", statusDotStyles[status])} />
        <h2 className="text-sm font-semibold">{statusLabels[status]}</h2>
        <span className="rounded-full bg-background px-2 text-xs text-muted-foreground">{tasks.length}</span>
        {status === "DONE" && tasks.length > 0 && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="ml-auto"
            onClick={() => archiveDone.mutate(archiveProjectId)}
            aria-label="Archiver les tâches terminées"
            title="Archiver les tâches terminées"
          >
            <ArchiveIcon />
          </Button>
        )}
      </header>

      <SortableContext id={status} items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 transition-colors",
            isOver && "rounded-lg bg-primary/5",
          )}
        >
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} />
          ))}
          {tasks.length === 0 && (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              {status === "DONE" ? "Glisse ici les tâches terminées" : "Aucune tâche"}
            </div>
          )}
        </div>
      </SortableContext>

      {status !== "DONE" && (
        <div className="p-2 pt-0">
          <QuickAdd defaults={defaults} />
        </div>
      )}
    </section>
  )
}

function BoardSkeleton() {
  return (
    <div className="flex gap-4 p-4 md:p-6">
      {STATUSES.map((s) => (
        <div key={s} className="flex w-80 shrink-0 flex-col gap-2 rounded-xl bg-muted/50 p-3">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-20" />
          <Skeleton className="h-16" />
        </div>
      ))}
    </div>
  )
}
