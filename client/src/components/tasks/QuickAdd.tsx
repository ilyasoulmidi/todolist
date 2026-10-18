import { useState, type FormEvent } from "react"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useCreateTask } from "@/lib/queries"
import type { TaskInput } from "@/lib/types"

// Ajout rapide en bas d'une colonne : Entrée crée la tâche et garde le champ ouvert pour enchaîner
export function QuickAdd({ defaults }: { defaults: TaskInput }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const createTask = useCreateTask()

  function submit(e: FormEvent) {
    e.preventDefault()
    const value = title.trim()
    if (!value) return
    createTask.mutate({ ...defaults, title: value })
    setTitle("")
  }

  if (!open) {
    return (
      <Button variant="ghost" className="w-full justify-start text-muted-foreground" onClick={() => setOpen(true)}>
        <PlusIcon /> Ajouter une tâche
      </Button>
    )
  }

  return (
    <form onSubmit={submit}>
      <Input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => !title.trim() && setOpen(false)}
        onKeyDown={(e) => e.key === "Escape" && (setTitle(""), setOpen(false))}
        placeholder="Titre de la tâche, puis Entrée"
        aria-label="Titre de la nouvelle tâche"
        maxLength={200}
        className="bg-card"
      />
    </form>
  )
}
