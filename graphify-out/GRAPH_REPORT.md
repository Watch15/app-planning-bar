# Graph Report - app-planning-bar  (2026-08-13)

## Corpus Check
- 58 files · ~237,030 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1355 nodes · 2177 edges · 78 communities (68 shown, 10 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 86 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `50b8f8aa`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Planning Board UI|Planning Board UI]]
- [[_COMMUNITY_Architecture & Design Rationale|Architecture & Design Rationale]]
- [[_COMMUNITY_html2canvas Render Engine|html2canvas Render Engine]]
- [[_COMMUNITY_html2canvas Parser|html2canvas Parser]]
- [[_COMMUNITY_Main Planning Script (State)|Main Planning Script (State)]]
- [[_COMMUNITY_Express Server & API|Express Server & API]]
- [[_COMMUNITY_Week Data Loading|Week Data Loading]]
- [[_COMMUNITY_NPM Dependencies|NPM Dependencies]]
- [[_COMMUNITY_Time Clock (Pointage)|Time Clock (Pointage)]]
- [[_COMMUNITY_Dispo Control Init|Dispo Control Init]]
- [[_COMMUNITY_Shift CRUD & Rendering|Shift CRUD & Rendering]]
- [[_COMMUNITY_Shared Utils & Validation|Shared Utils & Validation]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_PWA Manifest|PWA Manifest]]
- [[_COMMUNITY_Staff Card Styling|Staff Card Styling]]
- [[_COMMUNITY_Week Calculation Module|Week Calculation Module]]
- [[_COMMUNITY_Shift Hours Module|Shift Hours Module]]
- [[_COMMUNITY_Account Management UI|Account Management UI]]
- [[_COMMUNITY_Patron Creation Script|Patron Creation Script]]
- [[_COMMUNITY_Establishment Management|Establishment Management]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_html2canvas Helpers|html2canvas Helpers]]
- [[_COMMUNITY_html2canvas Color|html2canvas Color]]
- [[_COMMUNITY_Session Management|Session Management]]
- [[_COMMUNITY_Tap Selection|Tap Selection]]
- [[_COMMUNITY_Timeline Rendering|Timeline Rendering]]
- [[_COMMUNITY_Shift Drag Interaction|Shift Drag Interaction]]
- [[_COMMUNITY_Route Tests|Route Tests]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_html2canvas Internals B|html2canvas Internals B]]
- [[_COMMUNITY_html2canvas SVG Draw|html2canvas SVG Draw]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_PWA App Icons|PWA App Icons]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_DB Init Script|DB Init Script]]
- [[_COMMUNITY_DB Seed Script|DB Seed Script]]
- [[_COMMUNITY_Push Reminder Scheduler|Push Reminder Scheduler]]
- [[_COMMUNITY_Daily Cron Jobs|Daily Cron Jobs]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Service Worker Cache|Service Worker Cache]]
- [[_COMMUNITY_html2canvas Internals F|html2canvas Internals F]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Healthcheck Endpoint|Healthcheck Endpoint]]
- [[_COMMUNITY_Helmet Security Headers|Helmet Security Headers]]
- [[_COMMUNITY_Build-less Frontend|Build-less Frontend]]
- [[_COMMUNITY_In-Memory Rate Limiter|In-Memory Rate Limiter]]
- [[_COMMUNITY_Resend Email API|Resend Email API]]
- [[_COMMUNITY_Sentry Observability|Sentry Observability]]
- [[_COMMUNITY_Twilio SMS API|Twilio SMS API]]
- [[_COMMUNITY_Privacy Policy (RGPD)|Privacy Policy (RGPD)]]
- [[_COMMUNITY_Monthly Patron Recap|Monthly Patron Recap]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]

