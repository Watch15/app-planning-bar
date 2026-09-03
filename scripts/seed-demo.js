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
//   • UN BAR + UN RESTAURANT, 25 personnes + une directrice, ~2 mois de plannings
//     passés intégralement pointés, avec les écarts planifié/réel qu'on observe en vrai.
//     C'est la taille d'exploitation d'un vrai groupe de restauration : à 13 personnes
//     sur 3 établissements, le prospect qui en emploie 25 ne se reconnaissait pas.
//   • Un CA quotidien calculé À REBOURS depuis la masse salariale, pour que le
//     coefficient tombe dans une bande crédible (24–36 %) et se colore contre
//     l'objectif — un CA tiré au hasard donnerait des coefficients absurdes.
//   • Semaine courante PUBLIÉE, semaine suivante en BROUILLON avec sa file de
//     dispos à valider : c'est le cycle dispos → planning → publication, le cœur
//     de la démo.
//   • Tout est RELATIF à aujourd'hui et DÉTERMINISTE (PRNG à graine fixe) : le jeu
//     ne périme jamais et deux démos successives racontent la même histoire.
//
// ── CONFIDENTIALITÉ ────────────────────────────────────────────────────────────
// Aucune donnée de ce fichier ne provient d'une base client. Les établissements, les
// 26 personnes, leurs taux et leurs téléphones sont INVENTÉS. Seule la *forme* de
// l'exploitation (un bar + un restaurant, une vingtaine de personnes, une mise à jour
// du planning par semaine) s'inspire de ce qu'on observe chez un client — et une forme
// ne se dés-anonymise pas. Les numéros utilisent la plage 06 39 98 XX XX, réservée par
// l'ARCEP à la fiction : même OUTBOUND_ENABLED=true par erreur, ils ne joignent personne.
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
    toDateStr, weekStart, chargeMultiplier, normName, hashToken, normalizePhone,
    STAFF_COLORS,
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

// Horizon de collecte des dispos (B2). X = semaines de SAISIE, Y = semaines de
// VALIDATION (Y est borné à X par le serveur).
//
// ⚠️ L'horizon est ancré sur **N+1**, pas sur la semaine courante (`disposWeekStart`).
// X = 2 ouvre donc N+1 → N+2. C'est `disposHorizonRange` qui en fait foi, et c'est d'elle
// que ce script dérive la fin de ses plannings : le calculer à la main donnait N+1, donc
// une 2ᵉ semaine ouverte au staff et vide de tout — le prospect cliquait sur la dernière
// semaine de l'horizon et tombait sur du blanc.
//
// DEUX semaines, et pas quatre : c'est la cadence réelle d'une exploitation qui met son
// planning à jour toutes les semaines. Sur 4 semaines, la file de dispos s'étalait et
// devenait clairsemée (10 personnes en N+1, 2 en N+4) ; sur 2, elle est PLEINE, ce qui
// est à la fois plus crédible et bien plus vendeur — le prospect voit la charge de
// travail que l'outil lui retire. L'horizon reste un réglage : le montrer à 2 n'empêche
// pas de dire qu'il monte à 4 (`DISPO_HORIZON_MAX`).
const HORIZON_WEEKS    = 2;
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
const rnd = mulberry32(20260831);
const pick = arr => arr[Math.floor(rnd() * arr.length)];

// ── Le groupe fictif ──────────────────────────────────────────────────────────
// ⚠️ La forme du document est celle que produit `POST /api/establishments`
// (server.js:2108) : `id` slugifié, `type` dans {bar, restaurant}, et surtout
// **`open_time` / `close_time` en 'HH:MM'**.
//
// C'est `open_time`/`close_time` que lit `applyVenueHours` (script.js:21) pour borner
// la grille du planning. Ce script écrivait autrefois `hours: { open, close }`, que
// RIEN dans le produit ne lit : la démo tombait donc systématiquement sur la grille
// par défaut 10 h → 26 h, et le bar s'affichait avec sept heures vides tous les matins.
// La fiche établissement, elle, affichait « — » à la place des horaires.
const ESTABS = [
    { id: 'Le_Zinc_bar',           name: 'Le Zinc',    type: 'bar',
      open_time: '17:00', close_time: '02:00', groups: ['Bar', 'Salle'] },
    { id: 'La_Rotonde_restaurant', name: 'La Rotonde', type: 'restaurant',
      open_time: '11:00', close_time: '00:30', groups: ['Salle', 'Cuisine'] },
];
const Z = 'Le_Zinc_bar', T = 'La_Rotonde_restaurant';

// Heures décimales dérivées des chaînes, avec la MÊME règle que `applyVenueHours` :
// une fermeture antérieure à l'ouverture passe le lendemain. Dérivées et non saisies —
// deux champs à tenir d'accord finissent toujours par diverger, et c'est cette
// divergence-là qui a produit le bug ci-dessus.
function venueHours(e) {
    const hm = s => { const [h, m] = s.split(':').map(Number); return h + m / 60; };
    const open = hm(e.open_time);
    let close = hm(e.close_time);
    if (close <= open) close += 24;
    return { open, close };
}

// Un RÔLE décrit le métier exact ; un GROUPE dit le côté (Bar / Salle / Cuisine).
// Seul le type `responsable` a un effet fonctionnel : une soirée sans responsable
// désigné déclenche l'alerte « ! » et personne ne peut faire le pointage.
const RESP_SOIREE = 'Responsable de soirée';
const RESP_SALLE  = 'Responsable de salle';
const ROLES = [
    { name: RESP_SOIREE,        type: 'responsable' },
    { name: RESP_SALLE,         type: 'responsable' },
    { name: 'Chef de rang',     type: 'informatif' },
    { name: 'Serveur',          type: 'informatif' },
    { name: 'Runner',           type: 'informatif' },
    { name: 'Barman',           type: 'informatif' },
    { name: 'Barback',          type: 'informatif' },
    { name: 'Chef de cuisine',  type: 'informatif' },
    { name: 'Second de cuisine', type: 'informatif' },
    { name: 'Chef de partie',   type: 'informatif' },
    { name: 'Commis de cuisine', type: 'informatif' },
    { name: 'Plongeur',         type: 'informatif' },
];
const RESP_ROLES = ROLES.filter(r => r.type === 'responsable').map(r => r.name);

