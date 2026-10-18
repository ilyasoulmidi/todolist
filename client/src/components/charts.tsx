import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent, type ReactNode } from "react"
import { format } from "date-fns"
import { fr } from "date-fns/locale"
import { cn } from "@/lib/utils"
import type { DayValue } from "@/lib/stats"

/*
 * Petits graphiques en HTML/CSS (sans bibliothèque), selon les règles du skill dataviz :
 * colonnes <= 24 px aux extrémités arrondies de 4 px, grille fine et discrète,
 * infobulle au survol ET au focus clavier, texte toujours dans les couleurs de texte.
 */

// --- Infobulle partagée ---

interface Tip {
  x: number
  y: number
  value: string
  label: string
}

function useTooltip() {
  const ref = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<Tip | null>(null)

  const place = (clientX: number, clientY: number, value: string, label: string) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setTip({ x: clientX - box.left, y: clientY - box.top, value, label })
  }

  const handlers = (value: string, label: string) => ({
    onPointerMove: (e: PointerEvent) => place(e.clientX, e.clientY, value, label),
    onPointerLeave: () => setTip(null),
    onFocus: (e: FocusEvent<HTMLElement>) => {
      const r = e.currentTarget.getBoundingClientRect()
      place(r.left + r.width / 2, r.top, value, label)
    },
    onBlur: () => setTip(null),
    tabIndex: 0,
    "aria-label": `${label} : ${value}`,
  })

  const node = tip && (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-[calc(100%+10px)] flex-col rounded-md border bg-popover px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md"
      style={{ left: tip.x, top: tip.y }}
    >
      {/* La valeur d'abord, le libellé ensuite */}
      <span className="font-semibold text-foreground">{tip.value}</span>
      <span className="text-muted-foreground">{tip.label}</span>
    </div>
  )

  return { ref, handlers, node }
}

function niceMax(max: number) {
  if (max <= 4) return 4
  const step = 10 ** Math.floor(Math.log10(max))
  return Math.ceil(max / step) * step
}

// Accorde chaque mot : « tâche terminée » → « 2 tâches terminées »
const plural = (n: number, words: string) =>
  `${n} ${n > 1 ? words.split(" ").map((w) => `${w}s`).join(" ") : words}`

// --- Colonnes : une valeur par jour ---

