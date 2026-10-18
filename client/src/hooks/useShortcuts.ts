import { useEffect } from "react"
import { SEARCH_INPUT_ID } from "@/components/layout/Header"
import { useUi } from "@/stores/ui"

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
}

// Raccourcis clavier globaux : N = nouvelle tâche, / = rechercher
export function useShortcuts() {
  const openNewTask = useUi((s) => s.openNewTask)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      // Pas de raccourci quand une fenêtre est ouverte
      if (document.querySelector("[role=dialog], [role=alertdialog]")) return

      if (e.key === "n" || e.key === "N") {
        e.preventDefault()
        openNewTask()
      } else if (e.key === "/") {
        e.preventDefault()
        document.getElementById(SEARCH_INPUT_ID)?.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [openNewTask])
}
