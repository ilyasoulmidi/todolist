export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE"
export type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT"

export interface User {
  id: string
  email: string
  name: string
  theme: string
  createdAt: string
}

export interface Project {
  id: string
  name: string
  color: string
  icon: string | null
  position: number
  archivedAt: string | null
  openTaskCount: number
}

export interface Tag {
  id: string
  name: string
  color: string
}

export interface Subtask {
  id: string
  title: string
  done: boolean
  position: number
  taskId: string
}

export interface Task {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  priority: Priority
  position: number
  dueDate: string | null
  allDay: boolean
  reminderAt: string | null
  reminded: boolean
  recurrenceRule: string | null
  recurrenceParentId: string | null
  completedAt: string | null
  archivedAt: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  projectId: string | null
  project: Pick<Project, "id" | "name" | "color"> | null
  tags: Tag[]
  subtasks: Subtask[]
}

export interface TaskInput {
  title?: string
  description?: string | null
  status?: TaskStatus
  priority?: Priority
  position?: number
  dueDate?: string | null
  allDay?: boolean
  reminderAt?: string | null
  recurrenceRule?: string | null
  projectId?: string | null
  tagIds?: string[]
  subtasks?: string[]
  archived?: boolean
}

export interface TaskFilters {
  view?: "active" | "archived" | "trash"
  projectId?: string
  tagId?: string[]
  priority?: Priority[]
  status?: TaskStatus[]
  q?: string
  dueFrom?: string
  dueTo?: string
  noDue?: boolean
  sort?: string
  order?: "asc" | "desc"
}
