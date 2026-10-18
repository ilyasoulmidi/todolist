import { Navigate, Outlet } from "react-router"
import { Loader2Icon } from "lucide-react"
import { TaskDialog } from "@/components/tasks/TaskDialog"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { useShortcuts } from "@/hooks/useShortcuts"
import { useMe } from "@/lib/queries"
import { useUi } from "@/stores/ui"
import { Header } from "./Header"
import { Sidebar } from "./Sidebar"

export function AppLayout() {
  const { data: user, isLoading } = useMe()
  const mobileOpen = useUi((s) => s.mobileSidebarOpen)
  const setMobileOpen = useUi((s) => s.setMobileSidebarOpen)
  useShortcuts()

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (!user) return <Navigate to="/connexion" replace />

  return (
    <div className="flex h-svh overflow-hidden">
      <aside className="hidden w-64 shrink-0 border-r bg-muted/30 md:block">
        <Sidebar />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <Sidebar />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <TaskDialog />
    </div>
  )
}