export function DailyColumns({ data, unit }: { data: DayValue[]; unit: string }) {
  const { ref, handlers, node } = useTooltip()
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)))
  const peak = data.reduce((best, d) => (d.value > best.value ? d : best), data[0])
  const ticks = [max, max / 2, 0]

  return (
    <div ref={ref} className="relative">
      <div className="flex gap-2">
        {/* Axe Y : peu de graduations, arrondies */}
        <div className="flex h-44 flex-col justify-between py-0 text-right text-[11px] text-muted-foreground tabular-nums">
          {ticks.map((t) => (
            <span key={t} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
              {t}
            </span>
          ))}
        </div>
        <div className="relative h-44 flex-1">
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 border-t border-border"
              style={{ top: `${(1 - t / max) * 100}%` }}
              aria-hidden
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-0.5">
            {data.map((d, i) => {
              const label = format(d.date, "EEEE d MMMM", { locale: fr })
              return (
                <div
                  key={d.key}
                  className="group relative flex h-full flex-1 items-end justify-center outline-none"
                  {...handlers(plural(d.value, unit), label)}
                >
                  {d === peak && d.value > 0 && (
                    <span
                      className="absolute text-[11px] font-medium text-foreground tabular-nums"
                      style={{ bottom: `calc(${(d.value / max) * 100}% + 4px)` }}
                    >
                      {d.value}
                    </span>
                  )}
                  <div
                    className="w-full max-w-6 origin-bottom animate-grow-y rounded-t-[4px] bg-(--viz-series) transition-opacity group-hover:opacity-75 group-focus-visible:opacity-75 group-focus-visible:ring-2 group-focus-visible:ring-ring"
                    style={{ height: d.value ? `${(d.value / max) * 100}%` : 0, animationDelay: `${i * 18}ms` }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>
      {/* Axe X : un repère par semaine */}
      <div className="mt-1.5 ml-8 flex text-[11px] text-muted-foreground">
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 text-center whitespace-nowrap">
            {(data.length - 1 - i) % 7 === 0 ? format(d.date, "d MMM", { locale: fr }) : ""}
          </span>
        ))}
      </div>
      {node}
    </div>
  )
}

// --- Heatmap d'activité (semaines en colonnes, jours en lignes) ---

const HEAT_LEVELS = ["var(--viz-heat-0)", "var(--viz-heat-1)", "var(--viz-heat-2)", "var(--viz-heat-3)", "var(--viz-heat-4)"]
const WEEKDAY_LABELS = ["lun.", "", "mer.", "", "ven.", "", ""]

export function ActivityHeatmap({ days, unit }: { days: DayValue[]; unit: string }) {
  const { ref, handlers, node } = useTooltip()
  const max = Math.max(1, ...days.map((d) => d.value))
  const level = (v: number) => (v <= 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)))
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, w) => days.slice(w * 7, w * 7 + 7))

  return (
    <div ref={ref} className="relative">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <div className="flex flex-col gap-[3px] pt-5 text-[10px] leading-3 text-muted-foreground md:leading-4">
          {WEEKDAY_LABELS.map((l, i) => (
            <span key={i} className="h-3 md:h-4">
              {l}
            </span>
          ))}
        </div>
        {weeks.map((week, w) => {
          const firstOfMonth = week.find((d) => d.date.getDate() === 1)
          return (
            <div key={week[0].key} className="flex flex-col gap-[3px]">
              <span className="h-4 text-[10px] whitespace-nowrap text-muted-foreground">
                {firstOfMonth || w === 0 ? format((firstOfMonth ?? week[0]).date, "MMM", { locale: fr }) : ""}
              </span>
              {week.map((d) =>
                d.value < 0 ? (
                  <span key={d.key} className="size-3 md:size-4" aria-hidden />
                ) : (
                  <span
                    key={d.key}
                    className="size-3 animate-in rounded-[3px] outline-none duration-500 fill-mode-backwards fade-in zoom-in-50 md:size-4 hover:ring-2 hover:ring-foreground/40 focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ backgroundColor: HEAT_LEVELS[level(d.value)], animationDelay: `${w * 22}ms` }}
                    {...handlers(plural(d.value, unit), format(d.date, "EEEE d MMMM yyyy", { locale: fr }))}
                  />
                ),
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1 text-[11px] text-muted-foreground">
        Moins
        {HEAT_LEVELS.map((c) => (
          <span key={c} className="size-3 rounded-[3px]" style={{ backgroundColor: c }} />
        ))}
        Plus
      </div>
      {node}
    </div>
  )
}

// --- Barres horizontales (catégories) ---

export function BarList({
  items,
  unit,
  empty,
}: {
  items: { key: string; label: string; value: number; color?: string }[]
  unit: string
  empty: string
}) {
  const { ref, handlers, node } = useTooltip()
  const max = Math.max(1, ...items.map((i) => i.value))
  if (!items.some((i) => i.value > 0)) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>

  return (
    <div ref={ref} className="relative flex flex-col gap-2.5">
      {items.map((item, i) => (
        <div key={item.key} className="group grid grid-cols-[7rem_1fr] items-center gap-3 text-sm outline-none" {...handlers(plural(item.value, unit), item.label)}>
          <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
            {/* L'identité de la liste passe par la pastille, jamais par la couleur du texte */}
            {item.color && <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />}
            <span className="truncate">{item.label}</span>
          </span>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "h-4 origin-left animate-grow-x rounded-r-[4px] bg-(--viz-series) transition-opacity group-hover:opacity-75",
                item.value === 0 && "hidden",
              )}
              style={{ width: `${(item.value / max) * 85}%`, animationDelay: `${i * 90}ms` }}
            />
            <span className="text-xs font-medium text-foreground tabular-nums">{item.value}</span>
          </div>
        </div>
      ))}
      {node}
    </div>
  )
}

// --- Tuile de chiffre clé ---

export function StatTile({
  label,
  value,
  detail,
  icon,
  style,
}: {
  label: string
  value: ReactNode
  detail?: ReactNode
  icon?: ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      style={style}
      className="flex animate-in flex-col gap-1 rounded-xl border bg-card p-4 transition-shadow duration-500 fill-mode-backwards fade-in slide-in-from-bottom-3 hover:shadow-md"
    >
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-3xl font-semibold">{value}</span>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
    </div>
  )
}

// --- Nombre animé ---

export function CountUp({ value, format = String, duration = 900 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value)
      return
    }
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      // Décélération en fin de course
      setShown(Math.round(value * (1 - (1 - t) ** 3)))
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return <>{format(shown)}</>
}
