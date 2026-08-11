const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    isValidObjectId,
    hashToken,
    normalizePhone,
    computeActiveDate,
    toDateStr,
    weekStart,
    disposWeekStart,
    isAutoPublished,
    isDatePublished,
    normalizePublishDoc,
    chargeMultiplier,
    resolvePerfSettings,
    datesCoveredByPeriods,
    dispoDeadlineWaived,
    shouldMaterializeTemplate,
    buildTemplateDispos,
    classifyDirectorLinks,
} = require('../lib/utils');

// ── isValidObjectId ──────────────────────────────────────────────────────────

test('isValidObjectId accepte un ObjectId hexadécimal de 24 caractères', () => {
    assert.equal(isValidObjectId('507f1f77bcf86cd799439011'), true);
    assert.equal(isValidObjectId('AAAAAAAAAAAAAAAAAAAAAAAA'), true);
});

test('isValidObjectId refuse les tailles incorrectes', () => {
    assert.equal(isValidObjectId(''), false);
    assert.equal(isValidObjectId('507f1f77bcf86cd79943901'),   false);
    assert.equal(isValidObjectId('507f1f77bcf86cd7994390111'), false);
});

test('isValidObjectId refuse les caractères non hexadécimaux', () => {
    assert.equal(isValidObjectId('507f1f77bcf86cd79943901Z'), false);
    assert.equal(isValidObjectId('zzzzzzzzzzzzzzzzzzzzzzzz'), false);
});

test('isValidObjectId refuse les types non-string', () => {
    assert.equal(isValidObjectId(null), false);
    assert.equal(isValidObjectId(undefined), false);
    assert.equal(isValidObjectId(12345), false);
    assert.equal(isValidObjectId({}), false);
});

// ── hashToken ────────────────────────────────────────────────────────────────

test('hashToken produit un SHA-256 de 64 caractères hex', () => {
    const h = hashToken('abc');
    assert.match(h, /^[a-f0-9]{64}$/);
});

test('hashToken est déterministe', () => {
    assert.equal(hashToken('hello'), hashToken('hello'));
});

test('hashToken donne des sorties différentes pour des entrées différentes', () => {
    assert.notEqual(hashToken('foo'), hashToken('bar'));
});

// ── normalizePhone ───────────────────────────────────────────────────────────

test('normalizePhone transforme 06... en +336...', () => {
    assert.equal(normalizePhone('0612345678'), '+33612345678');
});

test('normalizePhone transforme 07... en +337...', () => {
    assert.equal(normalizePhone('0712345678'), '+33712345678');
});

test('normalizePhone supprime espaces, tirets et points', () => {
    assert.equal(normalizePhone('06 12 34 56 78'),  '+33612345678');
    assert.equal(normalizePhone('06-12-34-56-78'),  '+33612345678');
    assert.equal(normalizePhone('06.12.34.56.78'),  '+33612345678');
});

test('normalizePhone conserve un numéro déjà international', () => {
    assert.equal(normalizePhone('+33612345678'), '+33612345678');
    assert.equal(normalizePhone('+14155551234'), '+14155551234');
});

test('normalizePhone ajoute + devant un numéro non préfixé non-FR', () => {
    assert.equal(normalizePhone('14155551234'), '+14155551234');
});

test('normalizePhone supprime les espaces insécables (NBSP U+00A0)', () => {
    const nbsp = String.fromCharCode(160);
    assert.equal(normalizePhone('+33' + nbsp + '6' + nbsp + '12' + nbsp + '34' + nbsp + '56' + nbsp + '78'), '+33612345678');
});

test('normalizePhone supprime les Zero Width Spaces (U+200B)', () => {
    const zws = String.fromCharCode(0x200B);
    assert.equal(normalizePhone('06' + zws + '12345678'), '+33612345678');
});

