# Base de recette Castaniu (`templyo_castaniu_dev`)

*Créée le 2026-09-10. Objectif : développer / recetter les features **spécifiques
Castaniu** (D-100 validation hebdo, D-101 créneaux…) **sans** toucher
`gestion_bar` (prod client) ni polluer `templyo_dev` (recette générique).*

## Pourquoi une base à part

| Base | Rôle |
|------|------|
| `templyo_dev` | Recette produit Templyo (tous clients futurs) |
| `templyo_castaniu_dev` | Recette **profil Castaniu** (`CLIENT_PROFILE=castaniu`) |
| `gestion_bar` (cluster prod) | **Prod client — interdite** aux scripts destructifs |

Les flags Castaniu (hebdo, etc.) restent **off** sur `templyo_dev` / démo / autres
clients. On les active seulement quand `CLIENT_PROFILE=castaniu`.

## Mise en place (une fois)

1. Atlas → cluster **recette** (`vab3u2w`, pas `gqfynu8`) → la base
   `templyo_castaniu_dev` apparaîtra au premier seed.
2. Copier [`.env.castaniu.example`](../.env.castaniu.example) → `.env.castaniu`
   (même `MONGO_URI` que `.env.dev`, **`MONGO_DB=templyo_castaniu_dev`**,
   `CLIENT_PROFILE=castaniu`, `OUTBOUND_ENABLED=false`, `CRON_ENABLED=false`).
3. Seed + serveur local :

```bash
npm run castaniu:seed
npm run castaniu:server
```

Comptes = ceux de `seed-dev.js` (`@templyo.test`, mot de passe `SEED_PASSWORD`).

## Commandes

| Script | Effet |
|--------|--------|
| `npm run castaniu:seed` | Wipe + seed-dev sur `templyo_castaniu_dev` |
| `npm run castaniu:server` | `server.js` avec `.env.castaniu` |
| `npm run db:uri:castaniu` | Affiche l’URI (masquée) pour contrôle |

## Garde-fous

- `scripts/_db.js` refuse `gestion_bar` sans `--force`.
- `seed-dev` n’accepte que les bases dont le nom matche `/(dev|main|castaniu)/i`.
- Ne jamais pointer `.env.castaniu` sur le cluster **prod** Castaniu.

## Flags (obligatoire pour les features Castaniu)

Catalogue : [`docs/feature-flags.md`](feature-flags.md) · code : `lib/client-features.js`.

Dans `.env.castaniu` :

```
CLIENT_PROFILE=castaniu
FEATURE_WEEKLY_VALIDATION=false   # D-100 — true seulement quand prêt
FEATURE_PREDEFINED_SLOTS=false    # D-101 — true seulement quand prêt
```

Toute UI / route Castaniu doit passer par `ClientFeatures.enabled(…)` / `requireFeature(…)`.
Sans le bon profil **et** le `FEATURE_*=true`, la feature reste invisible (404 API).

## Lien tickets

- D-100 Validation hebdo — flag `weekly_staff_validation`
- D-101 Créneaux prédéfinis — flag `predefined_slots`
- Perf D-96→D-99 — **pas** gated Castaniu (produit générique)
