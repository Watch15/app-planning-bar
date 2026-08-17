// Utilitaires purs — pas de dépendance sur Express, Mongo ou le réseau.
// Faciles à tester de manière isolée.

const crypto = require('crypto');

function isValidObjectId(id) {
    return typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
}

function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizePhone(raw) {
    if (raw == null) return null;

    // 1. Supprimer les caract\u00E8res invisibles Unicode
    let p = String(raw)
        .replace(/[\u00A0\u200B\u200C\u200D\u2011\uFEFF]/g, '')
        .trim();

    // 2. "+33(0)6..." \u2192 "+336..."  avant de supprimer les parenth\u00E8ses
    p = p.replace(/\+(\d{1,3})\(0\)/g, '+$1');

    // 3. Supprimer espaces, tirets, points, parenth\u00E8ses
    p = p.replace(/[\s\-.()]/g, '');

    // 4. "0033..." \u2192 "+33..."  (pr\u00E9fixe international double-z\u00E9ro)
    if (/^00/.test(p)) p = '+' + p.slice(2);

    // 5. "06..." / "07..." \u2192 "+336..." / "+337..."
    if (/^0[67]/.test(p)) p = '+33' + p.slice(1);

    // 6. Pas de "+" \u2192 ajouter
    if (!/^\+/.test(p)) p = '+' + p;

    // 7. Valider E.164
    if (!/^\+[1-9]\d{7,14}$/.test(p)) {
        console.error('[normalizePhone] format invalide :', String(raw).slice(0, 40), '\u2192', p);
        return null;
    }

    return p;
}

// Date active = la "session" en cours (règle cutoff_hour).
// Avant cutoff_hour du matin, on considère qu'on est encore sur la session
// de la veille (gestion des shifts de nuit qui se terminent après minuit).
//   ex. cutoffHour = 9 : à 2h du matin le 12 avril → date active = 11 avril
// Retourne une Date locale (minuit de la date active).
function computeActiveDate(now, cutoffHour) {
    const d = new Date(now);
    if (d.getHours() < cutoffHour) d.setDate(d.getDate() - 1);
    d.setHours(0, 0, 0, 0);
    return d;
}

// Lundi (à minuit local) de la semaine contenant `date`, formatage de date, et
// horizon de saisie des dispos (B2).
// Source unique partagée avec le front : voir public/lib/week.js + tests/week.test.js (R-01).
// Ré-exporté tel quel pour ne pas changer les call sites serveur (disposWeekStart,
// isAutoPublished, routes) ni les imports existants.
// `toDateStr` et `disposWeekStart` VIVAIENT ici et sont partis dans `week.js` : B2 a
// besoin des deux côté navigateur (le formulaire multi-semaines et la file du patron
// calculent la même plage que le serveur), et le front en portait déjà une copie
// manuelle — `script.js` disait en commentaire qu'il rejouait la logique serveur.
const {
    weekStart, currentWeekStart, WEEK_CUTOFF_HOUR, toDateStr, disposWeekStart,
    disposHorizonRange, disposHorizonMondays, clampHorizonWeeks, DISPO_HORIZON_MAX,
    upcomingWeekStart, upcomingWeekRange, upcomingWeekMondays,
} = require('../public/lib/week.js');

// La semaine en cours et toutes les semaines passées sont auto-publiées.
// Une semaine future requiert un flag `settings: publish_<weekStart>` en base.
// `referenceNow` est injectable pour faciliter les tests.
function isAutoPublished(shiftDateStr, referenceNow) {
    const ref       = referenceNow || new Date();
    const shiftWeek = weekStart(new Date(shiftDateStr + 'T12:00:00'));
    const refWeek   = weekStart(ref);
    return shiftWeek <= refWeek;
}

// Normalise un doc settings `publish_<lundi>` en l'ensemble des établissements
// publiés pour cette semaine :
//   'ALL'        → tous les établissements (format legacy `{ published:true }` sans
//                  champ `establishments`, ou `establishments:'ALL'`)
//   Set<estabId> → uniquement ces établissements
//   null         → rien publié manuellement pour cette semaine
function normalizePublishDoc(doc) {
    if (!doc) return null;
    if (doc.establishments === 'ALL') return 'ALL';
    if (Array.isArray(doc.establishments)) return new Set(doc.establishments);
    if (doc.published === true) return 'ALL'; // legacy : publication globale
    return null;
}