test('normalizePhone supprime les tirets insécables (U+2011)', () => {
    const nbHyphen = String.fromCharCode(0x2011);
    assert.equal(normalizePhone('06' + nbHyphen + '12' + nbHyphen + '34' + nbHyphen + '56' + nbHyphen + '78'), '+33612345678');
});

test('normalizePhone gère un mix WhatsApp (NBSP + espaces + tirets)', () => {
    const nbsp = String.fromCharCode(160);
    assert.equal(normalizePhone('+33' + nbsp + '6 12-34.56' + nbsp + '78'), '+33612345678');
});

test('normalizePhone gère "+33 6 12 34 56 78" (format iOS contacts)', () => {
    assert.equal(normalizePhone('+33 6 12 34 56 78'), '+33612345678');
});

test('normalizePhone gère "0033..." (préfixe international double-zéro)', () => {
    assert.equal(normalizePhone('0033612345678'), '+33612345678');
});

test('normalizePhone gère "+33(0)6..." (format copié depuis certains annuaires)', () => {
    assert.equal(normalizePhone('+33(0)612345678'), '+33612345678');
});

test('normalizePhone retourne null pour un numéro invalide', () => {
    assert.equal(normalizePhone('12345'), null);
    assert.equal(normalizePhone('abcdef'), null);
    assert.equal(normalizePhone(''), null);
});

test('normalizePhone retourne null pour null/undefined', () => {
    assert.equal(normalizePhone(null), null);
});

// ── computeActiveDate ────────────────────────────────────────────────────────

test('computeActiveDate : heure >= cutoff → date du jour', () => {
    const now = new Date(2026, 3, 12, 15, 30); // 12 avril 15h30
    const active = computeActiveDate(now, 9);
    assert.equal(active.getDate(), 12);
    assert.equal(active.getMonth(), 3);
    assert.equal(active.getHours(), 0);
});

test('computeActiveDate : heure < cutoff → date de la veille', () => {
    const now = new Date(2026, 3, 12, 2, 30); // 12 avril 2h30 du matin
    const active = computeActiveDate(now, 9);
    assert.equal(active.getDate(), 11);
    assert.equal(active.getMonth(), 3);
    assert.equal(active.getHours(), 0);
});

test('computeActiveDate : pile à cutoff → date du jour', () => {
    const now = new Date(2026, 3, 12, 9, 0); // 12 avril 9h00
    const active = computeActiveDate(now, 9);
    assert.equal(active.getDate(), 12);
});

test('computeActiveDate gère le passage au mois précédent', () => {
    const now = new Date(2026, 3, 1, 3, 0); // 1er avril 3h du matin
    const active = computeActiveDate(now, 9);
    assert.equal(active.getDate(), 31);
    assert.equal(active.getMonth(), 2); // mars
});

test('computeActiveDate gère le passage à l\'année précédente', () => {
    const now = new Date(2026, 0, 1, 5, 0); // 1er janvier 5h
    const active = computeActiveDate(now, 9);
    assert.equal(active.getDate(), 31);
    assert.equal(active.getMonth(), 11); // décembre
    assert.equal(active.getFullYear(), 2025);
});

test('computeActiveDate : cutoff 0 → jamais de bascule sur la veille', () => {
    const now = new Date(2026, 3, 12, 0, 0);
    const active = computeActiveDate(now, 0);
    assert.equal(active.getDate(), 12);
});

// ── toDateStr ────────────────────────────────────────────────────────────────

test('toDateStr formate en YYYY-MM-DD avec zéros de padding', () => {
    assert.equal(toDateStr(new Date(2026, 0, 1)),  '2026-01-01');
    assert.equal(toDateStr(new Date(2026, 11, 31)), '2026-12-31');
    assert.equal(toDateStr(new Date(2026, 3, 7)),   '2026-04-07');
});

test('toDateStr utilise l\'heure locale (pas UTC)', () => {
    // 23h59 local ne doit PAS basculer au lendemain UTC
    const d = new Date(2026, 3, 12, 23, 59, 59);
    assert.equal(toDateStr(d), '2026-04-12');
});

