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

// `crossSwaps` : laissé à `undefined`, AUCUN doc `swaps` n'est écrit — c'est le cas qui
// compte, celui du client déjà livré, où le réglage n'existe pas encore en base.
function seed({ shifts = duo(), swaps = [], published = true, users = [], crossSwaps } = {}) {
    const settings = published ? [{ key: 'publish_' + N1, establishments: 'ALL' }] : [];
    if (crossSwaps !== undefined) settings.push({ key: 'swaps', cross_establishment: crossSwaps });
    return makeDb({
        shifts,
        shift_swaps: swaps,
        users,
        staff: [
            { _id: ALICE_STAFF, name: 'Alice', color: '#e74c3c' },
            { _id: BOB_STAFF,   name: 'Bob',   color: '#27ae60' },
        ],
        establishments: [{ id: 'bar1', name: 'Bar 1' }, { id: 'bar2', name: 'Bar 2' }],
        settings,
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
    assert.equal(swap.status, 'pending_staff', 'la demande attend le collègue, pas le patron');
    assert.equal(swap.from_staff_id, ALICE_STAFF);
    assert.equal(swap.to_staff_id, BOB_STAFF);
    assert.equal(swap.note, 'mariage');
    // Rien n'a bougé côté planning : c'est l'approbation qui déplace, pas la demande.
    assert.equal(db.collection('shifts')._docs.find(s => s._id === SH_ALICE).staff_id, ALICE_STAFF);
});

test("tant que le collègue n'a pas répondu, le patron ne voit rien", async () => {
    // C'est TOUT l'objet de la première validation : le patron n'arbitre que ce sur quoi
    // les deux salariés sont déjà d'accord. Sans cette garde, la double validation ne
    // serait qu'un écran de plus, pas une règle.
    const db = seed();
    app.locals.setTestDb(db);
    await propose(ALICE, { from_shift_id: SH_ALICE, to_shift_id: SH_BOB });

    assert.deepEqual(await (await req('/api/shift-swaps/pending', PATRON)).json(), []);
    assert.equal((await (await req('/api/shift-swaps/count', PATRON)).json()).count, 0);

    // ... et il ne peut pas non plus l'approuver en la devinant.
    const id = String(db.collection('shift_swaps')._docs[0]._id);
    assert.equal((await decide(PATRON, id, 'approve')).status, 409);
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

// ── Étape 1 : la réponse du collègue ─────────────────────────────────────────
//
// Ajoutée après acceptation de F-05 : le salarié dont on convoite le service décide
// AVANT le patron. Les cas qui comptent sont ceux où quelqu'un répond à la place d'un
// autre, et celui où le planning bouge pendant que le collègue réfléchit.

const respond = (user, id, action, body = {}) =>
    req('/api/shift-swaps/' + id + '/staff-' + action, user, { method: 'PATCH', body: JSON.stringify(body) });

// Pose une demande par le chemin normal et rend son id.
async function proposed(db) {
    app.locals.setTestDb(db);
    await propose(ALICE, { from_shift_id: SH_ALICE, to_shift_id: SH_BOB });
    return String(db.collection('shift_swaps')._docs[0]._id);
}

test("le collègue accepte : la demande passe alors chez le patron", async () => {
    const db = seed();
    const id = await proposed(db);

    const res = await respond(BOB, id, 'accept');
    assert.equal(res.status, 200);

    const swap = db.collection('shift_swaps')._docs[0];
    assert.equal(swap.status, 'pending');
    assert.ok(swap.staff_accepted_at, "la date d'accord est tracée : le patron l'affiche");
    // Accepter ne déplace RIEN : c'est le patron qui permute.
    assert.equal(db.collection('shifts')._docs.find(s => s._id === SH_ALICE).staff_id, ALICE_STAFF);

    const pending = await (await req('/api/shift-swaps/pending', PATRON)).json();
    assert.equal(pending.length, 1);
});

test("le collègue refuse : la demande est close et le patron ne la verra jamais", async () => {
    const db = seed();
    const id = await proposed(db);

    const res = await respond(BOB, id, 'decline', { reason: 'je bosse ce soir-là' });
    assert.equal(res.status, 200);

    const swap = db.collection('shift_swaps')._docs[0];
    assert.equal(swap.status, 'rejected');
    assert.equal(swap.rejected_by, 'staff', "distinguer un refus collègue d'un refus patron");
    assert.equal(swap.reject_reason, 'je bosse ce soir-là');
    assert.deepEqual(await (await req('/api/shift-swaps/pending', PATRON)).json(), []);
});

test("personne ne répond à la place du collègue visé", async () => {
    const db = seed();
    const id = await proposed(db);

    // Le proposeur signerait des deux mains — c'est le cas qui viderait la règle.
    assert.equal((await respond(ALICE, id, 'accept')).status, 403);
    // Le patron non plus : il a ses propres routes, il ne parle pas au nom du staff.
    assert.equal((await respond(PATRON, id, 'accept')).status, 403);
    assert.equal(db.collection('shift_swaps')._docs[0].status, 'pending_staff');
});

test("une réponse déjà donnée ne se redonne pas", async () => {
    const db = seed();
    const id = await proposed(db);
    assert.equal((await respond(BOB, id, 'accept')).status, 200);
    assert.equal((await respond(BOB, id, 'decline')).status, 409);
    assert.equal((await respond(BOB, id, 'accept')).status, 409);
});

test("si le planning a bougé pendant que le collègue réfléchit, la demande se clôt", async () => {
    // Le patron peut remanier son planning entre la proposition et la réponse. Faire
    // remonter la demande telle quelle enverrait le patron valider un échange qui ne
    // correspond plus à ce que les deux salariés ont accepté.
    const db = seed();
    const id = await proposed(db);
    db.collection('shifts')._docs.find(s => s._id === SH_BOB).staff_id = '0123456789abcdef0000000c';

    const res = await respond(BOB, id, 'accept');
    assert.equal(res.status, 410);
    assert.equal(db.collection('shift_swaps')._docs[0].status, 'rejected');
    assert.deepEqual(await (await req('/api/shift-swaps/pending', PATRON)).json(), []);
});

test("le proposeur peut retirer sa demande pendant que le collègue réfléchit", async () => {
    const db = seed();
    const id = await proposed(db);
    const res = await req('/api/shift-swaps/' + id, ALICE, { method: 'DELETE' });
    assert.equal(res.status, 200);
    assert.equal(db.collection('shift_swaps')._docs.length, 0);
});

test("une demande chez le collègue engage déjà les deux shifts", async () => {
    // Sinon un même service part dans deux échanges à la fois, et le second arrive
    // chez le patron sur un shift déjà promis.
    const db = seed();
    await proposed(db);
    const res = await propose(ALICE, { from_shift_id: SH_ALICE, to_shift_id: SH_BOB });
    assert.equal(res.status, 409);
    assert.deepEqual(await targets(ALICE, N1, day(N1, 6)), [], 'ni dans la liste des cibles');
});

// ── Réglage patron : échanges inter-établissements ───────────────────────────
//
// Demandé après acceptation de F-05 par le client. L'enjeu n'est pas le réglage lui-même
// mais son DÉFAUT : la feature est déjà livrée avec l'inter-établissement ouvert, donc une
// base sans doc `swaps` doit continuer à se comporter exactement comme avant.

// Le même duo, mais Bob travaille dans l'autre bar.
const duoCross = () => [
    shift(SH_ALICE, ALICE_STAFF, 'Alice', day(N1, 1), 'bar1'),
    shift(SH_BOB,   BOB_STAFF,   'Bob',   day(N1, 2), 'bar2'),
];

test("sans réglage en base, l'échange inter-établissements passe comme avant", async () => {
    app.locals.setTestDb(seed({ shifts: duoCross() }));
    const res = await propose(ALICE, { from_shift_id: SH_ALICE, to_shift_id: SH_BOB });
    assert.equal(res.status, 201);
});

test("réglage coupé : l'échange entre deux bars est refusé", async () => {
    app.locals.setTestDb(seed({ shifts: duoCross(), crossSwaps: false }));
    const res = await propose(ALICE, { from_shift_id: SH_ALICE, to_shift_id: SH_BOB });
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /entre établissements/);
});

test("réglage coupé : l'échange DANS le même bar reste possible", async () => {
    // Sinon le réglage ne coupe pas l'inter-établissement, il coupe la feature.
    app.locals.setTestDb(seed({ crossSwaps: false }));
    const res = await propose(ALICE, { from_shift_id: SH_ALICE, to_shift_id: SH_BOB });
    assert.equal(res.status, 201);
});

test('seul le patron touche au réglage', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    const patch = (user, body) => req('/api/swap-settings', user, { method: 'PATCH', body: JSON.stringify(body) });

    // Réglage GLOBAL : le directeur ne voit qu'une partie des établissements concernés.
    assert.equal((await patch(DIR_BAR2, { cross_establishment: false })).status, 403);
    assert.equal((await patch(PATRON,   { cross_establishment: 'non' })).status, 400);

    assert.equal((await patch(PATRON, { cross_establishment: false })).status, 200);
    assert.equal(db.collection('settings')._docs.find(d => d.key === 'swaps').cross_establishment, false);

    const read = await (await req('/api/swap-settings', ALICE)).json();
    assert.equal(read.cross_establishment, false, 'le staff lit le réglage pour filtrer son écran');
});

// ── La liste des cibles proposées ────────────────────────────────────────────

const targets = async (user, from, to) =>
    (await (await req('/api/shifts-for-swap?from=' + from + '&to=' + to, user)).json());

const targetsFrom = async (user, from, to, estab) =>
    (await (await req('/api/shifts-for-swap?from=' + from + '&to=' + to + '&establishment_id=' + estab, user)).json());

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

test('réglage coupé : la liste se limite au bar du shift proposé', async () => {
    // Alice travaille dans les deux bars — sans le réglage, les deux lui sont proposés.
    const shifts = [
        shift(SH_ALICE, ALICE_STAFF, 'Alice', day(N1, 1), 'bar1'),
        shift('0123456789abcdef000000a2', ALICE_STAFF, 'Alice', day(N1, 4), 'bar2'),
        shift(SH_BOB, BOB_STAFF, 'Bob', day(N1, 2), 'bar1'),
        shift('0123456789abcdef000000b2', BOB_STAFF, 'Bob', day(N1, 3), 'bar2'),
    ];
    app.locals.setTestDb(seed({ shifts }));
    assert.deepEqual(
        (await targetsFrom(ALICE, N1, day(N1, 6), 'bar1')).map(s => s._id).sort(),
        [SH_BOB, '0123456789abcdef000000b2'].sort(),
        'réglage ouvert : le paramètre ne filtre rien');

    app.locals.setTestDb(seed({ shifts, crossSwaps: false }));
    assert.deepEqual(
        (await targetsFrom(ALICE, N1, day(N1, 6), 'bar1')).map(s => s._id),
        [SH_BOB]);
    assert.deepEqual(
        (await targetsFrom(ALICE, N1, day(N1, 6), 'bar2')).map(s => s._id),
        ['0123456789abcdef000000b2']);
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
