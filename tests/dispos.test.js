// CD-06 — chemins critiques de POST /api/dispos (garde congé) + helper pur.
// S'appuie sur le harnais CD-05 : faux `db` en mémoire (app.locals.setTestDb)
// + session simulée par en-tête `x-test-user`. Aucun Mongo, aucune dépendance.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { splitDisposByConges, isFullRangeOnConge } = require('../lib/utils');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, baseUrl, horizonWeekDates } = require('./helpers/harness');

const STAFF_ID = '0123456789abcdef01234567';
const USER = { staff_id: STAFF_ID, name: 'Test Staff' };

// B2 — les 7 jours de la semaine en cours de collecte. Les dates en dur (`2099-01-05`…)
// utilisées auparavant ne passaient que parce que `POST /api/dispos` n'avait aucune borne
// de date ; elles sont désormais hors horizon. Les helpers PURS ci-dessous gardent leurs
// dates fictives : ils ne traversent pas la route.
const W = horizonWeekDates(1);

before(startApp);
after(stopApp);

function postDispos(dispos) {
    return fetch(baseUrl() + '/api/dispos', {
        method:  'POST',
        headers: { 'content-type': 'application/json', 'x-test-user': JSON.stringify(USER) },
        body:    JSON.stringify({ dispos }),
    });
}

// ── Helper pur splitDisposByConges ────────────────────────────────────────────

test('splitDisposByConges — aucun congé → tout gardé', () => {
    const dispos = [{ date: '2099-01-05' }, { date: '2099-01-06' }];
    const r = splitDisposByConges(dispos, []);
    assert.equal(r.kept.length, 2);
    assert.deepEqual(r.skippedDates, []);
});

test('splitDisposByConges — un congé couvre un jour → ce jour ignoré, reste gardé', () => {
    const dispos = [{ date: '2099-01-05' }, { date: '2099-01-06' }, { date: '2099-01-07' }];
    const conges = [{ start_date: '2099-01-06', end_date: '2099-01-06' }];
    const r = splitDisposByConges(dispos, conges);
    assert.deepEqual(r.kept.map(d => d.date), ['2099-01-05', '2099-01-07']);
    assert.deepEqual(r.skippedDates, ['2099-01-06']);
});

test('splitDisposByConges — bornes incluses + dédoublonnage des dates', () => {
    const dispos = [{ date: '2099-01-05' }, { date: '2099-01-06' }, { date: '2099-01-07' }];
    const conges = [{ start_date: '2099-01-05', end_date: '2099-01-07' }]; // couvre tout
    const r = splitDisposByConges(dispos, conges);
    assert.equal(r.kept.length, 0);
    assert.deepEqual(r.skippedDates, ['2099-01-05', '2099-01-06', '2099-01-07']);
});

// ── Helper pur isFullRangeOnConge ─────────────────────────────────────────────

test('isFullRangeOnConge — un congé couvre toute la semaine → true', () => {
    const conges = [{ start_date: '2099-02-02', end_date: '2099-02-08' }];
    assert.equal(isFullRangeOnConge(conges, '2099-02-02', '2099-02-08'), true);
});

test('isFullRangeOnConge — congé débordant la fenêtre → true', () => {
    const conges = [{ start_date: '2099-01-30', end_date: '2099-02-15' }];
    assert.equal(isFullRangeOnConge(conges, '2099-02-02', '2099-02-08'), true);
});

test('isFullRangeOnConge — un jour non couvert → false', () => {
    const conges = [{ start_date: '2099-02-02', end_date: '2099-02-07' }]; // manque le 08
    assert.equal(isFullRangeOnConge(conges, '2099-02-02', '2099-02-08'), false);
});

test('isFullRangeOnConge — deux congés contigus couvrant la semaine → true', () => {
    const conges = [
        { start_date: '2099-02-02', end_date: '2099-02-04' },
        { start_date: '2099-02-05', end_date: '2099-02-08' },
    ];
    assert.equal(isFullRangeOnConge(conges, '2099-02-02', '2099-02-08'), true);
});

test('isFullRangeOnConge — aucun congé → false', () => {
    assert.equal(isFullRangeOnConge([], '2099-02-02', '2099-02-08'), false);
});

// ── KPI & sans-dispo : staff en congé toute la semaine = couvert ──────────────

const S1 = '0123456789abcdef01234567'; // en congé toute la semaine
const S2 = '0123456789abcdef01234568'; // doit envoyer, n'a rien envoyé
const WK_FROM = '2099-02-02', WK_TO = '2099-02-08';

function seedKpiDb() {
    return makeDb({
        establishments: [{ id: 'bar1', name: 'Bar 1' }],
        users: [
            { role: 'staff', active: true, staff_id: S1 },
            { role: 'staff', active: true, staff_id: S2 },
        ],
        staff: [
            { _id: S1, name: 'Alice', color: '#111', venues: ['bar1'], can_submit_dispos: true },
            { _id: S2, name: 'Bob',   color: '#222', venues: ['bar1'], can_submit_dispos: true },
        ],
        availabilities: [],
        time_off: [{ staff_id: S1, status: 'approved', start_date: WK_FROM, end_date: WK_TO }],
    });
}

