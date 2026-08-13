// B2-b — un planning NON PUBLIÉ n'est pas lisible par le staff.
//
// Constat d'origine (2026-08-13) : `GET /api/my-shifts` ne filtrait sur aucune
// publication. Il rendait shifts, Jokers et collègues pour n'importe quelle plage
// demandée — le seul rempart étant que `planning.js` ne demandait jamais ces dates.
// Règle AFFICHÉE et non TENUE, exactement le trou refermé par B2-a sur l'horizon.
//
// Ce qui rendait le constat net plutôt qu'opinable : le flux iCal, sur la MÊME donnée,
// filtrait déjà par `isDatePublished`. L'intention produit était écrite dans le code ;
// c'est la route utilisée tous les jours qui l'oubliait.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { weekStart, toDateStr } = require('../lib/utils');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const STAFF_ID = '0123456789abcdef01234567';
const STAFF    = { _id: '0123456789abcdef0123eeee', staff_id: STAFF_ID, name: 'Bob', role: 'staff' };

// Semaine EN COURS (auto-publiée par construction) et deux semaines futures, qui ne le
// sont que si le patron a posé le drapeau.
const CUR  = toDateStr(weekStart(new Date()));
const N1   = toDateStr(weekStart(new Date(Date.now() + 7 * 864e5)));
const N2   = toDateStr(weekStart(new Date(Date.now() + 14 * 864e5)));
const day  = (monday, i) => toDateStr(new Date(new Date(monday + 'T12:00:00').getTime() + i * 864e5));

before(startApp);
after(stopApp);

const shift = (date, estab = 'bar1', extra = {}) => ({
    staff_id: STAFF_ID, staff_name: 'Bob', establishment_id: estab, date,
    start_time: 18, end_time: 24, ...extra,
});

function seed(shifts, settings = []) {
    return makeDb({
        shifts,
        settings,
        staff: [{ _id: STAFF_ID, name: 'Bob', venues: ['bar1', 'bar2'] }],
        establishments: [{ id: 'bar1', name: 'Bar 1' }, { id: 'bar2', name: 'Bar 2' }],
    });
}

const mine = async (from, to) =>
    (await (await req('/api/my-shifts?from=' + from + '&to=' + to, STAFF)).json());

// ── Le filtre de publication ─────────────────────────────────────────────────

test('semaine EN COURS : auto-publiée, donc visible (aucune régression)', async () => {
    // La garde ne doit rien changer à l'usage quotidien.
    app.locals.setTestDb(seed([shift(day(CUR, 2))]));
    const body = await mine(CUR, day(CUR, 6));
    assert.equal(body.shifts.length, 1);
});

test('LE cas : une semaine future NON publiée ne rend RIEN, même en forgeant la plage', async () => {
    // Avant B2-b, cette requête rendait le brouillon du patron.
    app.locals.setTestDb(seed([shift(day(N1, 2))]));
    const body = await mine(N1, day(N1, 6));
    assert.deepEqual(body.shifts, [], 'le brouillon reste invisible');
});

test('une semaine future PUBLIÉE est visible', async () => {
    app.locals.setTestDb(seed(
        [shift(day(N1, 2))],
        [{ key: 'publish_' + N1, establishments: 'ALL' }]));
    const body = await mine(N1, day(N1, 6));
    assert.equal(body.shifts.length, 1);
});

test('publication partielle : seul le bar publié remonte', async () => {
    // `isDatePublished` est scopé par établissement — publier bar1 ne publie pas bar2.
    app.locals.setTestDb(seed(
        [shift(day(N1, 2), 'bar1'), shift(day(N1, 3), 'bar2')],
        [{ key: 'publish_' + N1, establishments: ['bar1'] }]));
    const body = await mine(N1, day(N1, 6));
    assert.deepEqual(body.shifts.map(s => s.establishment_id), ['bar1']);
});

test('un brouillon est invisible EN ENTIER — collègues compris', async () => {
    // ⚠️ Ce test prouve la propriété de bout en bout, PAS la ligne `.filter(isVisible)`
    // posée sur les collègues. Celle-ci est inatteignable : `dates` dérive de `myShifts`,
    // déjà filtré, donc la date d'un brouillon n'entre jamais dans la requête collègues.
    // Vérifié par mutation — la retirer ne fait tomber aucun test.
    // L'intitulé le dit, parce qu'un nom qui promet plus que le test ne prouve fabrique
    // une confiance fausse, et c'est exactement ce qui avait produit les tests vacants
    // de F-14.
    app.locals.setTestDb(seed([
        shift(day(CUR, 2)),                                             // semaine visible
        shift(day(N1, 2)),                                              // brouillon
        { staff_id: 'autre', staff_name: 'Zoé', establishment_id: 'bar1',
          date: day(N1, 2), start_time: 18, end_time: 24 },
    ]));
    const body = await mine(CUR, day(N1, 6));
    assert.equal(body.shifts.length, 1, 'seul le shift de la semaine en cours');
    const colleaguesN1 = body.colleagues[day(N1, 2)] || [];
    assert.deepEqual(colleaguesN1, [], 'aucun collègue du brouillon');
});

test('un brouillon est invisible EN ENTIER — Jokers compris (même réserve)', async () => {
    // Même statut que le test ci-dessus : la propriété est vraie et vérifiée, mais elle
    // tient à la construction de `myDates`, pas au `.filter` posé sur les Jokers.
    app.locals.setTestDb(seed([
        shift(day(CUR, 2)),
        shift(day(CUR, 2), 'bar1', { staff_id: '__joker__', is_joker: true, staff_name: '' }),
        shift(day(N1, 2)),
        shift(day(N1, 2), 'bar1', { staff_id: '__joker__', is_joker: true, staff_name: '' }),
    ]));
    const body = await mine(CUR, day(N1, 6));
    const jokers = body.shifts.filter(s => s.is_joker);
    assert.equal(jokers.length, 1, 'seul le Joker de la semaine publiée');
    assert.equal(jokers[0].date, day(CUR, 2));
});

// ── Navigation : quelles semaines puis-je ouvrir ? ───────────────────────────

const publishedWeeks = async () => (await (await req('/api/my-published-weeks?weeks=4', STAFF)).json());

test('my-published-weeks : ne liste que les semaines publiées', async () => {
    app.locals.setTestDb(seed(
        [shift(day(N1, 2)), shift(day(N2, 2))],
        [{ key: 'publish_' + N2, establishments: 'ALL' }]));
    assert.deepEqual(await publishedWeeks(), [N2]);
});

test('my-published-weeks : une semaine publiée où je n\'ai RIEN n\'est pas listée', async () => {
    // L'y envoyer afficherait une page blanche présentée comme un planning.
    app.locals.setTestDb(seed(
        [shift(day(N1, 2))],
        [{ key: 'publish_' + N1, establishments: 'ALL' },
         { key: 'publish_' + N2, establishments: 'ALL' }]));
    assert.deepEqual(await publishedWeeks(), [N1]);
});

test('my-published-weeks : plusieurs semaines publiées sortent dans l\'ordre', async () => {
    app.locals.setTestDb(seed(
        [shift(day(N1, 2)), shift(day(N2, 3))],
        [{ key: 'publish_' + N1, establishments: 'ALL' },
         { key: 'publish_' + N2, establishments: 'ALL' }]));
    assert.deepEqual(await publishedWeeks(), [N1, N2]);
});

test('my-published-weeks : un compte sans profil staff obtient une liste vide', async () => {
    app.locals.setTestDb(seed([]));
    const body = await (await req('/api/my-published-weeks', { role: 'patron' })).json();
    assert.deepEqual(body, []);
});
