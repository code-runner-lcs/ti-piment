# TiPiment

PWA de rencontre — CDC : [`docs/CDC-V1.md`](docs/CDC-V1.md) (V1.1).
Stack : SolidJS (Vite) · Express 5 + TypeORM · PostgreSQL · Redis · TypeScript strict.

## Dev (M0)

```bash
pnpm install
docker compose up -d        # Postgres (5477) + Redis (6380)
pnpm migration:run          # migrations TypeORM
pnpm dev                    # api :3000 + web :5273
```

Ports choisis pour éviter les autres projets Docker du poste (5433/5173 occupés).

## Boucle M0
`/register` → `/login` (JWT HS512 15 min) → `/` appelle `GET /api/me` protégé → message hello.