// La date `dateStr` est-elle publiée POUR l'établissement `establishmentId` ?
// Vrai si auto-publiée (semaine en cours/passée → tous les établissements) OU si
// l'entrée du lundi de sa semaine vaut 'ALL' ou contient `establishmentId`.
// `publishedWeeks` : Map<lundi 'YYYY-MM-DD', 'ALL' | Set<estabId>> (cf. fetchPublishedWeeks).
// Helper pur partagé par tous les call sites serveur (source unique, R-02).
// Remplace l'ancienne heuristique `|shiftDate - weekMonday| < 8 jours` qui matchait
// à tort une semaine adjacente (un lundi est à 7 j du lundi précédent).
function isDatePublished(dateStr, publishedWeeks, establishmentId, referenceNow) {
    if (isAutoPublished(dateStr, referenceNow)) return true;
    if (!publishedWeeks || typeof publishedWeeks.get !== 'function') return false;
    const wk = toDateStr(weekStart(new Date(dateStr + 'T12:00:00')));
    const entry = publishedWeeks.get(wk);
    if (!entry) return false;
    if (entry === 'ALL') return true;
    return establishmentId != null && entry.has(establishmentId);
}

// Deux plages de dates "YYYY-MM-DD" se chevauchent-elles ? (bornes incluses)
// Comparaison lexicographique : valide car le format ISO est trié comme les dates.
// Utilisé pour empêcher deux congés du même staff de se recouvrir.
function datesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart <= bEnd && bStart <= aEnd;
}

// Le congé `conge` couvre-t-il la date `dateStr` ("YYYY-MM-DD") ? (bornes incluses)
function congeCoversDate(conge, dateStr) {
    if (!conge || !conge.start_date || !conge.end_date) return false;
    return conge.start_date <= dateStr && dateStr <= conge.end_date;
}

// Nombre de jours calendaires du congé `conge` qui tombent dans la fenêtre
// [fromStr, toStr] (bornes incluses, dates "YYYY-MM-DD"). 0 si pas de recouvrement.
// Sert au récap mensuel : compter les jours de congé d'un staff sur le mois.
function congeDaysInRange(conge, fromStr, toStr) {
    if (!conge || !conge.start_date || !conge.end_date) return 0;
    const start = conge.start_date > fromStr ? conge.start_date : fromStr;
    const end   = conge.end_date   < toStr   ? conge.end_date   : toStr;
    if (start > end) return 0;
    const sd = new Date(start + 'T12:00:00');
    const ed = new Date(end + 'T12:00:00');
    return Math.round((ed - sd) / 86400000) + 1;
}

// Sépare une liste de dispos `[{ date, ... }]` selon les congés `[{ start_date,
// end_date }]` (déjà filtrés « non refusés » par l'appelant). Un jour couvert par
// un congé est IGNORÉ (rangé dans skippedDates) plutôt que de faire échouer tout le
// lot. Retourne { kept, skippedDates } — skippedDates = dates uniques triées.
// Source de vérité serveur pour POST /api/dispos (cf. garde congé).
function splitDisposByConges(dispos, conges) {
    const list = Array.isArray(dispos) ? dispos : [];
    const cgs  = Array.isArray(conges) ? conges : [];
    if (!cgs.length) return { kept: list.slice(), skippedDates: [] };
    const onConge = d => cgs.some(c => congeCoversDate(c, d.date));
    const kept = list.filter(d => !onConge(d));
    const skippedDates = [...new Set(list.filter(onConge).map(d => d.date))].sort();
    return { kept, skippedDates };
}

// Le staff est-il en congé sur TOUTE la fenêtre [fromStr, toStr] — chaque jour
// calendaire couvert par au moins un congé (déjà filtré « non refusé » par
// l'appelant) ? Sert à ne pas compter quelqu'un en vacances toute la semaine
// parmi ceux qui doivent envoyer leurs dispos (il est réputé « couvert »).
function isFullRangeOnConge(conges, fromStr, toStr) {
    if (!fromStr || !toStr || fromStr > toStr) return false;
    const cgs = Array.isArray(conges) ? conges : [];
    if (!cgs.length) return false;
    const cur = new Date(fromStr + 'T12:00:00');
    const end = new Date(toStr + 'T12:00:00');
    if (isNaN(cur.getTime()) || isNaN(end.getTime())) return false;
    while (cur <= end) {
        const ds = toDateStr(cur);
        if (!cgs.some(c => congeCoversDate(c, ds))) return false;
        cur.setDate(cur.getDate() + 1);
    }
    return true;
}

