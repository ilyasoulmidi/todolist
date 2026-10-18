import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api, ApiError } from "./api"
import { formatLong } from "./dates"
import type { Project, Subtask, Tag, Task, TaskFilters, TaskInput, User } from "./types"

export const keys = {
  me: ["me"] as const,
  projects: ["projects"] as const,
  tags: ["tags"] as const,
  tasks: ["tasks"] as const,
  taskList: (filters: TaskFilters) => ["tasks", "list", filters] as const,
  task: (id: string) => ["tasks", "detail", id] as const,
}

function showError(error: unknown) {
  toast.error(error instanceof Error ? error.message : "Une erreur est survenue")
}

// --- Authentification ---

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return (await api.get<{ user: User }>("/auth/me")).user
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null
        throw e
      }
    },
    staleTime: Infinity,
    retry: false,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      api.post<{ user: User }>("/auth/login", data),
    onSuccess: ({ user }) => qc.setQueryData(keys.me, user),
  })
}

export function useRegister() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; email: string; password: string }) =>
      api.post<{ user: User }>("/auth/register", data),
    onSuccess: ({ user }) => qc.setQueryData(keys.me, user),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      qc.clear()
      qc.setQueryData(keys.me, null)
    },
  })
}

// --- Listes ---

export function useProjects() {
  return useQuery({
    queryKey: keys.projects,
    queryFn: async () => (await api.get<{ projects: Project[] }>("/projects")).projects,
  })
}

export function useSaveProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id?: string; name?: string; color?: string; archived?: boolean }) =>
      id
        ? api.patch<{ project: Project }>(`/projects/${id}`, data)
        : api.post<{ project: Project }>("/projects", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.tasks })
    },
    onError: showError,
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.projects })
      qc.invalidateQueries({ queryKey: keys.tasks })
    },
    onError: showError,
  })
}

// --- Étiquettes ---

export function useTags() {
  return useQuery({
    queryKey: keys.tags,
    queryFn: async () => (await api.get<{ tags: Tag[] }>("/tags")).tags,
  })
}

export function useSaveTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id?: string; name?: string; color?: string }) =>
      id ? api.patch<{ tag: Tag }>(`/tags/${id}`, data) : api.post<{ tag: Tag }>("/tags", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.tags })
      qc.invalidateQueries({ queryKey: keys.tasks })
    },
    onError: showError,
  })
}

export function useDeleteTag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tags/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.tags })
      qc.invalidateQueries({ queryKey: keys.tasks })
    },
    onError: showError,
  })
}

// --- Tâches ---

export function useTasks(filters: TaskFilters) {
  return useQuery({
    queryKey: keys.taskList(filters),
    queryFn: async () => (await api.get<{ tasks: Task[] }>("/tasks", { ...filters })).tasks,
    placeholderData: (previous) => previous,
  })
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: keys.task(id ?? ""),
    queryFn: async () => (await api.get<{ task: Task }>(`/tasks/${id}`)).task,
    enabled: !!id,
  })
}

// Applique une modification à toutes les copies en cache d'une tâche (listes + détail)
function patchCachedTask(qc: QueryClient, id: string, update: (task: Task) => Task | null) {
  qc.setQueriesData<Task[]>({ queryKey: ["tasks", "list"] }, (tasks) =>
    tasks?.flatMap((t) => {
      if (t.id !== id) return [t]
      const next = update(t)
      return next ? [next] : []
    }),
  )
  qc.setQueryData<Task>(keys.task(id), (task) => (task ? (update(task) ?? task) : task))
}

function invalidateAfterTaskChange(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: keys.tasks })
  qc.invalidateQueries({ queryKey: keys.projects })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TaskInput) => api.post<{ task: Task }>("/tasks", data),
    onSuccess: () => invalidateAfterTaskChange(qc),
    onError: showError,
  })
}

// Mise à jour optimiste : l'interface réagit tout de suite (glisser-déposer, cases à cocher…)
export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: TaskInput & { id: string }) =>
      api.patch<{ task: Task; nextTask: Task | null }>(`/tasks/${id}`, data),
    onSuccess: ({ nextTask }) => nextTask && announceNextOccurrence(nextTask),
    onMutate: async ({ id, ...data }) => {
      await qc.cancelQueries({ queryKey: keys.tasks })
      const snapshot = qc.getQueriesData({ queryKey: keys.tasks })
      const { tagIds, subtasks: _s, archived: _a, ...simple } = data
      const allTags = qc.getQueryData<Tag[]>(keys.tags) ?? []
      const projects = qc.getQueryData<Project[]>(keys.projects) ?? []
      patchCachedTask(qc, id, (task) => ({
        ...task,
        ...simple,
        tags: tagIds ? allTags.filter((t) => tagIds.includes(t.id)) : task.tags,
        project:
          data.projectId !== undefined
            ? (projects.find((p) => p.id === data.projectId) ?? null)
            : task.project,
        completedAt:
          data.status && data.status !== task.status
            ? data.status === "DONE"
              ? new Date().toISOString()
              : null
            : task.completedAt,
      }))
      return { snapshot }
    },
    onError: (error, _vars, context) => {
      context?.snapshot.forEach(([key, value]) => qc.setQueryData(key, value))
      showError(error)
    },
    onSettled: () => invalidateAfterTaskChange(qc),
  })
}

// Tâche récurrente terminée : l'API a créé la suivante
function announceNextOccurrence(task: Task) {
  toast.success("Prochaine occurrence créée", {
    description: task.dueDate ? `Échéance : ${formatLong(task.dueDate)}` : undefined,
  })
}

