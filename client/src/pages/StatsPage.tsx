import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { AlertTriangleIcon, CheckCircle2Icon, FlameIcon, ListTodoIcon, TimerIcon } from "lucide-react"
import { ActivityHeatmap, BarList, CountUp, DailyColumns, StatTile } from "@/components/charts"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { stagger } from "@/lib/motion"
import { computeStats, formatMinutes, type StatsResponse } from "@/lib/stats"

export function StatsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.get<StatsResponse>("/stats"),
  })
  const stats = useMemo(() => (data ? computeStats(data) : null), [data])

  if (isLoading || !stats) {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 md:p-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  const delta = stats.weekDelta
  const daily30 = stats.daily.reduce((s, d) => s + d.value, 0)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 md:p-6">
      <section aria-label="Chiffres clés" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={<CheckCircle2Icon className="size-4" />}
          label="Terminées (7 jours)"
          style={stagger(0, 70)}
          value={<CountUp value={stats.doneThisWeek} />}
          detail={delta === 0 ? "Comme la semaine précédente" : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} par rapport aux 7 jours précédents`}
        />
        <StatTile
          icon={<FlameIcon className="size-4" />}
          label="Série en cours"
          style={stagger(1, 70)}
          value={<CountUp value={stats.streak.current} format={(n) => `${n} j`} />}
          detail={`Record : ${stats.streak.best} jour${stats.streak.best > 1 ? "s" : ""} d'affilée`}
        />
        <StatTile
          icon={<ListTodoIcon className="size-4" />}
          label="Tâches ouvertes"
          style={stagger(2, 70)}
          value={<CountUp value={stats.openCount} />}
          detail={
            stats.overdue > 0 ? (
              // Statut « critique » : toujours icône + libellé, jamais la couleur seule
              <span className="flex items-center gap-1 font-medium text-(--viz-critical)">
                <AlertTriangleIcon className="size-3.5" /> {stats.overdue} en retard
              </span>
            ) : (
              "Aucune en retard"
            )
          }
        />
        <StatTile
          icon={<TimerIcon className="size-4" />}
          label="Concentration (7 jours)"
          style={stagger(3, 70)}
          value={<CountUp value={stats.focusMinutesWeek} format={formatMinutes} />}
          detail={`${stats.focusSessionsWeek} session${stats.focusSessionsWeek > 1 ? "s" : ""} Pomodoro terminée${stats.focusSessionsWeek > 1 ? "s" : ""}`}
        />
      </section>

      <Card index={1} title="Tâches terminées par jour" subtitle={`30 derniers jours · ${daily30} au total`}>
        <DailyColumns data={stats.daily} unit="tâche terminée" />
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Voir les données en tableau</summary>
          <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-left">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Jour</th>
                  <th className="px-3 py-1.5 text-right font-medium">Tâches terminées</th>
                </tr>
              </thead>
              <tbody className="divide-y tabular-nums">
                {[...stats.daily].reverse().map((d) => (
                  <tr key={d.key}>
                    <td className="px-3 py-1 first-letter:uppercase">{format(d.date, "EEEE d MMMM", { locale: fr })}</td>
                    <td className="px-3 py-1 text-right">{d.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      <Card index={2} title="Activité" subtitle="Tâches terminées sur les 6 derniers mois">
        <ActivityHeatmap days={stats.heatDays} unit="tâche terminée" />
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card index={3} title="Tâches ouvertes par priorité">
          <BarList items={stats.byPriority} unit="tâche" empty="Aucune tâche ouverte." />
        </Card>
        <Card index={4} title="Tâches ouvertes par liste">
          <BarList items={stats.byProject} unit="tâche" empty="Aucune tâche ouverte." />
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {stats.totals.done} tâche{stats.totals.done > 1 ? "s" : ""} terminée{stats.totals.done > 1 ? "s" : ""} sur {stats.totals.all} créée
        {stats.totals.all > 1 ? "s" : ""} ({stats.completionRate} %)
      </p>
    </div>
  )
}

function Card({
  index,
  title,
  subtitle,
  children,
}: {
  index: number
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section
      aria-label={title}
      style={stagger(index + 3, 70)}
      className="flex animate-in flex-col gap-4 rounded-xl border bg-card p-4 duration-500 fill-mode-backwards fade-in slide-in-from-bottom-3 md:p-5"
    >
      <header>
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </header>
      {children}
    </section>
  )
}