// Convertit le taux de charges patronales (%) en multiplicateur sur la masse brute.
// ex. chargeRate=45 → 1.45. Bornes raisonnables : 0–200 %, défaut 45.
function chargeMultiplier(chargeRate) {
    const rate = chargeRate == null ? 45 : chargeRate;
    return 1 + (rate / 100);
}

// Résout les paramètres Performance EFFECTIFS d'un établissement (E-14/E-24) :
// override par établissement (settings.performance_<id>) > défaut global
// (settings.performance) > valeurs par défaut codées. Chaque champ retombe
// indépendamment (un établissement peut surcharger le seul `charge_rate` et
// hériter des objectifs globaux). `global`/`perEstab` sont les docs `settings`
// bruts (ou null/undefined si absents).
const PERF_DEFAULTS = { target_gross: 30, target_charged: 43, charge_rate: 45 };
function resolvePerfSettings(global, perEstab) {
    const g = global || {};
    const e = perEstab || {};
    const pick = field => (e[field] ?? g[field] ?? PERF_DEFAULTS[field]);
    return {
        target_gross:   pick('target_gross'),
        target_charged: pick('target_charged'),
        charge_rate:    pick('charge_rate'),
    };
}

// Palette de couleurs staff + sélection d'une couleur inutilisée (première libre,
// sinon aléatoire). Partagé par TOUTES les créations de staff (route unitaire, bulk,
// profil directeur E-22, script de rattrapage) pour éviter la dérive entre copies.
const STAFF_COLORS = ['#3498db','#9b59b6','#e67e22','#2ecc71','#e74c3c','#1abc9c','#e91e8c','#f39c12','#16a085','#8e44ad','#d35400','#27ae60','#2980b9','#c0392b','#7f8c8d'];
function pickStaffColor(usedColors) {
    const used = usedColors instanceof Set ? usedColors : new Set(usedColors || []);
    return STAFF_COLORS.find(c => !used.has(c)) || STAFF_COLORS[Math.floor(Math.random() * STAFF_COLORS.length)];
}

// ── Disponibilités des directeurs (E-22) — logique pure ────────────────────────
// Le directeur passe par le pipeline `availabilities` standard (mêmes dispos que
// le staff, même file de validation patron). Sa semaine-type n'est qu'une
// COMMODITÉ DE SAISIE : elle pré-remplit les jours vides, elle n'écrase rien.

// Dates 'YYYY-MM-DD' de la fenêtre [fromStr..toStr] couvertes par au moins une des
// périodes `[{ start_date, end_date }]` (bornes incluses). Sert à exclure les jours
// d'absence déclarée (E-19, `manager_time_off`) de la matérialisation de la
// semaine-type — l'équivalent de `splitDisposByConges` côté directeur.
function datesCoveredByPeriods(periods, fromStr, toStr) {
    const list = Array.isArray(periods) ? periods : [];
    if (!list.length || !fromStr || !toStr || fromStr > toStr) return [];
    const cur = new Date(fromStr + 'T12:00:00');
    const end = new Date(toStr + 'T12:00:00');
    if (isNaN(cur.getTime()) || isNaN(end.getTime())) return [];
    const out = [];
    while (cur <= end) {
        const ds = toDateStr(cur);
        if (list.some(p => congeCoversDate(p, ds))) out.push(ds);
        cur.setDate(cur.getDate() + 1);
    }
    return out;
}

// La deadline de saisie est-elle levée pour cet utilisateur ?
// Le directeur en est exempté (décision produit du 2026-08-05) : il passe par le même
// pipeline que le staff depuis la correction E-22, mais rater la deadline l'empêcherait
// de déclarer SES PROPRES heures, sans personne au-dessus de lui pour rouvrir la saisie.
// N'ouvre QUE la deadline : `staffDispoOpen` (ouverture par établissement) continue
// de s'appliquer au directeur comme à tout le monde.
function dispoDeadlineWaived(settings, role, staffForceOpen) {
    if (settings && settings.force_open) return true;
    if (staffForceOpen) return true;
    return role === 'directeur';
}