export function useRestoreTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<{ task: Task }>(`/tasks/${id}/restore`),
    onSuccess: () => {
      invalidateAfterTaskChange(qc)
      toast.success("Tâche restaurée")
    },
    onError: showError,
  })
}

export function usePermanentDelete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`, { permanent: true }),
    onSuccess: () => invalidateAfterTaskChange(qc),
    onError: showError,
  })
}

export function useEmptyTrash() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.delete<{ deleted: number }>("/tasks/trash"),
    onSuccess: ({ deleted }) => {
      invalidateAfterTaskChange(qc)
      toast.success(`${deleted} tâche${deleted > 1 ? "s" : ""} supprimée${deleted > 1 ? "s" : ""} définitivement`)
    },
    onError: showError,
  })
}

export function useArchiveDone() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (projectId?: string | null) =>
      api.post<{ archived: number }>("/tasks/archive-done", projectId !== undefined ? { projectId } : {}),
    onSuccess: ({ archived }) => {
      invalidateAfterTaskChange(qc)
      toast.success(
        archived ? `${archived} tâche${archived > 1 ? "s" : ""} archivée${archived > 1 ? "s" : ""}` : "Aucune tâche terminée à archiver",
      )
    },
    onError: showError,
  })
}

export function useDuplicateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.post<{ task: Task }>(`/tasks/${id}/duplicate`),
    onSuccess: () => {
      invalidateAfterTaskChange(qc)
      toast.success("Tâche dupliquée")
    },
    onError: showError,
  })
}

// Met la tâche à la corbeille et propose de l'annuler pendant quelques secondes
export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (task: Task) => api.delete(`/tasks/${task.id}`),
    onMutate: async (task) => {
      await qc.cancelQueries({ queryKey: keys.tasks })
      const snapshot = qc.getQueriesData({ queryKey: keys.tasks })
      patchCachedTask(qc, task.id, () => null)
      return { snapshot }
    },
    onSuccess: (_data, task) => {
      invalidateAfterTaskChange(qc)
      toast(`« ${task.title} » supprimée`, {
        // Laisse le temps de réagir (4 s par défaut)
        duration: 8000,
        action: {
          label: "Annuler",
          onClick: async () => {
            try {
              await api.post(`/tasks/${task.id}/restore`)
              invalidateAfterTaskChange(qc)
            } catch (e) {
              showError(e)
            }
          },
        },
      })
    },
    onError: (error, _task, context) => {
      context?.snapshot.forEach(([key, value]) => qc.setQueryData(key, value))
      showError(error)
    },
  })
}

// Actions groupées de la vue Liste (une requête par tâche, en parallèle)
export function useBulkTasks() {
  const qc = useQueryClient()

  const update = useMutation({
    mutationFn: ({ ids, data }: { ids: string[]; data: TaskInput }) =>
      Promise.all(ids.map((id) => api.patch<{ nextTask: Task | null }>(`/tasks/${id}`, data))),
    onSuccess: (results, { ids }) => {
      const next = results.filter((r) => r.nextTask).length
      toast.success(`${ids.length} tâche${ids.length > 1 ? "s" : ""} modifiée${ids.length > 1 ? "s" : ""}`, {
        description: next ? `${next} occurrence${next > 1 ? "s" : ""} suivante${next > 1 ? "s" : ""} créée${next > 1 ? "s" : ""}` : undefined,
      })
    },
    onError: showError,
    onSettled: () => invalidateAfterTaskChange(qc),
  })

  const remove = useMutation({
    mutationFn: (ids: string[]) => Promise.all(ids.map((id) => api.delete(`/tasks/${id}`))),
    onSuccess: (_r, ids) => {
      toast(`${ids.length} tâche${ids.length > 1 ? "s" : ""} supprimée${ids.length > 1 ? "s" : ""}`, {
        duration: 8000,
        action: {
          label: "Annuler",
          onClick: async () => {
            try {
              await Promise.all(ids.map((id) => api.post(`/tasks/${id}/restore`)))
            } catch (e) {
              showError(e)
            }
            invalidateAfterTaskChange(qc)
          },
        },
      })
    },
    onError: showError,
    onSettled: () => invalidateAfterTaskChange(qc),
  })

  return { update, remove }
}

// --- Sous-tâches ---

export function useSubtaskMutations(taskId: string) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: keys.tasks })
  const setSubtasks = (update: (subtasks: Subtask[]) => Subtask[]) =>
    patchCachedTask(qc, taskId, (task) => ({ ...task, subtasks: update(task.subtasks) }))

  const add = useMutation({
    mutationFn: (title: string) =>
      api.post<{ subtask: Subtask }>(`/tasks/${taskId}/subtasks`, { title }),
    onSuccess: ({ subtask }) => {
      setSubtasks((list) => [...list, subtask])
      refresh()
    },
    onError: showError,
  })

  const update = useMutation({
    mutationFn: ({ id, ...data }: { id: string; title?: string; done?: boolean }) =>
      api.patch<{ subtask: Subtask }>(`/tasks/${taskId}/subtasks/${id}`, data),
    onMutate: ({ id, ...data }) => setSubtasks((list) => list.map((s) => (s.id === id ? { ...s, ...data } : s))),
    onError: (e) => {
      showError(e)
      refresh()
    },
    onSettled: refresh,
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${taskId}/subtasks/${id}`),
    onMutate: (id) => setSubtasks((list) => list.filter((s) => s.id !== id)),
    onError: (e) => {
      showError(e)
      refresh()
    },
    onSettled: refresh,
  })

  return { add, update, remove }
}
