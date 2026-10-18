import { useState } from "react"
import { differenceInCalendarDays, addDays, format } from "date-fns"
import { fr } from "date-fns/locale"
import { ArchiveIcon, ArchiveRestoreIcon, RotateCcwIcon, Trash2Icon, XCircleIcon } from "lucide-react"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useScope } from "@/hooks/useScope"
import { priorityLabels, priorityStyles } from "@/lib/labels"
import {
  useDeleteTask,
  useEmptyTrash,
  usePermanentDelete,
  useRestoreTask,
  useTasks,
  useUpdateTask,
} from "@/lib/queries"
import type { Task } from "@/lib/types"
import { stagger } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { useUi } from "@/stores/ui"

// Doit rester aligné avec TRASH_RETENTION_DAYS côté serveur
const RETENTION_DAYS = 30

type Kind = "trash" | "archived"

const copy = {
  trash: {
    icon: Trash2Icon,
    intro: `Les tâches de la corbeille sont supprimées définitivement au bout de ${RETENTION_DAYS} jours.`,
    empty: "La corbeille est vide.",
  },
  archived: {
    icon: ArchiveIcon,
    intro: "Les tâches archivées n'apparaissent plus dans tes vues, mais restent consultables ici.",
    empty: "Aucune tâche archivée. Archive les tâches terminées depuis la colonne « Fait » du Kanban.",
  },
}

// Page commune à la Corbeille et aux Archives
export function BinPage({ kind }: { kind: Kind }) {
  const { filters } = useScope()
  const { data: tasks, isLoading } = useTasks({
    view: kind,
    q: filters.q,
    priority: filters.priority,
    tagId: filters.tagId,
    sort: "updatedAt",
    order: "desc",
  })
  const emptyTrash = useEmptyTrash()
  const [confirmEmpty, setConfirmEmpty] = useState(false)
  const t = copy[kind]
  const Icon = t.icon

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-muted-foreground">{t.intro}</p>
        {kind === "trash" && !!tasks?.length && (
          <Button variant="destructive" onClick={() => setConfirmEmpty(true)}>
            <XCircleIcon /> Vider la corbeille
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : !tasks?.length ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          <Icon className="size-6" />
          {filters.q ? "Aucune tâche ne correspond à ta recherche." : t.empty}
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {tasks.map((task, i) => (
            <BinRow key={task.id} task={task} kind={kind} index={i} />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmEmpty}
        onOpenChange={setConfirmEmpty}
        title="Vider la corbeille ?"
        description={`${tasks?.length ?? 0} tâche(s) seront supprimées définitivement. Cette action est irréversible.`}
        confirmLabel="Vider"
        onConfirm={() => emptyTrash.mutate()}
      />
    </div>
  )
}

function BinRow({ task, kind, index }: { task: Task; kind: Kind; index: number }) {
  const openTask = useUi((s) => s.openTask)
  const restore = useRestoreTask()
  const permanentDelete = usePermanentDelete()
  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const since = kind === "trash" ? task.deletedAt! : task.archivedAt!
  const daysLeft = RETENTION_DAYS - differenceInCalendarDays(new Date(), new Date(since))

  return (
    <li
      style={stagger(index, 35)}
      className="flex animate-in flex-wrap items-center gap-3 px-4 py-3 text-sm duration-300 fill-mode-backwards fade-in slide-in-from-left-2"
    >
      <button type="button" onClick={() => openTask(task.id)} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
        <span className={cn("max-w-full truncate font-medium hover:underline", task.status === "DONE" && "line-through")}>
          {task.title}
        </span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {task.project && (
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full" style={{ backgroundColor: task.project.color }} />
              {task.project.name}
            </span>
          )}
          <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", priorityStyles[task.priority])}>
            {priorityLabels[task.priority]}
          </span>
          <span>
            {kind === "trash" ? "Supprimée" : "Archivée"} le {format(new Date(since), "d MMM yyyy", { locale: fr })}
          </span>
          {kind === "trash" && (
            <span className={cn(daysLeft <= 3 && "font-medium text-destructive")}>
              · effacée {daysLeft <= 0 ? "bientôt" : `le ${format(addDays(new Date(since), RETENTION_DAYS), "d MMM", { locale: fr })}`}
            </span>
          )}
        </span>
      </button>

      <div className="flex gap-1">
        {kind === "trash" ? (
          <>
            <Button size="sm" variant="outline" onClick={() => restore.mutate(task.id)}>
              <RotateCcwIcon /> Restaurer
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2Icon /> Supprimer
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => updateTask.mutate({ id: task.id, archived: false })}>
              <ArchiveRestoreIcon /> Désarchiver
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteTask.mutate(task)}>
              <Trash2Icon /> Corbeille
            </Button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Supprimer définitivement ?"
        description={`« ${task.title} » sera effacée pour de bon. Cette action est irréversible.`}
        onConfirm={() => permanentDelete.mutate(task.id)}
      />
    </li>
  )
}