// ── weekStart ────────────────────────────────────────────────────────────────

test('weekStart : un lundi retourne lui-même (à minuit local)', () => {
    // 11 mai 2026 = lundi
    const monday = weekStart(new Date(2026, 4, 11, 15, 30));
    assert.equal(toDateStr(monday), '2026-05-11');
    assert.equal(monday.getHours(), 0);
});

test('weekStart : un dimanche recule au lundi précédent (cas piège)', () => {
    // 17 mai 2026 = dimanche → lundi de la semaine = 11 mai
    const monday = weekStart(new Date(2026, 4, 17, 23, 59));
    assert.equal(toDateStr(monday), '2026-05-11');
});

test('weekStart : un mercredi recule de 2 jours', () => {
    // 13 mai 2026 = mercredi → lundi = 11 mai
    const monday = weekStart(new Date(2026, 4, 13, 10, 0));
    assert.equal(toDateStr(monday), '2026-05-11');
});

test('weekStart : bascule entre mois fonctionne', () => {
    // 2 juin 2026 = mardi → lundi = 1er juin
    assert.equal(toDateStr(weekStart(new Date(2026, 5, 2))), '2026-06-01');
    // 1er janvier 2026 = jeudi → lundi = 29 décembre 2025
    assert.equal(toDateStr(weekStart(new Date(2026, 0, 1))), '2025-12-29');
});

// ── disposWeekStart ──────────────────────────────────────────────────────────

test('disposWeekStart : un mercredi → lundi de la semaine suivante', () => {
    // 13 mai 2026 mercredi → +7j = 20 mai mercredi → lundi semaine = 18 mai
    const target = disposWeekStart(new Date(2026, 4, 13, 10, 0));
    assert.equal(toDateStr(target), '2026-05-18');
});

test('disposWeekStart : un lundi → lundi de la semaine N+1 (pas N)', () => {
    // 11 mai 2026 lundi → +7j = 18 mai lundi → lundi semaine = 18 mai (N+1)
    const target = disposWeekStart(new Date(2026, 4, 11, 9, 0));
    assert.equal(toDateStr(target), '2026-05-18');
});

test('disposWeekStart : un dimanche → lundi de la semaine N+1', () => {
    // 17 mai 2026 dimanche → +7j = 24 mai dimanche → lundi semaine = 18 mai
    const target = disposWeekStart(new Date(2026, 4, 17, 23, 0));
    assert.equal(toDateStr(target), '2026-05-18');
});

// ── isAutoPublished ──────────────────────────────────────────────────────────

test('isAutoPublished : semaine en cours = true', () => {
    const now = new Date(2026, 4, 13);  // mercredi 13 mai
    assert.equal(isAutoPublished('2026-05-15', now), true); // vendredi même semaine
    assert.equal(isAutoPublished('2026-05-11', now), true); // lundi même semaine
});

test('isAutoPublished : semaine passée = true', () => {
    const now = new Date(2026, 4, 13);
    assert.equal(isAutoPublished('2026-05-04', now), true);  // semaine précédente
    assert.equal(isAutoPublished('2025-12-31', now), true);  // bien plus ancien
});

test('isAutoPublished : semaine future = false', () => {
    const now = new Date(2026, 4, 13);
    assert.equal(isAutoPublished('2026-05-18', now), false); // lundi semaine suivante
    assert.equal(isAutoPublished('2026-06-01', now), false); // mois suivant
});

// ── normalizePublishDoc ──────────────────────────────────────────────────────

test('normalizePublishDoc : doc absent → null (rien publié)', () => {
    assert.equal(normalizePublishDoc(null), null);
    assert.equal(normalizePublishDoc(undefined), null);
});

test('normalizePublishDoc : legacy { published:true } sans establishments → ALL', () => {
    assert.equal(normalizePublishDoc({ published: true }), 'ALL');
});

