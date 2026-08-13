// B2-a — horizon de saisie des dispos.
//
// Ce que ce fichier prouve, et pourquoi chaque test existe :
//   • la BORNE d'horizon — `POST /api/dispos` n'a jamais vérifié les dates reçues ; la
//     limite « semaine prochaine » vivait dans `planning.js` seul, donc elle était
//     affichée et pas tenue ;
//   • la RÈGLE A — la deadline ne garde que la semaine en cours de collecte (N+1) ;
//   • l'ALIGNEMENT pastille/file — l'asymétrie de S-04, revenue sur l'axe du temps ;
//   • la LIBÉRATION EN JOKER d'un créneau dont la dispo validée a changé.
//
// ⚠️ Les gardes de `POST /api/dispos` sont en SÉRIE sur un même chemin (ouverture →
// horizon → deadline → congés). C'est le profil exact qui a produit 3 tests vacants sur
// 15 en F-14 : une garde amont peut rendre une garde aval inobservable. Chaque test vise
// donc une seule garde, avec les autres explicitement ouvertes.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const {
    disposHorizonRange, disposHorizonMondays, clampHorizonWeeks,
    DISPO_HORIZON_MAX, dispoMateriallyDiffers,
} = require('../lib/utils');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req, horizonWeekDates } = require('./helpers/harness');

const STAFF_ID = '0123456789abcdef01234567';
const STAFF    = { _id: '0123456789abcdef0123eeee', staff_id: STAFF_ID, name: 'Bob', role: 'staff' };
const PATRON   = { role: 'patron' };

const W1 = horizonWeekDates(1);   // semaine EN COURS DE COLLECTE — gardée par la deadline
const W2 = horizonWeekDates(2);   // N+2 — libre de deadline sous la règle A
const W5 = horizonWeekDates(5);   // au-delà d'un horizon de 4

before(startApp);
after(stopApp);

const postDispos = (dispos, user = STAFF) =>
    req('/api/dispos', user, { method: 'POST', body: JSON.stringify({ dispos }) });

const day = (date, start = 18, end = 24) => ({ date, type: 'custom', start_time: start, end_time: end });
const disposOf = db => db.collection('availabilities')._docs;
const shiftsOf = db => db.collection('shifts')._docs;

// Deadline garantie franchie quel que soit le jour d'exécution : `computeEffectiveDeadline`
// ramène toujours la deadline dans la semaine courante, donc viser un LUNDI 00:00 la place
// soit aujourd'hui à 0h (passée), soit un jour révolu.
const DEADLINE_FRANCHIE = '2026-01-05T00:00';   // 5 janvier 2026 = un lundi

function seed(dispoSettings = {}, extra = {}) {
    return makeDb({
        settings: [{ key: 'dispo', open: true, force_open: true, ...dispoSettings }],
        availabilities: [],
        ...extra,
    });
}

// ── Helpers purs ─────────────────────────────────────────────────────────────

test('disposHorizonRange : X=1 rend EXACTEMENT la semaine N+1 (comportement d\'avant B2)', () => {
    const now = new Date(2026, 7, 13, 10, 0);          // jeudi 13 août 2026
    assert.deepEqual(disposHorizonRange(now, 1), { from: '2026-08-17', to: '2026-08-23' });
});

test('disposHorizonRange : X=4 couvre 4 semaines pleines, du lundi au dimanche', () => {
    const now = new Date(2026, 7, 13, 10, 0);
    assert.deepEqual(disposHorizonRange(now, 4), { from: '2026-08-17', to: '2026-09-13' });
});

test('disposHorizonRange : un lundi vise N+1, jamais la semaine courante', () => {
    const now = new Date(2026, 7, 17, 9, 0);           // lundi 17 août
    assert.equal(disposHorizonRange(now, 1).from, '2026-08-24');
});

test('clampHorizonWeeks : 0, négatif, absent et illisible retombent tous sur 1', () => {
    for (const v of [0, -3, null, undefined, '', 'abc', NaN])
        assert.equal(clampHorizonWeeks(v), 1, 'valeur refusée : ' + String(v));
});

test('clampHorizonWeeks : au-delà du plafond, écrêté (pas d\'horizon infini)', () => {
    assert.equal(clampHorizonWeeks(999), DISPO_HORIZON_MAX);
    assert.equal(clampHorizonWeeks(DISPO_HORIZON_MAX), DISPO_HORIZON_MAX);
});