// ── L'équipe ──────────────────────────────────────────────────────────────────
// 25 personnes + la directrice. Les prénoms suivent l'alphabet (A → Z, sans X) : sur
// un effectif de cette taille, c'est ce qui permet de retrouver quelqu'un en direct
// devant le prospect sans faire défiler une liste au hasard.
//
// `venues` = les établissements où la personne peut travailler. Il conditionne
// l'ouverture des dispos ET l'affectation : chaque établissement a besoin d'au moins
// autant de personnes éligibles que de créneaux quotidiens, sinon le générateur laisse
// des trous. ⚠️ Chaque établissement a besoin de PLUSIEURS porteurs d'un rôle
// `responsable` : les créneaux d'ouverture leur sont réservés, et s'il n'y en a qu'un
// il rafle tous les services.
//
// `dispo` est la semaine HABITUELLE de la personne : elle alimente à la fois la file de
// dispos (plus bas) et, pour certains, la semaine-type. Écrire une table de dispos à la
// main à côté de la table du staff, c'était entretenir deux listes de 25 lignes qui
// parlent des mêmes gens — et les laisser diverger (quelqu'un déclarant des dispos du
// midi dans un établissement qui ne sert que le soir).
// `days` : 0 = lundi … 6 = dimanche.
//
// `rest` = jours de repos contractuels, en convention **JS** (0 = dimanche), parce que
// c'est celle que lit le produit (`rest_days`, script.js:3174). Le générateur les
// respecte : quelqu'un planifié sur son jour de repos apparaît grisé dans le planning,
// ce qui se lit comme un bug pendant la démo.
//
// `vol` = volume hebdomadaire du contrat, en heures. Il ne part PAS en base : le produit
// ne stocke pas les contrats. Il ne sert qu'à pondérer l'affectation (cf. `pointer` et la
// règle du moins chargé). Sans lui, la règle « le moins chargé l'emporte » finissait par
// donner À TOUT LE MONDE le même volume : chef de cuisine, plongeur et extra sortaient
// tous à ~20 h/semaine, et le récap mensuel — un des écrans que le prospect regarde le
// plus longtemps — alignait 25 personnes sur le même total. C'est la signature d'un jeu
// de données fabriqué. Avec `vol`, la règle compare un TAUX de remplissage (`hours/vol`)
// et non un cumul brut : le chef monte à ~35 h, l'extra reste à ~7 h, et l'échelle des
// salaires du récap redevient celle d'une vraie équipe.
const STAFF = [
    { n: 'Adrien Vasseur',    v: [Z],    r: [RESP_SOIREE],                g: ['Bar'],     rate: 15.2, vol: 32,
      dispo: { type: 'soir', start: 17, end: 26, days: [1, 2, 4, 5] }, tpl: true },
    { n: 'Bastien Roy',       v: [Z],    r: ['Barman'],                   g: ['Bar'],     rate: 13.1, vol: 26,
      dispo: { type: 'soir', start: 18, end: 26, days: [2, 3, 4, 5] }, nickname: 'Bast' },
    { n: 'Camille Dubreuil',  v: [Z, T], r: [RESP_SOIREE, 'Chef de rang'], g: ['Salle'],  rate: 14.6, vol: 26,
      dispo: { type: 'soir', start: 18, end: 26, days: [0, 1, 3, 5] }, tpl: true },
    { n: 'Damien Ferrer',     v: [Z],    r: ['Barman'],                   g: ['Bar'],     rate: 12.9, vol: 24,
      dispo: { type: 'soir', start: 18, end: 26, days: [3, 4, 5, 6] } },
    { n: 'Élodie Sanchez',    v: [Z],    r: ['Barback'],                  g: ['Bar'],     rate: 11.9, vol: 16,
      dispo: { type: 'soir', start: 19, end: 26, days: [4, 5, 6] }, rest: [1, 2] },
    { n: 'Farouk Belkacem',   v: [Z],    r: [RESP_SOIREE],                g: ['Bar'],     rate: 14.8, vol: 32,
      dispo: { type: 'soir', start: 17, end: 26, days: [0, 2, 3, 6] } },
    { n: 'Garance Lemoine',   v: [Z],    r: ['Serveur'],                  g: ['Salle'],   rate: 12.3, vol: 18,
      dispo: { type: 'soir', start: 18, end: 26, days: [1, 4, 5] }, congeModes: 'info' },
    // Hakim n'a AUCUN groupe et les deux établissements : c'est le polyvalent, et la
    // démonstration de la règle « sans groupe = visible dans tous les filtres ».
    { n: 'Hakim Zerrouki',    v: [Z, T], r: ['Runner'],                   g: [],          rate: 12.1, vol: 22,
      dispo: { type: 'soir', start: 18, end: 24.5, days: [1, 2, 3, 4, 5] } },
    { n: 'Inès Carvalho',     v: [T],    r: [RESP_SALLE, 'Chef de rang'], g: ['Salle'],   rate: 14.4, vol: 32,
      dispo: { type: 'midi', start: 11, end: 16, days: [1, 2, 3, 4, 5] }, tpl: true },
    { n: 'Jonas Meunier',     v: [T],    r: [RESP_SALLE],                 g: ['Salle'],   rate: 13.6, vol: 26,
      dispo: { type: 'soir', start: 18, end: 24.5, days: [2, 3, 4, 5] } },
    { n: 'Katia Perrin',      v: [T],    r: ['Serveur'],                  g: ['Salle'],   rate: 12.2, vol: 22,
      dispo: { type: 'midi', start: 11.5, end: 16, days: [0, 1, 2, 4] } },
    { n: 'Lucas Bonnet',      v: [T],    r: ['Serveur'],                  g: ['Salle'],   rate: 12.0, vol: 18,
      dispo: { type: 'soir', start: 19, end: 24.5, days: [3, 4, 5, 6] } },
    { n: 'Manon Estève',      v: [T],    r: [RESP_SALLE],                 g: ['Salle'],   rate: 14.2, vol: 30,
      dispo: { type: 'midi', start: 11, end: 16, days: [0, 2, 3, 5] } },
    { n: 'Nathan Rivière',    v: [T],    r: ['Chef de cuisine'],          g: ['Cuisine'], rate: 17.5, vol: 39,
      dispo: { type: 'soir', start: 18, end: 24.5, days: [1, 2, 3, 4, 5] }, rest: [0, 1], tpl: true },
    { n: 'Oksana Petrenko',   v: [T],    r: ['Second de cuisine'],        g: ['Cuisine'], rate: 14.6, vol: 35,
      dispo: { type: 'soir', start: 18, end: 24.5, days: [0, 2, 3, 4, 5] } },
    { n: 'Pierre-Yves Caron', v: [T],    r: ['Chef de partie'],           g: ['Cuisine'], rate: 13.4, vol: 30,
      dispo: { type: 'midi', start: 11, end: 16, days: [1, 2, 3, 5] }, nickname: 'PY' },
    { n: 'Quentin Faure',     v: [T],    r: ['Commis de cuisine'],        g: ['Cuisine'], rate: 11.9, vol: 28,
      dispo: { type: 'soir', start: 18.5, end: 24.5, days: [2, 3, 4, 5, 6] } },
    // Rachida ne saisit pas de dispos : `can_submit_dispos: false`. Le cas existe dans
    // toutes les équipes (contrat à horaires fixes), et c'est le seul moyen de montrer
    // l'interrupteur — le KPI « Dispos envoyées » l'exclut donc de son dénominateur.
    { n: 'Rachida Amrani',    v: [T],    r: ['Plongeur'],                 g: ['Cuisine'], rate: 11.8, vol: 24,
      dispo: null, noDispos: true },
    { n: 'Samuel Ngoma',      v: [T],    r: ['Chef de partie'],           g: ['Cuisine'], rate: 13.2, vol: 28,
      dispo: { type: 'midi', start: 11.5, end: 16, days: [0, 1, 3, 4] } },
    { n: 'Tiphaine Ollivier', v: [Z, T], r: ['Serveur'],                  g: ['Salle'],   rate: 12.4, vol: 16,
      dispo: { type: 'soir', start: 18, end: 24.5, days: [0, 1, 4, 5] }, congeModes: 'request' },
    { n: 'Ugo Santini',       v: [T],    r: ['Runner'],                   g: [],          rate: 12.0, vol: 18,
      dispo: { type: 'soir', start: 19, end: 24.5, days: [2, 4, 5, 6] } },
    { n: 'Valentine Roche',   v: [Z, T], r: [RESP_SOIREE],                g: ['Salle'],   rate: 14.9, vol: 24,
      dispo: { type: 'soir', start: 18, end: 26, days: [0, 2, 4, 6] }, tpl: true },
    { n: 'Wassim Haddad',     v: [Z],    r: ['Barman'],                   g: ['Bar'],     rate: 13.0, vol: 22,
      dispo: { type: 'soir', start: 18, end: 26, days: [0, 1, 3, 6] } },
    // Partie il y a trois semaines. `archived: true` (F-13) : elle disparaît des dispos,
    // des relances et de la planification, mais ses heures passées restent dans le récap
    // mensuel et dans la masse salariale. C'est LE cas du turnover en restauration, et il
    // était invisible tant que personne n'était archivé. `leftWeeksAgo` n'est pas un champ
    // du modèle : c'est LE fait à saisir, et `archived` en est la conséquence, dérivée
    // plus bas. Porter les deux à la main laissait poser l'un sans l'autre — quelqu'un
    // d'archivé mais encore planifié sur trois semaines, en silence.
    { n: 'Yasmine Corbier',   v: [T],    r: ['Commis de cuisine'],        g: ['Cuisine'], rate: 11.9, vol: 22,
      dispo: null, leftWeeksAgo: 3 },
    // Zoé est l'EXTRA : payée au forfait par shift (`fixed_rate`, exclusif du taux
    // horaire) et ses vacations sont marquées `extra: true` — le récap mensuel les
    // isole. C'est le cas qui montre les deux modes de rémunération côte à côte.
    { n: 'Zoé Marchetti',     v: [Z, T], r: [],                           g: [],          fixed: 95, vol: 8,
      dispo: { type: 'soir', start: 19, end: 26, days: [4, 5] }, extra: true },
];