test('normalizePublishDoc : establishments:"ALL" → ALL', () => {
    assert.equal(normalizePublishDoc({ establishments: 'ALL' }), 'ALL');
});

test('normalizePublishDoc : tableau d\'établissements → Set', () => {
    const r = normalizePublishDoc({ establishments: ['A', 'B'] });
    assert.ok(r instanceof Set);
    assert.equal(r.has('A'), true);
    assert.equal(r.has('B'), true);
    assert.equal(r.has('C'), false);
});

test('normalizePublishDoc : tableau vide → Set vide (rien publié)', () => {
    const r = normalizePublishDoc({ establishments: [] });
    assert.ok(r instanceof Set);
    assert.equal(r.size, 0);
});

// ── isDatePublished (par établissement) ──────────────────────────────────────

test('isDatePublished : semaine en cours/passée = true pour tout établissement', () => {
    const now = new Date(2026, 4, 13);            // mercredi 13 mai
    assert.equal(isDatePublished('2026-05-15', new Map(), 'A', now), true); // cette semaine
    assert.equal(isDatePublished('2026-05-04', new Map(), 'A', now), true); // semaine passée
});

test('isDatePublished : semaine future NON publiée = false', () => {
    const now = new Date(2026, 4, 13);
    assert.equal(isDatePublished('2026-05-25', new Map(), 'A', now), false);
});

test('isDatePublished : ALL publie tous les établissements', () => {
    const now = new Date(2026, 4, 13);
    const pub = new Map([['2026-05-25', 'ALL']]);
    assert.equal(isDatePublished('2026-05-25', pub, 'A', now), true);
    assert.equal(isDatePublished('2026-05-27', pub, 'Z', now), true); // n'importe quel étab
});

test('isDatePublished : Set partiel ne publie QUE les établissements listés', () => {
    const now = new Date(2026, 4, 13);
    const pub = new Map([['2026-05-25', new Set(['A'])]]); // semaine du 25 : seul A publié
    assert.equal(isDatePublished('2026-05-25', pub, 'A', now), true);  // A publié
    assert.equal(isDatePublished('2026-05-27', pub, 'A', now), true);  // mercredi même semaine, A
    assert.equal(isDatePublished('2026-05-25', pub, 'B', now), false); // B non publié
});

test('isDatePublished : NE matche PAS une semaine adjacente publiée (fix heuristique 8j)', () => {
    const now = new Date(2026, 4, 13);
    const pub = new Map([['2026-05-18', new Set(['A'])]]);
    assert.equal(isDatePublished('2026-05-25', pub, 'A', now), false);
});

test('isDatePublished : map absente/invalide + semaine future = false (pas de crash)', () => {
    const now = new Date(2026, 4, 13);
    assert.equal(isDatePublished('2026-05-25', null, 'A', now), false);
    assert.equal(isDatePublished('2026-05-25', undefined, 'A', now), false);
    assert.equal(isDatePublished('2026-05-25', new Set(['x']), 'A', now), false); // Set ≠ Map
});

test('isDatePublished : establishmentId absent + Set partiel = false', () => {
    const now = new Date(2026, 4, 13);
    const pub = new Map([['2026-05-25', new Set(['A'])]]);
    assert.equal(isDatePublished('2026-05-25', pub, null, now), false);
    assert.equal(isDatePublished('2026-05-25', pub, undefined, now), false);
});

// ── chargeMultiplier ─────────────────────────────────────────────────────────

test('chargeMultiplier : taux 45 % → 1.45', () => {
    assert.equal(chargeMultiplier(45), 1.45);
});

test('chargeMultiplier : taux 0 % → 1 (pas de markup)', () => {
    assert.equal(chargeMultiplier(0), 1);
});

test('chargeMultiplier : null/undefined → défaut 45 %', () => {
    assert.equal(chargeMultiplier(null), 1.45);
    assert.equal(chargeMultiplier(undefined), 1.45);
});