test('disposHorizonMondays : n lundis consécutifs, espacés de 7 jours', () => {
    const now = new Date(2026, 7, 13, 10, 0);
    assert.deepEqual(disposHorizonMondays(now, 3), ['2026-08-17', '2026-08-24', '2026-08-31']);
});

test('dispoMateriallyDiffers : horaires ou type changés → oui', () => {
    const prev = { type: 'custom', start_time: 18, end_time: 24 };
    assert.equal(dispoMateriallyDiffers(prev, { type: 'custom', start_time: 20, end_time: 24 }), true);
    assert.equal(dispoMateriallyDiffers(prev, { type: 'custom', start_time: 18, end_time: 26 }), true);
    assert.equal(dispoMateriallyDiffers(prev, { type: 'soir',   start_time: 18, end_time: 24 }), true);
});

test('dispoMateriallyDiffers : la NOTE seule ne libère pas un créneau', () => {
    // Corriger un commentaire ne doit pas faire disparaître quelqu'un du planning.
    const prev = { type: 'custom', start_time: 18, end_time: 24, note: 'peut-être en retard' };
    assert.equal(dispoMateriallyDiffers(prev, { type: 'custom', start_time: 18, end_time: 24, note: 'ok finalement' }), false);
});

test('dispoMateriallyDiffers : "18" et 18 sont la même heure', () => {
    // Le client renvoie tantôt une chaîne, tantôt un nombre : une comparaison littérale
    // libérerait un créneau à chaque re-soumission à l'identique.
    assert.equal(dispoMateriallyDiffers({ type: 'custom', start_time: 18, end_time: 24 },
                                        { type: 'custom', start_time: '18', end_time: '24' }), false);
});

// ── Borne d'horizon (le trou §2.1, fermé) ────────────────────────────────────

test('horizon par défaut : une date au-delà de N+1 est REFUSÉE', async () => {
    // Avant B2 cette requête passait : la route n'avait aucun contrôle de date.
    const db = seed();
    app.locals.setTestDb(db);
    const res = await postDispos([day(W2[0])]);
    assert.equal(res.status, 403);
    assert.equal(disposOf(db).length, 0, 'rien n\'est enregistré hors horizon');
});

test('horizon par défaut : une date PASSÉE est refusée elle aussi', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    const res = await postDispos([day('2020-01-06')]);
    assert.equal(res.status, 403);
    assert.equal(disposOf(db).length, 0);
});

test('horizon élargi à 4 : N+2 passe, N+5 reste refusée', async () => {
    const db = seed({ horizon_weeks: 4 });
    app.locals.setTestDb(db);
    assert.equal((await postDispos([day(W2[0])])).status, 201);
    assert.equal((await postDispos([day(W5[0])])).status, 403);
    assert.deepEqual(disposOf(db).map(d => d.date), [W2[0]]);
});

test('horizon : un seul jour hors plage fait refuser TOUT le lot', async () => {
    // Contrairement aux congés (ignorés silencieusement), une date hors horizon signale
    // un client désynchronisé ou forgé : on refuse au lieu d'enregistrer à moitié.
    const db = seed({ horizon_weeks: 2 });
    app.locals.setTestDb(db);
    const res = await postDispos([day(W1[0]), day(W5[0])]);
    assert.equal(res.status, 403);
    assert.equal(disposOf(db).length, 0);
});

// ── Règle A : la deadline ne garde que la semaine en cours de collecte ───────

test('règle A : deadline passée → N+1 refusée, N+2 enregistrée quand même', async () => {
    // LE test du lot. Avant B2, la deadline bloquait la route entière : déclarer sa
    // dispo de N+2 un samedi était impossible.
    const db = seed({ force_open: false, custom_deadline: DEADLINE_FRANCHIE, horizon_weeks: 4 });
    app.locals.setTestDb(db);
    const res = await postDispos([day(W1[0]), day(W2[0])]);
    assert.equal(res.status, 201);
    assert.deepEqual(disposOf(db).map(d => d.date), [W2[0]], 'seule la semaine libre est passée');
    assert.match((await res.json()).message, /deadline passée pour la semaine/);
});