// La directrice a un VRAI profil staff (E-22 modèle A) : planifiable, comptée en paie,
// et ses dispos passent par la même file de validation que tout le monde.
// `venues` DOIT rester aligné sur `assigned_establishments` de son compte (R-06),
// sinon elle ne peut plus saisir la moindre dispo. Elle ne gère QUE Le Zinc : c'est
// exactement là que se voit le périmètre par établissement — le patron a deux onglets,
// elle un seul, et le récap mensuel qu'elle ouvre ne contient que son bar.
const DIRECTOR = {
    n: 'Hélène Brunet', v: [Z], r: [RESP_SOIREE], g: ['Bar'], rate: 16.9, vol: 20,
    dispo: { type: 'soir', start: 17, end: 24, days: [0, 2, 4] }, tpl: true,
};

// ── Les services, par établissement et par jour ───────────────────────────────
// `dow` : 0 = lundi … 6 = dimanche (et non la convention JS, où 0 = dimanche).
// `resp: true` marque le créneau qui portera la désignation pointage du soir : le
// générateur y place en priorité quelqu'un qui a un rôle `responsable`.
// `closed` : jours de fermeture. `weekend` : créneaux ajoutés les jours de forte
// affluence, listés une seule fois dans WEEKEND pour que la règle ne se dise pas à
// trois endroits.
const WEEKEND = [4, 5];                                              // vendredi, samedi
const SERVICES = {
    // Le bar ouvre 7 j/7, un seul service, avec deux renforts le week-end.
    [Z]: { closed: [],
           slots:   [{ start: 17,   end: 24,   resp: true },
                     { start: 17.5, end: 26 },
                     { start: 18,   end: 26 },
                     { start: 18.5, end: 26 }],
           weekend: [{ start: 20, end: 26 }, { start: 21, end: 26 }] },
    // Le restaurant est fermé le lundi et désigne DEUX responsables par jour, un par
    // service : c'est le cas que D-56 a ouvert (« plusieurs responsables de soirée par
    // jour ») et qui ne se voyait nulle part tant que chaque journée n'en portait qu'un.
    [T]: { closed: [0],
           slots:   [{ start: 11,   end: 16,   resp: true },
                     { start: 11.5, end: 16 },
                     { start: 11.5, end: 15.5 },
                     { start: 12,   end: 16 },
                     { start: 18,   end: 24.5, resp: true },
                     { start: 18,   end: 24.5 },
                     { start: 18.5, end: 24.5 },
                     { start: 19,   end: 24.5 },
                     { start: 19,   end: 24.5 },
                     { start: 19,   end: 24 },
                     { start: 19.5, end: 24.5 }],
           weekend: [{ start: 12, end: 16 }, { start: 19.5, end: 24.5 }] },
};
function slotsFor(estabId, dow) {
    const s = SERVICES[estabId];
    if (s.closed.includes(dow)) return [];
    return WEEKEND.includes(dow) && s.weekend ? [...s.slots, ...s.weekend] : s.slots;
}

