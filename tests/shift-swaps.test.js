// F-05 — échanges de shifts entre employés, réactivé le 2026-09-03.
//
// La feature dormait commentée depuis mai 2026 « en attente de validation client », et
// personne ne l'a jamais couverte : au décommentage, elle ne tenait sur aucun test. Ce
// fichier est écrit d'abord pour ce que la réactivation risque, pas pour la liste des
// routes — un échange déplace un salarié d'un service à un autre, donc les cas qui
// comptent sont ceux où quelqu'un obtient un shift qu'il n'aurait pas dû avoir.
//
// Le cas ajouté à la réactivation (et absent du code de 2026-05) : un shift de semaine
// NON PUBLIÉE. Entre-temps B2-b a fermé la lecture des brouillons côté planning ; sans
// la même garde ici, l'échange rouvrait la porte — et par une route en ÉCRITURE.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { weekStart, toDateStr } = require('../lib/utils');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

before(startApp);
after(stopApp);

// ── Acteurs ──────────────────────────────────────────────────────────────────

const ALICE_STAFF = '0123456789abcdef0000000a';
const BOB_STAFF   = '0123456789abcdef0000000b';

const ALICE = { _id: '0123456789abcdef0000ee01', staff_id: ALICE_STAFF, name: 'Alice', role: 'staff' };
const BOB   = { _id: '0123456789abcdef0000ee02', staff_id: BOB_STAFF,   name: 'Bob',   role: 'staff' };
const PATRON = { _id: '0123456789abcdef0000ee03', name: 'Patron', role: 'patron' };
// Directeur du bar2 UNIQUEMENT : c'est lui qui rend le filtre de périmètre observable.
const DIR_BAR2 = { _id: '0123456789abcdef0000ee04', name: 'Dir', role: 'directeur', assigned_establishments: ['bar2'] };

// ── Dates ────────────────────────────────────────────────────────────────────
// Semaine N+1 : entièrement future (l'échange refuse le passé) et jamais
// auto-publiée (`isAutoPublished` ne couvre que la semaine en cours et avant) —
// donc c'est la seule fenêtre où « futur » et « publication » se testent séparément.

const N1   = toDateStr(weekStart(new Date(Date.now() + 7 * 864e5)));
const day  = (monday, i) => toDateStr(new Date(new Date(monday + 'T12:00:00').getTime() + i * 864e5));
const HIER = toDateStr(new Date(Date.now() - 864e5));

const SH_ALICE = '0123456789abcdef000000a1';
const SH_BOB   = '0123456789abcdef000000b1';
const SH_JOKER = '0123456789abcdef000000j1';

const shift = (id, staffId, staffName, date, estab = 'bar1', extra = {}) => ({
    _id: id, staff_id: staffId, staff_name: staffName, establishment_id: estab,
    date, start_time: 18, end_time: 24, color: '#3498db', ...extra,
});

// Le couple de base : Alice mardi, Bob mercredi, même bar, semaine N+1 publiée.
const duo = () => [
    shift(SH_ALICE, ALICE_STAFF, 'Alice', day(N1, 1)),
    shift(SH_BOB,   BOB_STAFF,   'Bob',   day(N1, 2)),
];

function seed({ shifts = duo(), swaps = [], published = true, users = [] } = {}) {
    return makeDb({
        shifts,
        shift_swaps: swaps,
        users,
        staff: [
            { _id: ALICE_STAFF, name: 'Alice', color: '#e74c3c' },
            { _id: BOB_STAFF,   name: 'Bob',   color: '#27ae60' },
        ],
        establishments: [{ id: 'bar1', name: 'Bar 1' }, { id: 'bar2', name: 'Bar 2' }],
        settings: published ? [{ key: 'publish_' + N1, establishments: 'ALL' }] : [],
    });
}

const propose = (user, body) =>
    req('/api/shift-swaps', user, { method: 'POST', body: JSON.stringify(body) });

// ── Proposer un échange ──────────────────────────────────────────────────────

test('le chemin normal : la demande part et attend le patron', async () => {
    const db = seed();
    app.locals.setTestDb(db);

    const res  = await propose(ALICE, { from_shift_id: SH_ALICE, to_shift_id: SH_BOB, note: 'mariage' });
    const body = await res.json();
    assert.equal(res.status, 201);
    assert.ok(body.swap_id);

    const [swap] = db.collection('shift_swaps')._docs;
    assert.equal(swap.status, 'pending');
    assert.equal(swap.from_staff_id, ALICE_STAFF);
    assert.equal(swap.to_staff_id, BOB_STAFF);
    assert.equal(swap.note, 'mariage');
    // Rien n'a bougé côté planning : c'est l'approbation qui déplace, pas la demande.
    assert.equal(db.collection('shifts')._docs.find(s => s._id === SH_ALICE).staff_id, ALICE_STAFF);
});

