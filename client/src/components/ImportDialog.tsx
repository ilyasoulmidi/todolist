import { useState, type ChangeEvent } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { FileUpIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { api } from "@/lib/api"

type Parsed = { format: "json"; data: unknown; count: number } | { format: "csv"; content: string; count: number }

const MAX_SIZE = 9 * 1024 * 1024

// Aperçu local du fichier avant envoi : on annonce combien de tâches seront importées
async function readFile(file: File): Promise<Parsed> {
  if (file.size > MAX_SIZE) throw new Error("Fichier trop volumineux (9 Mo maximum)")
  const text = await file.text()
  if (file.name.toLowerCase().endsWith(".json")) {
    let data: { tasks?: unknown[] }
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error("Ce fichier JSON est illisible")
    }
    if (!Array.isArray(data?.tasks)) throw new Error("Ce JSON ne ressemble pas à un export TodoList (champ « tasks » manquant)")
    return { format: "json", data, count: data.tasks.length }
  }
  if (file.name.toLowerCase().endsWith(".csv")) {
    // Estimation : lignes non vides moins l'en-tête (les cellules multi-lignes peuvent fausser un peu le compte)
    const lines = text.split(/\r?\n/).filter((l) => l.trim()).length
    return { format: "csv", content: text, count: Math.max(0, lines - 1) }
  }
  throw new Error("Format non pris en charge : choisis un fichier .json ou .csv")
}

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient()
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<Parsed | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  function reset(nextOpen: boolean) {
    if (!nextOpen) {
      setFile(null)
      setParsed(null)
      setError(null)
    }
    onOpenChange(nextOpen)
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    setFile(f ?? null)
    setParsed(null)
    setError(null)
    if (!f) return
    try {
      setParsed(await readFile(f))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fichier illisible")
    }
  }

  async function submit() {
    if (!parsed) return
    setPending(true)
    try {
      const body = parsed.format === "json" ? { format: "json", data: parsed.data } : { format: "csv", content: parsed.content }
      const { imported } = await api.post<{ imported: { tasks: number; projects: number; tags: number } }>("/data/import", body)
      await qc.invalidateQueries()
      toast.success(`${imported.tasks} tâche${imported.tasks > 1 ? "s" : ""} importée${imported.tasks > 1 ? "s" : ""}`, {
        description:
          imported.projects || imported.tags
            ? `${imported.projects} liste(s) et ${imported.tags} étiquette(s) créées`
            : undefined,
      })
      reset(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "L'import a échoué")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importer des tâches</DialogTitle>
          <DialogDescription>
            Fichier JSON exporté depuis TodoList, ou CSV avec au moins une colonne « titre » (colonnes possibles : statut,
            priorite, echeance, liste, etiquettes, sous_taches…). Les tâches sont ajoutées à celles existantes.
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed p-6 text-center text-sm transition hover:bg-muted/50 focus-within:ring-3 focus-within:ring-ring/50">
          <FileUpIcon className="size-6 text-muted-foreground" />
          {file ? <span className="font-medium">{file.name}</span> : <span>Choisir un fichier .json ou .csv</span>}
          <input type="file" accept=".json,.csv,application/json,text/csv" className="sr-only" onChange={onFile} />
        </label>

        {parsed && (
          <p className="text-sm">
            Prêt à importer environ <strong>{parsed.count}</strong> tâche{parsed.count > 1 ? "s" : ""} ({parsed.format.toUpperCase()}).
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => reset(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={!parsed || pending}>
            {pending && <Loader2Icon className="animate-spin" />}
            Importer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
