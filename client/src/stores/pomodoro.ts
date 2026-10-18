import { create } from "zustand"
import { persist } from "zustand/middleware"

export type PomodoroType = "WORK" | "SHORT_BREAK" | "LONG_BREAK"

export const DURATIONS: Record<PomodoroType, number> = { WORK: 25, SHORT_BREAK: 5, LONG_BREAK: 15 }
// Une longue pause toutes les 4 sessions de concentration
export const LONG_BREAK_EVERY = 4

export const pomodoroLabels: Record<PomodoroType, string> = {
  WORK: "Concentration",
  SHORT_BREAK: "Pause courte",
  LONG_BREAK: "Pause longue",
}

export interface ActiveSession {
  sessionId: string
  type: PomodoroType
  durationMin: number
  taskId: string | null
  taskTitle: string | null
  // En cours : heure de fin prévue ; en pause : temps restant figé
  endsAt: number | null
  pausedRemainingMs: number | null
}

interface PomodoroState {
  active: ActiveSession | null
  completedWork: number
  setActive: (session: ActiveSession | null) => void
  pause: () => void
  resume: () => void
  incrementWork: () => void
}

// Persisté : le minuteur survit à un rechargement de page
export const usePomodoro = create<PomodoroState>()(
  persist(
    (set) => ({
      active: null,
      completedWork: 0,
      setActive: (active) => set({ active }),
      pause: () =>
        set(({ active }) =>
          active?.endsAt ? { active: { ...active, endsAt: null, pausedRemainingMs: Math.max(0, active.endsAt - Date.now()) } } : {},
        ),
      resume: () =>
        set(({ active }) =>
          active && active.pausedRemainingMs !== null
            ? { active: { ...active, endsAt: Date.now() + active.pausedRemainingMs, pausedRemainingMs: null } }
            : {},
        ),
      incrementWork: () => set((s) => ({ completedWork: s.completedWork + 1 })),
    }),
    { name: "todolist-pomodoro" },
  ),
)

export function remainingMs(session: ActiveSession, now = Date.now()) {
  if (session.pausedRemainingMs !== null) return session.pausedRemainingMs
  return Math.max(0, (session.endsAt ?? now) - now)
}

export function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000)
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}