## God Nodes (most connected - your core abstractions)
1. `_()` - 36 edges
2. `Tests & sécurité — ouvert (revue du 2026-08-04/05)` - 34 edges
3. `toDateStr()` - 31 edges
4. `m()` - 31 edges
5. `addDays()` - 29 edges
6. `showToast()` - 25 edges
7. `init()` - 21 edges
8. `makeDb()` - 21 edges
9. `3. Fonctionnalités principales` - 21 edges
10. `escapeHtml()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `run()` --calls--> `weekStart()`  [INFERRED]
  scripts/seed-dev.js → public/lib/week.js
- `materializeAllManagerTemplates()` --calls--> `weekStart()`  [INFERRED]
  server.js → public/lib/week.js
- `dispoHorizons()` --calls--> `clampHorizonWeeks()`  [INFERRED]
  server.js → public/lib/week.js
- `horizonWeekDates()` --calls--> `disposHorizonMondays()`  [INFERRED]
  tests/helpers/harness.js → public/lib/week.js
- `Pièges blocs /* F-05 DÉSACTIVÉ */ (D-47)` --references--> `server.js (serveur Express monolithique)`  [EXTRACTED]
  docs/backlog.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Modules UMD partagés navigateur/Node testés** — architecture_umd_module, architecture_week_module, architecture_shift_hours_module, readme_lib_utils [EXTRACTED 0.90]
- **Sûreté timezone via toDateStr** — architecture_timezone_rule, architecture_todatestr, architecture_push_past_shift_guard [EXTRACTED 0.85]
- **Cycle de vie feature iCal (livrée puis désactivée)** — backlog_f09_ical, architecture_ical_feed, architecture_calendar_enabled_flag [EXTRACTED 0.90]

## Communities (78 total, 10 thin omitted)

### Community 0 - "Planning Board UI"
Cohesion: 0.05
Nodes (67): addDays(), allEstablishments, allStaff, applyCongeModes(), applyStatsPeriod(), buildHistStatsHtml(), buildTeamDisplayNames(), cancelConge() (+59 more)

### Community 1 - "Architecture & Design Rationale"
Cohesion: 0.18
Nodes (14): hourly_rate_snapshot / fixed_rate_snapshot, Modèle de données shifts, Modes de rémunération staff (Mutual exclusion Option A), F-06 Joker ouvert au staff (candidatures), Nom staff dénormalisé (source de vérité D-77), performance.html (pilotage économique), pointage.html (compte établissement), Disponibilités staff & patron (+6 more)

### Community 2 - "html2canvas Render Engine"
Cohesion: 0.04
Nodes (18): Be(), cn(), Cs(), dA(), E(), FA(), gs(), hA() (+10 more)

### Community 3 - "html2canvas Parser"
Cohesion: 0.13
Nodes (36): Ae(), mr(), QB(), re(), se(), SUPPORT_WORD_BREAKING(), w(), _() (+28 more)

### Community 4 - "Main Planning Script (State)"
Cohesion: 0.03
Nodes (66): allEstablishments, allGroups, allRoles, allStaff, AUTO_COLORS, _autoScroll, _btnCopyWeek, buildEstablishmentSelect() (+58 more)

### Community 5 - "Express Server & API"
Cohesion: 0.03
Nodes (30): isFullRangeOnConge(), app, bcrypt, canAccessEstablishment(), client, cors, crypto, DEPLOYED_COMMIT (+22 more)

### Community 6 - "Week Data Loading"
Cohesion: 0.10
Nodes (42): addDays(), disposScopeQS(), exportWeekCSV(), formatDateShort(), getMondayOf(), isToday(), loadCongesList(), loadDisposHistory() (+34 more)

### Community 7 - "NPM Dependencies"
Cohesion: 0.05
Nodes (38): dependencies, bcryptjs, cors, dotenv, express, express-session, helmet, mongodb (+30 more)

### Community 8 - "Time Clock (Pointage)"
Cohesion: 0.13
Nodes (23): activeStaff, allStaff, buildShiftCard(), checkAuth(), fmtH(), getActiveDate(), init(), initExtraForm() (+15 more)

### Community 9 - "Dispo Control Init"
Cohesion: 0.11
Nodes (22): acknowledgeOffDispo(), buildStaffDisplayNames(), checkAuth(), decideConge(), init(), initDropZone(), initNotifListeners(), initStaffSearch() (+14 more)

### Community 10 - "Shift CRUD & Rendering"
Cohesion: 0.09
Nodes (20): makeCollection(), makeDb(), dispoMateriallyDiffers(), staffReopenedFor(), { app, startApp, stopApp, req, horizonWeekDates }, assert, {
    disposHorizonRange, disposHorizonMondays, clampHorizonWeeks,
    DISPO_HORIZON_MAX, dispoMateriallyDiffers, staffReopenedFor,
}, { makeDb } (+12 more)

### Community 11 - "Shared Utils & Validation"
Cohesion: 0.11
Nodes (15): chargeMultiplier(), computeActiveDate(), dispoDeadlineWaived(), hashToken(), normalizePhone(), normalizePublishDoc(), resolvePerfSettings(), fetchPublishedWeeks() (+7 more)

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (10): { app, startApp, stopApp, req }, assert, DIR, ETAB, { makeDb }, OBS, PATRON, RESP_USER (+2 more)

### Community 13 - "PWA Manifest"
Cohesion: 0.18
Nodes (10): background_color, description, display, icons, name, orientation, short_name, shortcuts (+2 more)

### Community 14 - "Staff Card Styling"
Cohesion: 0.12
Nodes (22): applyCardNameContrast(), _buildCongeRow(), createShiftEl(), createStaffRow(), displayName(), escapeHtml(), _fmtCongeDateFr(), _kpiEstabRow() (+14 more)

### Community 15 - "Week Calculation Module"
Cohesion: 0.06
Nodes (30): 10.1 Rectification : ce n'était PAS que de l'ergonomie, 10.2 Livré, 10.3 Ce qui n'avait PAS besoin d'être fait, 10.4 Deux filtres redondants, assumés et étiquetés, 10. B2-b (2026-08-13) — et pourquoi le §2.4 était faux, 1. Besoin et arbitrage, 2.1 L'horizon d'une semaine n'existe pas dans le modèle. C'est une convention du navigateur., 2.2 Le vrai obstacle est la deadline, et elle est à valeur unique. (+22 more)

### Community 16 - "Shift Hours Module"
Cohesion: 0.33
Nodes (8): fmtClock(), fmtDurationH(), fmtHourOfDay(), shiftDurationHours(), shiftEffectiveHours(), assert, { shiftEffectiveHours, shiftDurationHours, fmtHourOfDay, fmtClock, fmtDurationH }, { test }

### Community 17 - "Account Management UI"
Cohesion: 0.25
Nodes (8): loadStaffNotesList(), matchesWordPrefix(), normalizeStr(), openStaffModal(), populateStaffManageFilters(), renderCongesListPatron(), renderStaffManageList(), renderStaffNotesList()

### Community 18 - "Patron Creation Script"
Cohesion: 0.07
Nodes (32): ask(), bcrypt, main(), { openDb }, readline, rl, loadEnv(), { MongoClient } (+24 more)

### Community 19 - "Establishment Management"
Cohesion: 0.11
Nodes (18): 1. Notre méthode de travail : c'est de l'agile *léger*, pas du Scrum, 2. CI/CD : on a une vraie CI + un CD découplé (donc *pas* un pipeline CI/CD intégré), 3. Axes d'amélioration — priorisés, 4. Résumé exécutif, Ce qui est sain, Ce qui manque pour « mûrir » la méthode, Comment ça se traduit concrètement, Côté méthode (process) (+10 more)

### Community 20 - "Community 20"
Cohesion: 0.20
Nodes (11): Garde B-10 — pas de push pour shift passé, Service Worker / PWA (Cache First, BUILD_TIME), Règle timezone — jamais toISOString(), toDateStr() helper, Architecture Web Push (VAPID), GitHub Actions CI Workflow, Node 20/22 Test Matrix, CI Syntax Check (node -c) (+3 more)

### Community 21 - "html2canvas Helpers"
Cohesion: 0.57
Nodes (7): hideError(), loginEmail(), loginPhone(), redirectByRole(), setLoading(), showError(), switchMode()

### Community 22 - "html2canvas Color"
Cohesion: 0.18
Nodes (11): ee(), fe(), He(), ie(), KB(), ne(), oe(), te() (+3 more)

### Community 23 - "Session Management"
Cohesion: 0.50
Nodes (4): CustomMongoStore (sessions promesses), SESSION_SECRET obligatoire en production, Session TTL 30 jours glissant (rolling/touch), Trust proxy en production (Railway)

### Community 24 - "Tap Selection"
Cohesion: 0.05
Nodes (41): 10. Déploiement (Railway), 11. Headers de sécurité (helmet), 12. Observabilité, 13. Tests & CI, 14. Synchronisation agenda — flux iCal (D-72), 1. Stack, 2. Structure du projet, 3.1 Fuseau horaire — NE JAMAIS utiliser `toISOString()` (+33 more)

### Community 25 - "Timeline Rendering"
Cohesion: 0.05
Nodes (41): Hiérarchie des rôles & middlewares auth, R-04 Découpage server.js en routers (reporté), Auth, Authentification, Cache Service Worker — ne pas toucher `%%BUILD_TIME%%`, Collections MongoDB, Commandes, Comptes & Staff (+33 more)

### Community 26 - "Shift Drag Interaction"
Cohesion: 0.06
Nodes (33): 1. Objet, 2. Utilisateurs & Rôles, 3.10 Publication, 3.11 Vue Staff (`planning.html`), 3.12 PWA, 3.13 Transfert de shift cross-établissement, 3.14 Recherche insensible aux accents, 3.15 SMS (Twilio) (+25 more)

### Community 27 - "Route Tests"
Cohesion: 0.15
Nodes (18): BASE, D(), expectIdx, FROM, git(), jar, login(), main() (+10 more)

### Community 28 - "Community 28"
Cohesion: 0.20
Nodes (7): scopeManagerOff(), validateOffPeriod(), assert, metaById, offs, { test }, { validateOffPeriod, scopeManagerOff }

### Community 29 - "html2canvas Internals B"
Cohesion: 0.10
Nodes (15): { app, startApp, stopApp, req, horizonWeekDates }, assert, closedSettings, DIR_BAR1, DIRECTEUR, { makeDb }, NEXT_MONDAY, PATRON (+7 more)

### Community 30 - "html2canvas SVG Draw"
Cohesion: 0.50
Nodes (4): gr(), Lr(), pr(), SUPPORT_FOREIGNOBJECT_DRAWING()

### Community 31 - "Community 31"
Cohesion: 0.29
Nodes (5): fs, path, root, { spawn }, TARGETS

### Community 32 - "PWA App Icons"
Cohesion: 1.00
Nodes (3): App Icon 192px (White T on Purple), App Icon 512px (White T on Purple), App Icon 72px (White T on Purple)

### Community 33 - "Community 33"
Cohesion: 0.16
Nodes (23): allEstabs, checkAuth(), currentData, dateLabel(), escapeHtml(), fmtEUR(), fmtHours(), fmtPct() (+15 more)

### Community 34 - "DB Init Script"
Cohesion: 0.33
Nodes (4): child, path, { spawn }, [target, ...rest]

### Community 35 - "DB Seed Script"
Cohesion: 0.40
Nodes (5): check(), an(), fn(), Pt(), sn()

### Community 36 - "Push Reminder Scheduler"
Cohesion: 0.20
Nodes (14): _autoScrollTick(), clearDragHighlights(), onMove(), onSidebarDragEnd(), onSidebarDragStart(), onTouchEnd(), onTouchMove(), _setSwapTarget() (+6 more)

### Community 37 - "Daily Cron Jobs"
Cohesion: 0.50
Nodes (3): globals, js, sharedRules

### Community 38 - "Community 38"
Cohesion: 0.17
Nodes (24): addManagerOff(), applyShiftAssignment(), assignStaffToJoker(), batchToast(), createShift(), deleteShift(), generatePrintGantt(), _ignoreNonAffectee() (+16 more)

### Community 39 - "Community 39"
Cohesion: 0.20
Nodes (9): 1. Design System existant, 3. Priorités recommandées, 4. Palette — tokens à ajouter (non prioritaire), 5. Flux utilisateur — frictions identifiées, Tokens couleurs (style.css), Typographie, UX Design — Templyo, login.html (page de connexion) (+1 more)

### Community 40 - "Community 40"
Cohesion: 0.05
Nodes (36): 0. En une phrase, 10. PWA / Service Worker, 11. Intégrations externes, 12. Tests & CI, 13. Documentation (`docs/`) & conventions, 14. Parcours de prise en main recommandé, 1. Démarrer en local (5 minutes), 2. Les 6 règles d'or (à ne JAMAIS enfreindre) (+28 more)

### Community 41 - "Community 41"
Cohesion: 0.39
Nodes (7): closeMobileDrawer(), _closeStaffBar(), openDispoSettingsMobile(), openMobileDrawer(), _openStaffBar(), syncDrawerDispoToggle(), toggleStaffBar()

### Community 42 - "Community 42"
Cohesion: 0.12
Nodes (21): app, baseUrl(), { disposHorizonMondays }, horizonWeekDates(), startApp(), stopApp(), splitDisposByConges(), { app, startApp, stopApp, baseUrl, horizonWeekDates } (+13 more)

### Community 43 - "Community 43"
Cohesion: 0.18
Nodes (8): { app, startApp, stopApp, req, baseUrl }, assert, bcrypt, EQUIPIER, { makeDb }, PATRON, seed(), { test, before, after, beforeEach }

### Community 46 - "html2canvas Internals F"
Cohesion: 0.18
Nodes (11): A(), CA(), fr(), Hn(), Xt(), C(), Dt(), n() (+3 more)

### Community 47 - "Community 47"
Cohesion: 0.22
Nodes (8): 1. L'application change un peu d'allure, 2. La page Performance ne montre plus que le « chargé », 3. Vos directeurs deviennent des membres de l'équipe à part entière, 4. La file d'attente des disponibilités est filtrée pour les directeurs, 5. Les changements de droits s'appliquent tout de suite, 6. Retirer quelqu'un de l'équipe sans perdre ses heures, Ce qui ne change pas, Templyo — ce qui change à la prochaine mise à jour

### Community 57 - "Community 57"
Cohesion: 0.33
Nodes (6): addEstablishment(), loadGroups(), openEstablishmentsModal(), renderEstablishmentsList(), renderGroupFilter(), renderTabs()

### Community 58 - "Community 58"
Cohesion: 0.15
Nodes (12): req(), postOneDispo(), putTemplate(), { app, startApp, stopApp, req }, assert, DIRECTEUR, { makeDb }, OBSERVATEUR (+4 more)

### Community 59 - "Community 59"
Cohesion: 0.33
Nodes (7): public/lib/shift-hours.js (heures effectives), Module UMD partagé navigateur/Node, WEEK_CUTOFF_HOUR = 6 (cutoff semaine en cours), public/lib/week.js (weekStart/currentWeekStart), Refacto incrémentale (modèle D-73), planning.html (interface staff), Onglet Mon équipe (responsable)

### Community 60 - "Community 60"
Cohesion: 0.06
Nodes (32): 5 échecs au smoke `dev` — aucun n'était un bug du produit (2026-08-10), Audit complet du jeu de recette (2026-08-07), Audit Railway complet (2026-08-05) — origine, variables, secrets, Base de recette (2026-08-05), 🔴 CI rouge depuis 3 jours, `main` non déployé — les logs HTTP cassaient le runner (2026-08-10), Colonne « Masse sal. brute » dans le tableau Performance (2026-08-07), Divers — outillage & process, Documentation — contradictions relevées (audit du 2026-08-05) (+24 more)

### Community 61 - "Community 61"
Cohesion: 0.15
Nodes (13): { app, startApp, stopApp, req, horizonWeekDates }, assert, day(), DIRECTEUR, { dispoEventDelta }, { makeDb }, PATRON, postDispos() (+5 more)

### Community 62 - "Community 62"
Cohesion: 0.17
Nodes (11): Pièges blocs /* F-05 DÉSACTIVÉ */ (D-47), F-05 Échange de shifts (désactivé), Backlog — Templyo, Déjà livré / non prioritaire, Fait, Notes pour les agents, P1 — Bugs bloquants (à faire en premier), P2 — Améliorations (après les P1) (+3 more)

### Community 63 - "Community 63"
Cohesion: 0.18
Nodes (5): { app, startApp, stopApp, req }, assert, { makeDb }, PATRON, { test, before, after, beforeEach }

### Community 64 - "Community 64"
Cohesion: 0.12
Nodes (15): 10. La semaine-type part À la deadline, jamais avant (2026-08-10), 1. Besoin exprimé, 2. La contrainte qui bloque (fait vérifié dans le code), 3. Deux modèles possibles, 4. Points durs transverses, 5. Décisions à prendre, 6. Recommandation, 6bis. Plan d'implémentation (Modèle A, retenu) (+7 more)

### Community 65 - "Community 65"
Cohesion: 0.18
Nodes (13): isValidObjectId(), shouldMaterializeTemplate(), archivedIdsAmong(), archivedStaff(), checkDispoRappels(), cleanupOldJokers(), computeEffectiveDeadline(), connectDB() (+5 more)

### Community 66 - "Community 66"
Cohesion: 0.29
Nodes (9): contains(), eq(), isObjId(), isOperator(), matchDoc(), matchField(), plainEq(), pullHits() (+1 more)

### Community 67 - "Community 67"
Cohesion: 0.13
Nodes (24): congeCoversDate(), congeDaysInRange(), crypto, datesOverlap(), DISPO_AUDIT_FIELDS, isAutoPublished(), isDatePublished(), PERF_DEFAULTS (+16 more)

### Community 68 - "Community 68"
Cohesion: 0.14
Nodes (9): { app, startApp, stopApp, req }, assert, CUR, { makeDb }, N1, N2, STAFF, { test, before, after } (+1 more)

### Community 69 - "Community 69"
Cohesion: 0.31
Nodes (6): install(), samePathname(), shouldRedirectOn401(), assert, { shouldRedirectOn401, samePathname, install }, { test }

### Community 70 - "Community 70"
Cohesion: 0.22
Nodes (10): classifyDirectorLinks(), normName(), pickStaffColor(), APPLY, CREATE, main(), { openDb }, { pickStaffColor, classifyDirectorLinks } (+2 more)

### Community 71 - "Community 71"
Cohesion: 0.13
Nodes (19): applyVenueHours(), applyViewMode(), buildDisplayedStaff(), buildRoleFilters(), extendDisplayForRealHours(), formatDateLong(), loadDayDetail(), loadEstablishments() (+11 more)

### Community 72 - "Community 72"
Cohesion: 0.33
Nodes (6): buildTemplateDispos(), datesCoveredByPeriods(), dispoEventDelta(), managerOffPeriods(), materializeManagerTemplateWeek(), recordDispoEvents()

### Community 73 - "Community 73"
Cohesion: 0.25
Nodes (8): 2.1 login.html, 2.2 set-password.html, 2.3 index.html (Patron / Directeur), 2.4 planning.html (Staff), 2.5 pointage.html, 2.6 performance.html (Patron / Directeur — pilotage économique), 2.7 politique-confidentialite.html, 2. Audit page par page

### Community 74 - "Community 74"
Cohesion: 0.28
Nodes (9): activeStaff(), openAccountsModal(), populateBarsCheckboxes(), populateStaffSelect(), renderAccountsList(), renderPendingInvites(), renderRestDaysTab(), switchAccountsTab() (+1 more)

### Community 75 - "Community 75"
Cohesion: 0.33
Nodes (6): Ce qui n'a pas bougé et pèse toujours, Documentation remise à jour dans cette passe, Le seul vrai « reste à faire » avant tout le monde : livrer les 2 commits en attente, Prochaine MAJ — lot proposé, Revue d'ensemble — état du projet au 2026-08-10, État vérifié

### Community 76 - "Community 76"
Cohesion: 0.40
Nodes (5): Devant les features, Le risque structurel le plus lourd, qui n'est pas une feature, Les autres features, par nécessité décroissante, Priorisation — revue de l'ensemble (2026-08-08), Reclassement de la Feature A — c'est un correctif, pas un confort

### Community 77 - "Community 77"
Cohesion: 1.00
Nodes (3): Flag CALENDAR_ENABLED (iCal désactivé D-83), Synchronisation agenda — flux iCal (D-72), F-09 Abonnement agenda iCal

## Knowledge Gaps
- **541 isolated node(s):** `js`, `globals`, `sharedRules`, `crypto`, `{
    weekStart, currentWeekStart, WEEK_CUTOFF_HOUR, toDateStr, disposWeekStart,
    disposHorizonRange, disposHorizonMondays, clampHorizonWeeks, DISPO_HORIZON_MAX,
}` (+536 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `check()` connect `DB Seed Script` to `Route Tests`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `fn()` connect `DB Seed Script` to `html2canvas Render Engine`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **Why does `Backlog — Templyo` connect `Community 62` to `Community 60`, `Community 77`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `m()` (e.g. with `Ee()` and `Ae()`) actually correct?**
  _`m()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **What connects `js`, `globals`, `sharedRules` to the rest of the system?**
  _546 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Planning Board UI` be split into smaller, more focused modules?**
  _Cohesion score 0.051929824561403506 - nodes in this community are weakly interconnected._
- **Should `html2canvas Render Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.03989071038251366 - nodes in this community are weakly interconnected._