import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createBrowserRouter, Navigate, RouterProvider } from "react-router"
import { AppLayout } from "@/components/layout/AppLayout"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useApplyTheme } from "@/hooks/useApplyTheme"
import { AuthPage } from "@/pages/AuthPage"
import { KanbanPage } from "@/pages/KanbanPage"

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
      { path: "*", element: <Navigate to="/kanban" replace /> },
    ],
  },
])

export default function App() {
  useApplyTheme()

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
