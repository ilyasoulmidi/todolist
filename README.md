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
