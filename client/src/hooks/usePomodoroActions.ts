import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { DURATIONS, LONG_BREAK_EVERY, pomodoroLabels, usePomodoro, type PomodoroType } from "@/stores/pomodoro"

interface Session {
  id: string
}

// Petit « ding » généré avec Web Audio (aucun fichier son à charger)
function ding() {
  try {
    const ctx = new AudioContext()
    const notes = [880, 1320]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      osc.type = "sine"
      const start = ctx.currentTime + i * 0.18
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.65)
    })
  } catch {
    // Son indisponible : la notification visuelle suffit
  }
}

export function usePomodoroActions() {
  const qc = useQueryClient()

  async function start(type: PomodoroType = "WORK", task?: { id: string; title: string } | null) {
    const { active, setActive } = usePomodoro.getState()
    if (active) await stop(false)
    const durationMin = DURATIONS[type]
    try {
      const { session } = await api.post<{ session: Session }>("/pomodoros", {
        type,
        durationMin,
        taskId: type === "WORK" ? (task?.id ?? null) : null,
      })
      setActive({
        sessionId: session.id,
        type,
        durationMin,
        taskId: task?.id ?? null,
        taskTitle: task?.title ?? null,
        endsAt: Date.now() + durationMin * 60_000,
        pausedRemainingMs: null,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de démarrer le minuteur")
    }
  }

  // completed = arrivé au bout ; sinon interrompu
  async function stop(completed: boolean) {
    const { active, setActive } = usePomodoro.getState()
    if (!active) return
    setActive(null)
    try {
      await api.patch(`/pomodoros/${active.sessionId}`, { completed })
    } catch {
      // Session déjà close (autre onglet) : rien à faire
    }
    qc.invalidateQueries({ queryKey: ["stats"] })
    qc.invalidateQueries({ queryKey: ["pomodoros"] })
  }

  /*
   * Fin de session puis proposition de l'étape suivante.
   * completed = arrivée au bout du temps ; false = « Passer » (seul le temps réellement écoulé est compté).
   */
  async function finish(completed = true) {
    const { active, completedWork, incrementWork } = usePomodoro.getState()
    if (!active) return
    const task = active.taskId ? { id: active.taskId, title: active.taskTitle ?? "" } : null
    await stop(completed)
    if (completed) ding()

    let next: PomodoroType = "WORK"
    if (active.type === "WORK") {
      const done = completed ? completedWork + 1 : completedWork
      if (completed) incrementWork()
      next = done > 0 && done % LONG_BREAK_EVERY === 0 ? "LONG_BREAK" : "SHORT_BREAK"
    }

    const title =
      active.type === "WORK" ? (completed ? "Session terminée, bravo !" : "Session passée") : "Fin de la pause"
    const body = `Suivant : ${pomodoroLabels[next].toLowerCase()} (${DURATIONS[next]} min)`
    if (completed && "Notification" in window && Notification.permission === "granted") {
      new Notification(`🍅 ${title}`, { body, tag: "pomodoro", icon: "/favicon.svg" })
    }
    toast.success(title, {
      description: body,
      duration: 20_000,
      action: { label: "Démarrer", onClick: () => start(next, next === "WORK" ? task : null) },
    })
  }

  return { start, stop, finish }
}
