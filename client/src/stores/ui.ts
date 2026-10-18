import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Priority, TaskStatus } from "@/lib/types"

export type Theme = "light" | "dark" | "system"

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

  // Fenêtre de tâche : null = fermée, "new" = création, sinon id de la tâche
  taskDialog: { mode: "new"; status?: TaskStatus } | { mode: "edit"; id: string } | null
  openNewTask: (status?: TaskStatus) => void
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

      taskDialog: null,
      openNewTask: (status) => set({ taskDialog: { mode: "new", status } }),
      openTask: (id) => set({ taskDialog: { mode: "edit", id } }),
      closeTaskDialog: () => set({ taskDialog: null }),

      mobileSidebarOpen: false,
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
    }),
    // Seul le thème est conservé d'une visite à l'autre
    { name: "todolist-ui", partialize: (s) => ({ theme: s.theme }) },
  ),
)
