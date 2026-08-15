'use strict';
// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  JEU DE DONNÉES DE DÉMONSTRATION (E-21) — pour montrer Templyo à un prospect  ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
//
// À NE PAS CONFONDRE AVEC `seed-dev.js`. Les deux remplissent la même base, mais
// poursuivent des buts opposés :
//
//   seed-dev.js  → RECETTE  : le strict minimum pour rendre chaque feature observable.
//                  8 shifts, 3 jours de CA. Parfait pour tester, catastrophique à
//                  montrer : un prospect y voit un produit vide.
//   seed-demo.js → VENTE    : un groupe crédible qui tourne depuis deux mois. Le
//                  récap mensuel est plein, la courbe de masse salariale existe,
//                  l'historique de pointage remonte. On montre un outil VIVANT.
//
// ── Ce que le jeu raconte ──────────────────────────────────────────────────────
//   • 3 établissements, 13 personnes, ~2 mois de plannings passés intégralement
//     pointés, avec les écarts planifié/réel qu'on observe en vrai.
//   • Un CA quotidien calculé À REBOURS depuis la masse salariale, pour que le
//     coefficient tombe dans une bande crédible (24–36 %) et se colore contre
//     l'objectif — un CA tiré au hasard donnerait des coefficients absurdes.
//   • Semaine courante PUBLIÉE, semaine suivante en BROUILLON avec sa file de
//     dispos à valider : c'est le cycle dispos → planning → publication, le cœur
//     de la démo.
//   • Tout est RELATIF à aujourd'hui et DÉTERMINISTE (PRNG à graine fixe) : le jeu
//     ne périme jamais et deux démos successives racontent la même histoire.
//
// ── Lancement ──────────────────────────────────────────────────────────────────
//   npm run demo:seed        (base de .env.demo, cf. garde-fou ci-dessous)
//   npm run demo:server      puis http://localhost:3100
//
// ⚠️ SÉCURITÉ — l'instance de démo ne doit joindre PERSONNE. `.env.demo` pose
//    OUTBOUND_ENABLED=false (server.js:117), qui coupe Resend, Twilio ET Web Push.
//    Sans lui, une invitation ou un rappel de dispos déclenché pendant la démo
//    part pour de vrai.

const bcrypt = require('bcryptjs');
const { openDb, APP_COLLECTIONS } = require('./_db');
const {
    toDateStr, weekStart, chargeMultiplier, normName, hashToken,
    // Les trois fonctions qui définissent l'horizon et l'audit CÔTÉ PRODUIT. Les
    // re-dériver à la main ici, c'était semer un jeu décalé de ce que l'app ouvre.
    disposHorizonRange, clampHorizonWeeks, dispoEventDelta, staffReopenedFor,
} = require('../lib/utils');

const PASSWORD = process.env.SEED_PASSWORD || 'Demo2026!';
const MAIL_DOMAIN = 'demo.templyo.fr';

// Taux de charges patronales, en UN seul endroit. Il sert deux fois et les deux usages
// DOIVENT rester d'accord : il est écrit dans les réglages `performance_*` que lit
// `/api/performance`, et il sert à rétro-calculer le CA (cf. plus bas). Les désaligner
// décale tous les coefficients affichés hors de la bande visée — c'est-à-dire casse
// précisément l'écran que ce jeu de données existe pour vendre.
const CHARGE_RATE = 45;
const CHARGE_MULT = chargeMultiplier(CHARGE_RATE);

// Horizon de collecte des dispos (B2). SANS ce réglage le défaut est 1 : le patron ne
// peut ouvrir que la semaine N+1, et toute la planification à l'avance — la question que
// pose systématiquement un prospect qui gère plusieurs établissements — reste invisible.
// X = semaines de SAISIE, Y = semaines de VALIDATION (Y est borné à X par le serveur).
//
// ⚠️ L'horizon est ancré sur **N+1**, pas sur la semaine courante (`disposWeekStart`).
// X = 4 ouvre donc N+1 → N+4. C'est `disposHorizonRange` qui en fait foi, et c'est d'elle
// que ce script dérive la fin de ses plannings : le calculer à la main donnait N+3, donc
// une 4ᵉ semaine ouverte au staff et vide de tout — le prospect cliquait sur la dernière
// semaine de l'horizon et tombait sur du blanc.
const HORIZON_WEEKS    = 4;
const VALIDATION_WEEKS = 2;
if (clampHorizonWeeks(HORIZON_WEEKS) !== HORIZON_WEEKS || VALIDATION_WEEKS > HORIZON_WEEKS)
    throw new Error('Horizon invalide : le serveur le ramènerait à ' + clampHorizonWeeks(HORIZON_WEEKS));

// ── Aléatoire REPRODUCTIBLE ───────────────────────────────────────────────────
// Math.random() ferait raconter une histoire différente à chaque passage : impossible
// de préparer son discours sur des chiffres qui bougent. Graine fixe ⇒ même démo.
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const rnd = mulberry32(20260721);
const pick = arr => arr[Math.floor(rnd() * arr.length)];

// ── Le groupe fictif ──────────────────────────────────────────────────────────
// `hours.open/close` borne la grille du planning : tout créneau doit tenir dedans.
// 26 = 2 h du matin (convention : les heures de fermeture débordent au-delà de 24).
const ESTABS = [
    { id: 'Comptoir_pub',         name: 'Le Comptoir',   type: 'pub',        hours: { open: 16, close: 26 }, groups: ['Bar', 'Salle'] },
    { id: 'Brasserie_restaurant', name: 'La Brasserie',  type: 'restaurant', hours: { open: 10, close: 26 }, groups: ['Salle', 'Cuisine'] },
    { id: 'Rooftop_pub',          name: 'Le Rooftop',    type: 'pub',        hours: { open: 16, close: 26 }, groups: ['Bar'] },
];

// Un RÔLE décrit le métier exact ; un GROUPE dit le côté (Bar / Salle / Cuisine).
// Seul le type `responsable` a un effet fonctionnel : une soirée sans responsable
// désigné déclenche l'alerte « ! » et personne ne peut faire le pointage.
const ROLES = [
    { name: 'Responsable de soirée', type: 'responsable' },
    { name: 'Chef de rang',          type: 'informatif' },
    { name: 'Barman',                type: 'informatif' },
    { name: 'Chef de partie',        type: 'informatif' },
    { name: 'Second de cuisine',     type: 'informatif' },
    { name: 'Plongeur',              type: 'informatif' },
    { name: 'Runner',                type: 'informatif' },
];

