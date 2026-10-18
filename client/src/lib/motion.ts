import type { CSSProperties } from "react"

// Décalage d'entrée pour les listes animées (plafonné pour ne pas faire attendre l'utilisateur)
export function stagger(index: number, step = 35, max = 420): CSSProperties {
  return { animationDelay: `${Math.min(index * step, max)}ms` }
}