// Matérialise la semaine-type (E-22 v2) sur une semaine : pour chaque jour de
// [weekStart .. +6] qui a une entrée horaire dans le modèle ET n'est pas déjà pris
// (`takenDates` = jours ayant déjà une dispo, quelle qu'en soit l'origine, + jours
// d'absence déclarée), renvoie { date, type, start_time, end_time } à insérer.
// CRÉATION SEULE : le modèle comble les trous, il ne remplace jamais l'existant.
// `template.days` est keyé lundi=0 … dimanche=6 ; `weekStart` doit être un lundi
// ('YYYY-MM-DD'). Midi local → insensible au DST.
function buildTemplateDispos(template, weekStart, takenDates) {
    const taken = takenDates instanceof Set ? takenDates : new Set(takenDates || []);
    const days  = (template && template.days) || {};
    const base  = new Date(weekStart + 'T12:00:00');
    const out = [];
    for (let i = 0; i < 7; i++) {
        const date = toDateStr(new Date(base.getTime() + i * 864e5));
        if (taken.has(date)) continue;
        const cell = days[i];
        if (!cell || cell.start_time == null || cell.end_time == null) continue;
        out.push({ date, type: cell.type || 'custom', start_time: cell.start_time, end_time: cell.end_time });
    }
    return out;
}

// Décide si la semaine-type doit être matérialisée MAINTENANT.
//
// Règle posée le 2026-08-10 : la semaine-type part **au déclenchement de la deadline,
// jamais avant**. Auparavant le cron la matérialisait tous les jours à 10h, donc jusqu'à
// 4 jours d'avance : les dispos de la directrice tombaient dans la file de validation du
// patron avant même que le staff ait fini d'envoyer les siennes.
//
// Le modèle devient : la semaine-type est **ce qui est envoyé à ma place si je n'ai rien
// envoyé moi-même**. La règle « création seule » de `buildTemplateDispos` donne déjà
// exactement cette sémantique — une saisie manuelle faite dans la semaine gagne, le
// modèle ne comble que les jours restés vides.
//
// `deadline` vient de `computeEffectiveDeadline` (server.js), qui rend une date DANS LE
// PASSÉ une fois le cycle franchi : `now >= deadline` signifie donc « la deadline de ce
// cycle est passée ». `lastMaterializedWeek` (marqueur posé sur le doc `manager_dispo_
// templates`) borne à UN passage par semaine cible : le vérificateur tourne toutes les
// 15 min pour coller à l'instant de la deadline, il ne doit pas re-créer 200 fois — ni
// ressusciter un jour que la directrice aurait retiré après coup.
function shouldMaterializeTemplate(now, deadline, lastMaterializedWeek, targetWeek) {
    if (!(now instanceof Date) || !(deadline instanceof Date)) return false;
    if (now.getTime() < deadline.getTime()) return false;
    return lastMaterializedWeek !== targetWeek;
}

// ── Rattachement directeur → profil staff (A-09) — le tri, pas l'écriture ──────
//
// Comparaison tolérante : casse, accents, ponctuation et espaces multiples ignorés,
// pour que « Alexandre  Housset » et « alexandre housset » se rapprochent.
const normName = s => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Range chaque compte `directeur` dans EXACTEMENT un des quatre paniers. C'est ici, et
// nulle part ailleurs, que se joue la sécurité de `link-directors --create-missing` :
// `none` veut dire « aucun profil ne correspond, ni par e-mail ni par nom », donc créer
// sur ce panier NE PEUT PAS produire de doublon. L'ancien `backfill-director-staff.js`
// créait d'abord et cherchait les homonymes ensuite ; il a dédoublé 2 directeurs sur 3
// chez le premier client. Sortir le tri du script le rend testable — un garde-fou qu'on
// ne peut pas éprouver n'est qu'une intention.
//
// L'e-mail prime sur le nom : c'est l'identifiant fort. Deux « Martin Dupont » avec des
// e-mails distincts se départagent ; sans e-mail, ils partent en `ambiguous`, jamais
// tranché par la machine — se tromper attribuerait à l'un l'historique de paie de l'autre.
function classifyDirectorLinks(directors, staff) {
    const all = staff || [];
    const out = { todo: [], already: [], none: [], ambiguous: [] };
    for (const u of directors || []) {
        if (u.staff_id) { out.already.push(u); continue; }
        // Normalisé une fois par directeur, pas une fois par profil comparé : c'est le
        // garde-fou anti-doublon du projet, il doit se lire d'un coup d'œil.
        const uMail = normName(u.email), uName = normName(u.name);
        let hits = u.email ? all.filter(s => s.email && normName(s.email) === uMail) : [];
        if (!hits.length) hits = all.filter(s => normName(s.name) === uName);
        if (hits.length === 1)      out.todo.push({ u, s: hits[0] });
        else if (hits.length === 0) out.none.push(u);
        else                        out.ambiguous.push({ u, hits });
    }
    return out;
}

