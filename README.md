# TiPiment

PWA de rencontre — CDC : [`docs/CDC-V1.md`](docs/CDC-V1.md) (V1.1).
Stack : SolidJS (Vite) · Express 5 + TypeORM · PostgreSQL · Redis · TypeScript strict.

## Dev (M0)

```bash
pnpm install
docker compose up -d        # Postgres (5477) + Redis (6380)
pnpm migration:run          # migrations TypeORM
pnpm --filter @tipiment/api seed   # données de test (dev uniquement, idempotent)
pnpm --filter @tipiment/api test   # 20 tests vitest+supertest (auth, refresh, rate-limit, gate)
pnpm dev                    # api :3000 + web :5273
```

## Données de test (seed)

Créées par `…/seed` — idempotent, bloque en prod, emails `.test` (TLD réservé). Mot de passe commun dev : `Tipiment-dev-2026`

| Email | Rôle | Email vérifié | Intérêt |
|---|---|---|---|
| alice@tipiment.test | user | ✅ | flux nominal |
| bob@tipiment.test | user | ✅ | tests deck/match (M2) |
| diane@tipiment.test | user | ✅ | edge 18+ (2005) |
| charlie@tipiment.test | user | ❌ | gate M1 « Vérifie ton email » |
| admin@tipiment.test | admin | ✅ | back-office (M1) |

Ports choisis pour éviter les autres projets Docker du poste (5433/5173 occupés).

## Boucle M0
`/register` → `/login` (JWT HS512 15 min) → `/` appelle `GET /api/me` protégé → message hello.