const C = 'Comptoir_pub', B = 'Brasserie_restaurant', R = 'Rooftop_pub';

// `venues` = les établissements où la personne peut travailler. Il conditionne
// l'ouverture des dispos ET l'affectation : chaque établissement a besoin d'au moins
// 5–6 personnes éligibles, sinon le générateur laisse des créneaux vides.
// ⚠️ Chaque établissement a besoin de PLUSIEURS porteurs du rôle `responsable` : le
// créneau d'ouverture du soir leur est réservé, et s'il n'y en a qu'un, il rafle tous
// les services (Kenza est montée à 39 h/semaine avant qu'Hugo et Bruno ne l'obtiennent).
const RESP = 'Responsable de soirée';
const STAFF = [
    { name: 'Alice Rambert',   color: '#3498db', venues: [C],       roles: [RESP],                  groups: ['Bar'],     rate: 14.2 },
    { name: 'Bruno Peyre',     color: '#9b59b6', venues: [C, B],    roles: ['Chef de rang', RESP],  groups: ['Salle'],   rate: 12.8 },
    { name: 'Chloé Marchand',  color: '#e67e22', venues: [B],       roles: ['Second de cuisine'],   groups: ['Cuisine'], rate: 13.5 },
    { name: 'David Ferry',     color: '#2ecc71', venues: [B],       roles: ['Plongeur'],            groups: ['Cuisine'], rate: 11.9 },
    // Elena n'a AUCUN groupe et tous les établissements : c'est la polyvalente, et
    // la démonstration de la règle « sans groupe = visible dans tous les filtres ».
    { name: 'Elena Costa',     color: '#e74c3c', venues: [C, B, R], roles: ['Runner'],              groups: [],          rate: 12.5 },
    { name: 'Farid Benali',    color: '#16a085', venues: [R],       roles: [RESP],                  groups: ['Bar'],     rate: 14.0 },
    { name: 'Gaëlle Nunès',    color: '#f39c12', venues: [R, C],    roles: ['Barman'],              groups: ['Bar'],     rate: 13.0 },
    { name: 'Hugo Delaunay',   color: '#8e44ad', venues: [B],       roles: ['Chef de partie', RESP], groups: ['Cuisine'], rate: 15.0 },
    { name: 'Inès Traoré',     color: '#d35400', venues: [C],       roles: ['Chef de rang'],        groups: ['Salle'],   rate: 12.2 },
    { name: 'Jonas Weber',     color: '#2980b9', venues: [R],       roles: ['Barman'],              groups: ['Bar'],     rate: 12.6 },
    { name: 'Kenza Amrani',    color: '#c0392b', venues: [B, C],    roles: [RESP],                  groups: ['Salle'],   rate: 13.2 },
    // Loïc est l'EXTRA : payé au forfait par shift (`fixed_rate`, exclusif du taux
    // horaire) et ses vacations sont marquées `extra: true` — le récap mensuel les
    // isole. C'est le cas qui montre les deux modes de rémunération côte à côte.
    { name: 'Loïc Vidal',      color: '#7f8c8d', venues: [C, B, R], roles: [],                      groups: [],          fixed: 95, extra: true },
    // Partie il y a trois semaines. `archived: true` (F-13) : elle disparaît des dispos,
    // des relances et de la planification, mais ses heures passées restent dans le récap
    // mensuel et dans la masse salariale. C'est LE cas du turnover en restauration, et il
    // était invisible tant que personne n'était archivé. `leftWeeksAgo` n'est pas un champ
    // du modèle : c'est LE fait à saisir, et `archived` en est la conséquence, dérivée
    // plus bas. Porter les deux à la main laissait poser l'un sans l'autre — quelqu'un
    // d'archivé mais encore planifié sur trois semaines, en silence.
    { name: 'Marion Ferrand',  color: '#95a5a6', venues: [B, C],    roles: ['Chef de rang'],        groups: ['Salle'],   rate: 12.4,
      leftWeeksAgo: 3 },
];

// La directrice a un VRAI profil staff (E-22 modèle A) : planifiable, comptée en paie,
// et ses dispos passent par la même file de validation que tout le monde.
// `venues` DOIT rester aligné sur `assigned_establishments` de son compte (R-06),
// sinon elle ne peut plus saisir la moindre dispo.
const DIRECTOR = {
    name: 'Diane Léon', color: '#1abc9c', venues: [C, R],
    roles: [RESP], groups: ['Bar'], rate: 16.5,
};

// ── Les services, par établissement et par jour ───────────────────────────────
// `dow` : 0 = lundi … 6 = dimanche (et non la convention JS, où 0 = dimanche).
// `resp: true` marque le créneau qui portera la désignation pointage du soir : le
// générateur y place en priorité quelqu'un qui a un rôle `responsable`.
// `closed` : jours de fermeture. `weekend` : créneaux ajoutés les jours de forte
// affluence, listés une seule fois dans WEEKEND pour que la règle ne se dise pas à
// trois endroits — elle y était écrite deux fois en `dow >= 4 && dow <= 5` et une
// troisième fois en `dow >= 4`, qui n'est pas la même chose.
const WEEKEND = [4, 5];                                              // vendredi, samedi
const SERVICES = {
    [C]: { closed: [],
           slots:   [{ start: 17, end: 24, resp: true }, { start: 18, end: 26 }],
           weekend: [{ start: 20, end: 26 }] },
    // La Brasserie désigne DEUX responsables par jour, un par service : c'est le cas que
    // D-56 a ouvert (« plusieurs responsables de soirée par jour ») et qui ne se voyait
    // nulle part tant que chaque journée n'en portait qu'un.
    [B]: { closed: [0],
           slots:   [{ start: 11,   end: 16,   resp: true },
                     { start: 11.5, end: 16 },
                     { start: 18,   end: 24.5, resp: true },
                     { start: 18.5, end: 24.5 },
                     { start: 19,   end: 24.5 }] },
    [R]: { closed: [0, 1],
           slots:   [{ start: 17, end: 26, resp: true }, { start: 18, end: 26 }],
           weekend: [{ start: 19, end: 26 }] },
};
function slotsFor(estabId, dow) {
    const s = SERVICES[estabId];
    if (s.closed.includes(dow)) return [];
    return WEEKEND.includes(dow) && s.weekend ? [...s.slots, ...s.weekend] : s.slots;
}

