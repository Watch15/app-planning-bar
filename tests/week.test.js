const { test } = require('node:test');
const assert = require('node:assert');
const {
    weekStart, currentWeekStart, WEEK_CUTOFF_HOUR, toDateStr,
    disposHorizonMondays, upcomingWeekMondays, upcomingWeekRange,
} = require('../public/lib/week.js');

// Suite canonique du module isomorphe public/lib/week.js (R-01).
// `lib/utils.js` ré-exporte `weekStart` ; les pages front y délèguent `getMondayOf`.

const ymd = d => [d.getFullYear(), d.getMonth() + 1, d.getDate()];

test('weekStart : un lundi retourne lui-même, à minuit local', () => {
    const m = weekStart(new Date(2026, 4, 11, 15, 30)); // lundi 11 mai 2026, 15h30
    assert.deepStrictEqual(ymd(m), [2026, 5, 11]);
    assert.strictEqual(m.getDay(), 1);
    assert.strictEqual(m.getHours(), 0);
    assert.strictEqual(m.getMinutes(), 0);
    assert.strictEqual(m.getSeconds(), 0);
});

test('weekStart : un dimanche recule au lundi précédent (cas piège -6)', () => {
    const m = weekStart(new Date(2026, 4, 17, 23, 59)); // dimanche 17 mai 2026
    assert.deepStrictEqual(ymd(m), [2026, 5, 11]);
    assert.strictEqual(m.getDay(), 1);
});

test('weekStart : un mercredi recule de 2 jours', () => {
    const m = weekStart(new Date(2026, 4, 13, 10, 0)); // mercredi 13 mai 2026
    assert.deepStrictEqual(ymd(m), [2026, 5, 11]);
});

test('weekStart : bascule de mois en arrière (mardi 1 sept 2026 → lundi 31 août)', () => {
    const m = weekStart(new Date(2026, 8, 1, 12)); // mardi 1 septembre 2026
    assert.deepStrictEqual(ymd(m), [2026, 8, 31]);
    assert.strictEqual(m.getDay(), 1);
});

test('weekStart : bascule d\'année (jeudi 1 janv 2026 → lundi 29 déc 2025)', () => {
    const m = weekStart(new Date(2026, 0, 1, 8)); // jeudi 1 janvier 2026
    assert.deepStrictEqual(ymd(m), [2025, 12, 29]);
    assert.strictEqual(m.getDay(), 1);
});

test('weekStart : idempotent — weekStart(weekStart(d)) === weekStart(d)', () => {
    const d = new Date(2026, 4, 14, 18, 45); // jeudi
    const once  = weekStart(d);
    const twice = weekStart(once);
    assert.strictEqual(twice.getTime(), once.getTime());
});

test('weekStart : n\'altère pas l\'argument d\'origine (copie défensive)', () => {
    const d = new Date(2026, 4, 14, 18, 45);
    const before = d.getTime();
    weekStart(d);
    assert.strictEqual(d.getTime(), before);
});

test('weekStart : accepte une chaîne ISO locale', () => {
    const m = weekStart('2026-05-13T10:00:00'); // mercredi
    assert.deepStrictEqual(ymd(m), [2026, 5, 11]);
});

// ── currentWeekStart (cutoff hebdo, défaut 6h) ───────────────────────────────

test('WEEK_CUTOFF_HOUR vaut 6 par défaut', () => {
    assert.strictEqual(WEEK_CUTOFF_HOUR, 6);
});

test('currentWeekStart : lundi 03h (avant cutoff) → semaine PRÉCÉDENTE', () => {
    // lundi 11 mai 2026, 3h → rattaché à dimanche 10 → lundi 4 mai
    const m = currentWeekStart(new Date(2026, 4, 11, 3, 0));
    assert.deepStrictEqual(ymd(m), [2026, 5, 4]);
});

test('currentWeekStart : lundi 06h (au cutoff) → semaine COURANTE', () => {
    const m = currentWeekStart(new Date(2026, 4, 11, 6, 0));
    assert.deepStrictEqual(ymd(m), [2026, 5, 11]);
});

test('currentWeekStart : lundi 09h → semaine courante', () => {
    const m = currentWeekStart(new Date(2026, 4, 11, 9, 0));
    assert.deepStrictEqual(ymd(m), [2026, 5, 11]);
});

test('currentWeekStart : mardi 03h (avant cutoff) reste dans la semaine courante', () => {
    // mardi 12 mai 3h → rattaché à lundi 11 → même semaine
    const m = currentWeekStart(new Date(2026, 4, 12, 3, 0));
    assert.deepStrictEqual(ymd(m), [2026, 5, 11]);
});

test('currentWeekStart : dimanche soir 23h → semaine courante (pas de bascule)', () => {
    const m = currentWeekStart(new Date(2026, 4, 17, 23, 0)); // dimanche 17 mai
    assert.deepStrictEqual(ymd(m), [2026, 5, 11]);
});

test('currentWeekStart : cutoff personnalisé (9h) respecté', () => {
    // lundi 07h avec cutoff 9 → avant cutoff → semaine précédente
    const m = currentWeekStart(new Date(2026, 4, 11, 7, 0), 9);
    assert.deepStrictEqual(ymd(m), [2026, 5, 4]);
});

