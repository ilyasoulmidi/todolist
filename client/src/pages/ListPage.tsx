import { useMemo, useState, type FormEvent } from "react"
import {
  AlignLeftIcon,
  ArrowDownNarrowWideIcon,
  ArrowUpNarrowWideIcon,
  CalendarIcon,
  CheckIcon,
  ChevronDownIcon,
  CircleIcon,
  FlagIcon,
  ListChecksIcon,
  PlusIcon,
  RepeatIcon,
  SearchXIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { useScope } from "@/hooks/useScope"
import { formatDue, isOverdue } from "@/lib/dates"
import { groupTasks } from "@/lib/grouping"
import { PRIORITIES, priorityLabels, priorityStyles, statusDotStyles, statusLabels } from "@/lib/labels"
import { useBulkTasks, useCreateTask, useTasks, useUpdateTask } from "@/lib/queries"
import type { Task, TaskStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useUi, type ListGroup, type ListSort, type ListStatusFilter } from "@/stores/ui"

const statusTabs: { value: ListStatusFilter; label: string }[] = [
  { value: "open", label: "Ouvertes" },
  { value: "TODO", label: "À faire" },
  { value: "IN_PROGRESS", label: "En cours" },
  { value: "DONE", label: "Faites" },
  { value: "all", label: "Toutes" },
]

const sortItems: { value: ListSort; label: string }[] = [
  { value: "dueDate", label: "Échéance" },
  { value: "priority", label: "Priorité" },
  { value: "title", label: "Titre" },
  { value: "createdAt", label: "Date de création" },
  { value: "position", label: "Ordre manuel" },
]

const groupItems: { value: ListGroup; label: string }[] = [
  { value: "dueDate", label: "Échéance" },
  { value: "status", label: "Statut" },
  { value: "priority", label: "Priorité" },
  { value: "project", label: "Liste" },
  { value: "none", label: "Aucun" },
]

const OPEN: TaskStatus[] = ["TODO", "IN_PROGRESS"]

export function ListPage() {
  const { filters, defaults } = useScope()
  const { listSort, listOrder, listGroup, listStatus, setListPrefs } = useUi()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Combine le filtre de statut de la vue Liste avec celui du périmètre (ex. « En retard »)
  const status = useMemo(() => {
    const own = listStatus === "all" ? undefined : listStatus === "open" ? OPEN : [listStatus]
    if (!filters.status) return own
    return own ? filters.status.filter((s) => own.includes(s)) : filters.status
  }, [listStatus, filters.status])

  const { data: tasks, isLoading } = useTasks({ ...filters, status, sort: listSort, order: listOrder })
  const groups = useMemo(() => groupTasks(tasks ?? [], listGroup).filter((g) => g.tasks.length > 0), [tasks, listGroup])

  // Ignore les tâches sélectionnées qui ne sont plus affichées
  const visibleSelection = useMemo(
    () => (tasks ?? []).filter((t) => selected.has(t.id)).map((t) => t.id),
    [tasks, selected],
  )

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allSelected = !!tasks?.length && visibleSelection.length === tasks.length

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 pb-24 md:p-6 md:pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Statut" className="flex rounded-lg bg-muted p-0.5 text-sm">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              role="tab"
              aria-selected={listStatus === tab.value}
              onClick={() => setListPrefs({ listStatus: tab.value })}
              className={cn(
                "rounded-md px-2.5 py-1 text-muted-foreground transition",
                listStatus === tab.value && "bg-background font-medium text-foreground shadow-xs",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <LabeledSelect
            label="Grouper"
            items={groupItems}
            value={listGroup}
            onChange={(v) => setListPrefs({ listGroup: v as ListGroup })}
          />
          <LabeledSelect
            label="Trier"
            items={sortItems}
            value={listSort}
            onChange={(v) => setListPrefs({ listSort: v as ListSort })}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setListPrefs({ listOrder: listOrder === "asc" ? "desc" : "asc" })}
            aria-label={listOrder === "asc" ? "Ordre croissant" : "Ordre décroissant"}
            title={listOrder === "asc" ? "Ordre croissant" : "Ordre décroissant"}
          >
            {listOrder === "asc" ? <ArrowUpNarrowWideIcon /> : <ArrowDownNarrowWideIcon />}
          </Button>
        </div>
      </div>

      <ListQuickAdd defaults={defaults} />

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState filtered={!!(filters.q || filters.priority || filters.tagId)} />
      ) : (
        <>
          <div className="flex items-center gap-3 px-3 text-xs text-muted-foreground">
            <Checkbox
              checked={allSelected}
              indeterminate={visibleSelection.length > 0 && !allSelected}
              onCheckedChange={(checked) => setSelected(new Set(checked ? tasks!.map((t) => t.id) : []))}
              aria-label="Tout sélectionner"
            />
            {tasks!.length} tâche{tasks!.length > 1 ? "s" : ""}
          </div>
          {groups.map((group) => (
            <section key={group.key} aria-label={group.label || "Tâches"} className="flex flex-col">
              {group.label && (
                <h2
                  className={cn(
                    "flex items-center gap-2 px-3 pb-1.5 text-sm font-semibold",
                    group.tone === "danger" && "text-destructive",
                  )}
                >
                  {group.color && <span className="size-2.5 rounded-full" style={{ backgroundColor: group.color }} />}
                  {group.label}
                  <span className="font-normal text-muted-foreground">{group.tasks.length}</span>
                </h2>
              )}
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {group.tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    selected={selected.has(task.id)}
                    onSelect={() => toggleSelect(task.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}

      {visibleSelection.length > 0 && (
        <BulkBar ids={visibleSelection} onClear={() => setSelected(new Set())} />
      )}
    </div>
  )
}

function LabeledSelect({
  label,
  items,
  value,
  onChange,
}: {
  label: string
  items: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(v as string)}>
      <SelectTrigger aria-label={label} className="min-w-0">
        <span className="hidden text-muted-foreground sm:inline">{label} :</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function ListQuickAdd({ defaults }: { defaults: Parameters<ReturnType<typeof useCreateTask>["mutate"]>[0] }) {
  const [title, setTitle] = useState("")
  const createTask = useCreateTask()

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    createTask.mutate({ ...defaults, title: title.trim() })
    setTitle("")
  }

  return (
    <form onSubmit={submit} className="relative">
      <PlusIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Ajouter une tâche, puis Entrée"
        aria-label="Ajouter une tâche"
        maxLength={200}
        className="h-10 bg-card pl-9"
      />
    </form>
  )
}

function TaskRow({ task, selected, onSelect }: { task: Task; selected: boolean; onSelect: () => void }) {
  const openTask = useUi((s) => s.openTask)
  const updateTask = useUpdateTask()
  const done = task.status === "DONE"
  const overdue = isOverdue(task.dueDate, task.status)
  const subtasksDone = task.subtasks.filter((s) => s.done).length

  return (
    <li
      className={cn(
        "group flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/50",
        selected && "bg-primary/5",
      )}
      onClick={() => openTask(task.id)}
    >
      <span onClick={(e) => e.stopPropagation()} className="flex">
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          aria-label={`Sélectionner « ${task.title} »`}
          className={cn("opacity-40 group-hover:opacity-100 focus-visible:opacity-100", selected && "opacity-100")}
        />
      </span>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          updateTask.mutate({ id: task.id, status: done ? "TODO" : "DONE" })
        }}
        aria-label={done ? "Marquer comme à faire" : "Marquer comme faite"}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition",
          done ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40 hover:border-emerald-500",
        )}
      >
        {done && <CheckIcon className="size-3" strokeWidth={3} />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <span className={cn("min-w-0 truncate font-medium", done && "text-muted-foreground line-through")}>
          {task.title}
        </span>

        <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {task.status === "IN_PROGRESS" && (
            <span className="flex items-center gap-1">
              <span className={cn("size-1.5 rounded-full", statusDotStyles.IN_PROGRESS)} />
              {statusLabels.IN_PROGRESS}
            </span>
          )}
          {task.subtasks.length > 0 && (
            <span className="flex items-center gap-1">
              <ListChecksIcon className="size-3.5" />
              {subtasksDone}/{task.subtasks.length}
            </span>
          )}
          {task.description && <AlignLeftIcon className="size-3.5" aria-label="A une description" />}
          {task.recurrenceRule && <RepeatIcon className="size-3.5" aria-label="Récurrente" />}
          {task.tags.map((tag) => (
            <span
              key={tag.id}
              className="rounded px-1.5 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: `${tag.color}22`, color: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </span>
      </div>

      {task.project && (
        <span className="hidden max-w-32 shrink-0 items-center gap-1.5 text-xs text-muted-foreground md:flex">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: task.project.color }} />
          <span className="truncate">{task.project.name}</span>
        </span>
      )}

      <span className={cn("hidden w-20 shrink-0 justify-center rounded px-1.5 py-0.5 text-[11px] font-medium sm:flex", priorityStyles[task.priority])}>
        {priorityLabels[task.priority]}
      </span>

      <span
        className={cn(
          "flex w-24 shrink-0 items-center justify-end gap-1 text-xs text-muted-foreground",
          overdue && "font-medium text-destructive",
        )}
      >
        {task.dueDate && (
          <>
            <CalendarIcon className="size-3.5" />
            {formatDue(task.dueDate)}
          </>
        )}
      </span>
    </li>
  )
}

function BulkBar({ ids, onClear }: { ids: string[]; onClear: () => void }) {
  const { update, remove } = useBulkTasks()
  const n = ids.length

  return (
    <div
      role="toolbar"
      aria-label="Actions sur la sélection"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-xl flex-wrap items-center gap-2 rounded-xl border bg-popover p-2 pl-4 text-sm shadow-lg md:left-64"
    >
      <span className="font-medium">
        {n} sélectionnée{n > 1 ? "s" : ""}
      </span>
      <div className="ml-auto flex flex-wrap gap-1">
        <Button size="sm" variant="outline" onClick={() => update.mutate({ ids, data: { status: "DONE" } }, { onSuccess: onClear })}>
          <CheckIcon /> Terminer
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
            <CircleIcon /> Statut <ChevronDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-36">
            {(["TODO", "IN_PROGRESS", "DONE"] as const).map((s) => (
              <DropdownMenuItem key={s} onClick={() => update.mutate({ ids, data: { status: s } }, { onSuccess: onClear })}>
                <span className={cn("size-2 rounded-full", statusDotStyles[s])} /> {statusLabels[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button size="sm" variant="outline" />}>
            <FlagIcon /> Priorité <ChevronDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-36">
            {PRIORITIES.map((p) => (
              <DropdownMenuItem key={p} onClick={() => update.mutate({ ids, data: { priority: p } }, { onSuccess: onClear })}>
                {priorityLabels[p]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button size="sm" variant="destructive" onClick={() => remove.mutate(ids, { onSuccess: onClear })}>
          <Trash2Icon /> Supprimer
        </Button>
        <Button size="icon-sm" variant="ghost" onClick={onClear} aria-label="Annuler la sélection">
          <XIcon />
        </Button>
      </div>
    </div>
  )
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
      {filtered ? <SearchXIcon className="size-6" /> : <CheckIcon className="size-6" />}
      {filtered ? "Aucune tâche ne correspond à ta recherche ou à tes filtres." : "Rien à faire ici. Profite !"}
    </div>
  )
}
