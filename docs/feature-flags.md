# Feature flags client (`CLIENT_PROFILE` + `FEATURE_*`)

Source unique : [`lib/client-features.js`](../lib/client-features.js).  
Front : [`public/lib/client-features.js`](../public/lib/client-features.js) (`ClientFeatures.enabled('…')`).

## Principe

| Couche | Rôle |
|--------|------|
| `CLIENT_PROFILE` | Qui est cette instance (`default`, `castaniu`, …) |
| `FEATURE_*` | Active une feature listée dans le catalogue |
| `profiles` dans le catalogue | Restreint la feature à certains profils |

Activation = **profil autorisé** + **`FEATURE_*=true`** (sauf `defaultOn`).  
`FEATURE_*=force` active même hors profil — recette locale, **et les environnements de recette hébergés** (cf. « Où le flag est posé »).  
`FEATURE_*=false` force off.

## Catalogue actuel

| Clé | Env | Profils | Défaut | Ticket |
|-----|-----|---------|--------|--------|
| `weekly_staff_validation` | `FEATURE_WEEKLY_VALIDATION` | castaniu | off | D-100 |
| `predefined_slots` | `FEATURE_PREDEFINED_SLOTS` | castaniu | **on** | D-101 |

## Où le flag est posé (état au 2026-09-11)

Le catalogue dit ce qu'une feature *peut* être ; seule la config d'une instance dit ce
qu'elle *est*. Les variables Railway ne sont dans aucun fichier du dépôt — se fier au
catalogue seul fait conclure à un bug là où il n'y a qu'une variable absente.

| Instance | `CLIENT_PROFILE` | `FEATURE_PREDEFINED_SLOTS` | D-101 visible |
|---|---|---|---|
| Local `.env` | `castaniu` | `true` | ✅ |
| Local `.env.dev` / `.env.castaniu` | — / `castaniu` | `force` / `true` | ✅ |
| Railway **Dev** (dev.templyo.fr) | *(absent)* | `force` **← posé le 2026-09-11** | ✅ |
| Railway **Demo** / **Prod** interne | *(absent)* | *(absente)* | ❌ |
| Railway **Castaniu Family** (prod client) | `castaniu` | `true` (+ `FEATURE_WEEKLY_VALIDATION=false`) | ✅ |

`force` sur Dev est délibéré : il ouvre **cette seule** feature sans faire passer
dev.templyo.fr en profil `castaniu`, ce qui y allumerait aussi, sans prévenir, toute
future feature castaniu-only. La base reste `templyo_dev` : c'est une recette d'UI,
pas un miroir de la prod client.

**Symptôme à reconnaître :** une feature gated qui marche en local et reste invisible
sur une instance hébergée n'est presque jamais un défaut de code ni un cache — c'est
`CLIENT_PROFILE` / `FEATURE_*` absent de cet environnement. Se lit en une commande :

```
railway variables --environment <Dev|Demo|Prod> --service <Dev|"Castaniu Family"> --json
```

Vérifier quand même que le code est bien déployé avant de conclure :
`curl -s https://dev.templyo.fr/script.js | grep -c proposeWeekSlots`.

## API / UI

- `GET /auth/me` et login → `{ client: { profile, features: { … } } }`
- `GET /api/client-features` (auth)
- Routes métier Castaniu : `requireFeature('weekly_staff_validation')` → 404 si off
- DOM : `<div data-feature="predefined_slots">…</div>` masqué automatiquement via `ClientFeatures.applyDom()`

## Ajouter une feature

1. Entrée dans `FEATURES` (`lib/client-features.js`)
2. Variable dans `.env.castaniu` / Railway Castaniu
3. Brancher UI (`ClientFeatures.enabled` / `data-feature`) + routes (`requireFeature`)
4. Test dans `tests/client-features.test.js`
5. Ligne dans ce doc + backlog

## Pas maintenant — features déjà en prod

Les capacités **déjà déployées** (échanges, Simulation, clôture OTP, jokers par groupe,
observateur, etc.) restent **toujours on** : on ne les passe pas encore par
`FEATURE_*`. Ticket **D-103** (backlog) : migration éventuelle **bien plus tard**,
quand le multi-client le demandera vraiment. Jusque-là le catalogue ne sert qu’au
neuf gated (Castaniu : D-100 / D-101).

## Recette Castaniu

Voir [`setup-castaniu-dev.md`](setup-castaniu-dev.md). Exemple :

```
CLIENT_PROFILE=castaniu
FEATURE_WEEKLY_VALIDATION=false
FEATURE_PREDEFINED_SLOTS=true    # D-101 : on par défaut sur Castaniu ; false pour forcer off
```

`FEATURE_*=force` active même hors profil (`npm run dev`, et l’env Railway **Dev**).