// Objectif de coefficient visé par jour de semaine, pour rétro-calculer le CA.
// Le week-end absorbe mieux la masse salariale : le prospect reconnaît ce profil.
const COEFF_TARGET = [34, 33, 31, 30, 27, 25, 29]; // lun → dim

// ── Helpers de date ───────────────────────────────────────────────────────────
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const dowOf = d => (d.getDay() + 6) % 7;             // lundi = 0
const round2 = n => Math.round(n * 100) / 100;

async function run() {
    // `expect` : ce script purge TOUTE la base, et le garde-fou de `_db.js` ne refuse
    // que la base client. Sans cette borne il écraserait la recette (`templyo_dev`)
    // sans un mot. La règle vit dans `openDb` et pas ici : c'est le harnais qui doit
    // savoir quelle base chaque script a le droit de détruire.
    const { client, db, dbName } = await openDb({ destructive: true, expect: /demo/i });

    try {
        // Le hachage bcrypt coûte ~270 ms en JS pur et ne dépend que de `PASSWORD` :
        // lancé ici, il s'entrelace avec les E/S réseau et n'est plus sur le chemin
        // critique au moment de créer les comptes.
        const hashPromise = bcrypt.hash(PASSWORD, 12);
        await Promise.all(APP_COLLECTIONS.map(c => db.collection(c).deleteMany({})));

        // Écritures indépendantes accumulées ici et lancées EN UNE FOIS à la fin :
        // chaque `await insertMany` isolé est un aller-retour Atlas (~100 ms) payé en
        // série. Les blocs restent à leur place — seule l'attente est mutualisée.
        const writes = [];

        // ── Repères temporels ─────────────────────────────────────────────────
        const now       = new Date();
        const today     = toDateStr(now);
        const thisMon   = weekStart(now);
        const nextMon   = weekStart(addDays(now, 7));
        const nextSun   = addDays(nextMon, 6);
        // Le planning couvre EXACTEMENT l'horizon que l'app ouvre au staff — même
        // fonction, donc pas de semaine ouverte et vide. Au-delà de N+1 il n'est
        // volontairement qu'ébauché (cf. `ossatureFrom`).
        const horizon    = disposHorizonRange(now, HORIZON_WEEKS);
        const horizonEnd = new Date(horizon.to + 'T12:00:00');
        // Frontière du remplissage : à partir de N+2, on ne pose plus que l'ossature.
        // Une date-chaîne comparée comme partout ailleurs dans ce fichier (`date < today`),
        // et la MÊME expression que celle affichée en fin de script — le récap ne peut
        // donc pas mentir sur ce que le jeu contient.
        const ossatureFrom = toDateStr(addDays(nextSun, 1));
        // On remonte au 1er du mois précédent OU à 6 semaines en arrière, le plus
        // lointain des deux : le récap mensuel du mois passé doit être COMPLET,
        // sinon la première chose que le prospect ouvre est un tableau tronqué.
        const firstPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const sixWeeksAgo    = weekStart(addDays(now, -42));
        const histStart      = weekStart(firstPrevMonth < sixWeeksAgo ? firstPrevMonth : sixWeeksAgo);

        // ── Établissements ────────────────────────────────────────────────────
        writes.push(db.collection('establishments').insertMany(ESTABS.map(e => ({ ...e }))));

        // ── Rôles ─────────────────────────────────────────────────────────────
        const roleIns = await db.collection('roles').insertMany(ROLES.map(r => ({ ...r })));
        const roleId = {};
        ROLES.forEach((r, i) => { roleId[r.name] = String(roleIns.insertedIds[i]); });
        // `staff.roles` porte les _id des rôles, JAMAIS leurs noms : c'est ce que pose
        // le front (`btn.dataset.role = String(r._id)`) et ce que compare le serveur
        // (`isResponsablePourSoiree`). Stocker les noms rendrait tout le monde
        // non-responsable, et le pointage de soirée serait inaccessible en démo.

        // ── Staff ─────────────────────────────────────────────────────────────
        const staffDefs = [...STAFF, DIRECTOR];
        const staffDocs = staffDefs.map(s => {
            const doc = {
                name: s.name, color: s.color, venues: s.venues,
                roles: s.roles.map(r => roleId[r]),
                groups: s.groups, email: '', phone: '',
                can_submit_dispos: true, created_at: new Date(),
            };
            // Forfait et taux horaire sont EXCLUSIFS : `/api/performance` teste
            // `fixed_rate_snapshot` d'abord, poser les deux rendrait le taux horaire mort.
            if (s.fixed != null) doc.fixed_rate = s.fixed;
            else doc.hourly_rate = s.rate;
            if (s.leftWeeksAgo) doc.archived = true;   // F-13 — cf. NOT_ARCHIVED côté serveur
            if (s === DIRECTOR) { doc.is_manager = true; doc.email = 'directeur@' + MAIL_DOMAIN; }
            return doc;
        });
        const staffIns = await db.collection('staff').insertMany(staffDocs);
        // L'_id et le compteur d'heures sont posés SUR la définition. Trois tables
        // parallèles (nom→id, id→définition, id→heures) indexaient la même population :
        // le générateur devait repasser par `byId[id]` pour relire un objet qu'il avait
        // déjà en main, et ajouter un attribut à quelqu'un demandait de savoir laquelle
        // des trois le porte. `sid` survit seul : congés, dispos et notifications ciblent
        // par nom.
        const sid = {};   // nom → _id (string)
        staffDefs.forEach((s, i) => {
            s.id = String(staffIns.insertedIds[i]);
            s.hours = 0;  // heures cumulées, pour affecter le moins chargé (cf. plus bas)
            // Date de départ d'un archivé : on cesse de le planifier à partir de là, mais
            // tout ce qu'il a fait avant reste. Posée SUR la définition, comme `id` et
            // `hours` — une table `leftOn` séparée aurait été un quatrième index de la
            // même population, et keyée par nom là où le reste cible par `_id`.
            if (s.leftWeeksAgo) s.leftOn = toDateStr(weekStart(addDays(now, -7 * s.leftWeeksAgo)));
            sid[s.name] = s.id;
        });

        // ── Comptes ───────────────────────────────────────────────────────────
        // TOUT LE MONDE a un compte, pas seulement les trois qu'on va montrer. Le KPI
        // « Dispos envoyées » de la page d'accueil a pour dénominateur le nombre de
        // comptes `staff` actifs : avec 3 comptes sur 13 personnes, il affichait 0/3 —
        // le premier chiffre que voit le prospect, et il est faux.
        // `normName` (lib/utils, canonisé par A-09) retire accents ET ponctuation :
        // Chloé → chloe, Gaëlle → gaelle, et un futur « Jean-Luc » → jean, là où une
        // simple dépose d'accents aurait laissé le tiret dans l'adresse. Une adresse
        // accentuée ou ponctuée est pénible à dicter en visio.
        const slug = n => normName(n).split(' ')[0];
        const hash = await hashPromise;
        const accounts = [
            { email: 'patron@' + MAIL_DOMAIN,    role: 'patron',      name: 'Paul Mercier', staff: null,          estabs: [] },
            { email: 'directeur@' + MAIL_DOMAIN, role: 'directeur',   name: DIRECTOR.name,  staff: DIRECTOR.name, estabs: [C, R] },
            { email: 'comptable@' + MAIL_DOMAIN, role: 'observateur', name: 'Odile Bassin', staff: null,          estabs: [] },
            // Les archivés n'ont plus de compte : ils sont partis. Le KPI « Dispos
            // envoyées » les exclut de toute façon (`NOT_ARCHIVED`), mais leur laisser un
            // accès contredirait ce que la démo raconte.
            ...STAFF.filter(s => !s.leftWeeksAgo).map(s => ({
                email: slug(s.name) + '@' + MAIL_DOMAIN, role: 'staff',
                name: s.name, staff: s.name, estabs: [],
            })),
            // Invitation ENVOYÉE, PAS ENCORE ACCEPTÉE. `active: false` est ce qui la range
            // dans l'onglet « ⚠️ Invitations en attente » de la modale Comptes
            // (`script.js:4691`), jusqu'ici toujours vide — alors que « comment j'ajoute
            // quelqu'un ? » est la question que pose tout prospect.
            { email: 'nouveau@' + MAIL_DOMAIN, role: 'staff', name: 'Théo Lambert',
              staff: null, estabs: [], pendingInvite: true },
        ];
        const userIns = await db.collection('users').insertMany(accounts.map(a => {
            const doc = {
                email: a.email, role: a.role, name: a.name,
                staff_id: a.staff ? sid[a.staff] : null,
                assigned_establishments: a.estabs,
                active: !a.pendingInvite, created_at: new Date(),
            };
            // Un invité n'a pas encore de mot de passe : il en pose un via son lien.
            // Le jeton est stocké HACHÉ (`hashToken`), comme le fait `server.js:1643` —
            // en clair, la base contiendrait un identifiant de connexion utilisable.
            if (a.pendingInvite) {
                doc.invite_token   = hashToken('demo-invite-' + a.email);
                // 24 h, comme le chemin e-mail du serveur (`server.js:1671`, et le corps
                // du mail l'annonce). Les 7 jours sont réservés au chemin SMS. Envoyée il
                // y a 2 h : encore valable pendant la démo, sans inventer une durée que
                // le produit ne pose jamais.
                doc.created_at     = addDays(now, -2 / 24);
                doc.invite_expires = addDays(doc.created_at, 1);
            } else {
                doc.password_hash = hash;
            }
            return doc;
        }));
        // Seule l'absence de la directrice référence un compte : un index des 15
        // ressemblerait à une table générale à maintenir alors qu'il porte une valeur.
        const directorUserId = String(userIns.insertedIds[accounts.findIndex(a => a.role === 'directeur')]);

        // ── Congés (posés AVANT les plannings : ils retirent des gens du pool) ──
        const conges = [
            // Validé et passé — alimente le bloc « congés validés » du récap mensuel.
            { who: 'Inès Traoré', mode: 'request', status: 'approved',
              from: addDays(histStart, 8), to: addDays(histStart, 13), reason: 'Congés annuels' },
            // Validé et en cours — la personne apparaît grisée dans le planning.
            { who: 'David Ferry', mode: 'request', status: 'approved',
              from: addDays(thisMon, 3), to: addDays(thisMon, 6), reason: 'Congés annuels' },
            // EN ATTENTE — c'est la demande que le patron valide en direct pendant la démo.
            { who: 'Chloé Marchand', mode: 'request', status: 'pending',
              from: addDays(nextMon, 14), to: addDays(nextMon, 20), reason: 'Vacances d\'été' },
            // Déclaration informative : le staff prévient, il n'y a rien à valider.
            { who: 'Jonas Weber', mode: 'info', status: 'approved',
              from: addDays(nextMon, 4), to: addDays(nextMon, 5), reason: 'Week-end en famille' },
        ];
        writes.push(db.collection('time_off').insertMany(conges.map(c => ({
            staff_id: sid[c.who], staff_name: c.who, mode: c.mode, status: c.status,
            start_date: toDateStr(c.from), end_date: toDateStr(c.to),
            reason: c.reason,                       // `reason`, pas `note` (cf. server.js)
            created_at: addDays(now, -10),
        }))));
        // Indisponible ce jour-là ⇒ ne pas le planifier. Seuls les congés VALIDÉS
        // bloquent : une demande en attente n'a encore rien retiré à personne.
        const blocked = new Set();
        conges.filter(c => c.status === 'approved').forEach(c => {
            for (let d = new Date(c.from); d <= c.to; d = addDays(d, 1))
                blocked.add(sid[c.who] + '|' + toDateStr(d));
        });

        // ── Génération des plannings ──────────────────────────────────────────
        // Du 1er du mois précédent au dimanche de N+3. Les semaines futures existent en
        // base mais restent NON PUBLIÉES → brouillon.
        //
        // Le degré de remplissage décroît avec l'éloignement, comme dans la vraie vie :
        //   N et N+1        → complet    (N publiée, N+1 le brouillon qu'on publie en direct)
        //   N+2 et au-delà  → OSSATURE   (seuls les créneaux `resp` sont posés)
        // Un patron ne monte pas quatre semaines d'affilée au créneau près ; il place
        // d'abord ses responsables. Remplir les semaines lointaines à fond aurait aussi
        // vidé la file de dispos de son sens — il ne resterait plus rien à arbitrer.
        const shifts = [];
        const wageByEstabDate = {};   // (estab|date) → masse salariale brute pointée
        const eligible = {};          // estab → [définitions] des gens pouvant y travailler
        ESTABS.forEach(e => {
            eligible[e.id] = staffDefs.filter(s => s.venues.includes(e.id));
        });

        // Pointe un shift passé et renvoie le salaire brut correspondant. Extrait de la
        // boucle : c'était la seule partie qui ne parlait pas d'affectation, et elle
        // alimentait `wageByEstabDate` par effet de bord depuis le fond de trois boucles.
        function pointer(shift, def) {
            // L'écart planifié/réel est la valeur que Templyo révèle. Sortie plus tard
            // qu'annoncé dans la majorité des cas — c'est ce qu'un patron reconnaît
            // immédiatement de son propre établissement.
            shift.real_start = round2(shift.start_time + pick([0, 0, 0, 0, 0.25]));
            shift.real_end   = round2(shift.end_time + pick([0, 0, 0, 0.25, 0.25, 0.5, 0.5, 0.75, 1]));
            // Le snapshot fige la rémunération au moment du pointage : augmenter
            // quelqu'un demain ne doit pas réécrire la masse salariale d'hier.
            if (def.fixed != null) shift.fixed_rate_snapshot = def.fixed;
            else shift.hourly_rate_snapshot = def.rate;
            return def.fixed != null
                ? def.fixed
                : (shift.real_end - shift.real_start) * def.rate;
        }

        for (let d = new Date(histStart); d <= horizonEnd; d = addDays(d, 1)) {
            const date = toDateStr(d);
            const dow  = dowOf(d);
            const past = date < today;
            const busyToday = new Set();   // personne ne fait deux services le même jour

            for (const estab of ESTABS) {
                let slots = slotsFor(estab.id, dow);
                if (date >= ossatureFrom) slots = slots.filter(s => s.resp);
                if (!slots.length) continue;

                // Vivier du jour : éligible, pas en congé. L'extra n'est appelé qu'en
                // renfort de fin de semaine — structurellement le moins chargé, il serait
                // sinon pris à chaque créneau par la règle d'équilibrage. Le tri par
                // occupation, lui, est refait à chaque créneau (`free` ci-dessous).
                const usable = eligible[estab.id].filter(s =>
                    !blocked.has(s.id + '|' + date)
                    && !(s.leftOn && date >= s.leftOn)
                    && (s.extra !== true || (WEEKEND.includes(dow) && rnd() < 0.2)));

                for (const slot of slots) {
                    const free = usable.filter(s => !busyToday.has(s));
                    if (!free.length) break;               // effectif épuisé : créneau non couvert
                    // Le créneau `resp` cherche d'abord un porteur du rôle responsable :
                    // sans lui, la soirée déclenche l'alerte « ! » et le pointage est bloqué.
                    const resps = slot.resp ? free.filter(s => s.roles.includes(RESP)) : [];
                    const candidates = resps.length ? resps : free;

                    // Le MOINS CHARGÉ l'emporte. Un tirage purement aléatoire donnait des
                    // semaines à 38 h pour l'un et 4 h pour l'autre : un planning que
                    // personne ne reconnaîtrait, sur le premier écran que voit le prospect.
                    // Le score est figé en une passe (le PRNG n'est donc jamais appelé
                    // depuis un comparateur) et le bruit ±1 h évite une rotation
                    // rigoureusement identique d'une semaine à l'autre.
                    const def = candidates
                        .map(s => [s, s.hours + rnd() * 2 - 1])
                        .reduce((a, b) => (b[1] < a[1] ? b : a))[0];
                    busyToday.add(def);
                    def.hours += slot.end - slot.start;

                    const shift = {
                        establishment_id: estab.id, staff_id: def.id, staff_name: def.name,
                        color: def.color, date, start_time: slot.start, end_time: slot.end,
                    };
                    if (slot.resp) shift.pointage_resp = true;
                    if (def.extra) shift.extra = true;

                    if (past) {
                        const k = estab.id + '|' + date;
                        wageByEstabDate[k] = (wageByEstabDate[k] || 0) + pointer(shift, def);
                    }
                    shifts.push(shift);
                }
            }
        }

        // ── Jokers ────────────────────────────────────────────────────────────
        // Un créneau ouvert aux candidatures. Le premier est placé sur le dernier jour
        // ENCORE À VENIR de la semaine courante : un Joker déjà passé ne se candidate
        // plus et le bouton serait mort au moment de le montrer.
        const satThisWeek = addDays(thisMon, 5);
        const jokerDate1  = toDateStr(satThisWeek) > today ? toDateStr(satThisWeek) : today;
        // La couleur vient de la définition, jamais recopiée : la vignette de candidature
        // resterait sinon à l'ancienne teinte après un changement dans STAFF, en silence.
        const candidature = (name, daysAgo) => {
            const def = staffDefs.find(s => s.name === name);
            return { staff_id: def.id, staff_name: def.name, staff_color: def.color,
                     submitted_at: addDays(now, -daysAgo) };
        };
        shifts.push({
            establishment_id: R, staff_id: '__joker__', staff_name: 'Joker', color: '#888',
            date: jokerDate1, start_time: 19, end_time: 26,
            is_joker: true, joker_open: true, note: 'Renfort bar — soirée DJ',
            joker_candidates: [candidature('Jonas Weber', 2), candidature('Gaëlle Nunès', 1)],
        });
        // Le second est sur la semaine en brouillon : il apparaîtra au staff au moment
        // exact où on publiera la semaine devant le prospect.
        shifts.push({
            establishment_id: B, staff_id: '__joker__', staff_name: 'Joker', color: '#888',
            date: toDateStr(addDays(nextMon, 5)), start_time: 18, end_time: 24.5,
            is_joker: true, joker_open: true, joker_candidates: [], note: 'Service du samedi soir',
        });

        writes.push(db.collection('shifts').insertMany(shifts));

        // ── CA quotidien ──────────────────────────────────────────────────────
        // Rétro-calculé depuis la masse salariale : CA = masse chargée / coefficient visé.
        // Tirer un CA au hasard donnerait des coefficients à 8 % ou 70 % — le prospect
        // le verrait tout de suite, et c'est justement l'écran qu'on vient lui vendre.
        // `CHARGE_MULT` est le MÊME multiplicateur que celui appliqué par
        // `/api/performance` : c'est ce qui garantit que les coefficients affichés
        // tombent bien dans la bande visée par COEFF_TARGET.
        const revenues = Object.entries(wageByEstabDate).map(([k, gross]) => {
            const [establishment_id, date] = k.split('|');
            const dow    = dowOf(new Date(date + 'T12:00:00'));
            const target = COEFF_TARGET[dow] + (rnd() * 6 - 3);   // ±3 pts de bruit
            const revenue = (gross * CHARGE_MULT) / (target / 100);
            return { establishment_id, date, revenue: Math.round(revenue / 10) * 10 };
        });
        writes.push(db.collection('daily_revenue').insertMany(revenues));

        // ── Disponibilités : la file que le patron traite pendant la démo ──────
        // Sur la semaine PROCHAINE (celle en cours de collecte). Volontairement
        // réparties sur les 3 établissements : la directrice, limitée au Comptoir et
        // au Rooftop, en voit moins que le patron — c'est le périmètre par
        // établissement qu'on montre en basculant de compte.
        // La colonne `sem` porte la semaine visée (1 = N+1). Une seule table pour tout
        // l'horizon : elle était scindée en deux jumelles parcourues par deux boucles
        // identiques, et il fallait comparer deux blocs distants pour voir que la file
        // décroît à mesure qu'on s'éloigne. Ici ça se lit d'un coup d'œil.
        // Toutes les semaines de l'horizon DOIVENT être représentées, sinon l'app en
        // ouvre une que le prospect trouvera vide.
        //           qui                sem  jours          type      début  fin
        const dispoPlan = [
            // Le jour 0 d'Alice est volontairement absent : c'est celui que le journal
            // d'audit raconte, et il est semé plus bas dans son état d'arrivée.
            ['Alice Rambert',   1, [1, 3, 4],    'soir',   18, 26],
            ['Bruno Peyre',     1, [1, 2, 5],    'midi',   11, 17],
            ['Chloé Marchand',  1, [0, 2, 4, 5], 'soir',   18, 24.5],
            ['Elena Costa',     1, [3, 4],       'custom', 16, 23],
            ['Farid Benali',    1, [2, 4, 5],    'soir',   17, 26],
            ['Gaëlle Nunès',    1, [4, 5],       'soir',   19, 26],
            ['Hugo Delaunay',   1, [1, 2, 3],    'midi',   11, 16],
            ['Inès Traoré',     1, [0, 5],       'soir',   17, 24],
            ['Kenza Amrani',    1, [2, 3, 6],    'soir',   18, 24.5],
            [DIRECTOR.name,     1, [0, 2],       'soir',   17, 24],   // E-22 : même file que tous
            ['Alice Rambert',   2, [0, 2, 4],    'soir',   18, 26],
            ['Farid Benali',    2, [3, 4, 5],    'soir',   17, 26],
            ['Chloé Marchand',  2, [1, 4],       'soir',   18, 24.5],
            ['Kenza Amrani',    2, [2, 5],       'midi',   11, 16],
            ['Bruno Peyre',     3, [1, 3],       'midi',   11, 17],
            ['Elena Costa',     3, [4, 5],       'soir',   18, 26],
            ['Hugo Delaunay',   3, [2],          'midi',   11, 16],
            ['Alice Rambert',   4, [1, 4],       'soir',   18, 26],
            ['Gaëlle Nunès',    4, [5],          'soir',   19, 26],
        ];
        const dispos = [];

        // Historique : chaque shift déjà planifié a forcément été précédé d'une dispo
        // envoyée puis validée. Sans elles, le KPI « Dispos envoyées » de la page
        // d'accueil affiche 0 % sur toutes les semaines déjà montées — c'est le premier
        // bandeau de l'écran, et il donnerait l'impression d'une équipe qui n'utilise pas
        // l'outil. `confirmed` + `establishment_id` = dispo validée ET affectée.
        const currentWeekEnd = toDateStr(addDays(thisMon, 6));
        for (const s of shifts) {
            if (s.staff_id === '__joker__' || s.date > currentWeekEnd) continue;
            dispos.push({
                staff_id: s.staff_id, staff_name: s.staff_name, date: s.date,
                type: s.start_time < 16 ? 'midi' : 'soir',
                start_time: s.start_time, end_time: s.end_time,
                note: '', status: 'confirmed', establishment_id: s.establishment_id,
                created_at: new Date(new Date(s.date + 'T12:00:00').getTime() - 9 * 864e5),
            });
        }

        for (const [who, sem, days, type, s, e] of dispoPlan) {
            const mon = weekStart(addDays(now, 7 * sem));
            for (const off of days) {
                dispos.push({
                    staff_id: sid[who], staff_name: who, date: toDateStr(addDays(mon, off)),
                    type, start_time: s, end_time: e, note: '', status: 'pending',
                    created_at: addDays(now, -3), updated_at: addDays(now, -3),
                });
            }
        }
        // Deux indisponibilités et une dispo déjà validée : la file doit contenir des
        // formes variées, et prouver qu'une dispo confirmée en sort bien.
        dispos.push({
            staff_id: sid['Jonas Weber'], staff_name: 'Jonas Weber', date: toDateStr(addDays(nextMon, 4)),
            type: 'off', start_time: null, end_time: null, note: 'Indisponible',
            status: 'pending', created_at: addDays(now, -3),
        });
        dispos.push({
            staff_id: sid['David Ferry'], staff_name: 'David Ferry', date: toDateStr(addDays(nextMon, 1)),
            type: 'soir', start_time: 18, end_time: 24.5, status: 'confirmed',
            establishment_id: B, created_at: addDays(now, -4),
        });

        // Note de semaine : un commentaire libre attaché à la SEMAINE, pas à un jour.
        // Stocké dans la même collection avec `type: 'week_note'` et `week_start` — c'est
        // pourquoi toutes les requêtes de dispos excluent ce type (`server.js:755`).
        dispos.push({
            staff_id: sid['Elena Costa'], staff_name: 'Elena Costa',
            week_start: toDateStr(nextMon), type: 'week_note',
            week_note: 'Je peux dépanner au Rooftop si besoin, prévenez-moi la veille.',
            created_at: addDays(now, -3),
        });
        // ── Journal d'audit des dispos (F-12) ─────────────────────────────────
        // Append-only, conservé 3 ans : c'est la preuve « qui a modifié quoi, et quand ».
        //
        // Le journal est GÉNÉRÉ à partir des états successifs, par `dispoEventDelta` — la
        // fonction que le serveur utilise lui-même. Les deltas étaient écrits à la main :
        // en plus de réencoder un format qui peut changer (`DISPO_AUDIT_FIELDS`), le
        // journal affirmait une dispo confirmée à 17 h alors que la dispo réellement semée
        // pour ce jour-là était en attente à 18 h. L'écran vendu comme « preuve »
        // contredisait la file de validation ouverte deux étapes plus tôt.
        //
        // Ici l'état final EST le document inséré dans `availabilities` : la contradiction
        // est devenue structurellement impossible.
        const alice  = staffDefs.find(s => s.name === 'Alice Rambert');
        const jour   = toDateStr(nextMon);
        const events = [];
        let etat = null;
        const journal = (action, by, at, apres) => {
            const d = dispoEventDelta(etat, apres);
            if (d) events.push({
                staff_id: alice.id, staff_name: alice.name, date: jour,
                at, by, action, before: d.before, after: d.after,
            });
            etat = apres;
        };
        const parElle = { user_id: null, role: 'staff', name: alice.name };
        const parDiane = { user_id: directorUserId, role: 'directeur', name: DIRECTOR.name };
        journal('submit',  parElle,  addDays(now, -3), { type: 'soir', start_time: 18, end_time: 26, status: 'pending' });
        journal('update',  parElle,  addDays(now, -2), { type: 'soir', start_time: 17, end_time: 26, status: 'pending' });
        journal('confirm', parDiane, addDays(now, -1), { type: 'soir', start_time: 17, end_time: 26, status: 'confirmed', establishment_id: C });
        dispos.push({
            staff_id: alice.id, staff_name: alice.name, date: jour, note: '',
            created_at: addDays(now, -3), updated_at: addDays(now, -1), ...etat,
        });
        writes.push(db.collection('dispo_events').insertMany(events));

        writes.push(db.collection('availabilities').insertMany(dispos));

        // La semaine-type de la directrice PRÉ-REMPLIT ses dispos, elle ne les envoie
        // pas : la matérialisation n'a lieu qu'à la deadline, et seulement sur les jours
        // restés vides — une saisie manuelle n'est jamais écrasée (règle du 2026-08-10).
        writes.push(db.collection('manager_dispo_templates').insertOne({
            staff_id: sid[DIRECTOR.name],
            days: { 1: { type: 'soir', start_time: 17, end_time: 24 },
                    3: { type: 'soir', start_time: 17, end_time: 24 },
                    5: { type: 'soir', start_time: 17, end_time: 26 } },
            updated_at: addDays(now, -20),
        }));
        writes.push(db.collection('manager_time_off').insertOne({
            user_id: directorUserId, name: DIRECTOR.name,
            start_date: toDateStr(addDays(nextMon, 9)), end_date: toDateStr(addDays(nextMon, 10)),
            type: 'off', note: 'Salon professionnel', created_at: addDays(now, -6),
        }));

        // ── Réglages ──────────────────────────────────────────────────────────
        // Deadline dispos = dimanche 23 h. Le jour de la semaine seul compte (elle est
        // RECALCULÉE chaque semaine par `computeEffectiveDeadline`) : viser le dimanche
        // garantit qu'elle est encore à venir quel que soit le jour de la démo — une
        // deadline dépassée grise le formulaire au pire moment.
        const deadlineSunday = toDateStr(addDays(thisMon, 6)) + 'T23:00';
        const settings = [
            { key: 'dispo', open: true, force_open: false, message: null,
              custom_deadline: deadlineSunday,
              // Horizon B2 : saisie sur 4 semaines, validation sur 2. Absents, ces deux
              // réglages retombent à 1 (`clampHorizonWeeks`) et la planification à
              // l'avance disparaît de la démo — c'est ce qui manquait.
              horizon_weeks: HORIZON_WEEKS, validation_horizon_weeks: VALIDATION_WEEKS,
              // Réouverture NOMINATIVE (E-15) posée pour Jonas sur la semaine N+1.
              // ⚠️ Elle ne DÉBLOQUE personne ici, et c'est voulu : la deadline visant le
              // dimanche 23 h, `computeEffectiveDeadline` la ramène toujours dans la
              // semaine courante, donc elle n'est pratiquement jamais franchie (cf. le
              // commentaire de `deadlineSunday`). L'entrée est là pour que le réglage
              // soit VISIBLE dans l'écran du patron, pas pour lever un blocage.
              // La forme `{ staff_id, week_start }` est celle que lit `staffReopenedFor` ;
              // une chaîne nue est l'ancienne forme, encore acceptée mais à ne pas semer.
              force_open_staff: [{ staff_id: sid['Jonas Weber'], week_start: toDateStr(nextMon) }] },
            // Objectif global + surcharges par établissement : un rooftop et une
            // brasserie n'ont pas la même structure de coût, et l'app le sait.
            // ⚠️ Ces valeurs sont calées SUR LES DONNÉES générées (médiane du coefficient
            // par établissement ≈ 28,5–30,3 %) : posées trop bas, tout le tableau de la
            // page Performance ressort en rouge et la démo raconte un groupe en difficulté.
            // Visées un peu au-dessus de la médiane ⇒ majorité de jours verts, une
            // minorité rouge — ce qui montre l'alerte sans noircir le tableau.
            { key: 'performance',                 target_charged: 31, charge_rate: CHARGE_RATE },
            { key: 'performance_' + C,            target_charged: 31, charge_rate: CHARGE_RATE },
            { key: 'performance_' + B,            target_charged: 32, charge_rate: CHARGE_RATE },
            { key: 'performance_' + R,            target_charged: 30, charge_rate: CHARGE_RATE },
            // Semaine courante publiée. Forme courante : `establishments` ('ALL' ou
            // une liste d'ids) — `published: true` est la branche legacy.
            { key: 'publish_' + toDateStr(thisMon), establishments: 'ALL', published_at: addDays(now, -5) },
            // La semaine PROCHAINE n'a volontairement PAS de doc publish_ : c'est le
            // brouillon qu'on publiera en direct devant le prospect.
        ];
        // Relire la forme avec la fonction du produit plutôt que de la croire correcte.
        // `force_open_staff` accepte deux formes (objet et chaîne legacy) : une faute de
        // frappe sur une clé passerait sans bruit et ne se verrait qu'en démo.
        if (!staffReopenedFor(settings[0], sid['Jonas Weber'], toDateStr(nextMon)))
            throw new Error('force_open_staff : forme non reconnue par staffReopenedFor');
        writes.push(db.collection('settings').insertMany(settings));

        // ── Notifications ─────────────────────────────────────────────────────
        // Le compte affiché est DÉRIVÉ de `sent_to` : il était écrit « 11 membre(s) »
        // pour 13 destinataires, et le message contredisait la donnée juste en dessous.
        // Les archivés sont exclus : le serveur ne relance jamais quelqu'un qui est parti
        // (`DISPO_TARGET` porte `NOT_ARCHIVED`), le journal ne doit pas dire le contraire.
        const rappelTo = staffDefs.filter(s => !s.leftWeeksAgo).map(s => s.id);
        writes.push(db.collection('notifications').insertOne({
            type: 'rappel_dispo',
            message: 'Rappel dispos envoyé à ' + rappelTo.length + ' membre(s) — semaine du ' + toDateStr(nextMon),
            week_start: toDateStr(nextMon),
            sent_to: rappelTo,
            read: false, created_at: addDays(now, -3),
        }));
        writes.push(db.collection('staff_notifications').insertMany([
            { staff_id: sid['Alice Rambert'], type: 'planning', title: 'Planning publié',
              body: 'Ton planning de la semaine est disponible.', url: '/planning.html',
              read: false, created_at: addDays(now, -5) },
            { staff_id: sid['Alice Rambert'], type: 'dispo', title: 'Dispos à envoyer',
              body: 'Pense à saisir tes disponibilités pour la semaine prochaine.', url: '/planning.html',
              read: true, created_at: addDays(now, -3) },
            { staff_id: sid['Farid Benali'], type: 'joker', title: 'Créneau à pourvoir',
              body: 'Un renfort est ouvert samedi au Rooftop.', url: '/planning.html',
              read: false, created_at: addDays(now, -2) },
        ]));

        await Promise.all(writes);

        // ── Récapitulatif ─────────────────────────────────────────────────────
        const pointed = shifts.filter(s => s.real_start != null).length;
        console.log('\n╭─ Base « ' + dbName + ' » prête pour la démo');
        console.log('│  ' + ESTABS.length + ' établissements · ' + staffDefs.length + ' membres · '
            + shifts.length + ' shifts (' + pointed + ' pointés) · ' + revenues.length + ' jours de CA');
        console.log('│  Plannings du ' + toDateStr(histStart) + ' au ' + horizon.to
            + ' (complets jusqu\'au ' + toDateStr(nextSun) + ', ossature à partir du ' + ossatureFrom + ')');
        const valid = disposHorizonRange(now, VALIDATION_WEEKS);
        console.log('│');
        console.log('│  Mot de passe commun : ' + PASSWORD);
        accounts.filter(a => a.role !== 'staff')
            .forEach(a => console.log('│    ' + a.role.padEnd(12) + ' ' + a.email));
        const staffAccounts = accounts.filter(a => a.role === 'staff');
        console.log('│    staff        ' + staffAccounts.map(a => a.email.split('@')[0]).join(', ') + ' @' + MAIL_DOMAIN);
        console.log('╰─ Déroulé de démo suggéré :\n');
        [
            'Planning, semaine courante — la semaine est publiée, l\'équipe la voit. Basculer entre les 3 établissements.',
            // Le chiffre annoncé doit être CELUI QUE L'ÉCRAN MONTRE : la file du patron
            // est bornée par l'horizon de VALIDATION (`server.js:3837`), pas par le total
            // des dispos semées. Compter brut annonçait 44 pour un écran à 39.
            'Semaine suivante — elle est en BROUILLON. Ouvrir la file de dispos ('
                + dispos.filter(d => d.status === 'pending'
                    && d.date >= valid.from && d.date <= valid.to).length
                + ' en attente sur les ' + VALIDATION_WEEKS + ' semaines validables), en valider'
                + ' quelques-unes, puis publier. C\'est le cycle complet.',
            'Planifier À L\'AVANCE — la saisie est ouverte sur ' + HORIZON_WEEKS + ' semaines ('
                + horizon.from + ' → ' + horizon.to + '). À partir de N+2 le planning n\'a que'
                + ' son ossature — les responsables sont posés, le reste non — et la file de'
                + ' dispos s\'y remplit déjà.',
            'Se connecter en directrice (directeur@' + MAIL_DOMAIN + ') — elle ne voit que Le Comptoir et Le Rooftop, et ses propres dispos passent par la même validation.',
            'Onglet Congés — une demande de Chloé Marchand attend une réponse ; David Ferry est déjà en congé cette semaine et apparaît grisé.',
            'Joker ouvert samedi au Rooftop — 2 candidatures reçues, en retenir une en un clic.',
            'Gestion du staff — Marion Ferrand est ARCHIVÉE : partie il y a 3 semaines, elle sort des dispos et du planning mais ses heures restent au récap. Le turnover, en clair.',
            'Modale Comptes, onglet « Invitations en attente » — Théo Lambert a été invité et n\'a pas encore posé son mot de passe.',
            'Historique d\'une dispo (F-12) — Alice a saisi, corrigé, puis la directrice a validé : qui a fait quoi, et quand.',
            'Pointage — comparer planifié et réel sur les semaines passées : c\'est là que les heures non facturées apparaissent.',
            'Performance — CA, masse salariale chargée et coefficient jour par jour, coloré contre l\'objectif propre à chaque établissement.',
            'Récap mensuel du mois dernier — heures par personne, écart planifié/réel, ventilation par établissement, congés validés.',
        ].forEach((l, i) => console.log('  ' + (i + 1) + '. ' + l));
        console.log('\n  ⚠️  Vérifie OUTBOUND_ENABLED=false avant toute démo : sinon invitations,');
        console.log('      SMS et push partent pour de vrai.\n');
    } catch (e) {
        console.error('❌', e);
        process.exitCode = 1;
    } finally {
        await client.close();
    }
}

run();
