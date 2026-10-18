import { useEffect, useState } from "react"
import { CoffeeIcon, PauseIcon, PlayIcon, SkipForwardIcon, SquareIcon, TimerIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { usePomodoroActions } from "@/hooks/usePomodoroActions"
import { cn } from "@/lib/utils"
import { DURATIONS, formatClock, pomodoroLabels, remainingMs, usePomodoro, type PomodoroType } from "@/stores/pomodoro"
import { useUi } from "@/stores/ui"

// Minuteur flottant, visible sur toutes les pages tant qu'une session est active
export function PomodoroWidget() {
  const active = usePomodoro((s) => s.active)
  const { pause, resume } = usePomodoro()
  const { stop, finish } = usePomodoroActions()
  const openTask = useUi((s) => s.openTask)
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [active])

  const remaining = active ? remainingMs(active, now) : 0
  const running = !!active?.endsAt

  // Fin de session détectée ici (y compris au retour sur un onglet resté en arrière-plan)
  useEffect(() => {
    if (active && running && remaining <= 0) finish(true)
  }, [active, running, remaining, finish])

  // Le temps restant s'affiche aussi dans l'onglet du navigateur
  useEffect(() => {
    if (!active) return
    const previous = document.title
    document.title = `${formatClock(remaining)} · ${active.type === "WORK" ? "Concentration" : "Pause"} · TodoList`
    return () => {
      document.title = previous
    }
  }, [active, remaining])

  if (!active) return null

  const progress = 1 - remaining / (active.durationMin * 60_000)
  const isWork = active.type === "WORK"

  return (
    <div
      role="timer"
      aria-label={`${pomodoroLabels[active.type]} : ${formatClock(remaining)} restantes`}
      className="fixed right-4 bottom-4 z-40 flex w-[min(20rem,calc(100vw-2rem))] animate-in flex-col gap-2 rounded-xl border bg-popover p-3 shadow-lg duration-300 fade-in slide-in-from-bottom-4"
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            isWork ? "bg-red-100 dark:bg-red-950" : "bg-emerald-100 dark:bg-emerald-950",
          )}
        >
          {isWork ? (
            <TimerIcon className="size-5 text-red-600 dark:text-red-400" />
          ) : (
            <CoffeeIcon className="size-5 text-emerald-700 dark:text-emerald-300" />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-2xl font-semibold tabular-nums leading-none">{formatClock(remaining)}</span>
          <span className="truncate text-xs text-muted-foreground">
            {pomodoroLabels[active.type]}
            {!running && " · en pause"}
          </span>
        </div>
        <div className="flex gap-1">
          <Button
            size="icon-sm"
            variant="outline"
            onClick={running ? pause : resume}
            aria-label={running ? "Mettre en pause" : "Reprendre"}
          >
            {running ? <PauseIcon /> : <PlayIcon />}
          </Button>
          <Button size="icon-sm" variant="outline" onClick={() => finish(false)} aria-label="Passer à l'étape suivante" title="Passer">
            <SkipForwardIcon />
          </Button>
          <Button size="icon-sm" variant="ghost" onClick={() => stop(false)} aria-label="Arrêter" title="Arrêter">
            <SquareIcon />
          </Button>
        </div>
      </div>
      {active.taskTitle && (
        <button
          type="button"
          onClick={() => active.taskId && openTask(active.taskId)}
          className="truncate text-left text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Sur : {active.taskTitle}
        </button>
      )}
      <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", isWork ? "bg-red-500" : "bg-emerald-500")}
          style={{ width: `${Math.min(100, progress * 100)}%` }}
        />
      </div>
    </div>
  )
}

// Bouton de l'en-tête : démarrer une session sans tâche associée
export function PomodoroLauncher() {
  const active = usePomodoro((s) => s.active)
  const { start } = usePomodoroActions()
  const [open, setOpen] = useState(false)

  const launch = (type: PomodoroType) => {
    start(type)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" aria-label="Minuteur Pomodoro" title="Minuteur Pomodoro" />}>
        <TimerIcon className={cn(active && "text-red-500")} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60">
        <p className="text-sm font-semibold">Minuteur Pomodoro</p>
        <p className="text-xs text-muted-foreground">
          Travaille par sessions de {DURATIONS.WORK} min, puis fais une pause. Lance-le depuis une tâche pour suivre le temps passé dessus.
        </p>
        {(["WORK", "SHORT_BREAK", "LONG_BREAK"] as const).map((type) => (
          <Button key={type} variant={type === "WORK" ? "default" : "outline"} onClick={() => launch(type)} className="justify-between">
            {pomodoroLabels[type]}
            <span className="text-xs opacity-70">{DURATIONS[type]} min</span>
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
