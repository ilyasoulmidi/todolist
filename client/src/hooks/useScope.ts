import { useMemo } from "react"
import { useLocation, useSearchParams } from "react-router"
import { smartViewFilters, smartViewLabels, toDueIso, type SmartView } from "@/lib/dates"
import { useProjects, useTags } from "@/lib/queries"
import type { TaskFilters, TaskInput } from "@/lib/types"
import { useUi } from "@/stores/ui"

// Périmètre affiché, lu depuis l'URL (?vue=today, ?liste=<id>, ?etiquette=<id>) + filtres de l'en-tête
export function useScope() {
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const { data: projects } = useProjects()
  const { data: tags } = useTags()
  const search = useUi((s) => s.search)
  const priorityFilter = useUi((s) => s.priorityFilter)
  const tagFilter = useUi((s) => s.tagFilter)

  const view = (params.get("vue") as SmartView | null) ?? "all"
  const projectId = params.get("liste")
  const tagId = params.get("etiquette")

  return useMemo(() => {
    let title = smartViewLabels[view] ?? smartViewLabels.all
    let color: string | undefined
    let filters: TaskFilters = {}

    if (projectId) {
      const project = projects?.find((p) => p.id === projectId)
      title = projectId === "none" ? "Sans liste" : (project?.name ?? "Liste")
      color = project?.color
      filters.projectId = projectId
    } else if (tagId) {
      const tag = tags?.find((t) => t.id === tagId)
      title = tag ? `#${tag.name}` : "Étiquette"
      color = tag?.color
      filters.tagId = [tagId]
    } else {
      filters = smartViewFilters(view in smartViewLabels ? view : "all")
    }

    const tagIds = [...(filters.tagId ?? []), ...tagFilter.filter((id) => id !== tagId)]
    filters = {
      ...filters,
      q: search.trim() || undefined,
      priority: priorityFilter.length ? priorityFilter : undefined,
      tagId: tagIds.length ? tagIds : undefined,
    }

    // Valeurs pré-remplies d'une tâche créée depuis ce périmètre
    const defaults: TaskInput = {}
    if (projectId && projectId !== "none") defaults.projectId = projectId
    if (tagId) defaults.tagIds = [tagId]
    if (!projectId && !tagId && view === "today") defaults.dueDate = toDueIso(new Date())

    if (pathname.startsWith("/corbeille")) title = "Corbeille"
    else if (pathname.startsWith("/archives")) title = "Archives"

    return { title, color, filters, defaults, view, projectId, tagId }
  }, [view, projectId, tagId, projects, tags, search, priorityFilter, tagFilter, pathname])
}
