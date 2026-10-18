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
