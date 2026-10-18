import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createBrowserRouter, Navigate, RouterProvider } from "react-router"
import { AppLayout } from "@/components/layout/AppLayout"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useApplyTheme } from "@/hooks/useApplyTheme"
import { usePomodoro } from "@/stores/pomodoro"
import { AuthPage } from "@/pages/AuthPage"
import { BinPage } from "@/pages/BinPage"
import { CalendarPage } from "@/pages/CalendarPage"
import { KanbanPage } from "@/pages/KanbanPage"
import { ListPage } from "@/pages/ListPage"
import { StatsPage } from "@/pages/StatsPage"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: true },
  },
})

const router = createBrowserRouter([
  { path: "/connexion", element: <AuthPage mode="login" /> },
  { path: "/inscription", element: <AuthPage mode="register" /> },
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/kanban" replace /> },
      { path: "kanban", element: <KanbanPage /> },
      { path: "liste", element: <ListPage /> },
      { path: "calendrier", element: <CalendarPage /> },
      { path: "statistiques", element: <StatsPage /> },
      { path: "archives", element: <BinPage key="archived" kind="archived" /> },
      { path: "corbeille", element: <BinPage key="trash" kind="trash" /> },
      { path: "*", element: <Navigate to="/kanban" replace /> },
    ],
  },
])

export default function App() {
  useApplyTheme()
  // Les toasts remontent au-dessus du minuteur Pomodoro quand il est affiché
  const pomodoroActive = usePomodoro((s) => !!s.active)

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" offset={{ bottom: pomodoroActive ? 136 : 24 }} mobileOffset={{ bottom: pomodoroActive ? 136 : 16 }} />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
