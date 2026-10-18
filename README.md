# TodoList

Todo-list interactive full-stack : React + TypeScript (Vite) côté client, Express + Prisma + PostgreSQL côté serveur.

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
| POST | `/api/tasks/:id/subtasks` | Ajouter une sous-tâche `{ title }` |
| PATCH | `/api/tasks/:id/subtasks/:subtaskId` | `{ title?, done?, position? }` |
| DELETE | `/api/tasks/:id/subtasks/:subtaskId` | Supprimer une sous-tâche |

Paramètres de `GET /api/tasks` :

- `view` : `active` (défaut), `archived`, `trash`
- `status`, `priority`, `tagId` : une ou plusieurs valeurs séparées par des virgules (`status=TODO,IN_PROGRESS`)
- `projectId` : id d'une liste, ou `none` pour les tâches sans liste
- `q` : recherche (titre, description, sous-tâches), insensible à la casse
- `dueFrom` / `dueTo` : intervalle d'échéance `[dueFrom, dueTo[` ; `noDue=true` pour les tâches sans échéance
- `sort` : `position` (défaut), `dueDate`, `priority`, `createdAt`, `updatedAt`, `title` ; `order` : `asc` / `desc`
