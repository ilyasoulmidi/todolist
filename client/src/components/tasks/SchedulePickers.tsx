import { useEffect, useState } from "react"
import { addDays, addHours, format, setHours, setMinutes } from "date-fns"
import { fr } from "date-fns/locale"
import { BellIcon, BellOffIcon, RepeatIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useNotificationPermission } from "@/hooks/useReminders"
import { fromDueIso } from "@/lib/dates"
import {
  buildRule,
  describeRule,
  detectPreset,
  parseRule,
  presetRule,
  WEEKDAYS,
  type Freq,
  type Preset,
  type Rule,
} from "@/lib/recurrence"
import { cn } from "@/lib/utils"

// --- Récurrence ---

const presetLabels: Record<Exclude<Preset, "custom">, string> = {
  none: "Ne se répète pas",
  daily: "Tous les jours",
  weekdays: "Tous les jours ouvrés (lun.–ven.)",
  weekly: "Chaque semaine",
  biweekly: "Toutes les 2 semaines",
  monthly: "Tous les mois",
  yearly: "Tous les ans",
}

const freqUnits: { value: Freq; label: string }[] = [
  { value: "DAILY", label: "jour(s)" },
  { value: "WEEKLY", label: "semaine(s)" },
  { value: "MONTHLY", label: "mois" },
  { value: "YEARLY", label: "an(s)" },
]

export function RecurrencePicker({
  value,
  dueDate,
  onChange,
}: {
  value: string | null
  dueDate: string | null
  onChange: (rule: string | null) => void
}) {
  const ref = dueDate ? fromDueIso(dueDate) : new Date()
  const preset = detectPreset(value, ref)
  const [customOpen, setCustomOpen] = useState(preset === "custom")

  useEffect(() => setCustomOpen(preset === "custom"), [preset])

  // Précise le jour concerné pour lever toute ambiguïté (« Chaque semaine (le lundi) »)
  const weekday = WEEKDAYS[(ref.getDay() + 6) % 7].label
  const detail: Partial<Record<Preset, string>> = {
    weekly: `le ${weekday}`,
    biweekly: `le ${weekday}`,
    monthly: `le ${ref.getDate() === 1 ? "1er" : ref.getDate()}`,
    yearly: `le ${format(ref, "d MMMM", { locale: fr })}`,
  }
  const items = [
    ...Object.entries(presetLabels).map(([key, label]) => ({
      value: key,
      label: detail[key as Preset] ? `${label} (${detail[key as Preset]})` : label,
    })),
    { value: "custom", label: preset === "custom" ? describeRule(value) : "Personnalisé…" },
  ]

  return (
    <div className="flex flex-col gap-2">
      <Select
        items={items}
        value={customOpen ? "custom" : preset}
        onValueChange={(v) => {
          if (v === "custom") {
            setCustomOpen(true)
            if (!value) onChange(presetRule("weekly", ref))
          } else {
            setCustomOpen(false)
            onChange(presetRule(v as Preset, ref))
          }
        }}
      >
        <SelectTrigger className="w-full">
          <RepeatIcon className={cn(!value && "text-muted-foreground")} />
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {customOpen && value && <CustomRuleEditor value={value} onChange={onChange} />}
    </div>
  )
}

