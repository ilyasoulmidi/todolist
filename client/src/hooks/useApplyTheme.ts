import { useEffect, useSyncExternalStore } from "react"
import { useUi } from "@/stores/ui"

const media = window.matchMedia("(prefers-color-scheme: dark)")

function subscribe(callback: () => void) {
  media.addEventListener("change", callback)
  return () => media.removeEventListener("change", callback)
}

// Thème réellement affiché ("system" résolu selon les préférences de l'OS)
export function useResolvedTheme(): "light" | "dark" {
  const theme = useUi((s) => s.theme)
  const systemDark = useSyncExternalStore(subscribe, () => media.matches)
  if (theme === "system") return systemDark ? "dark" : "light"
  return theme
}

export function useApplyTheme() {
  const resolved = useResolvedTheme()
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolved === "dark")
    document.documentElement.style.colorScheme = resolved
  }, [resolved])
}