// ── Absences des directeurs (E-19) — logique pure, testable hors Express/Mongo ──
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Valide une PÉRIODE d'absence (start_date → end_date) déclarée par un directeur.
// end vide → période d'un seul jour. Refuse format invalide, fin avant début,
// période entièrement passée. Retourne { start, end, error }.
function validateOffPeriod(start, endDate, today) {
    const end = endDate || start; // fin vide → période d'un seul jour
    if (!ISO_DATE_RE.test(start) || !ISO_DATE_RE.test(end))
        return { start: null, end: null, error: 'Dates invalides (format YYYY-MM-DD)' };
    if (end < start)
        return { start: null, end: null, error: 'La date de fin doit être après la date de début.' };
    if (end < today)
        return { start: null, end: null, error: 'La période doit être à venir.' };
    return { start, end, error: null };
}

// Filtre + enrichit les absences directeur pour un demandeur donné (scope par
// établissement). `metaById` : Map<user_id, { name, estabs }>. `canAccess(viewer,
// estabId)` : prédicat d'accès. Patron/observateur voient tout ; un directeur ne
// voit que les absences des directeurs partageant au moins un de ses établissements.
// Une absence dont le compte n'existe plus (méta absente) est ignorée.
function scopeManagerOff(offs, metaById, viewer, canAccess) {
    const out = [];
    for (const o of offs) {
        const meta = metaById.get(String(o.user_id));
        if (!meta) continue;
        const canSee = viewer.role === 'patron' || viewer.role === 'observateur'
            || meta.estabs.some(e => canAccess(viewer, e));
        if (canSee) out.push({
            _id: o._id, user_id: o.user_id,
            start_date: o.start_date, end_date: o.end_date, type: o.type || 'off',
            note: o.note || '', name: meta.name || o.name || 'Directeur',
            assigned_establishments: meta.estabs,
        });
    }
    return out;
}

// F-12 — les champs d'une dispo qu'un litige regarde réellement. Tout le reste
// (`updated_at`, `staff_name`, `created_at`) est du bruit : le journal doit rester
// lisible et tenir dans quelques centaines d'octets par événement.
const DISPO_AUDIT_FIELDS = Object.freeze(
    ['type', 'start_time', 'end_time', 'note', 'status', 'establishment_id']);

// F-12 — le DELTA entre deux versions d'une dispo, c.-à-d. les seuls champs qui ont
// bougé, sous la forme `{ before, after }`.
//
// Rend **null** quand rien n'a changé, et c'est le point important : `POST /api/dispos`
// ré-envoie la semaine entière à chaque enregistrement, donc sans ce null le journal se
// remplirait de « Bruno n'a rien modifié » à chaque clic et deviendrait illisible — un
// journal qu'on ne peut plus lire ne prouve rien.
//
// Chaque événement porte l'avant ET l'après des champs touchés : il se suffit à lui-même.
// C'est ce qui permet d'expirer les vieux événements (TTL) sans casser les récents —
// un journal qui n'aurait que les deltas successifs exigerait de tout rejouer depuis
// l'origine, et perdrait tout sens dès la première purge.
//
// `null`/`undefined` sont acceptés des deux côtés : création (before absent) et
// suppression (after absent) passent par le même chemin.
function dispoEventDelta(before, after) {
    const b = before || {}, a = after || {};
    const outB = {}, outA = {};
    let changed = false;
    // Comparaison numérique pour les horaires : le client renvoie tantôt 18, tantôt "18".
    // Hissée hors de la boucle — elle était réallouée à chaque champ, six fois par événement.
    const norm = v => (typeof v === 'string' && v !== '' && !isNaN(v) ? parseFloat(v) : v);
    for (const f of DISPO_AUDIT_FIELDS) {
        // `undefined` et `null` décrivent la même absence côté Mongo ; les distinguer
        // ferait apparaître des changements qui n'en sont pas.
        const bv = b[f] === undefined ? null : b[f];
        const av = a[f] === undefined ? null : a[f];
        if (norm(bv) === norm(av)) continue;
        changed = true;
        if (bv !== null) outB[f] = bv;
        if (av !== null) outA[f] = av;
    }
    return changed ? { before: outB, after: outA } : null;
}