test('proposer le shift d\'un autre est refusé', async () => {
    app.locals.setTestDb(seed());
    const res = await propose(BOB, { from_shift_id: SH_ALICE, to_shift_id: SH_BOB });
    assert.equal(res.status, 403);
});

test('un Joker n\'est pas un partenaire d\'échange', async () => {
    app.locals.setTestDb(seed({ shifts: [
        ...duo(),
        shift(SH_JOKER, '__joker__', 'Joker', day(N1, 3), 'bar1', { is_joker: true }),
    ] }));
    const res = await propose(ALICE, { from_shift_id: SH_ALICE, to_shift_id: SH_JOKER });
    assert.equal(res.status, 400);
});

test('un shift déjà passé ne s\'échange plus', async () => {
    // La semaine écoulée est auto-publiée : le refus vient bien de la date, pas de B2.
    app.locals.setTestDb(seed({ shifts: [
        shift(SH_ALICE, ALICE_STAFF, 'Alice', HIER),
        shift(SH_BOB,   BOB_STAFF,   'Bob',   HIER),
    ] }));
    const res = await propose(ALICE, { from_shift_id: SH_ALICE, to_shift_id: SH_BOB });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /futurs/);
});

test('B2-b : un planning NON PUBLIÉ ne se négocie pas', async () => {
    // LE cas de la réactivation. Le brouillon du patron n'est pas encore une promesse ;
    // en faire une monnaie d'échange le rendrait public par la bande.
    app.locals.setTestDb(seed({ published: false }));
    const res = await propose(ALICE, { from_shift_id: SH_ALICE, to_shift_id: SH_BOB });
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /publié/);
});

test('un shift déjà engagé dans une demande n\'en accepte pas une seconde', async () => {
    app.locals.setTestDb(seed({ swaps: [{
        _id: '0123456789abcdef0000cc01', status: 'pending',
        from_shift_id: SH_BOB, to_shift_id: '0123456789abcdef000000c9',
        from_staff_id: BOB_STAFF, to_staff_id: ALICE_STAFF,
        from_establishment_id: 'bar1', to_establishment_id: 'bar1',
    }] }));
    const res = await propose(ALICE, { from_shift_id: SH_ALICE, to_shift_id: SH_BOB });
    assert.equal(res.status, 409);
});

// ── La liste des cibles proposées ────────────────────────────────────────────

const targets = async (user, from, to) =>
    (await (await req('/api/shifts-for-swap?from=' + from + '&to=' + to, user)).json());

test('la liste ne propose que les collègues des bars où je travaille', async () => {
    app.locals.setTestDb(seed({ shifts: [
        ...duo(),
        // Même semaine, autre bar : Alice n'y met jamais les pieds.
        shift('0123456789abcdef000000c1', BOB_STAFF, 'Bob', day(N1, 3), 'bar2'),
        shift(SH_JOKER, '__joker__', 'Joker', day(N1, 4), 'bar1', { is_joker: true }),
    ] }));
    const list = await targets(ALICE, N1, day(N1, 6));
    assert.deepEqual(list.map(s => s._id), [SH_BOB], 'ni mon propre shift, ni le bar2, ni le Joker');
});

test('la liste tait les semaines non publiées', async () => {
    app.locals.setTestDb(seed({ published: false }));
    assert.deepEqual(await targets(ALICE, N1, day(N1, 6)), []);
});

test('un shift déjà engagé disparaît de la liste', async () => {
    app.locals.setTestDb(seed({ swaps: [{
        _id: '0123456789abcdef0000cc02', status: 'pending',
        from_shift_id: SH_BOB, to_shift_id: '0123456789abcdef000000c9',
        from_staff_id: BOB_STAFF, to_staff_id: ALICE_STAFF,
        from_establishment_id: 'bar1', to_establishment_id: 'bar1',
    }] }));
    assert.deepEqual(await targets(ALICE, N1, day(N1, 6)), []);
});

// ── Décision du patron ───────────────────────────────────────────────────────

// Une demande en attente, prête à être tranchée.
const pending = (extra = {}) => ({
    _id: '0123456789abcdef0000dd01', status: 'pending',
    from_shift_id: SH_ALICE, to_shift_id: SH_BOB,
    from_staff_id: ALICE_STAFF, from_staff_name: 'Alice',
    to_staff_id: BOB_STAFF,     to_staff_name: 'Bob',
    from_establishment_id: 'bar1', to_establishment_id: 'bar1',
    created_at: new Date(), decided_at: null, decided_by: null, ...extra,
});

