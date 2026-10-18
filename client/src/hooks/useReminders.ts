import { createElement, useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { BellRingIcon } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { keys } from "@/lib/queries"
import type { Task } from "@/lib/types"
import { useUi } from "@/stores/ui"

const supported = typeof window !== "undefined" && "Notification" in window

export function useNotificationPermission() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    supported ? Notification.permission : "unsupported",
  )

  async function request() {
    if (!supported) return
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === "granted") toast.success("Notifications activées")
  }

  return { permission, request }
}

/*
 * Vérifie toutes les 30 s (et au retour sur l'onglet) les rappels arrivés à échéance.
 * Chaque rappel est affiché une fois : notification du navigateur si elle est autorisée,
 * toast dans l'application dans tous les cas, puis acquitté auprès de l'API.
 * Limite : l'application doit être ouverte dans un onglet pour recevoir les rappels.
 */
export function useReminders() {
  const qc = useQueryClient()
  const openTask = useUi((s) => s.openTask)
  const shown = useRef(new Set<string>())

  const { data } = useQuery({
    queryKey: [...keys.tasks, "reminders"],
    queryFn: async () => (await api.get<{ tasks: Task[] }>("/tasks/reminders/due")).tasks,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  })

  useEffect(() => {
    for (const task of data ?? []) {
      if (shown.current.has(task.id)) continue
      shown.current.add(task.id)

      if (supported && Notification.permission === "granted") {
        const notification = new Notification("Rappel · TodoList", {
          body: task.title,
          tag: `rappel-${task.id}`,
          icon: "/favicon.svg",
        })
        notification.onclick = () => {
          window.focus()
          openTask(task.id)
          notification.close()
        }
      }

      toast(task.title, {
        description: "Rappel",
        icon: createElement(BellRingIcon, { className: "size-4 text-indigo-500" }),
        duration: 15_000,
        action: { label: "Ouvrir", onClick: () => openTask(task.id) },
      })

      api
        .post(`/tasks/${task.id}/reminder/ack`)
        .then(() => qc.invalidateQueries({ queryKey: keys.tasks }))
        .catch(() => shown.current.delete(task.id))
    }
  }, [data, openTask, qc])
}