test('chargeMultiplier : taux 100 % → 2', () => {
    assert.equal(chargeMultiplier(100), 2);
});

// ── resolvePerfSettings (E-14/E-24 — paramètres perf par établissement) ────────

test('resolvePerfSettings : tout absent → défauts 30/43/45', () => {
    assert.deepEqual(resolvePerfSettings(null, null), { target_gross: 30, target_charged: 43, charge_rate: 45 });
});

test('resolvePerfSettings : global seul → hérité, pas de défaut', () => {
    const global = { key: 'performance', target_gross: 28, target_charged: 40, charge_rate: 42 };
    assert.deepEqual(resolvePerfSettings(global, null), { target_gross: 28, target_charged: 40, charge_rate: 42 });
});

test('resolvePerfSettings : override établissement gagne sur le global', () => {
    const global   = { target_gross: 30, target_charged: 43, charge_rate: 45 };
    const perEstab = { target_gross: 25, target_charged: 38, charge_rate: 50 };
    assert.deepEqual(resolvePerfSettings(global, perEstab), { target_gross: 25, target_charged: 38, charge_rate: 50 });
});

test('resolvePerfSettings : fallback champ par champ (override partiel)', () => {
    // L'établissement ne surcharge QUE charge_rate → objectifs hérités du global.
    const global   = { target_gross: 30, target_charged: 43, charge_rate: 45 };
    const perEstab = { charge_rate: 52 };
    assert.deepEqual(resolvePerfSettings(global, perEstab), { target_gross: 30, target_charged: 43, charge_rate: 52 });
});

test('resolvePerfSettings : charge_rate 0 explicite est respecté (pas écrasé par le défaut)', () => {
    const perEstab = { charge_rate: 0 };
    assert.equal(resolvePerfSettings(null, perEstab).charge_rate, 0);
});

// ── datesCoveredByPeriods (E-22 — absences directeur exclues du pré-remplissage) ─

test('datesCoveredByPeriods : une période au milieu de la fenêtre', () => {
    const p = [{ start_date: '2026-05-13', end_date: '2026-05-14' }];
    assert.deepEqual(datesCoveredByPeriods(p, '2026-05-11', '2026-05-17'),
        ['2026-05-13', '2026-05-14']);
});

test('datesCoveredByPeriods : période débordant la fenêtre → bornée à la fenêtre', () => {
    const p = [{ start_date: '2026-04-01', end_date: '2026-12-31' }];
    assert.equal(datesCoveredByPeriods(p, '2026-05-11', '2026-05-17').length, 7);
});

test('datesCoveredByPeriods : périodes disjointes cumulées, sans doublon', () => {
    const p = [
        { start_date: '2026-05-11', end_date: '2026-05-12' },
        { start_date: '2026-05-12', end_date: '2026-05-13' }, // chevauche la 1re
    ];
    assert.deepEqual(datesCoveredByPeriods(p, '2026-05-11', '2026-05-17'),
        ['2026-05-11', '2026-05-12', '2026-05-13']);
});

test('datesCoveredByPeriods : période hors fenêtre → aucune date', () => {
    const p = [{ start_date: '2026-06-01', end_date: '2026-06-10' }];
    assert.deepEqual(datesCoveredByPeriods(p, '2026-05-11', '2026-05-17'), []);
});

test('datesCoveredByPeriods : liste vide / fenêtre invalide → aucune date', () => {
    assert.deepEqual(datesCoveredByPeriods([], '2026-05-11', '2026-05-17'), []);
    assert.deepEqual(datesCoveredByPeriods(null, '2026-05-11', '2026-05-17'), []);
    const p = [{ start_date: '2026-05-11', end_date: '2026-05-17' }];
    assert.deepEqual(datesCoveredByPeriods(p, '2026-05-17', '2026-05-11'), []); // from > to
});

// ── buildTemplateDispos (E-22 v2 — pré-remplissage semaine-type) ───────────────