// B2 — une réouverture nominative de la deadline vise UNE semaine précise.
// Forme stockée dans `settings.force_open_staff` : `{ staff_id, week_start }`.
//
// Pourquoi la semaine : sur un horizon d'une seule semaine, « rouvrir pour Kevin » était
// sans ambiguïté — il n'y avait qu'une semaine verrouillable. Dès que l'horizon s'allonge,
// la même entrée ne dit plus POUR QUOI elle a été posée, et surtout elle se faisait
// consommer par n'importe quel envoi : rouvert pour la semaine prochaine, Kevin
// enregistrait d'abord une semaine lointaine et perdait sa réouverture sans avoir touché
// à celle qui était figée.
//
// Entrées LEGACY (chaînes nues = l'id du staff) : elles datent d'avant, quand une seule
// semaine pouvait être verrouillée. Elles valent donc pour la semaine que les appelants
// interrogent — qui est toujours celle en cours de collecte, la deadline ne gardant
// qu'elle (règle A). Elles disparaissent à la première utilisation.
function staffReopenedFor(settings, staffId, weekStart) {
    const list = (settings && Array.isArray(settings.force_open_staff)) ? settings.force_open_staff : [];
    return list.some(e => (typeof e === 'string'
        ? e === staffId
        : !!e && e.staff_id === staffId && e.week_start === weekStart));
}

// B2 — deux versions d'une même dispo décrivent-elles une DISPONIBILITÉ différente ?
// Sert à décider si une re-soumission doit libérer le shift déjà créé sur cette dispo.
// La NOTE en est volontairement exclue : corriger un commentaire (« finalement je peux
// venir en avance, à confirmer ») ne doit pas faire disparaître quelqu'un du planning.
// Comparaison numérique et non littérale : le client renvoie tantôt 18, tantôt "18".
function dispoMateriallyDiffers(prev, next) {
    const num = v => (v == null || v === '' ? null : parseFloat(v));
    return (prev.type || 'custom') !== (next.type || 'custom')
        || num(prev.start_time) !== num(next.start_time)
        || num(prev.end_time)   !== num(next.end_time);
}

module.exports = {
    isValidObjectId,
    dispoMateriallyDiffers,
    staffReopenedFor,
    dispoEventDelta,
    DISPO_AUDIT_FIELDS,
    hashToken,
    normalizePhone,
    computeActiveDate,
    toDateStr,
    weekStart,
    currentWeekStart,
    WEEK_CUTOFF_HOUR,
    disposWeekStart,
    disposHorizonRange,
    disposHorizonMondays,
    upcomingWeekStart,
    upcomingWeekRange,
    upcomingWeekMondays,
    clampHorizonWeeks,
    DISPO_HORIZON_MAX,
    isAutoPublished,
    isDatePublished,
    normalizePublishDoc,
    chargeMultiplier,
    datesOverlap,
    congeCoversDate,
    congeDaysInRange,
    splitDisposByConges,
    isFullRangeOnConge,
    validateOffPeriod,
    scopeManagerOff,
    resolvePerfSettings,
    datesCoveredByPeriods,
    dispoDeadlineWaived,
    buildTemplateDispos,
    shouldMaterializeTemplate,
    STAFF_COLORS,
    pickStaffColor,
    classifyDirectorLinks,
    normName,
};
