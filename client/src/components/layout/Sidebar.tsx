import { useState } from "react"
import { Link, useLocation, useSearchParams } from "react-router"
import {
  AlertTriangleIcon,
  CalendarDaysIcon,
  CalendarIcon,
  CheckSquareIcon,
  InboxIcon,
  KanbanIcon,
  ListIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SunIcon,
  TagIcon,
  Trash2Icon,
} from "lucide-react"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { NameColorDialog } from "@/components/NameColorDialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { SmartView } from "@/lib/dates"
import { useDeleteProject, useDeleteTag, useProjects, useSaveProject, useSaveTag, useTags } from "@/lib/queries"
import type { Project, Tag } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useUi } from "@/stores/ui"

const smartViews: { view: SmartView; label: string; icon: typeof InboxIcon }[] = [
  { view: "all", label: "Toutes les tâches", icon: InboxIcon },
  { view: "today", label: "Aujourd'hui", icon: SunIcon },
  { view: "week", label: "Cette semaine", icon: CalendarDaysIcon },
  { view: "overdue", label: "En retard", icon: AlertTriangleIcon },
]

// Liste et Calendrier arrivent à l'étape suivante
const views = [
  { path: "/kanban", label: "Kanban", icon: KanbanIcon, ready: true },
  { path: "/liste", label: "Liste", icon: ListIcon, ready: false },
  { path: "/calendrier", label: "Calendrier", icon: CalendarIcon, ready: false },
]

type Editing =
  | { kind: "project"; item?: Project }
  | { kind: "tag"; item?: Tag }
  | null

type Deleting = { kind: "project"; item: Project } | { kind: "tag"; item: Tag } | null

export function Sidebar() {
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const setMobileOpen = useUi((s) => s.setMobileSidebarOpen)
  const { data: projects = [] } = useProjects()
  const { data: tags = [] } = useTags()
  const saveProject = useSaveProject()
  const deleteProject = useDeleteProject()
  const saveTag = useSaveTag()
  const deleteTag = useDeleteTag()

  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<Deleting>(null)

  const basePath = views.find((v) => pathname.startsWith(v.path))?.path ?? "/kanban"
  const currentView = params.get("vue") ?? (params.get("liste") || params.get("etiquette") ? null : "all")
  const close = () => setMobileOpen(false)

  return (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto p-3 text-sm">
      <Link to="/" onClick={close} className="flex items-center gap-2 px-2 pt-1 text-base font-semibold">
        <CheckSquareIcon className="size-5 text-primary" />
        TodoList
      </Link>

      <Section title="Vues">
        {views.map(({ path, label, icon: Icon, ready }) =>
          ready ? (
            <NavItem key={path} to={`${path}?${params}`} active={basePath === path} onClick={close} icon={<Icon />}>
              {label}
            </NavItem>
          ) : (
            <div key={path} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground/60">
              <Icon className="size-4" />
              {label}
              <span className="ml-auto text-[10px] tracking-wide uppercase">bientôt</span>
            </div>
          ),
        )}
      </Section>

      <Section title="Filtres rapides">
        {smartViews.map(({ view, label, icon: Icon }) => (
          <NavItem
            key={view}
            to={view === "all" ? basePath : `${basePath}?vue=${view}`}
            active={currentView === view}
            onClick={close}
            icon={<Icon />}
          >
            {label}
          </NavItem>
        ))}
      </Section>

      <Section title="Listes" onAdd={() => setEditing({ kind: "project" })} addLabel="Nouvelle liste">
        {projects.map((project) => (
          <NavItem
            key={project.id}
            to={`${basePath}?liste=${project.id}`}
            active={params.get("liste") === project.id}
            onClick={close}
            icon={<span className="size-2.5 rounded-full" style={{ backgroundColor: project.color }} />}
            count={project.openTaskCount}
            menu={
              <ItemMenu
                onEdit={() => setEditing({ kind: "project", item: project })}
                onDelete={() => setDeleting({ kind: "project", item: project })}
              />
            }
          >
            {project.name}
          </NavItem>
        ))}
        <NavItem
          to={`${basePath}?liste=none`}
          active={params.get("liste") === "none"}
          onClick={close}
          icon={<InboxIcon />}
        >
          Sans liste
        </NavItem>
      </Section>

      <Section title="Étiquettes" onAdd={() => setEditing({ kind: "tag" })} addLabel="Nouvelle étiquette">
        {tags.length === 0 && <p className="px-2 text-xs text-muted-foreground">Aucune étiquette</p>}
        {tags.map((tag) => (
          <NavItem
            key={tag.id}
            to={`${basePath}?etiquette=${tag.id}`}
            active={params.get("etiquette") === tag.id}
            onClick={close}
            icon={<TagIcon style={{ color: tag.color }} />}
            menu={
              <ItemMenu
                onEdit={() => setEditing({ kind: "tag", item: tag })}
                onDelete={() => setDeleting({ kind: "tag", item: tag })}
              />
            }
          >
            {tag.name}
          </NavItem>
        ))}
      </Section>

      <NameColorDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={
          editing?.kind === "tag"
            ? editing.item ? "Modifier l'étiquette" : "Nouvelle étiquette"
            : editing?.item ? "Modifier la liste" : "Nouvelle liste"
        }
        submitLabel={editing?.item ? "Enregistrer" : "Créer"}
        initial={editing?.item}
        onSubmit={(values) =>
          editing?.kind === "tag"
            ? saveTag.mutateAsync({ id: editing.item?.id, ...values })
            : saveProject.mutateAsync({ id: editing?.item?.id, ...values })
        }
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={deleting?.kind === "tag" ? "Supprimer l'étiquette ?" : "Supprimer la liste ?"}
        description={
          deleting?.kind === "tag"
            ? `L'étiquette « ${deleting.item.name} » sera retirée de toutes les tâches.`
            : `La liste « ${deleting?.item.name} » sera supprimée. Ses tâches sont conservées dans « Sans liste ».`
        }
        onConfirm={() => {
          if (deleting?.kind === "tag") deleteTag.mutate(deleting.item.id)
          else if (deleting) deleteProject.mutate(deleting.item.id)
        }}
      />
    </nav>
  )
}

function Section({
  title,
  children,
  onAdd,
  addLabel,
}: {
  title: string
  children: React.ReactNode
  onAdd?: () => void
  addLabel?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex h-7 items-center justify-between px-2">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {onAdd && (
          <Button variant="ghost" size="icon-xs" onClick={onAdd} aria-label={addLabel} title={addLabel}>
            <PlusIcon />
          </Button>
        )}
      </div>
      {children}
    </div>
  )
}

function NavItem({
  to,
  active,
  icon,
  count,
  menu,
  onClick,
  children,
}: {
  to: string
  active: boolean
  icon: React.ReactNode
  count?: number
  menu?: React.ReactNode
  onClick?: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        "group/item flex items-center rounded-md transition-colors hover:bg-muted",
        active && "bg-muted font-medium text-foreground",
      )}
    >
      <Link
        to={to}
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
      >
        <span className="flex size-4 items-center justify-center">{icon}</span>
        <span className="truncate">{children}</span>
        {!!count && (
          <span className={cn("ml-auto text-xs text-muted-foreground", menu && "group-hover/item:hidden")}>{count}</span>
        )}
      </Link>
      {menu}
    </div>
  )
}

function ItemMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            className="mr-1 opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
            aria-label="Actions"
          />
        }
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onEdit}>
          <PencilIcon /> Modifier
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2Icon /> Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