const _tplV2 = { days: {
    0: { type: 'soir', start_time: 16, end_time: 26 }, // lundi
    2: { type: 'midi', start_time: 10, end_time: 17 }, // mercredi
} };

test('buildTemplateDispos : matérialise les bons jours de la semaine (lundi-first)', () => {
    const out = buildTemplateDispos(_tplV2, '2026-05-11', new Set()); // lundi 11 mai
    assert.deepEqual(out, [
        { date: '2026-05-11', type: 'soir', start_time: 16, end_time: 26 },
        { date: '2026-05-13', type: 'midi', start_time: 10, end_time: 17 },
    ]);
});

test('buildTemplateDispos : saute un jour ayant déjà une dispo (jamais d\'écrasement)', () => {
    const out = buildTemplateDispos(_tplV2, '2026-05-11', new Set(['2026-05-11']));
    assert.deepEqual(out.map(d => d.date), ['2026-05-13']);
});

test('buildTemplateDispos : saute les jours d\'absence déclarée (E-19)', () => {
    // Le mercredi 13 est couvert par une absence → le modèle ne le pré-remplit pas.
    const offs  = [{ start_date: '2026-05-12', end_date: '2026-05-13' }];
    const taken = new Set(datesCoveredByPeriods(offs, '2026-05-11', '2026-05-17'));
    assert.deepEqual(buildTemplateDispos(_tplV2, '2026-05-11', taken).map(d => d.date),
        ['2026-05-11']);
});

test('buildTemplateDispos : modèle vide/null → aucune dispo', () => {
    assert.deepEqual(buildTemplateDispos(null, '2026-05-11', new Set()), []);
    assert.deepEqual(buildTemplateDispos({ days: {} }, '2026-05-11', new Set()), []);
});

test('buildTemplateDispos : case sans horaires ignorée', () => {
    const tpl = { days: { 1: { type: 'custom', start_time: null, end_time: null } } };
    assert.deepEqual(buildTemplateDispos(tpl, '2026-05-11', new Set()), []);
});

// ── dispoDeadlineWaived (exemption deadline — décision du 2026-08-05) ─────────

test('dispoDeadlineWaived : par défaut, personne n\'est exempté', () => {
    assert.equal(dispoDeadlineWaived({}, 'staff', false), false);
    assert.equal(dispoDeadlineWaived(null, 'staff', false), false);
});

test('dispoDeadlineWaived : force_open global lève la deadline pour tout le monde', () => {
    assert.equal(dispoDeadlineWaived({ force_open: true }, 'staff', false), true);
});

test('dispoDeadlineWaived : réouverture nominative lève la deadline pour ce staff', () => {
    assert.equal(dispoDeadlineWaived({ force_open: false }, 'staff', true), true);
});

test('dispoDeadlineWaived : le directeur est exempté sans réglage patron', () => {
    assert.equal(dispoDeadlineWaived({ force_open: false }, 'directeur', false), true);
});

test('dispoDeadlineWaived : l\'exemption ne déborde sur aucun autre rôle', () => {
    // Le point sensible : c'est une exception de rôle dans un pipeline qu'on vient
    // d'unifier. Si elle fuit vers `staff`, la deadline ne veut plus rien dire.
    // Liste = les rôles de session valides (cf. PATCH /api/users/:id/role), + absent.
    for (const role of ['staff', 'patron', 'observateur', 'etablissement', undefined])
        assert.equal(dispoDeadlineWaived({ force_open: false }, role, false), false, 'rôle ' + role);
});

// ── shouldMaterializeTemplate (semaine-type envoyée À la deadline — 2026-08-10) ──
// Le modèle : la semaine-type est « ce qui part à ma place si je n'ai rien envoyé ».
// Avant, le cron de 10h la matérialisait tous les jours → jusqu'à 4 jours d'avance.

