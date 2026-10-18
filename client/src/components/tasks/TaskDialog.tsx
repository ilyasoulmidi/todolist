import { useEffect, useState, type FormEvent } from "react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { fr as dayPickerFr } from "react-day-picker/locale"
import { ArchiveIcon, ArchiveRestoreIcon, CalendarIcon, CopyIcon, Loader2Icon, PlusIcon, RotateCcwIcon, Trash2Icon, XIcon } from "lucide-react"
import { RecurrencePicker, ReminderPicker } from "./SchedulePickers"
import { usePomodoroActions } from "@/hooks/usePomodoroActions"
import { usePomodoro } from "@/stores/pomodoro"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useScope } from "@/hooks/useScope"
import { formatLong, fromDueIso, isOverdue, toDueIso } from "@/lib/dates"
import { PRIORITIES, priorityLabels, STATUSES, statusLabels } from "@/lib/labels"
import {
  useCreateTask,
  useDeleteTask,
  useDuplicateTask,
  useProjects,
  useRestoreTask,
  useSubtaskMutations,
  useTags,
  useTask,
  useTaskPomodoros,
  useUpdateTask,
} from "@/lib/queries"
import type { Priority, Task, TaskInput, TaskStatus } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useUi } from "@/stores/ui"

export function TaskDialog() {
  const dialog = useUi((s) => s.taskDialog)
  const close = useUi((s) => s.closeTaskDialog)

  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90svh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        {dialog?.mode === "new" && <NewTaskForm initial={dialog.defaults} onDone={close} />}
        {dialog?.mode === "edit" && <EditTask id={dialog.id} onDone={close} />}
      </DialogContent>
    </Dialog>
  )
}

// --- Création ---

function NewTaskForm({ initial, onDone }: { initial?: TaskInput; onDone: () => void }) {
  const { defaults } = useScope()
  const createTask = useCreateTask()
  const [values, setValues] = useState<TaskInput>({ priority: "MEDIUM", status: "TODO", ...defaults, ...initial })
  const [subtasks, setSubtasks] = useState<string[]>([])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!values.title?.trim()) return
    await createTask.mutateAsync({ ...values, subtasks })
    onDone()
  }

  return (
    <form onSubmit={submit}>
      <DialogHeader className="border-b p-4">
        <DialogTitle>Nouvelle tâche</DialogTitle>
        <DialogDescription className="sr-only">Renseigne les informations de la tâche</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 p-4">
        <Input
          autoFocus
          value={values.title ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))}
          placeholder="Que faut-il faire ?"
          aria-label="Titre"
          maxLength={200}
          className="h-10 text-base"
        />
        <TaskFields values={values} onChange={(patch) => setValues((v) => ({ ...v, ...patch }))} />
        <DescriptionField
          value={values.description ?? ""}
          onCommit={(description) => setValues((v) => ({ ...v, description }))}
          live
        />
        <div className="flex flex-col gap-2">
          <Label>Sous-tâches</Label>
          {subtasks.map((title, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <Checkbox disabled />
              <span className="flex-1">{title}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Retirer"
                onClick={() => setSubtasks((list) => list.filter((_, j) => j !== i))}
              >
                <XIcon />
              </Button>
            </div>
          ))}
          <AddSubtaskInput onAdd={(title) => setSubtasks((list) => [...list, title])} />
        </div>
      </div>

      <DialogFooter className="m-0 border-t p-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Annuler
        </Button>
        <Button type="submit" disabled={!values.title?.trim() || createTask.isPending}>
          {createTask.isPending && <Loader2Icon className="animate-spin" />}
          Créer la tâche
        </Button>
      </DialogFooter>
    </form>
  )
}

// --- Édition (chaque modification est enregistrée immédiatement) ---

function EditTask({ id, onDone }: { id: string; onDone: () => void }) {
  const { data: task, isLoading, isError } = useTask(id)

  if (isLoading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <DialogTitle className="sr-only">Chargement</DialogTitle>
        <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (isError || !task) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        <DialogTitle className="mb-2">Tâche introuvable</DialogTitle>
        Elle a peut-être été supprimée.
      </div>
    )
  }
  return <EditTaskForm task={task} onDone={onDone} />
}

