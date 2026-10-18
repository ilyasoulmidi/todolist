import { useState, type FormEvent } from "react"
import { Link, Navigate } from "react-router"
import { CheckSquareIcon, Loader2Icon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api"
import { useLogin, useMe, useRegister } from "@/lib/queries"

type Mode = "login" | "register"

const copy = {
  login: {
    title: "Bon retour !",
    description: "Connecte-toi pour retrouver tes tâches.",
    submit: "Se connecter",
    switchText: "Pas encore de compte ?",
    switchLink: "Créer un compte",
    switchTo: "/inscription",
  },
  register: {
    title: "Créer un compte",
    description: "Organise tes journées en quelques secondes.",
    submit: "Créer mon compte",
    switchText: "Déjà inscrit ?",
    switchLink: "Se connecter",
    switchTo: "/connexion",
  },
}

export function AuthPage({ mode }: { mode: Mode }) {
  const { data: user } = useMe()
  const login = useLogin()
  const register = useRegister()
  const mutation = mode === "login" ? login : register

  const [form, setForm] = useState({ name: "", email: "", password: "" })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  if (user) return <Navigate to="/" replace />

  const t = copy[mode]

  const update = (field: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    try {
      if (mode === "login") await login.mutateAsync({ email: form.email, password: form.password })
      else await register.mutateAsync(form)
    } catch (err) {
      if (err instanceof ApiError && err.details) {
        setFieldErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])))
      } else {
        setError(err instanceof Error ? err.message : "Une erreur est survenue")
      }
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted/40 p-4">
      <div className="flex items-center gap-2 text-lg font-semibold">
        <CheckSquareIcon className="size-6 text-primary" />
        TodoList
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{t.title}</CardTitle>
          <CardDescription>{t.description}</CardDescription>
        </CardHeader>

        <form onSubmit={onSubmit} noValidate>
          <CardContent className="flex flex-col gap-4">
            {mode === "register" && (
              <Field id="name" label="Nom" error={fieldErrors.name}>
                <Input id="name" autoComplete="name" value={form.name} onChange={update("name")} autoFocus aria-invalid={!!fieldErrors.name} />
              </Field>
            )}
            <Field id="email" label="Email" error={fieldErrors.email}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="toi@exemple.com"
                value={form.email}
                onChange={update("email")}
                autoFocus={mode === "login"}
                aria-invalid={!!fieldErrors.email}
              />
            </Field>
            <Field id="password" label="Mot de passe" error={fieldErrors.password}>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={form.password}
                onChange={update("password")}
                aria-invalid={!!fieldErrors.password}
              />
            </Field>
            {mode === "register" && !fieldErrors.password && (
              <p className="-mt-2 text-xs text-muted-foreground">8 caractères minimum.</p>
            )}
            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </CardContent>

          <CardFooter className="mt-6 flex flex-col gap-3 border-t pt-4 pb-4">
            <Button type="submit" size="lg" className="w-full" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2Icon className="animate-spin" />}
              {t.submit}
            </Button>
            <p className="text-sm text-muted-foreground">
              {t.switchText}{" "}
              <Link to={t.switchTo} className="font-medium text-foreground underline-offset-4 hover:underline">
                {t.switchLink}
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
