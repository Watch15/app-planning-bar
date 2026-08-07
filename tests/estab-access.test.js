// R-16 / S-05 / S-06 — périmètre par établissement.
//
// Le contrôle `canAccessEstablishment` était recopié à la main dans 14 routes, et OUBLIÉ
// dans 5 autres. Ces tests couvrent le middleware `requireEstablishmentAccess` qui remplace
// la copie, les routes qui l'avaient oublié (S-06), et la confirmation de dispo (S-05).
//
// Le point à ne pas régresser : ces routes sont montées en `requireAuth`, donc un compte
// staff ordinaire les atteint. Avant, il lisait les shifts nominatifs de n'importe quel bar
// en devinant l'id (slug `Nom_bar`).

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const PATRON  = { _id: 'u-pat', role: 'patron', name: 'Paul' };
const OBS     = { _id: 'u-obs', role: 'observateur', name: 'Oscar' };
// Directeur limité à bar1 — c'est lui qui révèle chaque trou.
const DIR     = { _id: 'u-dir', role: 'directeur', name: 'Diane', assigned_establishments: ['bar1'] };
const STAFF   = { _id: 'u-stf', role: 'staff', name: 'Bob', staff_id: '0123456789abcdef0123cccc' };
// Compte établissement : lié à bar2, et à lui seul.
const ETAB    = { _id: 'u-eta', role: 'etablissement', name: 'Poste bar2', establishment_id: 'bar2' };

const DAY = '2099-04-06';

before(startApp);
after(stopApp);

let db;
beforeEach(() => {
    db = makeDb({
        establishments: [{ id: 'bar1', name: 'Bar 1' }, { id: 'bar2', name: 'Bar 2' }],
        staff: [{ _id: '0123456789abcdef0123cccc', name: 'Bob', venues: ['bar1'], hourly_rate: 12 }],
        shifts: [
            { establishment_id: 'bar1', staff_id: '0123456789abcdef0123cccc', staff_name: 'Bob', date: DAY, start_time: 18, end_time: 24 },
            { establishment_id: 'bar2', staff_id: '0123456789abcdef0123cccc', staff_name: 'Bob', date: DAY, start_time: 12, end_time: 18 },
        ],
        availabilities: [],
        settings: [],
    });
    app.locals.setTestDb(db);
});

const code = async (user, path) => (await req(path, user)).status;

// ── S-06 : les routes de lecture qui n'avaient AUCUN contrôle ────────────────

for (const [label, path] of [
    ['GET /api/week/:id',       '/api/week/{ID}?from=2099-04-01&to=2099-04-30'],
    ['GET /api/week-full/:id',  '/api/week-full/{ID}?from=2099-04-01&to=2099-04-30'],
    ['GET /api/shifts/:id/:date','/api/shifts/{ID}/' + DAY],
]) {
    test('S-06 : ' + label + ' — le directeur accède à SON bar', async () =>
        assert.equal(await code(DIR, path.replace('{ID}', 'bar1')), 200));

    test('S-06 : ' + label + ' — refusé sur un bar qui n\'est pas le sien', async () =>
        assert.equal(await code(DIR, path.replace('{ID}', 'bar2')), 403));

    test('S-06 : ' + label + ' — un staff ne lit plus les shifts d\'un bar', async () =>
        assert.equal(await code(STAFF, path.replace('{ID}', 'bar1')), 403));

    test('S-06 : ' + label + ' — le patron n\'est jamais filtré', async () =>
        assert.equal(await code(PATRON, path.replace('{ID}', 'bar2')), 200));
}

// ── S-06 : pointage — le compte établissement est borné au sien ──────────────

test('S-06 : le compte établissement lit son propre bar (id pris en SESSION)', async () => {
    // Il ne transmet pas d'establishment_id : l'id vient de sa session, donc il ne peut
    // pas en viser un autre en trafiquant la requête.
    assert.equal(await code(ETAB, '/api/pointage/' + DAY), 200);
    assert.equal(await code(ETAB, '/api/pointage/' + DAY + '?establishment_id=bar1'), 200);
    const body = await (await req('/api/pointage/' + DAY + '?establishment_id=bar1', ETAB)).json();
    assert.deepEqual(body.map(s => s.establishment_id), ['bar2'], 'la query est ignorée pour ce rôle');
});