// ── upcomingWeek* — horizon de CONSULTATION du planning ──────────────────────
//
// Bug du 2026-08-17 (« certains staff ne voient plus le planning », signalé vers 1h/2h
// du matin) : la vue principale du staff suit `currentWeekStart` (cutoff 6h) alors que
// la liste des semaines à venir suivait `disposHorizonMondays` (= `weekStart(now + 7j)`,
// SANS cutoff). Le lundi entre 00:00 et 06:00 les deux divergent d'une semaine, et la
// semaine qui vient de commencer se retrouve dans AUCUNE des deux — inatteignable
// pendant six heures, exactement quand le staff sort de service et consulte.

// L'invariant produit, formulé SANS rejouer le calcul corrigé : à tout instant, la
// semaine calendaire en cours doit être atteignable quelque part dans l'app — soit
// c'est celle qu'affiche la vue principale, soit elle est dans la liste « à venir ».
const reachableWith = (mondaysFn, now) => {
    const displayed = toDateStr(currentWeekStart(now));
    const calendar  = toDateStr(weekStart(now));
    return calendar === displayed || mondaysFn(now, 8).includes(calendar);
};

// Toutes les heures d'une semaine complète (lundi 11 → dimanche 17 mai 2026).
const everyHourOfWeek = () => {
    const out = [];
    for (let day = 11; day <= 17; day++)
        for (let h = 0; h < 24; h++) out.push(new Date(2026, 4, day, h, 30));
    return out;
};

test('upcomingWeekMondays : la semaine en cours est TOUJOURS atteignable (24h/24, 7j/7)', () => {
    for (const now of everyHourOfWeek()) {
        assert.ok(reachableWith(upcomingWeekMondays, now),
            'semaine injoignable à ' + now.toString());
    }
});

test('le calcul PRÉCÉDENT échouait bien — le test a des dents', () => {
    // Sans ça, rien ne prouve que l'invariant ci-dessus attrape quoi que ce soit.
    const trous = everyHourOfWeek().filter(now => !reachableWith(disposHorizonMondays, now));
    assert.strictEqual(trous.length, 6, 'attendu : lundi 00h→05h');
    assert.deepStrictEqual(trous.map(d => d.getHours()), [0, 1, 2, 3, 4, 5]);
    assert.ok(trous.every(d => d.getDay() === 1), 'tous un lundi');
});

test('upcomingWeekMondays : lundi 01h30 → la semaine qui commence est en tête de liste', () => {
    // Le cas du client. Vue principale = semaine du 4 mai (cutoff) ; la liste doit
    // donc DÉMARRER au 11 mai, la semaine que le patron vient de publier.
    const now = new Date(2026, 4, 11, 1, 30);
    assert.deepStrictEqual(toDateStr(currentWeekStart(now)), '2026-05-04');
    assert.deepStrictEqual(upcomingWeekMondays(now, 3), ['2026-05-11', '2026-05-18', '2026-05-25']);
});

test('upcomingWeekMondays : hors fenêtre nocturne, identique à l\'horizon dispos', () => {
    // Non-régression : la correction ne doit RIEN changer aux 162 autres heures.
    for (const now of everyHourOfWeek()) {
        if (now.getDay() === 1 && now.getHours() < WEEK_CUTOFF_HOUR) continue;
        assert.deepStrictEqual(upcomingWeekMondays(now, 8), disposHorizonMondays(now, 8),
            'divergence inattendue à ' + now.toString());
    }
});

test('upcomingWeekRange : la plage encadre exactement les lundis rendus', () => {
    const now     = new Date(2026, 4, 11, 1, 30); // dans la fenêtre nocturne
    const mondays = upcomingWeekMondays(now, 4);
    const range   = upcomingWeekRange(now, 4);
    assert.strictEqual(range.from, mondays[0]);
    // `to` = dimanche de la 4e semaine = dernier lundi + 6 jours
    const lastSunday = new Date(mondays[3] + 'T12:00:00');
    lastSunday.setDate(lastSunday.getDate() + 6);
    assert.strictEqual(range.to, toDateStr(lastSunday));
});

test('upcomingWeekMondays : horizon écrêté comme les autres (clampHorizonWeeks)', () => {
    const now = new Date(2026, 4, 13, 10, 0);
    assert.strictEqual(upcomingWeekMondays(now, 99).length, 12); // DISPO_HORIZON_MAX
    assert.strictEqual(upcomingWeekMondays(now, 0).length, 1);   // plancher
});

test('upcomingWeekMondays : invariant tenu aussi aux bascules DST 2026', () => {
    // 29/03 (2h→3h) et 25/10 (3h→2h) : les lundis 30/03 et 26/10 sont les cas chauds.
    for (const [y, m, d] of [[2026, 2, 30], [2026, 9, 26]]) {
        for (let h = 0; h < 24; h++) {
            const now = new Date(y, m, d, h, 30);
            assert.ok(reachableWith(upcomingWeekMondays, now),
                'semaine injoignable à ' + now.toString());
        }
    }
});
