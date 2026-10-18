import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Priority, TaskInput, TaskStatus } from "@/lib/types"

export type Theme = "light" | "dark" | "system"

export type ListSort = "position" | "dueDate" | "priority" | "createdAt" | "title"
export type ListGroup = "none" | "status" | "dueDate" | "project" | "priority"
export type ListStatusFilter = "open" | "all" | TaskStatus

interface UiState {
  theme: Theme
  setTheme: (theme: Theme) => void

  // Recherche et filtres de l'en-tête
  search: string
  setSearch: (search: string) => void
  priorityFilter: Priority[]
  togglePriority: (priority: Priority) => void
  tagFilter: string[]
  toggleTag: (tagId: string) => void
  clearFilters: () => void

  // Préférences de la vue Liste (conservées d'une visite à l'autre)
  listSort: ListSort
  listOrder: "asc" | "desc"
  listGroup: ListGroup
  listStatus: ListStatusFilter
  setListPrefs: (prefs: Partial<Pick<UiState, "listSort" | "listOrder" | "listGroup" | "listStatus">>) => void

  // Fenêtre de tâche : null = fermée, "new" = création (avec valeurs pré-remplies), sinon id de la tâche
  taskDialog: { mode: "new"; defaults?: TaskInput } | { mode: "edit"; id: string } | null
  openNewTask: (defaults?: TaskInput) => void
  openTask: (id: string) => void
  closeTaskDialog: () => void

  mobileSidebarOpen: boolean
  setMobileSidebarOpen: (open: boolean) => void
}

const toggle = <T,>(list: T[], value: T) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme) => set({ theme }),

      search: "",
      setSearch: (search) => set({ search }),
      priorityFilter: [],
      togglePriority: (p) => set((s) => ({ priorityFilter: toggle(s.priorityFilter, p) })),
      tagFilter: [],
      toggleTag: (id) => set((s) => ({ tagFilter: toggle(s.tagFilter, id) })),
      clearFilters: () => set({ search: "", priorityFilter: [], tagFilter: [] }),

      listSort: "dueDate",
      listOrder: "asc",
      listGroup: "dueDate",
      listStatus: "open",
      setListPrefs: (prefs) => set(prefs),

      taskDialog: null,
      openNewTask: (defaults) => set({ taskDialog: { mode: "new", defaults } }),
      openTask: (id) => set({ taskDialog: { mode: "edit", id } }),
      closeTaskDialog: () => set({ taskDialog: null }),

      mobileSidebarOpen: false,
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
    }),
    {
      name: "todolist-ui",
      partialize: (s) => ({
        theme: s.theme,
        listSort: s.listSort,
        listOrder: s.listOrder,
        listGroup: s.listGroup,
        listStatus: s.listStatus,
      }),
    },
  ),
)