test('S-06 : le directeur ne pointe pas sur un bar qui n\'est pas le sien', async () => {
    assert.equal(await code(DIR, '/api/pointage/' + DAY + '?establishment_id=bar1'), 200);
    assert.equal(await code(DIR, '/api/pointage/' + DAY + '?establishment_id=bar2'), 403);
});

// ── S-06 : récap mensuel — l'ABSENCE de paramètre valait « tous les bars » ───

// Bob a 6 h sur bar1 ET 6 h sur bar2. Le total est donc le révélateur : 6 h pour la
// directrice (bar1 seul), 12 h pour le patron. Une assertion « bar2 n'apparaît pas »
// serait passée même sans le correctif — la 1re version de ce test l'a prouvé.
const recapRow = async user => {
    const res = await req('/api/recap-mensuel?month=2099-04', user);
    assert.equal(res.status, 200);
    const rows = await res.json();
    assert.equal(rows.length, 1, 'un seul staff attendu, obtenu ' + JSON.stringify(rows).slice(0, 120));
    return rows[0];
};

test('S-06 : récap sans establishment_id — le directeur ne compte que ses bars', async () => {
    const r = await recapRow(DIR);
    assert.equal(r.planned_hours, 6, 'les 6 h de bar2 ne doivent pas être comptées');
    assert.deepEqual(r.by_establishment.map(e => e.establishment_id), ['bar1']);
});

test('S-06 : récap sans establishment_id — le patron cumule tout', async () => {
    const r = await recapRow(PATRON);
    assert.equal(r.planned_hours, 12);
    assert.deepEqual(r.by_establishment.map(e => e.establishment_id).sort(), ['bar1', 'bar2']);
});

// ── S-05 : confirmer une dispo = l'affecter à un bar ─────────────────────────

const DISPO = '0123456789abcdef0123dddd';
function seedDispo() {
    db.collection('availabilities')._docs.push({
        _id: DISPO, staff_id: '0123456789abcdef0123cccc', staff_name: 'Bob',
        date: DAY, type: 'soir', start_time: 18, end_time: 24, status: 'pending',
    });
}
const confirm = (user, estab) => req('/api/dispos/' + DISPO + '/confirm', user, {
    method: 'PATCH', body: JSON.stringify({ establishment_id: estab, create_shift: true }),
});

test('S-05 : le directeur ne peut pas affecter une dispo à un bar qui n\'est pas le sien', async () => {
    seedDispo();
    const res = await confirm(DIR, 'bar2');
    assert.equal(res.status, 403);
    const dispo = db.collection('availabilities')._docs.find(d => d._id === DISPO);
    assert.equal(dispo.status, 'pending', 'la dispo reste en attente');
    assert.equal(db.collection('shifts')._docs.filter(s => s.date === DAY).length, 2,
        'aucun shift créé dans bar2');
});

test('S-05 : le directeur affecte bien à SON bar (contre-épreuve)', async () => {
    seedDispo();
    assert.equal((await confirm(DIR, 'bar1')).status, 200);
    const dispo = db.collection('availabilities')._docs.find(d => d._id === DISPO);
    assert.equal(dispo.status, 'confirmed');
    assert.equal(dispo.establishment_id, 'bar1');
});

test('S-05 : le patron affecte à n\'importe quel bar', async () => {
    seedDispo();
    assert.equal((await confirm(PATRON, 'bar2')).status, 200);
});

test('S-05 : l\'observateur reste bloqué en écriture (denyObservateurEdit, en amont)', async () => {
    seedDispo();
    assert.equal((await confirm(OBS, 'bar1')).status, 403);
});

// ── R-16 : le compte établissement, traité nativement ────────────────────────
// 5 routes écrivaient `role !== 'etablissement' && !canAccessEstablishment(…)` — elles
// sautaient la vérification pour ce rôle. ⚠️ Vérifié : chacune portait sa PROPRE garde,
// il n'y avait pas de trou ; supprimer le cas particulier est une simplification.
// Ces tests verrouillent le comportement attendu pour qu'il le reste.

