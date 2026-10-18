# TodoList

Todo-list interactive full-stack : React + TypeScript (Vite) côté client, Express + Prisma + PostgreSQL côté serveur.

## Fonctionnalités

- Comptes utilisateurs (inscription, connexion, session en cookie sécurisé)
- Tableau **Kanban** (À faire / En cours / Fait) avec glisser-déposer entre les colonnes et dans une colonne
- Vue **Liste** : tri (échéance, priorité, titre, création, manuel), regroupement (échéance, statut, priorité, liste), filtre de statut, sélection multiple et actions groupées (terminer, statut, priorité, suppression annulable)
- Vue **Calendrier** mois / semaine : glisser une tâche sur un jour pour la replanifier, panneau des tâches sans échéance, création rapide sur un jour, affichage adapté au mobile
- Tâches complètes : priorité, échéance, liste, étiquettes, description, sous-tâches avec progression
- **Tâches récurrentes** (tous les jours, jours ouvrés, chaque semaine, tous les mois, tous les ans, ou règle personnalisée) : terminer une occurrence crée automatiquement la suivante
- **Rappels** : notification du navigateur (et rappel dans l'application) à l'heure choisie, avec raccourcis « Dans 1 heure », « Demain 9:00 », « La veille de l'échéance »…
- **Archives** (archivage en un clic des tâches terminées) et **Corbeille** (restauration, suppression définitive, purge automatique après 30 jours)
- **Statistiques** : tâches terminées (7 jours, évolution), série de jours actifs et record, tâches en retard, temps de concentration, graphique des 30 derniers jours (avec vue tableau), heatmap d'activité sur 6 mois, répartition par priorité et par liste
- **Minuteur Pomodoro** (25 / 5 / 15 min) lançable depuis une tâche : widget flottant, pause / reprise, son et notification en fin de session, temps restant dans l'onglet, temps de concentration par tâche
- **Import / export** JSON (sauvegarde complète) et CSV compatible Excel (séparateur `;`), import qui réutilise les listes et étiquettes existantes
- Filtres rapides : Aujourd'hui, Cette semaine, En retard ; listes et étiquettes colorées
- Recherche instantanée et filtres par priorité / étiquette
- Ajout rapide en bas de colonne, duplication, suppression avec « Annuler »
- Thème clair / sombre / système, interface responsive (mobile)
- Raccourcis clavier : `N` nouvelle tâche, `/` rechercher

## Stack

| Côté | Technologies |
|---|---|
| Front | React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui (Base UI), TanStack Query, Zustand, dnd-kit, date-fns, React Router |
| Back | Node, Express 5, Prisma 7, PostgreSQL 17, Zod, JWT, bcrypt |
| Tests | Vitest, Supertest |

## Structure

```
client/   Front React + Vite (port 5173, proxy /api -> 4000)
server/   API Express + Prisma (port 4000)
docker-compose.yml   PostgreSQL 17 (port 5433)
```

## Démarrage

```bash
npm install                       # installe client + serveur (workspaces) et génère le client Prisma
cp server/.env.example server/.env
npm run db:up                     # lance PostgreSQL dans Docker
npm run db:migrate -w server      # applique les migrations
npm run db:seed -w server         # données de démo (demo@todolist.test / demo1234)
npm run dev                       # lance l'API et le front
```

- Front : http://localhost:5173
- API : http://localhost:4000/api/health
- Explorer la base : `npm run db:studio -w server`

## Tests

```bash
npm test -w server   # tests de l'API (base PostgreSQL dédiée : todolist_test)
```

## API

L'authentification repose sur un JWT stocké dans un cookie `httpOnly` (valable 7 jours).

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Inscription `{ name, email, password }` (mot de passe ≥ 8 caractères) |
| POST | `/api/auth/login` | Connexion `{ email, password }` |
| POST | `/api/auth/logout` | Déconnexion (efface le cookie) |
| GET | `/api/auth/me` | Utilisateur connecté (401 sinon) |

Toutes les routes ci-dessous exigent d'être connecté. Un utilisateur n'accède qu'à ses propres données (404 sinon).

### Listes

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/projects` | Listes actives (`?archived=true` pour les archivées), avec `openTaskCount` |
| POST | `/api/projects` | `{ name, color?, icon?, position? }` |
| PATCH | `/api/projects/:id` | Modifier ; `{ archived: true }` pour archiver |
| DELETE | `/api/projects/:id` | Supprimer (les tâches passent « sans liste ») |

### Étiquettes

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/tags` | Étiquettes triées par nom |
| POST | `/api/tags` | `{ name, color? }` (nom unique par utilisateur) |
| PATCH | `/api/tags/:id` | Renommer / changer la couleur |
| DELETE | `/api/tags/:id` | Supprimer |

### Tâches

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/tasks` | Liste filtrée (voir ci-dessous) |
| GET | `/api/tasks/:id` | Détail avec sous-tâches, étiquettes et liste |
| POST | `/api/tasks` | `{ title, description?, status?, priority?, dueDate?, allDay?, reminderAt?, recurrenceRule?, projectId?, tagIds?, subtasks?: string[] }` |
| PATCH | `/api/tasks/:id` | Modification partielle, dont `position` (Kanban), `tagIds` (remplace), `archived` |
| DELETE | `/api/tasks/:id` | Mise à la corbeille (`?permanent=true` : suppression définitive) |
| POST | `/api/tasks/:id/restore` | Restaurer depuis la corbeille |
| POST | `/api/tasks/:id/duplicate` | Dupliquer |
| DELETE | `/api/tasks/trash` | Vider la corbeille |
| POST | `/api/tasks/archive-done` | Archiver les tâches terminées (`{ projectId? }`) |
| GET | `/api/tasks/reminders/due` | Rappels arrivés à échéance, pas encore notifiés |
| POST | `/api/tasks/:id/reminder/ack` | Marquer le rappel comme notifié |

### Pomodoro, statistiques et données

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/pomodoros?taskId=` | Sessions (d'une tâche) |
| POST | `/api/pomodoros` | Démarrer `{ type, durationMin, taskId? }` |
| PATCH | `/api/pomodoros/:id` | Terminer `{ completed }` (interrompue : seul le temps écoulé compte) |
| GET | `/api/stats` | Données brutes de l'année, agrégées côté client dans le fuseau de l'utilisateur |
| GET | `/api/data/export?format=json\|csv` | Téléchargement de toutes les tâches |
| POST | `/api/data/import` | `{ format: "json", data }` ou `{ format: "csv", content }`, en une transaction |
| POST | `/api/tasks/:id/subtasks` | Ajouter une sous-tâche `{ title }` |
| PATCH | `/api/tasks/:id/subtasks/:subtaskId` | `{ title?, done?, position? }` |
| DELETE | `/api/tasks/:id/subtasks/:subtaskId` | Supprimer une sous-tâche |

Récurrence : `recurrenceRule` accepte un sous-ensemble de RRULE (`FREQ=DAILY|WEEKLY|MONTHLY|YEARLY`, `INTERVAL`, `BYDAY` en hebdomadaire, `BYMONTHDAY` en mensuel). Passer une tâche récurrente à `DONE` renvoie `nextTask`, l'occurrence suivante créée.

Paramètres de `GET /api/tasks` :

- `view` : `active` (défaut), `archived`, `trash`
- `status`, `priority`, `tagId` : une ou plusieurs valeurs séparées par des virgules (`status=TODO,IN_PROGRESS`)
- `projectId` : id d'une liste, ou `none` pour les tâches sans liste
- `q` : recherche (titre, description, sous-tâches), insensible à la casse
- `dueFrom` / `dueTo` : intervalle d'échéance `[dueFrom, dueTo[` ; `noDue=true` pour les tâches sans échéance
- `sort` : `position` (défaut), `dueDate`, `priority`, `createdAt`, `updatedAt`, `title` ; `order` : `asc` / `desc`
