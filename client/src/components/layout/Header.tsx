import { useNavigate } from "react-router"
import { useState } from "react"
import {
  DownloadIcon,
  FileUpIcon,
  FilterIcon,
  LogOutIcon,
  MenuIcon,
  MonitorIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SunIcon,
  XIcon,
} from "lucide-react"
import { ImportDialog } from "@/components/ImportDialog"
import { PomodoroLauncher } from "@/components/PomodoroWidget"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { useResolvedTheme } from "@/hooks/useApplyTheme"
import { useScope } from "@/hooks/useScope"
import { PRIORITIES, priorityLabels } from "@/lib/labels"
import { useLogout, useMe, useTags } from "@/lib/queries"
import { useUi, type Theme } from "@/stores/ui"

export const SEARCH_INPUT_ID = "recherche-taches"

export function Header() {
  const navigate = useNavigate()
  const { title, color } = useScope()
  const { data: user } = useMe()
  const { data: tags = [] } = useTags()
  const logout = useLogout()
  const resolvedTheme = useResolvedTheme()
  const {
    search,
    setSearch,
    priorityFilter,
    togglePriority,
    tagFilter,
    toggleTag,
    clearFilters,
    theme,
    setTheme,
    openNewTask,
    setMobileSidebarOpen,
  } = useUi()

  const [importOpen, setImportOpen] = useState(false)
  const activeFilters = priorityFilter.length + tagFilter.length

  // Le cookie de session accompagne la requête : le navigateur télécharge directement le fichier
  const download = (format: "json" | "csv") => {
    const a = document.createElement("a")
    a.href = `/api/data/export?format=${format}`
    a.download = ""
    a.click()
  }

  return (
    <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3 md:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setMobileSidebarOpen(true)}
        aria-label="Ouvrir le menu"
      >
        <MenuIcon />
      </Button>

      <h1 className="flex min-w-0 items-center gap-2 text-lg font-semibold">
        {color && <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: color }} />}
        <span className="truncate">{title}</span>
      </h1>

      <div className="ml-auto flex items-center gap-2">
        <div className="relative hidden sm:block">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={SEARCH_INPUT_ID}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && (setSearch(""), e.currentTarget.blur())}
            placeholder="Rechercher…  /"
            aria-label="Rechercher une tâche"
            className="w-56 pl-8 lg:w-72"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" aria-label="Filtres" />}>
            <FilterIcon />
            <span className="hidden lg:inline">Filtres</span>
            {activeFilters > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{activeFilters}</span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Priorité</DropdownMenuLabel>
              {PRIORITIES.map((p) => (
                <DropdownMenuCheckboxItem
                  key={p}
                  checked={priorityFilter.includes(p)}
                  onCheckedChange={() => togglePriority(p)}
                  closeOnClick={false}
                >
                  {priorityLabels[p]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
            {tags.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Étiquettes</DropdownMenuLabel>
                  {tags.map((tag) => (
                    <DropdownMenuCheckboxItem
                      key={tag.id}
                      checked={tagFilter.includes(tag.id)}
                      onCheckedChange={() => toggleTag(tag.id)}
                      closeOnClick={false}
                    >
                      <span className="size-2 rounded-full" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuGroup>
              </>
            )}
            {(activeFilters > 0 || search) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={clearFilters}>
                  <XIcon /> Effacer les filtres
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button onClick={() => openNewTask()} title="Nouvelle tâche (N)">
          <PlusIcon className="transition-transform duration-300 group-hover/button:rotate-90" />
          <span className="hidden sm:inline">Nouvelle tâche</span>
        </Button>

        <PomodoroLauncher />

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Thème" />}>
            {resolvedTheme === "dark" ? <MoonIcon /> : <SunIcon />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
              <DropdownMenuRadioItem value="light">
                <SunIcon /> Clair
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">
                <MoonIcon /> Sombre
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">
                <MonitorIcon /> Système
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="rounded-full" aria-label="Mon compte" />}>
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">{user?.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="flex flex-col">
                <span className="text-sm text-foreground">{user?.name}</span>
                <span className="font-normal">{user?.email}</span>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Mes données</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => download("json")}>
                <DownloadIcon /> Exporter en JSON
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => download("csv")}>
                <DownloadIcon /> Exporter en CSV (Excel)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportOpen(true)}>
                <FileUpIcon /> Importer…
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => logout.mutate(undefined, { onSuccess: () => navigate("/connexion") })}
            >
              <LogOutIcon /> Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Recherche pleine largeur sur mobile */}
      <div className="relative w-full sm:hidden">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          aria-label="Rechercher une tâche"
          className="pl-8"
        />
      </div>
    </header>
  )
}