test('R-16 : le compte établissement lit le CA de SON bar', async () =>
    assert.equal(await code(ETAB, '/api/revenue/bar2/' + DAY), 200));

test('R-16 : le compte établissement ne lit PAS le CA d\'un autre bar', async () =>
    assert.equal(await code(ETAB, '/api/revenue/bar1/' + DAY), 403));

test('R-16 : un compte établissement sans establishment_id n\'accède à rien', async () => {
    const orphan = { _id: 'u-orph', role: 'etablissement', name: 'Orphelin' };
    assert.equal(await code(orphan, '/api/revenue/bar1/' + DAY), 403);
    assert.equal(await code(orphan, '/api/revenue/bar2/' + DAY), 403);
});

test('R-16 : le directeur ne lit pas le CA d\'un bar qui n\'est pas le sien', async () => {
    assert.equal(await code(DIR, '/api/revenue/bar1/' + DAY), 200);
    assert.equal(await code(DIR, '/api/revenue/bar2/' + DAY), 403);
});

// ── Responsable de soirée : le pointage doit RESTER accessible ───────────────
// Régression trouvée en préparant la propagation client : `GET /api/pointage/:date` était
// passé sous `requireEstablishmentAccess`, or `pointage.js` sert aussi le rôle `staff`
// (E-03). Un staff n'a pas d'`assigned_establishments` ⇒ 403 ⇒ plus aucun shift à pointer.
// Le droit vient de son rôle SUR LA SOIRÉE, ce qui demande une requête : repli inline.

const ROLE_RESP = 'aaaaaaaaaaaaaaaaaaaa1111';
const RESP_STAFF = '0123456789abcdef0123bbbb';
const RESP_USER = { _id: 'u-resp', role: 'staff', name: 'Alice', staff_id: RESP_STAFF };

function seedSoiree() {
    const d = makeDb({
        establishments: [{ id: 'bar1', name: 'Bar 1' }, { id: 'bar2', name: 'Bar 2' }],
        roles: [{ _id: ROLE_RESP, name: 'Responsable de soirée', type: 'responsable' }],
        staff: [
            { _id: RESP_STAFF, name: 'Alice', venues: ['bar1'], roles: [ROLE_RESP] },
            { _id: '0123456789abcdef0123cccc', name: 'Bob', venues: ['bar1'], roles: [] },
        ],
        shifts: [
            // Alice est la responsable désignée du soir sur bar1.
            { establishment_id: 'bar1', staff_id: RESP_STAFF, staff_name: 'Alice',
              date: DAY, start_time: 18, end_time: 26, pointage_resp: true },
            { establishment_id: 'bar1', staff_id: '0123456789abcdef0123cccc', staff_name: 'Bob',
              date: DAY, start_time: 20, end_time: 26 },
        ],
    });
    app.locals.setTestDb(d);
    return d;
}

test('pointage : le responsable de soirée accède au bar où il est désigné', async () => {
    seedSoiree();
    const res = await req('/api/pointage/' + DAY + '?establishment_id=bar1', RESP_USER);
    assert.equal(res.status, 200, 'sans ce repli, il ne voit plus aucun shift à pointer');
    assert.equal((await res.json()).length, 2, 'il voit toute la soirée, pas seulement son shift');
});

test('pointage : un staff SANS rôle responsable reste refusé', async () => {
    seedSoiree();
    const bob = { _id: 'u-bob', role: 'staff', name: 'Bob', staff_id: '0123456789abcdef0123cccc' };
    assert.equal(await code(bob, '/api/pointage/' + DAY + '?establishment_id=bar1'), 403);
});

test('pointage : le responsable n\'accède PAS à un bar où il n\'est pas désigné', async () => {
    seedSoiree();
    assert.equal(await code(RESP_USER, '/api/pointage/' + DAY + '?establishment_id=bar2'), 403);
});

test('pointage : sans establishment_id → 400, pas 403', async () => {
    seedSoiree();
    assert.equal(await code(RESP_USER, '/api/pointage/' + DAY), 400);
});