// Tout créneau DOIT tenir dans les horaires de son établissement, sinon il se dessine
// hors de la grille (ou se fait rogner) et la démo montre un planning tronqué. Vérifié
// ici plutôt que promis en commentaire : c'est le genre d'écart qu'on ne voit qu'en
// direct devant le prospect.
for (const e of ESTABS) {
    const { open, close } = venueHours(e);
    for (const s of [...SERVICES[e.id].slots, ...(SERVICES[e.id].weekend || [])])
        if (s.start < open || s.end > close)
            throw new Error('Créneau hors horaires pour ' + e.name + ' : '
                + s.start + '→' + s.end + ' déborde de ' + open + '→' + close);
}
// `vol` sert de DIVISEUR à la règle d'affectation : absent ou nul, le score part à
// l'infini et la personne n'est plus jamais choisie — elle disparaîtrait du planning
// sans le moindre message.
for (const s of [...STAFF, DIRECTOR])
    if (!(s.vol > 0)) throw new Error('vol manquant ou nul pour ' + s.n);

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
        // On remonte au 1er du mois précédent OU à 8 semaines en arrière, le plus
        // lointain des deux : le récap mensuel du mois passé doit être COMPLET,
        // sinon la première chose que le prospect ouvre est un tableau tronqué. Huit
        // semaines (et non six) pour tenir la promesse « deux mois d'historique » même
        // quand la démo tombe en début de mois.
        const firstPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const eightWeeksAgo  = weekStart(addDays(now, -56));
        const histStart      = weekStart(firstPrevMonth < eightWeeksAgo ? firstPrevMonth : eightWeeksAgo);

        // ── Établissements ────────────────────────────────────────────────────
        writes.push(db.collection('establishments').insertMany(
            ESTABS.map(e => ({ ...e, created_at: addDays(now, -180) }))));

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
        // Couleurs prises dans la palette DU PRODUIT (`STAFF_COLORS`) plutôt que
        // choisies à la main : c'est celle que `pickStaffColor` sert à la création d'un
        // membre, donc la seule qui ressemble à ce que le prospect obtiendra.
        // ⚠️ Elle ne compte que 15 teintes pour 26 personnes : au-delà, elles se
        // répètent. C'est le comportement réel du produit à cette taille d'équipe
        // (`pickStaffColor` retombe sur un tirage aléatoire une fois la palette épuisée),
        // pas un raccourci du jeu de données.
        const staffDocs = staffDefs.map((s, i) => {
            const doc = {
                name: s.n, color: STAFF_COLORS[i % STAFF_COLORS.length], venues: s.v,
                roles: s.r.map(r => roleId[r]),
                groups: s.g,
                email: '',
                // Plage 06 39 98 XX XX — réservée à la fiction, cf. l'en-tête. Stockée
                // en E.164 par la fonction du produit : le format brut passerait à
                // l'insertion mais casserait la fiche contact du pointage.
                phone: normalizePhone('06 39 98 ' + String(10 + i).padStart(2, '0')
                    + ' ' + String(20 + i * 3).padStart(2, '0')),
                can_submit_dispos: s.noDispos !== true,
                created_at: addDays(now, -170 + i),
            };
            if (s.nickname)   doc.nickname    = s.nickname;
            if (s.rest)       doc.rest_days   = s.rest;
            if (s.congeModes) doc.conge_modes = s.congeModes;
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
            sid[s.n] = s.id;
        });

        // ── Comptes ───────────────────────────────────────────────────────────
        // TOUT LE MONDE a un compte, pas seulement les trois qu'on va montrer. Le KPI
        // « Dispos envoyées » de la page d'accueil a pour dénominateur le nombre de
        // comptes `staff` actifs : avec 3 comptes sur 26 personnes, il afficherait 0/3 —
        // le premier chiffre que voit le prospect, et il serait faux.
        // `normName` (lib/utils, canonisé par A-09) retire accents ET ponctuation :
        // Élodie → elodie, Zoé → zoe, et « Pierre-Yves » → pierre, là où une simple
        // dépose d'accents aurait laissé le tiret dans l'adresse. Une adresse accentuée
        // ou ponctuée est pénible à dicter en visio.
        const slug = n => normName(n).split(' ')[0];
        const hash = await hashPromise;
        const accounts = [
            { email: 'patron@' + MAIL_DOMAIN,    role: 'patron',      name: 'Paul Mercier', staff: null,       estabs: [] },
            { email: 'directeur@' + MAIL_DOMAIN, role: 'directeur',   name: DIRECTOR.n,     staff: DIRECTOR.n, estabs: [Z] },
            { email: 'comptable@' + MAIL_DOMAIN, role: 'observateur', name: 'Odile Bassin', staff: null,       estabs: [] },
            // Les archivés n'ont plus de compte : ils sont partis. Le KPI « Dispos
            // envoyées » les exclut de toute façon (`NOT_ARCHIVED`), mais leur laisser un
            // accès contredirait ce que la démo raconte.
            ...STAFF.filter(s => !s.leftWeeksAgo).map(s => ({
                email: slug(s.n) + '@' + MAIL_DOMAIN, role: 'staff',
                name: s.n, staff: s.n, estabs: [],
            })),
            // Invitation ENVOYÉE, PAS ENCORE ACCEPTÉE. `active: false` est ce qui la range
            // dans l'onglet « ⚠️ Invitations en attente » de la modale Comptes
            // (`script.js:4691`), jusqu'ici toujours vide — alors que « comment j'ajoute
            // quelqu'un ? » est la question que pose tout prospect.
            { email: 'nouveau@' + MAIL_DOMAIN, role: 'staff', name: 'Théo Lambert',
              staff: null, estabs: [], pendingInvite: true },
        ];
        // Deux comptes ne peuvent pas partager une adresse : `users.email` est unique, et
        // l'insertion échouerait au milieu du jeu avec un message Mongo illisible. Sur 26
        // personnes, deux prénoms identiques suffisent — autant le dire ici clairement.
        const emails = accounts.map(a => a.email);
        const dupes  = emails.filter((e, i) => emails.indexOf(e) !== i);
        if (dupes.length) throw new Error('Adresses en double (prénoms identiques ?) : ' + [...new Set(dupes)].join(', '));

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
            // `news_seen_at` est volontairement ABSENT de tous les comptes : absent =
            // jamais lu, donc la pastille « Du neuf » s'allume à la première connexion
            // de chaque rôle. C'est une feature à montrer, pas un état à masquer.
            return doc;
        }));
        // Seule l'absence de la directrice référence un compte : un index des 28
        // ressemblerait à une table générale à maintenir alors qu'il porte une valeur.
        const directorUserId = String(userIns.insertedIds[accounts.findIndex(a => a.role === 'directeur')]);

        // ── Congés (posés AVANT les plannings : ils retirent des gens du pool) ──
        const conges = [
            // Validé et passé — alimente le bloc « congés validés » du récap mensuel.
            { who: 'Inès Carvalho', mode: 'request', status: 'approved',
              from: addDays(histStart, 8), to: addDays(histStart, 13), reason: 'Congés annuels' },
            { who: 'Samuel Ngoma', mode: 'request', status: 'approved',
              from: addDays(histStart, 22), to: addDays(histStart, 27), reason: 'Congés annuels' },
            // Validé et EN COURS — la personne apparaît grisée dans le planning de la
            // semaine qu'on ouvre en premier.
            { who: 'Lucas Bonnet', mode: 'request', status: 'approved',
              from: addDays(thisMon, 3), to: addDays(thisMon, 6), reason: 'Congés annuels' },
            // Une absence LONGUE, à cheval sur les deux semaines de l'horizon : c'est
            // elle qui rend visible le trou que la file de dispos doit combler.
            { who: 'Oksana Petrenko', mode: 'request', status: 'approved',
              from: addDays(nextMon, 2), to: addDays(nextMon, 9), reason: 'Congé sans solde' },
            // EN ATTENTE — c'est la demande que le patron valide en direct pendant la démo.
            { who: 'Quentin Faure', mode: 'request', status: 'pending',
              from: addDays(nextMon, 8), to: addDays(nextMon, 12), reason: 'Mariage d\'un proche' },
            { who: 'Bastien Roy', mode: 'request', status: 'pending',
              from: addDays(nextMon, 11), to: addDays(nextMon, 13), reason: 'Rendez-vous médical' },
            // REFUSÉE — l'onglet Congés ne montrait que des demandes acceptées ou en
            // attente ; le prospect demande systématiquement « et si je refuse ? ».
            { who: 'Damien Ferrer', mode: 'request', status: 'rejected',
              from: addDays(thisMon, 4), to: addDays(thisMon, 5), reason: 'Week-end prolongé' },
            // Déclaration informative : le staff prévient, il n'y a rien à valider.
            { who: 'Garance Lemoine', mode: 'info', status: 'approved',
              from: addDays(nextMon, 4), to: addDays(nextMon, 5), reason: 'Week-end en famille' },
        ];
        writes.push(db.collection('time_off').insertMany(conges.map(c => ({
            staff_id: sid[c.who], staff_name: c.who, mode: c.mode, status: c.status,
            start_date: toDateStr(c.from), end_date: toDateStr(c.to),
            reason: c.reason,                       // `reason`, pas `note` (cf. server.js)
            created_at: addDays(now, -10),
        }))));
        // Indisponible ce jour-là ⇒ ne pas le planifier. Seuls les congés VALIDÉS
        // bloquent : une demande en attente n'a encore rien retiré à personne, et une
        // demande refusée encore moins.
        const blocked = new Set();
        conges.filter(c => c.status === 'approved').forEach(c => {
            for (let d = new Date(c.from); d <= c.to; d = addDays(d, 1))
                blocked.add(sid[c.who] + '|' + toDateStr(d));
        });

        // ── Génération des plannings ──────────────────────────────────────────
        // Du 1er du mois précédent au dimanche de N+2. Les semaines futures existent en
        // base mais restent NON PUBLIÉES → brouillon.
        //
        // Le degré de remplissage décroît avec l'éloignement, comme dans la vraie vie :
        //   N et N+1        → complet    (N publiée, N+1 le brouillon qu'on publie en direct)
        //   N+2             → OSSATURE   (seuls les créneaux `resp` sont posés)
        // Un patron ne monte pas quatre semaines d'affilée au créneau près ; il place
        // d'abord ses responsables. Remplir les semaines lointaines à fond aurait aussi
        // vidé la file de dispos de son sens — il ne resterait plus rien à arbitrer.
        const shifts = [];
        const wageByEstabDate = {};   // (estab|date) → masse salariale brute pointée
        const eligible = {};          // estab → [définitions] des gens pouvant y travailler
        ESTABS.forEach(e => {
            eligible[e.id] = staffDefs.filter(s => s.v.includes(e.id));
        });
        // Un établissement dont le vivier est plus petit que son plus gros jour laisse
        // des créneaux vides tous les week-ends — et un planning troué est la première
        // chose que voit le prospect. Vérifié avant de générer, pas constaté après.
        for (const e of ESTABS) {
            const maxSlots = Math.max(...[0, 1, 2, 3, 4, 5, 6].map(d => slotsFor(e.id, d).length));
            if (eligible[e.id].length < maxSlots)
                throw new Error(e.name + ' : ' + eligible[e.id].length + ' personnes éligibles pour '
                    + maxSlots + ' créneaux le jour le plus chargé');
        }

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
            const jsDow = d.getDay();      // convention `rest_days` (0 = dimanche)
            const past = date < today;
            const busyToday = new Set();   // personne ne fait deux services le même jour

            for (const estab of ESTABS) {
                let slots = slotsFor(estab.id, dow);
                if (date >= ossatureFrom) slots = slots.filter(s => s.resp);
                if (!slots.length) continue;

                // Vivier du jour : éligible, pas en congé, pas sur un jour de repos.
                // L'extra n'est appelé qu'en renfort de fin de semaine — structurellement
                // le moins chargé, il serait sinon pris à chaque créneau par la règle
                // d'équilibrage. Le tri par occupation, lui, est refait à chaque créneau
                // (`free` ci-dessous).
                const usable = eligible[estab.id].filter(s =>
                    !blocked.has(s.id + '|' + date)
                    && !(s.rest && s.rest.includes(jsDow))
                    && !(s.leftOn && date >= s.leftOn)
                    && (s.extra !== true || (WEEKEND.includes(dow) && rnd() < 0.5)));

                for (const slot of slots) {
                    const free = usable.filter(s => !busyToday.has(s));
                    if (!free.length) break;               // effectif épuisé : créneau non couvert
                    // Le créneau `resp` cherche d'abord un porteur d'un rôle responsable :
                    // sans lui, la soirée déclenche l'alerte « ! » et le pointage est bloqué.
                    const resps = slot.resp
                        ? free.filter(s => s.r.some(role => RESP_ROLES.includes(role)))
                        : [];
                    const candidates = resps.length ? resps : free;

                    // Celui qui est LE PLUS LOIN DE SON CONTRAT l'emporte. Un tirage
                    // purement aléatoire donnait des semaines à 38 h pour l'un et 4 h pour
                    // l'autre ; comparer les cumuls bruts (`s.hours`) donnait l'excès
                    // inverse, tout le monde au même volume. C'est le RATIO qui reproduit
                    // ce que fait un patron : il remplit d'abord les contrats les plus
                    // gros. Le score est figé en une passe (le PRNG n'est donc jamais
                    // appelé depuis un comparateur) et le bruit évite une rotation
                    // rigoureusement identique d'une semaine à l'autre.
                    //
                    // Le bruit ne joue que sur le CHOIX du créneau, pas sur le volume :
                    // la règle est auto-correctrice (qui passe sous son ratio est repris
                    // au tour suivant), donc chacun converge sur son contrat quelle qu'en
                    // soit l'amplitude — vérifié, l'élargir de ±3 % à ±15 % ne déplace
                    // aucun total. Il sert uniquement à ce que la rotation ne soit pas
                    // rigoureusement identique d'une semaine à l'autre. Et c'est sans
                    // conséquence pour la démo : le produit ne stocke aucun contrat, donc
                    // aucun écran ne compare jamais les heures planifiées à `vol`. Ce que
                    // le prospect voit du récap, c'est l'ÉVENTAIL (8 h → 32 h selon les
                    // postes) et l'écart planifié/réel, qui vient du pointage.
                    const def = candidates
                        .map(s => [s, s.hours / s.vol + rnd() * 0.3 - 0.15])
                        .reduce((a, b) => (b[1] < a[1] ? b : a))[0];
                    busyToday.add(def);
                    def.hours += slot.end - slot.start;

                    const shift = {
                        establishment_id: estab.id, staff_id: def.id, staff_name: def.n,
                        color: staffDocs[staffDefs.indexOf(def)].color,
                        date, start_time: slot.start, end_time: slot.end,
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
        // La couleur vient du document staff, jamais recopiée : la vignette de candidature
        // resterait sinon à l'ancienne teinte après un changement de palette, en silence.
        const colorOf = name => staffDocs[staffDefs.findIndex(s => s.n === name)].color;
        const candidature = (name, daysAgo) => ({
            staff_id: sid[name], staff_name: name, staff_color: colorOf(name),
            submitted_at: addDays(now, -daysAgo),
        });
        shifts.push({
            establishment_id: Z, staff_id: '__joker__', staff_name: 'Joker', color: '#888',
            date: jokerDate1, start_time: 19, end_time: 26,
            is_joker: true, joker_open: true, note: 'Renfort bar — soirée DJ',
            joker_candidates: [candidature('Bastien Roy', 2), candidature('Wassim Haddad', 1),
                               candidature('Zoé Marchetti', 1)],
        });
        // Le second est sur la semaine en brouillon : il apparaîtra au staff au moment
        // exact où on publiera la semaine devant le prospect.
        shifts.push({
            establishment_id: T, staff_id: '__joker__', staff_name: 'Joker', color: '#888',
            date: toDateStr(addDays(nextMon, 5)), start_time: 19, end_time: 24.5,
            is_joker: true, joker_open: true, joker_candidates: [], note: 'Service du samedi soir',
        });

        // Seule insertion de shifts qui soit attendue plutôt que mise au lot : une
        // demande d'échange référence ses deux shifts par leur `_id`, et Mongo ne le
        // donne qu'à l'écriture. Un aller-retour Atlas payé pour la seule chose qu'on
        // ne peut pas connaître d'avance.
        const shiftIns = await db.collection('shifts').insertMany(shifts);

        // ── Échanges de shifts (F-05) ─────────────────────────────────────────
        // Deux personnes veulent permuter leur service, le patron tranche. C'est la
        // file « ⇄ Échanges » de son écran, et le badge qui va avec.
        //
        // La fenêtre utilisable est étroite, et c'est le produit qui la fixe, pas le
        // jeu : la route n'accepte que des shifts FUTURS (`date >= aujourd'hui`) et de
        // semaine PUBLIÉE (B2-b) — donc uniquement ce qui reste de la semaine courante,
        // la suivante étant volontairement en brouillon. Semé un dimanche soir, il ne
        // reste rien : on ne pose alors AUCUNE demande, plutôt qu'une demande que le
        // patron refuserait d'approuver sous les yeux du prospect.
        const finSemaineCourante = toDateStr(addDays(thisMon, 6));
        const echangeables = shifts
            .map((s, i) => ({ s, id: String(shiftIns.insertedIds[i]) }))
            .filter(({ s }) => s.staff_id !== '__joker__'
                && s.date > today && s.date <= finSemaineCourante);
        // Au Zinc de préférence : c'est le seul établissement de la directrice, donc
        // le seul endroit où la demande apparaît AUSSI sur un compte non-patron — le
        // filtre de périmètre est une partie de ce qu'on montre.
        const source = echangeables.find(({ s }) => s.establishment_id === Z) || echangeables[0];
        const cible  = source && echangeables.find(({ s }) => s.staff_id !== source.s.staff_id);

        if (cible) {
            writes.push(db.collection('shift_swaps').insertOne({
                from_shift_id: source.id,             to_shift_id:   cible.id,
                from_staff_id: source.s.staff_id,     from_staff_name: source.s.staff_name,
                to_staff_id:   cible.s.staff_id,      to_staff_name:   cible.s.staff_name,
                from_establishment_id: source.s.establishment_id,
                to_establishment_id:   cible.s.establishment_id,
                from_date: source.s.date, from_start_time: source.s.start_time, from_end_time: source.s.end_time,
                to_date:   cible.s.date,  to_start_time:   cible.s.start_time,  to_end_time:   cible.s.end_time,
                note: 'Je suis pris ce soir-là — ' + cible.s.staff_name.split(' ')[0] + ' est d\'accord.',
                status: 'pending', created_at: addDays(now, -1),
                decided_at: null, decided_by: null,
            }));
            // Mêmes destinataires que `createNotifForPatrons` : patron toujours,
            // directeur seulement sur son périmètre, observateur jamais. Recopier la
            // règle serait la faire diverger ; on la relit ici en toutes lettres pour
            // que le jeu montre exactement ce que produit un vrai envoi.
            const destinataires = accounts
                .map((a, i) => ({ a, id: String(userIns.insertedIds[i]) }))
                .filter(({ a }) => a.role === 'patron'
                    || (a.role === 'directeur' && a.estabs.includes(source.s.establishment_id)));
            writes.push(db.collection('notifications').insertMany(destinataires.map(({ id }) => ({
                user_id: id,
                type: 'shift_swap_request',
                message: source.s.staff_name + ' propose un échange : son service du '
                    + source.s.date + ' contre celui de ' + cible.s.staff_name + ' le ' + cible.s.date,
                establishment_id: source.s.establishment_id,
                read: false, created_at: addDays(now, -1),
            }))));
        }

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
        //
        // Une seule table, keyée `staff_id|date` : c'est la clé d'unicité du produit
        // (`POST /api/dispos` fait un upsert dessus). Sans elle, un cas particulier posé
        // à la main sur un jour déjà couvert par la semaine habituelle de quelqu'un
        // créait DEUX dispos pour la même personne le même jour — invisible dans le seed,
        // et affiché en double dans la file de validation.
        const dispoByKey = new Map();
        const poser = d => dispoByKey.set(d.staff_id + '|' + d.date, d);

        // 1. Historique : chaque shift déjà planifié a forcément été précédé d'une dispo
        // envoyée puis validée. Sans elles, le KPI « Dispos envoyées » de la page
        // d'accueil affiche 0 % sur toutes les semaines déjà montées — c'est le premier
        // bandeau de l'écran, et il donnerait l'impression d'une équipe qui n'utilise pas
        // l'outil. `confirmed` + `establishment_id` = dispo validée ET affectée.
        const currentWeekEnd = toDateStr(addDays(thisMon, 6));
        for (const s of shifts) {
            if (s.staff_id === '__joker__' || s.date > currentWeekEnd) continue;
            poser({
                staff_id: s.staff_id, staff_name: s.staff_name, date: s.date,
                type: s.start_time < 16 ? 'midi' : 'soir',
                start_time: s.start_time, end_time: s.end_time,
                note: '', status: 'confirmed', establishment_id: s.establishment_id,
                created_at: new Date(new Date(s.date + 'T12:00:00').getTime() - 9 * 864e5),
            });
        }

        // 2. La file EN ATTENTE, sur les deux semaines de l'horizon. Générée depuis la
        // semaine habituelle de chaque personne (`dispo`) plutôt que saisie dans une
        // table parallèle : à 26 personnes, une table à la main aurait fait 60 lignes à
        // tenir d'accord avec la table du staff juste au-dessus.
        //
        // ~15 % des gens ne renvoient rien une semaine donnée. C'est VOULU : un KPI
        // « Dispos envoyées » à 100 % rendrait le bouton de relance incompréhensible, et
        // aucun patron ne croirait à une équipe de 25 personnes où tout le monde répond.
        const OUBLI = 0.15;
        const oublis = [];            // (nom, semaine) — pour le récap de fin de script
        for (let sem = 1; sem <= HORIZON_WEEKS; sem++) {
            const mon = weekStart(addDays(now, 7 * sem));
            for (const s of staffDefs) {
                if (!s.dispo || s.leftWeeksAgo || s.noDispos) continue;
                if (rnd() < OUBLI) { oublis.push(s.n + ' (S+' + sem + ')'); continue; }
                for (const off of s.dispo.days) {
                    const date = toDateStr(addDays(mon, off));
                    // Un congé validé a déjà retiré la personne : envoyer une dispo
                    // par-dessus, c'est ce que le produit empêche (`splitDisposByConges`).
                    if (blocked.has(s.id + '|' + date)) continue;
                    poser({
                        staff_id: s.id, staff_name: s.n, date,
                        type: s.dispo.type, start_time: s.dispo.start, end_time: s.dispo.end,
                        note: '', status: 'pending',
                        created_at: addDays(now, -3), updated_at: addDays(now, -3),
                    });
                }
            }
        }

        // 3. Les formes particulières, posées APRÈS : la file doit contenir autre chose
        // que des créneaux, et `poser` garantit qu'elles écrasent la semaine habituelle
        // au lieu de s'y ajouter.
        poser({   // indisponibilité déclarée
            staff_id: sid['Damien Ferrer'], staff_name: 'Damien Ferrer',
            date: toDateStr(addDays(nextMon, 4)),
            type: 'off', start_time: null, end_time: null, note: 'Indisponible ce soir-là',
            status: 'pending', created_at: addDays(now, -3),
        });
        poser({   // dispo déjà validée et affectée : elle doit SORTIR de la file
            staff_id: sid['Katia Perrin'], staff_name: 'Katia Perrin',
            date: toDateStr(addDays(nextMon, 1)),
            type: 'midi', start_time: 11.5, end_time: 16, status: 'confirmed',
            establishment_id: T, created_at: addDays(now, -4),
        });
        poser({   // une note libre attachée au créneau, que le patron lit à la validation
            staff_id: sid['Ugo Santini'], staff_name: 'Ugo Santini',
            date: toDateStr(addDays(nextMon, 5)),
            type: 'soir', start_time: 19, end_time: 24.5, status: 'pending',
            note: 'Je dois partir à minuit au plus tard (dernier train).',
            created_at: addDays(now, -2), updated_at: addDays(now, -2),
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
        const suivi  = staffDefs.find(s => s.n === 'Adrien Vasseur');
        const jour   = toDateStr(nextMon);
        const events = [];
        let etat = null;
        const journal = (action, by, at, apres) => {
            const d = dispoEventDelta(etat, apres);
            if (d) events.push({
                staff_id: suivi.id, staff_name: suivi.n, date: jour,
                at, by, action, before: d.before, after: d.after,
            });
            etat = apres;
        };
        const parLui   = { user_id: null, role: 'staff', name: suivi.n };
        const parDiane = { user_id: directorUserId, role: 'directeur', name: DIRECTOR.n };
        journal('submit',  parLui,   addDays(now, -3), { type: 'soir', start_time: 18, end_time: 26, status: 'pending' });
        journal('update',  parLui,   addDays(now, -2), { type: 'soir', start_time: 17, end_time: 26, status: 'pending' });
        journal('confirm', parDiane, addDays(now, -1), { type: 'soir', start_time: 17, end_time: 26, status: 'confirmed', establishment_id: Z });
        poser({
            staff_id: suivi.id, staff_name: suivi.n, date: jour, note: '',
            created_at: addDays(now, -3), updated_at: addDays(now, -1), ...etat,
        });
        writes.push(db.collection('dispo_events').insertMany(events));

        // Note de semaine : un commentaire libre attaché à la SEMAINE, pas à un jour.
        // Stocké dans la même collection avec `type: 'week_note'` et `week_start` — c'est
        // pourquoi toutes les requêtes de dispos excluent ce type (`server.js:755`).
        // Hors de la table keyée par date : il n'a pas de `date`, et l'y ranger aurait
        // écrasé la dispo du lundi de la personne.
        const dispos = [...dispoByKey.values(),
            { staff_id: sid['Hakim Zerrouki'], staff_name: 'Hakim Zerrouki',
              week_start: toDateStr(nextMon), type: 'week_note',
              week_note: 'Je peux dépanner au Zinc si besoin, prévenez-moi la veille.',
              created_at: addDays(now, -3) },
            { staff_id: sid['Manon Estève'], staff_name: 'Manon Estève',
              week_start: toDateStr(addDays(nextMon, 7)), type: 'week_note',
              week_note: 'Je récupère mes enfants le mercredi, pas de service du soir.',
              created_at: addDays(now, -2) },
        ];
        writes.push(db.collection('availabilities').insertMany(dispos));

        // ── Semaines-types (ouvertes à TOUT le staff depuis le 2026-08-24) ──────
        // La semaine-type PRÉ-REMPLIT les dispos, elle ne les envoie pas : la
        // matérialisation n'a lieu qu'à la deadline, et seulement sur les jours restés
        // vides — une saisie manuelle n'est jamais écrasée (règle du 2026-08-10).
        //
        // Plusieurs personnes en ont une, et pas seulement la directrice : la collection
        // s'appelle encore `manager_dispo_templates` pour ne pas migrer une base client,
        // mais le mécanisme ne connaît plus le rôle (server.js:4609). Un jeu qui n'en
        // semait qu'une, sur le compte directeur, laissait croire au privilège que la
        // feature a justement supprimé.
        //
        // Les jours repris sont ceux de la semaine habituelle : c'est ce qu'un vrai
        // salarié enregistre, et ça reste cohérent avec la file de dispos ci-dessus.
        writes.push(db.collection('manager_dispo_templates').insertMany(
            staffDefs.filter(s => s.tpl).map(s => ({
                staff_id: s.id, staff_name: s.n,
                days: Object.fromEntries(s.dispo.days.map(off =>
                    [off, { type: s.dispo.type, start_time: s.dispo.start, end_time: s.dispo.end }])),
                updated_at: addDays(now, -20),
            }))));
        // Les absences du DIRECTEUR vivent à part (E-19, keyées `user_id`) : c'est le seul
        // congé qui ne passe pas par `time_off`.
        writes.push(db.collection('manager_time_off').insertOne({
            user_id: directorUserId, name: DIRECTOR.n,
            start_date: toDateStr(addDays(nextMon, 9)), end_date: toDateStr(addDays(nextMon, 10)),
            type: 'off', note: 'Salon professionnel', created_at: addDays(now, -6),
        }));

        // ── Réglages ──────────────────────────────────────────────────────────
        // Deadline dispos = samedi 23 h. Le jour de la semaine seul compte (elle est
        // RECALCULÉE chaque semaine par `computeEffectiveDeadline`) : viser le samedi
        // garantit qu'elle est encore à venir tous les jours de démo sauf le
        // dimanche — une deadline dépassée grise le formulaire au pire moment.
        const deadlineSaturday = toDateStr(addDays(thisMon, 5)) + 'T23:00';
        const settings = [
            { key: 'dispo', open: true, force_open: false, message: null,
              custom_deadline: deadlineSaturday,
              // Horizon B2 : saisie ET validation sur 2 semaines. Absents, ces deux
              // réglages retombent à 1 (`clampHorizonWeeks`) et la deuxième semaine
              // disparaît de la saisie alors que le planning, lui, la contient.
              horizon_weeks: HORIZON_WEEKS, validation_horizon_weeks: VALIDATION_WEEKS,
              // Réouverture NOMINATIVE (E-15) posée pour Damien sur la semaine N+1.
              // ⚠️ Elle ne DÉBLOQUE personne hors dimanche, et c'est voulu : la deadline visant le
              // samedi 23 h, `computeEffectiveDeadline` la ramène toujours dans la
              // semaine courante, donc elle n'est franchie qu'un dimanche (cf. le
              // commentaire de `deadlineSaturday`). L'entrée est là pour que le réglage
              // soit VISIBLE dans l'écran du patron, pas pour lever un blocage.
              // La forme `{ staff_id, week_start }` est celle que lit `staffReopenedFor` ;
              // une chaîne nue est l'ancienne forme, encore acceptée mais à ne pas semer.
              force_open_staff: [{ staff_id: sid['Damien Ferrer'], week_start: toDateStr(nextMon) }] },
            // Objectif global + surcharges par établissement : un bar et un restaurant
            // n'ont pas la même structure de coût, et l'app le sait.
            // ⚠️ Ces valeurs sont calées SUR LES DONNÉES générées : posées trop bas, tout
            // le tableau de la page Performance ressort en rouge et la démo raconte un
            // groupe en difficulté. Visées un peu au-dessus de la médiane ⇒ majorité de
            // jours verts, une minorité rouge — ce qui montre l'alerte sans noircir le
            // tableau. Le récap de fin de script affiche la médiane réelle : si elle
            // s'éloigne de ces cibles, ce sont ces trois lignes qu'il faut rectifier.
            { key: 'performance',      target_charged: 31, charge_rate: CHARGE_RATE },
            { key: 'performance_' + Z, target_charged: 31, charge_rate: CHARGE_RATE },
            { key: 'performance_' + T, target_charged: 30, charge_rate: CHARGE_RATE },
            // Semaine courante publiée. Forme courante : `establishments` ('ALL' ou
            // une liste d'ids) — `published: true` est la branche legacy.
            { key: 'publish_' + toDateStr(thisMon), establishments: 'ALL', published_at: addDays(now, -5) },
            // La semaine PROCHAINE n'a volontairement PAS de doc publish_ : c'est le
            // brouillon qu'on publiera en direct devant le prospect.
        ];
        // Relire la forme avec la fonction du produit plutôt que de la croire correcte.
        // `force_open_staff` accepte deux formes (objet et chaîne legacy) : une faute de
        // frappe sur une clé passerait sans bruit et ne se verrait qu'en démo.
        if (!staffReopenedFor(settings[0], sid['Damien Ferrer'], toDateStr(nextMon)))
            throw new Error('force_open_staff : forme non reconnue par staffReopenedFor');
        writes.push(db.collection('settings').insertMany(settings));

        // ── Notifications ─────────────────────────────────────────────────────
        // Le compte affiché est DÉRIVÉ de `sent_to` : il était écrit « 11 membre(s) »
        // pour 13 destinataires, et le message contredisait la donnée juste en dessous.
        // Les archivés sont exclus, et ceux qui ne saisissent pas de dispos aussi : le
        // serveur ne relance jamais l'un ni l'autre (`DISPO_TARGET` porte `NOT_ARCHIVED`
        // et `can_submit_dispos`), le journal ne doit pas dire le contraire.
        const rappelTo = staffDefs.filter(s => !s.leftWeeksAgo && !s.noDispos).map(s => s.id);
        writes.push(db.collection('notifications').insertOne({
            type: 'rappel_dispo',
            message: 'Rappel dispos envoyé à ' + rappelTo.length + ' membre(s) — semaine du ' + toDateStr(nextMon),
            week_start: toDateStr(nextMon),
            sent_to: rappelTo,
            read: false, created_at: addDays(now, -3),
        }));
        writes.push(db.collection('staff_notifications').insertMany([
            { staff_id: sid['Adrien Vasseur'], type: 'planning', title: 'Planning publié',
              body: 'Ton planning de la semaine est disponible.', url: '/planning.html',
              read: false, created_at: addDays(now, -5) },
            { staff_id: sid['Adrien Vasseur'], type: 'dispo', title: 'Dispos à envoyer',
              body: 'Pense à saisir tes disponibilités pour la semaine prochaine.', url: '/planning.html',
              read: true, created_at: addDays(now, -3) },
            { staff_id: sid['Bastien Roy'], type: 'joker', title: 'Créneau à pourvoir',
              body: 'Un renfort est ouvert samedi au Zinc.', url: '/planning.html',
              read: false, created_at: addDays(now, -2) },
            { staff_id: sid['Inès Carvalho'], type: 'planning', title: 'Planning publié',
              body: 'Ton planning de la semaine est disponible.', url: '/planning.html',
              read: false, created_at: addDays(now, -5) },
        ]));

        await Promise.all(writes);

        // ── Récapitulatif ─────────────────────────────────────────────────────
        const pointed = shifts.filter(s => s.real_start != null).length;
        // La médiane du coefficient réellement obtenu, par établissement : c'est elle qui
        // dit si les `target_charged` posés plus haut sont encore bien calés. L'annoncer
        // évite de découvrir en démo que toute la page Performance est rouge.
        const coeffs = {};
        revenues.forEach(r => {
            const gross = wageByEstabDate[r.establishment_id + '|' + r.date];
            (coeffs[r.establishment_id] ||= []).push((gross * CHARGE_MULT) / r.revenue * 100);
        });
        // Semaines d'HISTORIQUE (pointé), et non l'empan total : c'est le chiffre qu'on
        // annonce au prospect (« deux mois »), et il ne doit pas inclure les semaines à
        // venir, qui ne portent aucun pointage.
        const semPassees = Math.round((thisMon - histStart) / (7 * 864e5));

        console.log('\n╭─ Base « ' + dbName + ' » prête pour la démo');
        console.log('│  ' + ESTABS.length + ' établissements · ' + staffDefs.length + ' membres ('
            + staffDefs.filter(s => s.leftWeeksAgo).length + ' archivé) · '
            + shifts.length + ' shifts (' + pointed + ' pointés) · ' + revenues.length + ' jours de CA');
        console.log('│  Plannings du ' + toDateStr(histStart) + ' au ' + horizon.to
            + '   — ' + semPassees + ' semaines d\'historique pointé');
        console.log('│    complets jusqu\'au ' + toDateStr(nextSun) + ', ossature à partir du ' + ossatureFrom);
        // L'échelle des heures : c'est ce que montre le récap mensuel, et c'est le
        // premier endroit où un jeu de données trop lisse se trahit. Trois personnes
        // suffisent à vérifier que l'éventail tient (cf. `vol`).
        const semaine = {};
        shifts.filter(s => s.staff_id !== '__joker__' && s.date < today).forEach(s => {
            semaine[s.staff_id] = (semaine[s.staff_id] || 0) + (s.end_time - s.start_time);
        });
        const echelle = staffDefs
            .filter(s => !s.leftWeeksAgo)
            .map(s => [s.n, (semaine[s.id] || 0) / semPassees, s.vol])
            .sort((a, b) => b[1] - a[1]);
        const ligne = e => '     ' + e[0].padEnd(18) + e[1].toFixed(1).padStart(5) + ' h/sem  (contrat ' + e[2] + ' h)';
        console.log('│  Heures réellement planifiées, par semaine :');
        console.log('│' + ligne(echelle[0]));
        console.log('│' + ligne(echelle[Math.floor(echelle.length / 2)]));
        console.log('│' + ligne(echelle[echelle.length - 1]));
        ESTABS.forEach(e => {
            const list = (coeffs[e.id] || []).slice().sort((a, b) => a - b);
            const med  = list.length ? list[Math.floor(list.length / 2)] : 0;
            const cible = settings.find(s => s.key === 'performance_' + e.id).target_charged;
            console.log('│    ' + e.name.padEnd(11) + ' coefficient médian ' + med.toFixed(1)
                + ' %  (objectif ' + cible + ' %)');
        });
        const valid = disposHorizonRange(now, VALIDATION_WEEKS);
        const enAttente = dispos.filter(d => d.status === 'pending'
            && d.date >= valid.from && d.date <= valid.to).length;
        console.log('│  ' + (cible
            ? '1 échange de shifts en attente (' + source.s.staff_name + ' ⇄ ' + cible.s.staff_name + ')'
            : 'aucun échange semé — plus aucun jour publié à venir cette semaine'));
        console.log('│  ' + enAttente + ' dispos en attente sur ' + horizon.from + ' → ' + horizon.to
            + '   (' + oublis.length + ' non-envois : ' + (oublis.join(', ') || 'aucun') + ')');
        console.log('│');
        console.log('│  Mot de passe commun : ' + PASSWORD);
        accounts.filter(a => a.role !== 'staff')
            .forEach(a => console.log('│    ' + a.role.padEnd(12) + ' ' + a.email));
        const staffAccounts = accounts.filter(a => a.role === 'staff' && !a.pendingInvite);
        console.log('│    staff        ' + staffAccounts.length + ' comptes : '
            + staffAccounts.map(a => a.email.split('@')[0]).join(', '));
        console.log('│                 @' + MAIL_DOMAIN);
        console.log('╰─ Déroulé de démo suggéré :\n');
        [
            'Planning, semaine courante — publiée, l\'équipe la voit. Basculer du Zinc à La Rotonde : '
                + 'la grille suit les horaires de chaque établissement (17 h → 2 h contre 11 h → 0 h 30).',
            'Filtrer par groupe (Bar / Salle / Cuisine) — Hakim Zerrouki et Ugo Santini n\'ont AUCUN '
                + 'groupe : ils restent visibles partout, c\'est la règle du polyvalent.',
            'Semaine suivante — elle est en BROUILLON. Ouvrir la file de dispos ('
                + enAttente + ' en attente sur les ' + VALIDATION_WEEKS + ' semaines ouvertes), en valider'
                + ' quelques-unes, puis publier. C\'est le cycle complet, et c\'est LE moment de la démo.',
            'Dans la file : une indisponibilité (Damien Ferrer), une note de créneau (Ugo Santini, '
                + '« dernier train »), et deux notes de semaine. Tout n\'est pas un créneau à cocher.',
            'Page d\'accueil, KPI « Dispos envoyées » — il n\'est pas à 100 % : '
                + (oublis.length || 'quelques') + ' personnes n\'ont rien renvoyé. Le bouton de relance sert à ça.',
            'Se connecter en directrice (directeur@' + MAIL_DOMAIN + ') — elle ne gère QUE Le Zinc : '
                + 'un seul onglet, un seul récap, et ses propres dispos passent par la même validation que tout le monde.',
            'Onglet Congés — une demande de Quentin Faure attend une réponse, une de Damien Ferrer a été '
                + 'REFUSÉE, Lucas Bonnet est en congé cette semaine (grisé au planning) et Oksana Petrenko '
                + 'part 8 jours à cheval sur les deux semaines ouvertes.',
            'Joker ouvert samedi au Zinc — 3 candidatures reçues, en retenir une en un clic.',
            'Gestion du staff — 25 personnes : taux horaire, rôles, groupes, jours de repos '
                + '(Nathan Rivière, Élodie Sanchez), surnoms (« Bast », « PY »), et Rachida Amrani qui ne '
                + 'saisit pas de dispos. Yasmine Corbier est ARCHIVÉE : partie il y a 3 semaines, elle '
                + 'sort des dispos et du planning mais ses heures restent au récap. Le turnover, en clair.',
            'Ma semaine type — ouverte à TOUTE l\'équipe : '
                + staffDefs.filter(s => s.tpl).length + ' personnes en ont enregistré une. Elle pré-remplit '
                + 'les jours restés vides à la deadline, sans jamais écraser une saisie manuelle.',
            'Modale Comptes, onglet « Invitations en attente » — Théo Lambert a été invité et n\'a pas encore posé son mot de passe.',
            'Historique d\'une dispo (F-12) — Adrien a saisi, corrigé, puis la directrice a validé : qui a fait quoi, et quand.',
            'Pointage — comparer planifié et réel sur les semaines passées : c\'est là que les heures non facturées apparaissent.',
            'Performance — CA, masse salariale chargée et coefficient jour par jour, coloré contre l\'objectif propre à chaque établissement.',
            'Récap mensuel du mois dernier — heures par personne, écart planifié/réel, ventilation par '
                + 'établissement, congés validés, et Zoé Marchetti au forfait isolée des salariés à l\'heure.',
            '« Du neuf » — la pastille est allumée sur les trois écrans : aucun compte n\'a encore lu le journal des nouveautés.',
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