function EditTaskForm({ task, onDone }: { task: Task; onDone: () => void }) {
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const duplicateTask = useDuplicateTask()
  const restoreTask = useRestoreTask()
  const subtaskMutations = useSubtaskMutations(task.id)
  const [title, setTitle] = useState(task.title)

  useEffect(() => setTitle(task.title), [task.title])

  const save = (patch: TaskInput) => updateTask.mutate({ id: task.id, ...patch })
  const commitTitle = () => {
    const value = title.trim()
    if (value && value !== task.title) save({ title: value })
    else setTitle(task.title)
  }

  const done = task.subtasks.filter((s) => s.done).length

  return (
    <>
      <DialogHeader className="border-b p-4 pr-12">
        <DialogTitle className="sr-only">Modifier la tâche</DialogTitle>
        <DialogDescription className="sr-only">Les modifications sont enregistrées automatiquement</DialogDescription>
        <div className="flex items-start gap-3">
          <Checkbox
            className="mt-2.5"
            checked={task.status === "DONE"}
            onCheckedChange={(checked) => save({ status: checked ? "DONE" : "TODO" })}
            aria-label="Terminée"
          />
          <Textarea
            value={title}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
            aria-label="Titre"
            maxLength={200}
            rows={1}
            className={cn(
              "min-h-0 resize-none border-transparent bg-transparent px-2 text-lg font-semibold shadow-none hover:border-input focus-visible:border-ring dark:bg-transparent",
              task.status === "DONE" && "text-muted-foreground line-through",
            )}
          />
        </div>
      </DialogHeader>

      <div className="flex flex-col gap-5 p-4">
        {(task.deletedAt || task.archivedAt) && (
          <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            {task.deletedAt ? <Trash2Icon className="size-4" /> : <ArchiveIcon className="size-4" />}
            <span className="flex-1">
              {task.deletedAt
                ? `Dans la corbeille depuis le ${format(new Date(task.deletedAt), "d MMM", { locale: fr })}`
                : `Archivée le ${format(new Date(task.archivedAt!), "d MMM", { locale: fr })}`}
            </span>
            {task.deletedAt ? (
              <Button size="sm" variant="outline" onClick={() => restoreTask.mutate(task.id)}>
                <RotateCcwIcon /> Restaurer
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => save({ archived: false })}>
                <ArchiveRestoreIcon /> Désarchiver
              </Button>
            )}
          </div>
        )}
        <TaskFields
          values={{
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate,
            projectId: task.projectId,
            tagIds: task.tags.map((t) => t.id),
            recurrenceRule: task.recurrenceRule,
            reminderAt: task.reminderAt,
          }}
          onChange={save}
          overdue={isOverdue(task.dueDate, task.status)}
        />

        <DescriptionField value={task.description ?? ""} onCommit={(description) => save({ description })} />

        {!task.deletedAt && !task.archivedAt && task.status !== "DONE" && <FocusSection task={task} />}

        <div className="flex flex-col gap-2">
          <Label>
            Sous-tâches
            {task.subtasks.length > 0 && (
              <span className="font-normal text-muted-foreground">
                {done}/{task.subtasks.length}
              </span>
            )}
          </Label>
          {task.subtasks.length > 0 && (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${(done / task.subtasks.length) * 100}%` }}
              />
            </div>
          )}
          {task.subtasks.map((subtask) => (
            <div key={subtask.id} className="group flex items-center gap-2 text-sm">
              <Checkbox
                checked={subtask.done}
                onCheckedChange={(checked) => subtaskMutations.update.mutate({ id: subtask.id, done: !!checked })}
                aria-label={`Terminer « ${subtask.title} »`}
              />
              <SubtaskTitle
                title={subtask.title}
                done={subtask.done}
                onCommit={(value) => subtaskMutations.update.mutate({ id: subtask.id, title: value })}
              />
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label="Supprimer la sous-tâche"
                onClick={() => subtaskMutations.remove.mutate(subtask.id)}
              >
                <XIcon />
              </Button>
            </div>
          ))}
          <AddSubtaskInput onAdd={(value) => subtaskMutations.add.mutate(value)} />
        </div>
      </div>

      <DialogFooter className="m-0 flex-row items-center border-t p-4 sm:justify-between">
        <p className="mr-auto text-xs text-muted-foreground">
          Créée le {format(new Date(task.createdAt), "d MMM yyyy", { locale: fr })}
          {task.completedAt && ` · terminée le ${format(new Date(task.completedAt), "d MMM", { locale: fr })}`}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => duplicateTask.mutate(task.id)}>
            <CopyIcon /> Dupliquer
          </Button>
          {!task.archivedAt && !task.deletedAt && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                save({ archived: true })
                onDone()
              }}
            >
              <ArchiveIcon /> Archiver
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              deleteTask.mutate(task)
              onDone()
            }}
          >
            <Trash2Icon /> Supprimer
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}

// Lancement d'un Pomodoro sur la tâche + temps de concentration déjà passé dessus
function FocusSection({ task }: { task: Task }) {
  const { data: sessions = [] } = useTaskPomodoros(task.id)
  const { start } = usePomodoroActions()
  const activeTaskId = usePomodoro((s) => s.active?.taskId)
  const work = sessions.filter((s) => s.type === "WORK" && s.endedAt)
  const minutes = work.reduce((sum, s) => sum + s.durationMin, 0)
  const done = work.filter((s) => s.completed).length

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
      <span className="text-lg" aria-hidden>
        🍅
      </span>
      <span className="flex-1 text-muted-foreground">
        {minutes > 0
          ? `${done} session${done > 1 ? "s" : ""} terminée${done > 1 ? "s" : ""} · ${minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`} de concentration`
          : "Aucune session de concentration sur cette tâche"}
      </span>
      <Button
        size="sm"
        variant={activeTaskId === task.id ? "outline" : "default"}
        disabled={activeTaskId === task.id}
        onClick={() => start("WORK", { id: task.id, title: task.title })}
      >
        {activeTaskId === task.id ? "En cours…" : "Lancer un Pomodoro"}
      </Button>
    </div>
  )
}

// --- Champs partagés ---

function TaskFields({
  values,
  onChange,
  overdue,
}: {
  values: TaskInput
  onChange: (patch: TaskInput) => void
  overdue?: boolean
}) {
  const { data: projects = [] } = useProjects()
  const { data: tags = [] } = useTags()
  const tagIds = values.tagIds ?? []

  const statusItems = STATUSES.map((s) => ({ value: s, label: statusLabels[s] }))
  const priorityItems = PRIORITIES.map((p) => ({ value: p, label: priorityLabels[p] }))
  const projectItems = [{ value: "none", label: "Sans liste" }, ...projects.map((p) => ({ value: p.id, label: p.name }))]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <FieldRow label="Statut">
        <Select items={statusItems} value={values.status ?? "TODO"} onValueChange={(v) => v && onChange({ status: v as TaskStatus })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {statusItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      <FieldRow label="Priorité">
        <Select items={priorityItems} value={values.priority ?? "MEDIUM"} onValueChange={(v) => v && onChange({ priority: v as Priority })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {priorityItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      <FieldRow label="Échéance">
        <DueDatePicker value={values.dueDate ?? null} onChange={(dueDate) => onChange({ dueDate })} overdue={overdue} />
      </FieldRow>

      <FieldRow label="Répétition">
        <RecurrencePicker
          value={values.recurrenceRule ?? null}
          dueDate={values.dueDate ?? null}
          onChange={(recurrenceRule) => onChange({ recurrenceRule })}
        />
      </FieldRow>

      <FieldRow label="Rappel">
        <ReminderPicker
          value={values.reminderAt ?? null}
          dueDate={values.dueDate ?? null}
          onChange={(reminderAt) => onChange({ reminderAt })}
        />
      </FieldRow>

      <FieldRow label="Liste">
        <Select
          items={projectItems}
          value={values.projectId ?? "none"}
          onValueChange={(v) => onChange({ projectId: v === "none" ? null : (v as string) })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {projectItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label>Étiquettes</Label>
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">Crée des étiquettes depuis la barre latérale.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => {
              const active = tagIds.includes(tag.id)
              return (
                <button
                  key={tag.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onChange({ tagIds: active ? tagIds.filter((id) => id !== tag.id) : [...tagIds, tag.id] })
                  }
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs font-medium transition",
                    !active && "text-muted-foreground hover:border-foreground/30",
                  )}
                  style={active ? { backgroundColor: `${tag.color}22`, borderColor: tag.color, color: tag.color } : undefined}
                >
                  {tag.name}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function DueDatePicker({
  value,
  onChange,
  overdue,
}: {
  value: string | null
  onChange: (value: string | null) => void
  overdue?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = value ? fromDueIso(value) : undefined

  return (
    <div className="flex gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              className={cn("flex-1 justify-start font-normal", !value && "text-muted-foreground", overdue && "text-destructive")}
            />
          }
        >
          <CalendarIcon />
          {value ? formatLong(value) : "Aucune échéance"}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            locale={dayPickerFr}
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              onChange(date ? toDueIso(date) : null)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      {value && (
        <Button variant="ghost" size="icon" aria-label="Retirer l'échéance" onClick={() => onChange(null)}>
          <XIcon />
        </Button>
      )}
    </div>
  )
}

function DescriptionField({
  value,
  onCommit,
  live = false,
}: {
  value: string
  onCommit: (value: string | null) => void
  live?: boolean
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="task-description">Description</Label>
      <Textarea
        id="task-description"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          if (live) onCommit(e.target.value || null)
        }}
        onBlur={() => !live && text !== value && onCommit(text.trim() ? text : null)}
        placeholder="Ajoute des détails, des liens, des notes…"
        rows={4}
        maxLength={5000}
      />
    </div>
  )
}

function SubtaskTitle({ title, done, onCommit }: { title: string; done: boolean; onCommit: (value: string) => void }) {
  const [value, setValue] = useState(title)
  useEffect(() => setValue(title), [title])

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const v = value.trim()
        if (v && v !== title) onCommit(v)
        else setValue(title)
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      aria-label="Titre de la sous-tâche"
      maxLength={200}
      className={cn(
        "flex-1 rounded bg-transparent px-1 py-0.5 outline-none hover:bg-muted focus:bg-muted",
        done && "text-muted-foreground line-through",
      )}
    />
  )
}

function AddSubtaskInput({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState("")

  return (
    <div className="flex items-center gap-2">
      <PlusIcon className="size-4 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            // Ne soumet pas le formulaire de création
            e.preventDefault()
            if (value.trim()) {
              onAdd(value.trim())
              setValue("")
            }
          }
        }}
        placeholder="Ajouter une sous-tâche, puis Entrée"
        aria-label="Nouvelle sous-tâche"
        maxLength={200}
        className="flex-1 rounded bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground hover:bg-muted focus:bg-muted"
      />
    </div>
  )
}