function getJson(path, user) {
    return fetch(baseUrl() + path, { headers: { 'x-test-user': JSON.stringify(user) } });
}

test('KPI — staff en congé toute la semaine compté couvert, pas en manquant', async () => {
    app.locals.setTestDb(seedKpiDb());
    const res = await getJson('/api/dispos/kpi?from=' + WK_FROM + '&to=' + WK_TO, { role: 'patron' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.overall.total, 2);          // les 2 staff dans la population
    assert.equal(body.overall.sent, 1);           // Alice (congé) comptée comme couverte
    assert.deepEqual(body.missing.map(m => m.id), [S2]); // seule Bob manque
});

test('sans-dispo — exclut le staff en congé toute la semaine', async () => {
    app.locals.setTestDb(seedKpiDb());
    const res = await getJson('/api/dispos/sans-dispo?from=' + WK_FROM + '&to=' + WK_TO, { role: 'patron' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.map(s => s.id), [S2]); // Alice (congé) absente, Bob présent
});

// ── Route POST /api/dispos ────────────────────────────────────────────────────

test('saisie fermée (settings.open=false) → 403', async () => {
    app.locals.setTestDb(makeDb({ settings: [{ key: 'dispo', open: false }] }));
    const res = await postDispos([{ date: W[0], type: 'custom', start_time: 18, end_time: 24 }]);
    assert.equal(res.status, 403);
});

test('jour de congé ignoré, les autres jours sont enregistrés → 201', async () => {
    const db = makeDb({
        settings:       [{ key: 'dispo', open: true, force_open: true, force_open_week: W[0] }],
        time_off:       [{ staff_id: STAFF_ID, status: 'approved', start_date: W[1], end_date: W[1] }],
        availabilities: [],
    });
    app.locals.setTestDb(db);
    const res = await postDispos([
        { date: W[0], type: 'custom', start_time: 18, end_time: 24 },
        { date: W[1], type: 'custom', start_time: 18, end_time: 24 }, // congé
        { date: W[2], type: 'custom', start_time: 18, end_time: 24 },
    ]);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.match(body.message, /congé ignoré/);

    const saved = db.collection('availabilities')._docs.map(d => d.date).sort();
    assert.deepEqual(saved, [W[0], W[2]]); // PAS le mardi (congé)
});

test('toute la semaine en congé → 200, rien enregistré', async () => {
    const db = makeDb({
        settings:       [{ key: 'dispo', open: true, force_open: true, force_open_week: W[0] }],
        time_off:       [{ staff_id: STAFF_ID, status: 'approved', start_date: W[0], end_date: W[4] }],
        availabilities: [],
    });
    app.locals.setTestDb(db);
    const res = await postDispos([
        { date: W[1], type: 'custom', start_time: 18, end_time: 24 },
        { date: W[2], type: 'custom', start_time: 18, end_time: 24 },
    ]);
    assert.equal(res.status, 200);
    assert.equal(db.collection('availabilities')._docs.length, 0);
});

test('purge d\'une dispo déjà posée sur un jour devenu congé', async () => {
    const db = makeDb({
        settings:       [{ key: 'dispo', open: true, force_open: true, force_open_week: W[0] }],
        time_off:       [{ staff_id: STAFF_ID, status: 'approved', start_date: W[1], end_date: W[1] }],
        // dispo périmée déjà en base sur le jour désormais en congé
        availabilities: [{ staff_id: STAFF_ID, date: W[1], type: 'custom', status: 'pending' }],
    });
    app.locals.setTestDb(db);
    // On re-soumet le 06 (devenu congé) + un jour valide → le 06 est purgé et non ré-ajouté.
    const res = await postDispos([
        { date: W[0], type: 'custom', start_time: 18, end_time: 24 },
        { date: W[1], type: 'custom', start_time: 18, end_time: 24 },
    ]);
    assert.equal(res.status, 201);
    const dates = db.collection('availabilities')._docs.map(d => d.date).sort();
    assert.deepEqual(dates, [W[0]]); // le mardi (congé) a été purgé et non ré-enregistré
});

test('cas nominal sans congé → 201, tous les jours enregistrés', async () => {
    const db = makeDb({
        settings:       [{ key: 'dispo', open: true, force_open: true, force_open_week: W[0] }],
        time_off:       [],
        availabilities: [],
    });
    app.locals.setTestDb(db);
    const res = await postDispos([
        { date: W[0], type: 'custom', start_time: 18, end_time: 24 },
        { date: W[1], type: 'custom', start_time: 18, end_time: 24 },
    ]);
    assert.equal(res.status, 201);
    assert.equal(db.collection('availabilities')._docs.length, 2);
});