test('règle A : tout le lot dans la semaine figée → 403, message d\'avant B2 conservé', async () => {
    const db = seed({ force_open: false, custom_deadline: DEADLINE_FRANCHIE, horizon_weeks: 4 });
    app.locals.setTestDb(db);
    const res = await postDispos([day(W1[0]), day(W1[1])]);
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /deadline est passée/i);
    assert.equal(disposOf(db).length, 0);
});

test('règle A : l\'exemption de rôle reste AU-DESSUS — le directeur passe sur N+1', async () => {
    // `dispoDeadlineWaived` ne doit pas être court-circuité par la nouvelle règle.
    const db = makeDb({
        settings: [{ key: 'dispo', open: true, force_open: false, custom_deadline: DEADLINE_FRANCHIE }],
        availabilities: [],
    });
    app.locals.setTestDb(db);
    const res = await postDispos([day(W1[0])], { ...STAFF, role: 'directeur' });
    assert.equal(res.status, 201);
    assert.deepEqual(disposOf(db).map(d => d.date), [W1[0]]);
});

// ── Alignement pastille / file (le 🔴 du §4) ─────────────────────────────────

function seedPending(settings = {}) {
    return makeDb({
        settings: [{ key: 'dispo', open: true, ...settings }],
        users: [],
        availabilities: [
            { staff_id: STAFF_ID, date: W1[0], status: 'pending', start_time: 18, end_time: 24 },
            { staff_id: STAFF_ID, date: W5[0], status: 'pending', start_time: 18, end_time: 24 },
        ],
    });
}

test('pastille : bornée sur l\'horizon de validation — la dispo lointaine n\'est pas comptée', async () => {
    // Sans borne, la pastille annonçait 2 pendant que la file (bornée from/to) en
    // montrait 1. C'est l'asymétrie de S-04, sur l'axe du temps.
    app.locals.setTestDb(seedPending({ horizon_weeks: 6 }));
    const body = await (await req('/api/dispos/count', PATRON)).json();
    assert.equal(body.count, 1);
});

test('pastille : Y élargi → la dispo lointaine entre dans le compte', async () => {
    app.locals.setTestDb(seedPending({ horizon_weeks: 6, validation_horizon_weeks: 6 }));
    assert.equal((await (await req('/api/dispos/count', PATRON)).json()).count, 2);
});

test('pastille et file annoncent la MÊME plage et le MÊME nombre', async () => {
    // La garantie structurelle : les deux sortent de `disposHorizonRange`.
    app.locals.setTestDb(seedPending({ horizon_weeks: 6, validation_horizon_weeks: 3 }));
    const count = await (await req('/api/dispos/count', PATRON)).json();
    const file  = await (await req('/api/dispos/pending?from=' + count.from + '&to=' + count.to, PATRON)).json();
    assert.equal(file.length, count.count, 'la file et la pastille ne peuvent plus diverger');
});

test('Y > X est ramené à X — la file ne remonte jamais plus loin que la saisie', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    const res = await req('/api/dispo-settings', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ horizon_weeks: 2, validation_horizon_weeks: 9 }),
    });
    assert.equal(res.status, 200);
    const saved = db.collection('settings')._docs.find(s => s.key === 'dispo');
    assert.equal(saved.horizon_weeks, 2);
    assert.equal(saved.validation_horizon_weeks, 2, 'Y écrêté sur X');
});

test('GET /api/dispo-settings expose l\'horizon et sa plage au client', async () => {
    app.locals.setTestDb(seed({ horizon_weeks: 3, validation_horizon_weeks: 2 }));
    const body = await (await req('/api/dispo-settings', STAFF)).json();
    assert.equal(body.horizon_weeks, 3);
    assert.equal(body.validation_horizon_weeks, 2);
    assert.deepEqual(body.horizon_range, disposHorizonRange(new Date(), 3));
    assert.equal(body.horizon_max, DISPO_HORIZON_MAX);
});

