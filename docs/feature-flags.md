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
| `time_tracking` | `FEATURE_TIME_TRACKING` | tous | off | D-103 |
| `performance` | `FEATURE_PERFORMANCE` | tous | off | D-103 |
| `shift_swaps` | `FEATURE_SHIFT_SWAPS` | tous | off | D-103 |
| `calendar_sync` | `FEATURE_CALENDAR_SYNC` | tous | off | D-83 / D-103 |
| `weekly_staff_validation` | `FEATURE_WEEKLY_VALIDATION` | castaniu | off | D-100 |
| `predefined_slots` | `FEATURE_PREDEFINED_SLOTS` | castaniu | **on** | D-101 |

## Matrice contractuelle

La source commerciale/juridique est `juridique/00_Fiche_Tarifaire_Commerciale.txt`,
`02_Projet_CGV_v2.md` (art. 3.1) et `03_Modele_Bon_de_Commande.md` (§3).

| Capacité | Socle Planning | Flag |
|---|---:|---|
| Planning drag & drop, PWA staff, disponibilités, congés, Jokers, exports | oui | aucun — toujours disponible |
| Clôture de service, pointage terrain (OTP, tablette), comptes établissement, audit litiges | non | `time_tracking` |
| CA, masse salariale, ratios, simulation **+ saisie manuelle des heures** (patron/directeur) | non | `performance` |
| Échanges de shifts | non promis au socle | `shift_swaps` |
| Abonnement agenda iCal | expérimental, non promis au socle | `calendar_sync` |
| Validation hebdo et créneaux N+1 Castaniu | développements spécifiques | flags existants |

Les flags portent sur des **frontières de module**, pas sur chaque bouton du socle :
cela évite de créer des combinaisons incohérentes impossibles à vendre ou tester.

> **Arbitrage A (2026-09-16, tranché) :** Formule 3 Performance inclut la **saisie
> manuelle** des heures réelles (modale patron / feuille mobile → `PATCH …/pointage`),
> pour alimenter les KPI réels sans module terrain. Formule 2 reste le pointage de
> terrain (OTP, tablette, comptes établissement, responsable de soirée). Helper
> `canWriteRealHours` = `time_tracking` **OU** `performance`. La Simulation planifiée
> fonctionne avec `performance` seul (hybride : réel si déjà saisi + planifié).

## Presets d'offre

```dotenv
# Formule 1 — Socle Planning
FEATURE_TIME_TRACKING=false
FEATURE_PERFORMANCE=false
FEATURE_SHIFT_SWAPS=false
FEATURE_CALENDAR_SYNC=false

# Formule 2 — Planning + Clôture & Pointage terrain
FEATURE_TIME_TRACKING=true
FEATURE_PERFORMANCE=false

# Formule 3 — Planning + Performance & Simulation
# (inclut saisie manuelle des heures ; pas d'OTP / tablette)
FEATURE_TIME_TRACKING=false
FEATURE_PERFORMANCE=true

# Formule 4 / Pack Fondateur — Pack complet contractuel
FEATURE_TIME_TRACKING=true
FEATURE_PERFORMANCE=true
```

`shift_swaps` et `calendar_sync` restent des activations explicites indépendantes :
elles ne font pas partie des trois modules tarifaires contractuels.

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
5. **Si le code gaté était déjà couvert par une suite existante**, y poser
   `process.env.FEATURE_X = 'force'` dans le `before()` : le harnais ne force que
   `time_tracking` / `performance` / `shift_swaps`, le reste tourne sous le profil par
   défaut, où une feature `profiles: ['castaniu']` est off — et la suite devient rouge.
5. Ligne dans ce doc + backlog

## Portes effectivement protégées

- `time_tracking` : page Pointage, CTA OTP staff, responsables de soirée, comptes
  tablette établissement, réglages et routes pointage/clôture/audit **terrain**.
- `performance` : page Performance, saisie CA, réglages, simulation, taux/forfaits
  staff et routes associées.
- **Heures réelles manuelles** (`canWriteRealHours`) : `PATCH /api/shifts/:id/pointage`
  + modale / feuille d'édition patron — ouvertes si `time_tracking` **ou**
  `performance` (arbitrage A). Effacer les heures passe par le même PATCH.
- `shift_swaps` : actions staff, file patron, réglages et toutes les routes d'échange.
- `calendar_sync` : carte staff et les deux routes iCal. Il remplace l'ancien doublon
  `CALENDAR_ENABLED` serveur + constante front.
- `predefined_slots` : la garde couvre aussi `PATCH .../joker-open`, la lecture staff
  et la candidature ; un ancien `slot_offer` ne contourne donc pas un flag coupé.

Quand un flag est off, l'interface est masquée **et** l'API répond 404 : masquer un
bouton seul n'est jamais considéré comme un contrôle d'accès.

## Recette Castaniu

Voir [`setup-castaniu-dev.md`](setup-castaniu-dev.md). Exemple :

```
CLIENT_PROFILE=castaniu
FEATURE_TIME_TRACKING=true       # Pack Fondateur
FEATURE_PERFORMANCE=true         # Pack Fondateur
FEATURE_WEEKLY_VALIDATION=false
FEATURE_PREDEFINED_SLOTS=true    # D-101 : on par défaut sur Castaniu ; false pour forcer off
```

`FEATURE_*=force` active même hors profil (`npm run dev`, et l’env Railway **Dev**).
