import { useEffect, useState, type FormEvent } from "react"
import { CheckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { COLORS } from "@/lib/labels"
import { cn } from "@/lib/utils"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  submitLabel: string
  initial?: { name: string; color: string }
  onSubmit: (values: { name: string; color: string }) => Promise<unknown> | void
}

// Petite fenêtre « nom + couleur » partagée par les listes et les étiquettes
export function NameColorDialog({ open, onOpenChange, title, submitLabel, initial, onSubmit }: Props) {
  const [name, setName] = useState("")
  const [color, setColor] = useState(COLORS[6])
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "")
      setColor(initial?.color ?? COLORS[Math.floor(Math.random() * COLORS.length)])
    }
  }, [open, initial?.name, initial?.color])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setPending(true)
    try {
      await onSubmit({ name: name.trim(), color })
      onOpenChange(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name-color-name">Nom</Label>
            <Input id="name-color-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={50} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Couleur</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Couleur ${c}`}
                  aria-pressed={c === color}
                  onClick={() => setColor(c)}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition",
                    c === color && "ring-2 ring-foreground/60",
                  )}
                  style={{ backgroundColor: c }}
                >
                  {c === color && <CheckIcon className="size-4 text-white" />}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || pending}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