const VEN13 = new Date(2026, 7, 14, 13, 0);   // vendredi 14 août 2026, 13h00 — la deadline
const W     = '2026-08-17';                   // lundi suivant = semaine cible

test('shouldMaterializeTemplate : rien ne part avant la deadline', () => {
    // Lundi 10h : c'est exactement le moment où l'ancien cron envoyait.
    assert.equal(shouldMaterializeTemplate(new Date(2026, 7, 10, 10, 0), VEN13, null, W), false);
    // Une minute avant : toujours rien.
    assert.equal(shouldMaterializeTemplate(new Date(2026, 7, 14, 12, 59), VEN13, null, W), false);
});

test('shouldMaterializeTemplate : part À la deadline, à la seconde près', () => {
    assert.equal(shouldMaterializeTemplate(VEN13, VEN13, null, W), true);
    assert.equal(shouldMaterializeTemplate(new Date(2026, 7, 14, 13, 1), VEN13, null, W), true);
});

test('shouldMaterializeTemplate : une seule fois par semaine cible', () => {
    // Le vérificateur repasse tous les quarts d'heure jusqu'à dimanche soir : sans le
    // marqueur, il re-créerait à chaque tour — et ressusciterait un jour retiré depuis.
    assert.equal(shouldMaterializeTemplate(new Date(2026, 7, 14, 13, 15), VEN13, W, W), false);
    assert.equal(shouldMaterializeTemplate(new Date(2026, 7, 16, 22, 0), VEN13, W, W), false);
});

test('shouldMaterializeTemplate : le marqueur de la semaine PRÉCÉDENTE ne bloque pas', () => {
    // Piège : un marqueur périmé ne doit pas geler le directeur pour toujours.
    assert.equal(shouldMaterializeTemplate(VEN13, VEN13, '2026-08-10', W), true);
});

test('shouldMaterializeTemplate : entrées non-Date refusées plutôt que comparées', () => {
    // `undefined < date` est false en JS, donc une deadline manquante aurait laissé
    // passer la matérialisation — c'est-à-dire l'envoi anticipé qu'on veut interdire.
    assert.equal(shouldMaterializeTemplate(VEN13, undefined, null, W), false);
    assert.equal(shouldMaterializeTemplate(undefined, VEN13, null, W), false);
    assert.equal(shouldMaterializeTemplate('2026-08-14', VEN13, null, W), false);
});

// ── classifyDirectorLinks (A-09 — le tri qui rend le doublon impossible) ─────
//
// Ce tri est la SEULE chose qui empêche `link-directors --create-missing` de
// refabriquer l'incident du premier client : un directeur qui travaillait déjà en
// salle recevait un SECOND profil staff, son historique de shifts était scindé et
// sa paie comptée deux fois (2 directeurs sur 3). La règle tient en une phrase :
// on ne crée QUE sur le panier `none`, et `none` doit être vide dès qu'un homonyme
// existe, quelle que soit la forme du nom.

const DIR  = (name, extra) => ({ _id: 'u_' + name, name, ...extra });
const PROF = (name, extra) => ({ _id: 's_' + name, name, ...extra });

test('classifyDirectorLinks : un directeur déjà lié n\'est jamais retouché', () => {
    const r = classifyDirectorLinks([DIR('Diane', { staff_id: 'abc' })], []);
    assert.equal(r.already.length, 1);
    assert.equal(r.todo.length + r.none.length + r.ambiguous.length, 0);
});

test('classifyDirectorLinks : un homonyme unique → liaison, pas création', () => {
    const r = classifyDirectorLinks([DIR('Alexandre Housset')], [PROF('Alexandre Housset')]);
    assert.equal(r.todo.length, 1);
    assert.equal(r.todo[0].s.name, 'Alexandre Housset');
    assert.equal(r.none.length, 0, 'un profil existe : créer ici serait le doublon');
});