test('GET /api/dispo-settings : deadline passée mais horizon large → la saisie reste ouverte', async () => {
    // `canSubmit` doit dire « il peut saisir QUELQUE CHOSE », sinon le front grise tout
    // le formulaire multi-semaines pour une seule semaine figée.
    app.locals.setTestDb(seed({ force_open: false, custom_deadline: DEADLINE_FRANCHIE, horizon_weeks: 4 }));
    const body = await (await req('/api/dispo-settings', STAFF)).json();
    assert.equal(body.deadlinePassed, true);
    assert.equal(body.collectionWeekOpen, false, 'N+1 est figée');
    assert.equal(body.canSubmit, true, 'les semaines suivantes restent ouvertes');
});

// ── Libération en Joker d'un créneau dont la dispo validée a changé ──────────

const BAR = 'bar1';
const SHIFT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

function seedConfirmed(shiftExtra = {}) {
    return makeDb({
        settings: [{ key: 'dispo', open: true, force_open: true }],
        users: [],
        availabilities: [{
            staff_id: STAFF_ID, date: W1[0], type: 'custom',
            start_time: 18, end_time: 24, status: 'confirmed', establishment_id: BAR,
        }],
        shifts: [{
            _id: SHIFT_ID, staff_id: STAFF_ID, staff_name: 'Bob',
            establishment_id: BAR, date: W1[0], start_time: 18, end_time: 24,
            color: '#3498db', ...shiftExtra,
        }],
    });
}

test('dispo validée modifiée → le créneau repasse en Joker, il n\'est pas supprimé', async () => {
    // Décision du 2026-08-13, alignée sur F-14 : le poste était tenu, il reste à
    // pourvoir. Le supprimer le ferait disparaître en silence d'un planning publié.
    const db = seedConfirmed();
    app.locals.setTestDb(db);
    const res = await postDispos([day(W1[0], 20, 26)]);
    assert.equal(res.status, 201);

    const shifts = shiftsOf(db);
    assert.equal(shifts.length, 1, 'le créneau existe toujours');
    assert.equal(shifts[0].is_joker, true);
    assert.equal(shifts[0].staff_id, '__joker__');
    assert.equal(shifts[0].date, W1[0], 'même jour, même besoin');
    assert.match((await res.json()).message, /Joker/);
});

test('re-soumission À L\'IDENTIQUE → le planning n\'est pas touché', async () => {
    // Le cas le plus courant : le staff rouvre son formulaire et renvoie sans rien
    // changer. Sans le test de différence matérielle, il se dé-planifierait tout seul.
    const db = seedConfirmed();
    app.locals.setTestDb(db);
    const res = await postDispos([day(W1[0], 18, 24)]);
    assert.equal(res.status, 201);
    assert.equal(shiftsOf(db)[0].staff_id, STAFF_ID, 'toujours titulaire');
    assert.ok(!shiftsOf(db)[0].is_joker);
});

test('créneau déjà POINTÉ → jamais libéré (ce sont des heures travaillées)', async () => {
    const db = seedConfirmed({ real_start: 18.5, real_end: 24 });
    app.locals.setTestDb(db);
    const res = await postDispos([day(W1[0], 20, 26)]);
    assert.equal(res.status, 201);
    assert.equal(shiftsOf(db)[0].staff_id, STAFF_ID, 'la paie n\'est pas effacée par une dispo');
    assert.match((await res.json()).message, /pointé/);
});

test('dispo jamais validée (pending) → aucun créneau libéré', async () => {
    // La libération ne vise QUE ce que le patron avait validé.
    const db = seedConfirmed();
    db.collection('availabilities')._docs[0].status = 'pending';
    app.locals.setTestDb(db);
    await postDispos([day(W1[0], 20, 26)]);
    assert.equal(shiftsOf(db)[0].staff_id, STAFF_ID);
});

test('un créneau d\'un AUTRE bar que celui de la dispo n\'est pas touché', async () => {
    const db = seedConfirmed();
    db.collection('shifts')._docs.push({
        _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', staff_id: STAFF_ID, staff_name: 'Bob',
        establishment_id: 'bar2', date: W1[0], start_time: 18, end_time: 24,
    });
    app.locals.setTestDb(db);
    await postDispos([day(W1[0], 20, 26)]);
    const byBar = Object.fromEntries(shiftsOf(db).map(s => [s.establishment_id, s]));
    assert.equal(byBar[BAR].is_joker, true, 'le bar de la dispo est libéré');
    assert.equal(byBar.bar2.staff_id, STAFF_ID, 'l\'autre bar est hors sujet');
});
