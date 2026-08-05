# Graph Report - app-planning-bar  (2026-08-05)

## Corpus Check
- 40 files · ~169,457 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1045 nodes · 1699 edges · 72 communities (60 shown, 12 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 82 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b15b8dc6`
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

## God Nodes (most connected - your core abstractions)
1. `_()` - 36 edges
2. `m()` - 31 edges
3. `toDateStr()` - 30 edges
4. `addDays()` - 28 edges
5. `showToast()` - 24 edges
6. `3. Fonctionnalités principales` - 21 edges
7. `init()` - 20 edges
8. `loadDayDetail()` - 17 edges
9. `escapeHtml()` - 17 edges
10. `make_xlsx_lib()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `materializeAllManagerTemplates()` --calls--> `weekStart()`  [INFERRED]
  server.js → public/lib/week.js
- `Disponibilités staff & patron` --implements--> `planning.html (interface staff)`  [INFERRED]
  docs/prd.md → public/planning.html
- `Onglet Mon équipe (responsable)` --implements--> `planning.html (interface staff)`  [INFERRED]
  docs/prd.md → public/planning.html
- `fullWeekCongeSet()` --calls--> `isFullRangeOnConge()`  [EXTRACTED]
  server.js → lib/utils.js
- `main()` --calls--> `pickStaffColor()`  [EXTRACTED]
  scripts/backfill-director-staff.js → lib/utils.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Modules UMD partagés navigateur/Node testés** — architecture_umd_module, architecture_week_module, architecture_shift_hours_module, readme_lib_utils [EXTRACTED 0.90]
- **Sûreté timezone via toDateStr** — architecture_timezone_rule, architecture_todatestr, architecture_push_past_shift_guard [EXTRACTED 0.85]
- **Cycle de vie feature iCal (livrée puis désactivée)** — backlog_f09_ical, architecture_ical_feed, architecture_calendar_enabled_flag [EXTRACTED 0.90]

## Communities (72 total, 12 thin omitted)

### Community 0 - "Planning Board UI"
Cohesion: 0.05
Nodes (64): addDays(), allEstablishments, allStaff, applyCongeModes(), applyStatsPeriod(), buildHistStatsHtml(), buildTeamDisplayNames(), cancelConge() (+56 more)

### Community 1 - "Architecture & Design Rationale"
Cohesion: 0.18
Nodes (14): hourly_rate_snapshot / fixed_rate_snapshot, Modèle de données shifts, Modes de rémunération staff (Mutual exclusion Option A), F-06 Joker ouvert au staff (candidatures), Nom staff dénormalisé (source de vérité D-77), performance.html (pilotage économique), pointage.html (compte établissement), Disponibilités staff & patron (+6 more)

### Community 2 - "html2canvas Render Engine"
Cohesion: 0.04
Nodes (17): an(), Be(), cn(), Cs(), E(), fn(), gs(), I() (+9 more)

### Community 3 - "html2canvas Parser"
Cohesion: 0.13
Nodes (36): Ae(), mr(), QB(), re(), se(), SUPPORT_WORD_BREAKING(), w(), _() (+28 more)

### Community 4 - "Main Planning Script (State)"
Cohesion: 0.03
Nodes (60): allEstablishments, allGroups, allRoles, allStaff, AUTO_COLORS, _autoScroll, _btnCopyWeek, buildEstablishmentSelect() (+52 more)

### Community 5 - "Express Server & API"
Cohesion: 0.04
Nodes (27): app, bcrypt, canAccessEstablishment(), checkDispoRappels(), cleanupOldJokers(), client, computeEffectiveDeadline(), connectDB() (+19 more)

### Community 6 - "Week Data Loading"
Cohesion: 0.11
Nodes (36): addDays(), exportWeekCSV(), formatDateShort(), generatePrintGantt(), getMondayOf(), isToday(), loadDisposList(), loadModifyTab() (+28 more)

### Community 7 - "NPM Dependencies"
Cohesion: 0.06
Nodes (30): dependencies, bcryptjs, cors, dotenv, express, express-session, helmet, mongodb (+22 more)

### Community 8 - "Time Clock (Pointage)"
Cohesion: 0.14
Nodes (22): allStaff, buildShiftCard(), checkAuth(), fmtH(), getActiveDate(), init(), initExtraForm(), initRevenueForm() (+14 more)

### Community 9 - "Dispo Control Init"
Cohesion: 0.11
Nodes (22): acknowledgeOffDispo(), buildStaffDisplayNames(), checkAuth(), decideConge(), init(), initDropZone(), initNotifListeners(), initStaffSearch() (+14 more)

### Community 10 - "Shift CRUD & Rendering"
Cohesion: 0.22
Nodes (9): loadCongesList(), loadStaffNotesList(), matchesWordPrefix(), normalizeStr(), openStaffModal(), populateStaffManageFilters(), renderCongesListPatron(), renderStaffManageList() (+1 more)

### Community 11 - "Shared Utils & Validation"
Cohesion: 0.11
Nodes (23): chargeMultiplier(), computeActiveDate(), congeCoversDate(), congeDaysInRange(), crypto, datesOverlap(), dispoDeadlineWaived(), hashToken() (+15 more)

### Community 12 - "Community 12"
Cohesion: 0.20
Nodes (9): Backlog — Templyo, Déjà livré / non prioritaire, Fait, Notes pour les agents, P1 — Bugs bloquants (à faire en premier), P2 — Améliorations (après les P1), P2 — Audit ergonomie restant (mai 2026), P3 — Nouvelles fonctionnalités (roadmap) (+1 more)

### Community 13 - "PWA Manifest"
Cohesion: 0.18
Nodes (10): background_color, description, display, icons, name, orientation, short_name, shortcuts (+2 more)

### Community 14 - "Staff Card Styling"
Cohesion: 0.12
Nodes (22): _buildCongeRow(), createShiftEl(), createStaffRow(), displayName(), escapeHtml(), _fmtCongeDateFr(), _kpiEstabRow(), _kpiProgressBar() (+14 more)

### Community 15 - "Week Calculation Module"
Cohesion: 0.25
Nodes (8): disposWeekStart(), isAutoPublished(), isDatePublished(), currentWeekStart(), weekStart(), assert, { test }, { weekStart, currentWeekStart, WEEK_CUTOFF_HOUR }

### Community 16 - "Shift Hours Module"
Cohesion: 0.33
Nodes (8): fmtClock(), fmtDurationH(), fmtHourOfDay(), shiftDurationHours(), shiftEffectiveHours(), assert, { shiftEffectiveHours, shiftDurationHours, fmtHourOfDay, fmtClock, fmtDurationH }, { test }

### Community 17 - "Account Management UI"
Cohesion: 0.38
Nodes (7): openAccountsModal(), populateBarsCheckboxes(), populateStaffSelect(), renderAccountsList(), renderPendingInvites(), switchAccountsTab(), _updatePendingBadge()

### Community 18 - "Patron Creation Script"
Cohesion: 0.33
Nodes (6): ask(), bcrypt, main(), { MongoClient }, readline, rl

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
Cohesion: 0.15
Nodes (12): Hiérarchie des rôles & middlewares auth, Collections MongoDB, Commandes, Installation, Rôles utilisateurs (patron/directeur/staff/etablissement), Rôles utilisateurs, Stack technique Templyo, Stack technique (+4 more)

### Community 26 - "Shift Drag Interaction"
Cohesion: 0.06
Nodes (33): 1. Objet, 2. Utilisateurs & Rôles, 3.10 Publication, 3.11 Vue Staff (`planning.html`), 3.12 PWA, 3.13 Transfert de shift cross-établissement, 3.14 Recherche insensible aux accents, 3.15 SMS (Twilio) (+25 more)

### Community 27 - "Route Tests"
Cohesion: 0.50
Nodes (3): app, assert, { test, before, after }

### Community 28 - "Community 28"
Cohesion: 0.20
Nodes (7): scopeManagerOff(), validateOffPeriod(), assert, metaById, offs, { test }, { validateOffPeriod, scopeManagerOff }

### Community 29 - "html2canvas Internals B"
Cohesion: 0.11
Nodes (15): app, assert, closedSettings, DIR_BAR1, DIRECTEUR, { makeDb }, NEXT_MONDAY, PATRON (+7 more)

### Community 30 - "html2canvas SVG Draw"
Cohesion: 0.50
Nodes (4): gr(), Lr(), pr(), SUPPORT_FOREIGNOBJECT_DRAWING()

### Community 31 - "Community 31"
Cohesion: 0.20
Nodes (10): Auth, Comptes & Staff, Disponibilités, Infra, Performance / CA, Routes API principales, Shifts & Pointage, Web Push & Notifications (+2 more)

### Community 32 - "PWA App Icons"
Cohesion: 1.00
Nodes (3): App Icon 192px (White T on Purple), App Icon 512px (White T on Purple), App Icon 72px (White T on Purple)

### Community 33 - "Community 33"
Cohesion: 0.16
Nodes (23): allEstabs, checkAuth(), currentData, dateLabel(), escapeHtml(), fmtEUR(), fmtHours(), fmtPct() (+15 more)

### Community 36 - "Push Reminder Scheduler"
Cohesion: 0.36
Nodes (9): _autoScrollTick(), onMove(), onSidebarDragStart(), onTouchMove(), _setSwapTarget(), _shiftElAtPoint(), startAutoScroll(), updateAutoScrollPos() (+1 more)

### Community 37 - "Daily Cron Jobs"
Cohesion: 0.50
Nodes (3): globals, js, sharedRules

### Community 38 - "Community 38"
Cohesion: 0.15
Nodes (27): addManagerOff(), applyShiftAssignment(), assignStaffToJoker(), clearDragHighlights(), createShift(), deleteShift(), _ignoreNonAffectee(), loadManagerOff() (+19 more)

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
Cohesion: 0.20
Nodes (7): splitDisposByConges(), app, assert, { makeDb }, { splitDisposByConges, isFullRangeOnConge }, { test, before, after }, USER

### Community 43 - "Community 43"
Cohesion: 0.25
Nodes (8): 2.1 login.html, 2.2 set-password.html, 2.3 index.html (Patron / Directeur), 2.4 planning.html (Staff), 2.5 pointage.html, 2.6 performance.html (Patron / Directeur — pilotage économique), 2.7 politique-confidentialite.html, 2. Audit page par page

### Community 46 - "html2canvas Internals F"
Cohesion: 0.18
Nodes (11): A(), CA(), fr(), Hn(), Xt(), C(), Dt(), n() (+3 more)

### Community 47 - "Community 47"
Cohesion: 0.25
Nodes (8): Authentification, Fonctionnalités, Performance (`performance.html`), Pointage (`pointage.html`), PWA, Vue patron (`index.html`), Vue staff (`planning.html`), Web Push

### Community 57 - "Community 57"
Cohesion: 0.15
Nodes (17): applyVenueHours(), applyViewMode(), buildDisplayedStaff(), buildRoleFilters(), extendDisplayForRealHours(), formatDateLong(), loadDayDetail(), loadEstablishments() (+9 more)

### Community 58 - "Community 58"
Cohesion: 0.18
Nodes (10): app, assert, DIRECTEUR, { makeDb }, OBSERVATEUR, patch(), PATRON, req() (+2 more)

### Community 59 - "Community 59"
Cohesion: 0.40
Nodes (6): public/lib/shift-hours.js (heures effectives), Module UMD partagé navigateur/Node, public/lib/week.js (weekStart/currentWeekStart), Refacto incrémentale (modèle D-73), planning.html (interface staff), Onglet Mon équipe (responsable)

### Community 60 - "Community 60"
Cohesion: 0.18
Nodes (11): Divers — outillage & process, Documentation — contradictions relevées (audit du 2026-08-05), Findings de revue restants (hors sécurité), Livré pendant la session du 2026-08-04/05, Livré pendant la session du 2026-08-05 (palier 1 — refermer E-22), Palier 2 — sécurité (2026-08-05), Questions en attente de réponse, Sécurité — à traiter (+3 more)

### Community 61 - "Community 61"
Cohesion: 0.33
Nodes (6): Cache Service Worker — ne pas toucher `%%BUILD_TIME%%`, Helpers purs → `lib/utils.js`, Règles techniques à ne jamais casser, `script.js` — monolithique, ne pas découper, Sessions MongoDB — promesses uniquement, Timezone — jamais `toISOString()`

### Community 62 - "Community 62"
Cohesion: 0.33
Nodes (7): buildTemplateDispos(), datesCoveredByPeriods(), isFullRangeOnConge(), toDateStr(), fullWeekCongeSet(), managerOffPeriods(), materializeManagerTemplateWeek()

### Community 63 - "Community 63"
Cohesion: 0.50
Nodes (4): Pièges blocs /* F-05 DÉSACTIVÉ */ (D-47), F-05 Échange de shifts (désactivé), R-04 Découpage server.js en routers (reporté), server.js (serveur Express monolithique)

### Community 64 - "Community 64"
Cohesion: 0.14
Nodes (13): 1. Besoin exprimé, 2. La contrainte qui bloque (fait vérifié dans le code), 3. Deux modèles possibles, 4. Points durs transverses, 5. Décisions à prendre, 6. Recommandation, 6bis. Plan d'implémentation (Modèle A, retenu), 7. Impact sur le travail déjà fait (+5 more)

### Community 65 - "Community 65"
Cohesion: 0.24
Nodes (9): isValidObjectId(), pickStaffColor(), main(), { MongoClient }, { pickStaffColor }, createManagerStaffProfile(), managerStaffName(), materializeAllManagerTemplates() (+1 more)

### Community 66 - "Community 66"
Cohesion: 0.43
Nodes (5): eq(), isObjId(), isOperator(), matchField(), plainEq()

### Community 67 - "Community 67"
Cohesion: 0.67
Nodes (4): Flag CALENDAR_ENABLED (iCal désactivé D-83), Synchronisation agenda — flux iCal (D-72), WEEK_CUTOFF_HOUR = 6 (cutoff semaine en cours), F-09 Abonnement agenda iCal

### Community 68 - "Community 68"
Cohesion: 0.33
Nodes (6): addEstablishment(), loadGroups(), openEstablishmentsModal(), renderEstablishmentsList(), renderGroupFilter(), renderTabs()

### Community 69 - "Community 69"
Cohesion: 0.40
Nodes (5): makeCollection(), makeDb(), seedKpiDb(), seed(), seedPendingAcrossBars()

### Community 70 - "Community 70"
Cohesion: 0.40
Nodes (5): dA(), FA(), hA(), lA(), UA()

### Community 71 - "Community 71"
Cohesion: 0.67
Nodes (4): applyCardNameContrast(), shiftTextColor(), textColorFor(), updateStaffColor()

## Knowledge Gaps
- **361 isolated node(s):** `js`, `globals`, `sharedRules`, `crypto`, `{ weekStart, currentWeekStart, WEEK_CUTOFF_HOUR }` (+356 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `fmtH()` connect `Time Clock (Pointage)` to `Main Planning Script (State)`, `Community 38`, `Week Data Loading`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **Why does `Backlog — Templyo` connect `Community 12` to `Community 67`, `Community 60`, `Community 63`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `server.js (serveur Express monolithique)` connect `Community 63` to `Timeline Rendering`, `Community 20`, `Community 31`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `m()` (e.g. with `Ee()` and `Ae()`) actually correct?**
  _`m()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **What connects `js`, `globals`, `sharedRules` to the rest of the system?**
  _366 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Planning Board UI` be split into smaller, more focused modules?**
  _Cohesion score 0.0532724505327245 - nodes in this community are weakly interconnected._
- **Should `html2canvas Render Engine` be split into smaller, more focused modules?**
  _Cohesion score 0.04011299435028248 - nodes in this community are weakly interconnected._