function CustomRuleEditor({ value, onChange }: { value: string; onChange: (rule: string) => void }) {
  const rule: Rule = parseRule(value) ?? { freq: "WEEKLY", interval: 1, byDay: [] }
  const update = (patch: Partial<Rule>) => {
    const next = { ...rule, ...patch }
    if (next.freq !== "WEEKLY") next.byDay = []
    if (next.freq !== "MONTHLY") next.byMonthDay = undefined
    onChange(buildRule(next))
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="flex items-center gap-2">
        Tous les
        <Input
          type="number"
          min={1}
          max={365}
          value={rule.interval}
          onChange={(e) => update({ interval: Math.min(365, Math.max(1, Number(e.target.value) || 1)) })}
          className="w-16"
          aria-label="Intervalle"
        />
        <Select
          items={freqUnits}
          value={rule.freq}
          onValueChange={(v) => v && update({ freq: v as Freq })}
        >
          <SelectTrigger aria-label="Unité">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {freqUnits.map((u) => (
              <SelectItem key={u.value} value={u.value}>
                {u.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {rule.freq === "WEEKLY" && (
        <div className="flex gap-1" role="group" aria-label="Jours de la semaine">
          {WEEKDAYS.map((day) => {
            const active = rule.byDay.includes(day.code)
            return (
              <button
                key={day.code}
                type="button"
                aria-pressed={active}
                aria-label={day.label}
                title={day.label}
                onClick={() => {
                  const byDay = active ? rule.byDay.filter((d) => d !== day.code) : [...rule.byDay, day.code]
                  update({ byDay })
                }}
                className={cn(
                  "flex size-8 items-center justify-center rounded-full border text-xs font-medium transition",
                  active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {day.short}
              </button>
            )
          })}
        </div>
      )}
      <p className="text-xs text-muted-foreground">{describeRule(value)}</p>
    </div>
  )
}

// --- Rappel ---

function toLocalInput(iso: string) {
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm")
}

export function ReminderPicker({
  value,
  dueDate,
  onChange,
}: {
  value: string | null
  dueDate: string | null
  onChange: (iso: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const { permission, request } = useNotificationPermission()
  const now = new Date()

  const quick = [
    { label: "Dans 1 heure", date: addHours(now, 1) },
    { label: "Ce soir, 18:00", date: setMinutes(setHours(now, 18), 0), hidden: now.getHours() >= 18 },
    { label: "Demain, 9:00", date: setMinutes(setHours(addDays(now, 1), 9), 0) },
    ...(dueDate
      ? [
          { label: "Le jour de l'échéance, 9:00", date: setMinutes(setHours(fromDueIso(dueDate), 9), 0) },
          { label: "La veille de l'échéance, 18:00", date: setMinutes(setHours(addDays(fromDueIso(dueDate), -1), 18), 0) },
        ]
      : []),
  ].filter((q) => !q.hidden && q.date > now)

  const set = (date: Date | null) => {
    onChange(date ? date.toISOString() : null)
    setOpen(false)
  }

  const past = value && new Date(value) < now

  return (
    <div className="flex gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button variant="outline" className={cn("flex-1 justify-start font-normal", !value && "text-muted-foreground")} />
          }
        >
          {value ? <BellIcon /> : <BellOffIcon />}
          <span className={cn("truncate", past && "line-through")}>
            {value ? format(new Date(value), "EEE d MMM 'à' HH:mm", { locale: fr }) : "Aucun rappel"}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          <div className="flex flex-col gap-1">
            {quick.map((q) => (
              <Button key={q.label} variant="ghost" className="justify-between font-normal" onClick={() => set(q.date)}>
                {q.label}
                <span className="text-xs text-muted-foreground">{format(q.date, "EEE HH:mm", { locale: fr })}</span>
              </Button>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Date et heure précises
            <Input
              type="datetime-local"
              defaultValue={value ? toLocalInput(value) : ""}
              onChange={(e) => e.target.value && onChange(new Date(e.target.value).toISOString())}
            />
          </label>
          {permission === "default" && (
            <Button variant="secondary" size="sm" onClick={request}>
              <BellIcon /> Activer les notifications du navigateur
            </Button>
          )}
          {permission === "denied" && (
            <p className="text-xs text-muted-foreground">
              Notifications bloquées par le navigateur : les rappels s'afficheront seulement dans l'application.
            </p>
          )}
        </PopoverContent>
      </Popover>
      {value && (
        <Button variant="ghost" size="icon" aria-label="Retirer le rappel" onClick={() => set(null)}>
          <XIcon />
        </Button>
      )}
    </div>
  )
}