const decide = (user, id, action, body = {}) =>
    req('/api/shift-swaps/' + id + '/' + action, user, { method: 'PATCH', body: JSON.stringify(body) });

test('approuver échange VRAIMENT les deux porteurs, couleur comprise', async () => {
    const db = seed({ swaps: [pending()] });
    app.locals.setTestDb(db);

    const res = await decide(PATRON, '0123456789abcdef0000dd01', 'approve');
    assert.equal(res.status, 200);

    const shifts = db.collection('shifts')._docs;
    const sa = shifts.find(s => s._id === SH_ALICE);
    const sb = shifts.find(s => s._id === SH_BOB);
    assert.equal(sa.staff_id, BOB_STAFF,   'le service d\'Alice passe à Bob');
    assert.equal(sb.staff_id, ALICE_STAFF, 'et réciproquement');
    // La couleur suit la personne, pas le créneau : sans ça le planning du patron
    // afficherait le bon nom sous l'ancienne couleur — le pire des deux mondes.
    assert.equal(sa.color, '#27ae60');
    assert.equal(sb.color, '#e74c3c');
    assert.equal(db.collection('shift_swaps')._docs[0].status, 'approved');
});

test('une demande déjà tranchée ne se retranche pas', async () => {
    app.locals.setTestDb(seed({ swaps: [pending({ status: 'approved' })] }));
    const res = await decide(PATRON, '0123456789abcdef0000dd01', 'approve');
    assert.equal(res.status, 409);
});

test('si un des shifts a disparu, la demande s\'annule au lieu de casser', async () => {
    const db = seed({ shifts: [shift(SH_ALICE, ALICE_STAFF, 'Alice', day(N1, 1))], swaps: [pending()] });
    app.locals.setTestDb(db);
    const res = await decide(PATRON, '0123456789abcdef0000dd01', 'approve');
    assert.equal(res.status, 410);
    assert.equal(db.collection('shift_swaps')._docs[0].status, 'rejected');
});

test('refuser laisse le planning intact et garde le motif', async () => {
    const db = seed({ swaps: [pending()] });
    app.locals.setTestDb(db);

    const res = await decide(PATRON, '0123456789abcdef0000dd01', 'reject', { reason: 'effectif trop juste' });
    assert.equal(res.status, 200);

    const swap = db.collection('shift_swaps')._docs[0];
    assert.equal(swap.status, 'rejected');
    assert.equal(swap.reject_reason, 'effectif trop juste');
    assert.equal(db.collection('shifts')._docs.find(s => s._id === SH_ALICE).staff_id, ALICE_STAFF);
});

test('un directeur ne décide pas hors de son périmètre', async () => {
    app.locals.setTestDb(seed({ swaps: [pending()] }));   // échange 100 % bar1
    const res = await decide(DIR_BAR2, '0123456789abcdef0000dd01', 'approve');
    assert.equal(res.status, 403);
});

test('… et son compteur ne compte que ses bars', async () => {
    app.locals.setTestDb(seed({ swaps: [
        pending(),                                                   // bar1 ↔ bar1
        pending({ _id: '0123456789abcdef0000dd02', to_establishment_id: 'bar2' }), // touche bar2
    ] }));
    assert.deepEqual(await (await req('/api/shift-swaps/count', DIR_BAR2)).json(), { count: 1 });
    assert.deepEqual(await (await req('/api/shift-swaps/count', PATRON)).json(),   { count: 2 });
});

// ── Annulation par le proposeur ──────────────────────────────────────────────

const annuler = (user, id) => req('/api/shift-swaps/' + id, user, { method: 'DELETE' });

test('seul le proposeur annule sa demande', async () => {
    const db = seed({ swaps: [pending()] });
    app.locals.setTestDb(db);

    assert.equal((await annuler(BOB, '0123456789abcdef0000dd01')).status, 403);
    assert.equal((await annuler(ALICE, '0123456789abcdef0000dd01')).status, 200);
    assert.deepEqual(db.collection('shift_swaps')._docs, []);
});

test('mes demandes me sont rendues, celles des autres non', async () => {
    app.locals.setTestDb(seed({ swaps: [
        pending(),
        pending({ _id: '0123456789abcdef0000dd03', from_staff_id: '0123456789abcdef0000000c', to_staff_id: '0123456789abcdef0000000d' }),
    ] }));
    const mine = await (await req('/api/shift-swaps/mine', ALICE)).json();
    assert.deepEqual(mine.map(s => s._id), ['0123456789abcdef0000dd01']);
});