// Le cœur du garde-fou. Si la normalisation faiblit, l'homonyme n'est plus vu,
// le directeur tombe dans `none`, et --create-missing lui fabrique un doublon.
test('classifyDirectorLinks : casse, accents, espaces et ponctuation ne créent pas de doublon', () => {
    for (const variante of ['alexandre housset', 'ALEXANDRE  HOUSSET', 'Alexàndre-Housset', ' Alexandre   Housset ']) {
        const r = classifyDirectorLinks([DIR(variante)], [PROF('Alexandre Housset')]);
        assert.equal(r.none.length, 0, 'variante « ' + variante +' » : homonyme manqué → doublon');
        assert.equal(r.todo.length, 1, 'variante « ' + variante + ' » devrait se rapprocher');
    }
});

test('classifyDirectorLinks : l\'e-mail prime sur le nom', () => {
    // Deux profils portent le même nom, mais un seul porte l'e-mail du compte :
    // l'identifiant fort tranche là où le nom seul aurait dit « ambigu ».
    const r = classifyDirectorLinks(
        [DIR('Martin Dupont', { email: 'martin@bar.fr' })],
        [PROF('Martin Dupont', { email: 'martin@bar.fr' }), PROF('Martin Dupont', { email: 'autre@bar.fr' })],
    );
    assert.equal(r.todo.length, 1);
    assert.equal(r.todo[0].s.email, 'martin@bar.fr');
    assert.equal(r.ambiguous.length, 0);
});

test('classifyDirectorLinks : deux homonymes indiscernables → ambigu, JAMAIS créé', () => {
    const r = classifyDirectorLinks([DIR('Martin Dupont')], [PROF('Martin Dupont'), PROF('martin  dupont')]);
    assert.equal(r.ambiguous.length, 1);
    assert.equal(r.ambiguous[0].hits.length, 2);
    // Le point qui compte : `none` est vide, donc --create-missing ne le touchera pas.
    assert.equal(r.none.length, 0, 'un ambigu ne doit jamais devenir une création');
    assert.equal(r.todo.length, 0, 'ni une liaison arbitraire');
});

test('classifyDirectorLinks : aucun profil correspondant → seul cas créable', () => {
    const r = classifyDirectorLinks([DIR('Nouvelle Directrice')], [PROF('Alexandre Housset')]);
    assert.equal(r.none.length, 1);
    assert.equal(r.todo.length + r.ambiguous.length, 0);
});

test('classifyDirectorLinks : un e-mail qui ne matche pas retombe sur le nom', () => {
    // Sinon un directeur dont l'e-mail a changé serait vu comme « aucun profil »
    // alors que le sien existe — et --create-missing le dédoublerait.
    const r = classifyDirectorLinks(
        [DIR('Alexandre Housset', { email: 'nouveau@bar.fr' })],
        [PROF('Alexandre Housset', { email: 'ancien@bar.fr' })],
    );
    assert.equal(r.todo.length, 1);
    assert.equal(r.none.length, 0);
});

test('classifyDirectorLinks : chaque directeur tombe dans exactement un panier', () => {
    const dirs = [
        DIR('Diane', { staff_id: 'abc' }),
        DIR('Alexandre Housset'),
        DIR('Martin Dupont'),
        DIR('Nouvelle Directrice'),
    ];
    const staff = [PROF('Alexandre Housset'), PROF('Martin Dupont'), PROF('martin dupont')];
    const r = classifyDirectorLinks(dirs, staff);
    assert.equal(r.already.length + r.todo.length + r.none.length + r.ambiguous.length, dirs.length);
    assert.deepEqual(r.none.map(u => u.name), ['Nouvelle Directrice']);
});

test('classifyDirectorLinks : entrées vides ou absentes ne cassent rien', () => {
    assert.deepEqual(classifyDirectorLinks(undefined, undefined),
        { todo: [], already: [], none: [], ambiguous: [] });
    assert.equal(classifyDirectorLinks([DIR('Seule')], undefined).none.length, 1);
});
