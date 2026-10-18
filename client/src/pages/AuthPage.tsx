import { useState, type FormEvent } from "react"
import { Link, Navigate } from "react-router"
import {
  ArrowRightIcon,
  BarChart3Icon,
  BellRingIcon,
  CheckSquareIcon,
  EyeIcon,
  EyeOffIcon,
  KanbanIcon,
  Loader2Icon,
  LockIcon,
  MailIcon,
  UserIcon,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ApiError } from "@/lib/api"
import { useLogin, useMe, useRegister } from "@/lib/queries"
import { cn } from "@/lib/utils"

type Mode = "login" | "register"

const copy = {
  login: {
    title: "Bon retour 👋",
    description: "Connecte-toi pour retrouver tes tâches.",
    submit: "Se connecter",
    switchText: "Pas encore de compte ?",
    switchLink: "Créer un compte",
    switchTo: "/inscription",
  },
  register: {
    title: "Crée ton compte",
    description: "Gratuit, sans engagement, prêt en 10 secondes.",
    submit: "Créer mon compte",
    switchText: "Déjà inscrit ?",
    switchLink: "Se connecter",
    switchTo: "/connexion",
  },
}

const features: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: KanbanIcon, title: "Kanban, liste et calendrier", text: "Trois vues pour organiser tes tâches comme tu veux." },
  { icon: BellRingIcon, title: "Rappels et récurrences", text: "Ne rate plus rien, même les tâches qui reviennent." },
  { icon: BarChart3Icon, title: "Statistiques et Pomodoro", text: "Suis tes progrès et reste concentré." },
]

export function AuthPage({ mode }: { mode: Mode }) {
  const { data: user } = useMe()
  const login = useLogin()
  const register = useRegister()
  const mutation = mode === "login" ? login : register

  const [form, setForm] = useState({ name: "", email: "", password: "" })
  const [showPassword, setShowPassword] = useState(false)
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
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />

      <main className="relative flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        {/* Halo discret derrière le formulaire */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklch,var(--color-indigo-500)_12%,transparent),transparent)]"
        />

        <div className="relative w-full max-w-sm">
          {/* Logo visible seulement sans le panneau (mobile / tablette) */}
          <Logo className="mb-10 justify-center lg:hidden" />

          <div className="mb-8 flex flex-col gap-1.5 text-center lg:text-left">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t.title}</h1>
            <p className="text-muted-foreground">{t.description}</p>
          </div>

          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
            {mode === "register" && (
              <Field id="name" label="Nom" error={fieldErrors.name}>
                <IconInput
                  icon={UserIcon}
                  id="name"
                  autoComplete="name"
                  placeholder="Ton prénom"
                  value={form.name}
                  onChange={update("name")}
                  autoFocus
                  aria-invalid={!!fieldErrors.name}
                />
              </Field>
            )}

            <Field id="email" label="Email" error={fieldErrors.email}>
              <IconInput
                icon={MailIcon}
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

            <Field
              id="password"
              label="Mot de passe"
              error={fieldErrors.password}
              hint={mode === "register" ? "8 caractères minimum." : undefined}
            >
              <IconInput
                icon={LockIcon}
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="••••••••"
                value={form.password}
                onChange={update("password")}
                aria-invalid={!!fieldErrors.password}
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    className="rounded-md p-1 text-muted-foreground transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                  </button>
                }
              />
            </Field>

            {error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={mutation.isPending}
              className="group mt-2 h-11 w-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
            >
              {mutation.isPending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <>
                  {t.submit}
                  <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            {t.switchText}{" "}
            <Link
              to={t.switchTo}
              className="font-medium text-indigo-600 underline-offset-4 hover:underline dark:text-indigo-400"
            >
              {t.switchLink}
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}

// Panneau de présentation (écrans larges uniquement)
function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-[linear-gradient(145deg,#1e1b4b_0%,#312e81_45%,#4c1d95_100%)] text-white lg:flex lg:flex-col">
      {/* Halos lumineux et grille discrète */}
      <div aria-hidden className="absolute -top-32 -left-24 size-96 rounded-full bg-indigo-400/30 blur-3xl" />
      <div aria-hidden className="absolute -right-24 bottom-0 size-[28rem] rounded-full bg-fuchsia-500/25 blur-3xl" />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.05)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]"
      />

      <div className="relative flex flex-1 flex-col justify-between gap-10 p-10 xl:p-14">
        <Logo light />

        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-4">
            <h2 className="max-w-md text-4xl leading-tight font-semibold tracking-tight xl:text-5xl">
              Organise tes journées, <span className="text-indigo-200">sans effort.</span>
            </h2>
            <p className="max-w-md text-lg text-indigo-100/80">
              Toutes tes tâches au même endroit, avec les outils pour avancer chaque jour.
            </p>
          </div>

          <ul className="flex flex-col gap-4">
            {features.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 backdrop-blur">
                  <Icon className="size-4.5" />
                </span>
                <span className="flex flex-col">
                  <span className="font-medium">{title}</span>
                  <span className="text-sm text-indigo-100/70">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Aperçu de l'application */}
        <div className="relative -mr-24 -mb-24 xl:-mr-32">
          <img
            src="/auth-preview.jpg"
            alt="Aperçu du tableau Kanban de TodoList"
            width={1020}
            height={600}
            className="w-full max-w-2xl rounded-xl shadow-2xl ring-1 shadow-black/40 ring-white/15"
          />
        </div>
      </div>
    </aside>
  )
}

function Logo({ light = false, className }: { light?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5 text-lg font-semibold", className)}>
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-xl",
          light ? "bg-white/15 ring-1 ring-white/20" : "bg-indigo-600 text-white shadow-md shadow-indigo-600/30",
        )}
      >
        <CheckSquareIcon className="size-5" />
      </span>
      TodoList
    </div>
  )
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

function IconInput({
  icon: Icon,
  trailing,
  className,
  ...props
}: React.ComponentProps<typeof Input> & { icon: LucideIcon; trailing?: React.ReactNode }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={cn("h-11 pl-9 text-base sm:text-sm", trailing && "pr-10", className)} {...props} />
      {trailing && <span className="absolute top-1/2 right-2 -translate-y-1/2">{trailing}</span>}
    </div>
  )
}
