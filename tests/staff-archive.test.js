// F-13 — Archiver un membre du staff : la sortie NON destructive.
//
// Demandé le 2026-08-05, sens confirmé le 2026-08-11 (« en gardant leurs heures »).
// Avant, la seule façon de sortir quelqu'un était `DELETE /api/staff/:id`, qui supprime
// ses shifts — donc son historique de paie. Ces tests tiennent les DEUX moitiés de la
// promesse, parce qu'une seule ne vaut rien :
//   • ce qui doit disparaître  → barre du personnel, file des dispos, nouveaux shifts, accès ;
//   • ce qui doit RESTER       → shifts passés, pointage, récap, masse salariale.
// Un archivage qui oublie la seconde moitié est une suppression déguisée.
//
// Harnais CD-05 : faux `db` en mémoire + session simulée par l'en-tête `x-test-user`.

const { test, before, after } = require('node:test');
const assert  = require('node:assert/strict');
const bcrypt  = require('bcryptjs');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req, baseUrl } = require('./helpers/harness');

const PARTIE   = '0123456789abcdef0123a001'; // celle qu'on archive
const RESTANTE = '0123456789abcdef0123a002'; // celle qui reste en poste
const USER_P   = '0123456789abcdef0123b001';
const PATRON   = { role: 'patron' };
const EQUIPIER = { role: 'staff', _id: USER_P, staff_id: PARTIE };

before(startApp);
after(stopApp);

const HIER    = '2026-08-01';
const DEMAIN  = '2099-01-01'; // volontairement lointain : « à venir » quel que soit le jour

function seed(extra = {}) {
    return makeDb({
        settings: [{ key: 'dispo', open: true }],
        establishments: [{ id: 'bar1', name: 'Le Bar' }],
        users: [
            { _id: USER_P, role: 'staff', active: true, staff_id: PARTIE, name: 'Partie',
              email: 'partie@templyo.test', password_hash: bcrypt.hashSync('motdepasse', 8) },
            { _id: '0123456789abcdef0123b002', role: 'staff', active: true, staff_id: RESTANTE, name: 'Restante' },
        ],
        staff: [
            { _id: PARTIE,   name: 'Partie',   venues: ['bar1'], can_submit_dispos: true },
            { _id: RESTANTE, name: 'Restante', venues: ['bar1'], can_submit_dispos: true },
        ],
        shifts: [
            { _id: 's1', staff_id: PARTIE, staff_name: 'Partie', establishment_id: 'bar1',
              date: HIER, start_time: 18, end_time: 24, real_start: 18, real_end: 24, hourly_rate_snapshot: 12 },
            { _id: 's2', staff_id: PARTIE, staff_name: 'Partie', establishment_id: 'bar1',
              date: DEMAIN, start_time: 18, end_time: 24 },
        ],
        availabilities: [],
        sessions: [
            { sid: 'sess-partie', session: { user: { _id: USER_P } } },
            { sid: 'sess-autre',  session: { user: { _id: 'un-autre-compte' } } },
        ],
        ...extra,
    });
}

const archive = (id, archived, who = PATRON) =>
    req('/api/staff/' + id + '/archive', who, { method: 'PATCH', body: JSON.stringify({ archived }) });

const staffDoc = (db, id) => db.collection('staff')._docs.find(s => String(s._id) === id);

// ── Ce que l'archivage écrit ─────────────────────────────────────────────────

test('archiver pose le drapeau et la date, sans rien supprimer', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    const res = await archive(PARTIE, true);
    assert.equal(res.status, 200);

    const doc = staffDoc(db, PARTIE);
    assert.equal(doc.archived, true);
    assert.ok(doc.archived_at instanceof Date, 'la date d\'archivage sert à retracer une sortie');
    // Le profil est INTACT : c'est ce qui rend la réactivation possible.
    assert.equal(doc.name, 'Partie');
    assert.equal(doc.can_submit_dispos, true);
});

test('réactiver efface le drapeau — l\'archivage n\'est pas un aller simple', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    await archive(PARTIE, true);
    const res = await archive(PARTIE, false);
    assert.equal(res.status, 200);

    const doc = staffDoc(db, PARTIE);
    assert.ok(!doc.archived, 'le champ doit disparaître, pas valoir false');
    assert.ok(!doc.archived_at);
});

test('archiver coupe les sessions du compte lié, et seulement les siennes', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    await archive(PARTIE, true);

    const sids = db.collection('sessions')._docs.map(s => s.sid);
    assert.deepEqual(sids, ['sess-autre'],
        'sans ça la personne archivée garde son accès jusqu\'à 30 jours (le trou de R-17)');
});

test('archiver signale les créneaux à venir laissés en place', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    const res  = await archive(PARTIE, true);
    const body = await res.json();
    // Décision du 2026-08-11 : on ne troue pas un planning déjà annoncé. Mais le patron
    // doit savoir ce qui reste, sinon il découvre le créneau des semaines plus tard.
    assert.equal(body.upcoming_shifts, 1);
    assert.equal(db.collection('shifts')._docs.length, 2, 'aucun shift supprimé');
});

// ── Ce qui doit RESTER : l'historique ────────────────────────────────────────

test('l\'historique survit intégralement à l\'archivage', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    await archive(PARTIE, true);

    const passe = db.collection('shifts')._docs.find(s => s.date === HIER);
    assert.ok(passe, 'le shift passé doit exister');
    assert.equal(passe.real_start, 18, 'le pointage est conservé');
    assert.equal(passe.hourly_rate_snapshot, 12, 'le taux figé — donc la paie — est conservé');
});

test('un staff archivé reste renvoyé par /api/staff, avec son drapeau', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    await archive(PARTIE, true);

    // Le filtrer ici effacerait son nom des récaps et des plannings déjà édités.
    for (const who of [PATRON, EQUIPIER]) {
        const list = await (await req('/api/staff', who)).json();
        const doc  = list.find(s => String(s._id) === PARTIE);
        assert.ok(doc, 'rôle ' + who.role + ' : l\'archivé doit rester visible de l\'API');
        assert.equal(doc.archived, true, 'rôle ' + who.role + ' : le drapeau doit être exposé');
    }
});

// ── Ce qui doit DISPARAÎTRE : la vie courante ────────────────────────────────

test('un archivé sort de la liste « sans dispo »', async () => {
    const db = seed();
    app.locals.setTestDb(db);

    const avant = await (await req('/api/dispos/sans-dispo?from=2026-08-10&to=2026-08-16', PATRON)).json();
    assert.deepEqual(avant.map(s => s.name).sort(), ['Partie', 'Restante']);

    await archive(PARTIE, true);
    const apres = await (await req('/api/dispos/sans-dispo?from=2026-08-10&to=2026-08-16', PATRON)).json();
    assert.deepEqual(apres.map(s => s.name), ['Restante'],
        'relancer les gens partis est le symptôme le plus visible d\'un archivage raté');
});

test('on ne peut plus planifier un archivé', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    await archive(PARTIE, true);

    const res = await req('/api/shifts', PATRON, {
        method: 'POST',
        body: JSON.stringify({ staff_id: PARTIE, staff_name: 'Partie', establishment_id: 'bar1',
                               date: DEMAIN, start_time: 18, end_time: 24 }),
    });
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /archiv/i);
    assert.equal(db.collection('shifts')._docs.length, 2, 'aucun shift créé');
});

test('planifier quelqu\'un d\'actif marche toujours', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    await archive(PARTIE, true);

    const res = await req('/api/shifts', PATRON, {
        method: 'POST',
        body: JSON.stringify({ staff_id: RESTANTE, staff_name: 'Restante', establishment_id: 'bar1',
                               date: DEMAIN, start_time: 18, end_time: 24 }),
    });
    assert.equal(res.status, 201, 'le garde-fou ne doit pas déborder sur les autres');
    assert.equal(db.collection('shifts')._docs.length, 3);
});

// ── L'accès ──────────────────────────────────────────────────────────────────
//
// Le login ne consultait AUCUN drapeau avant F-13 : `users.active` signifie « invitation
// en attente », pas « désactivé ». Couper un accès imposait de supprimer le compte.
// Ces deux tests passent par la vraie route (pas d'en-tête `x-test-user`), donc par bcrypt.

const login = (body) => fetch(baseUrl() + '/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

test('un profil archivé ferme la connexion', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    await archive(PARTIE, true);

    const res = await login({ email: 'partie@templyo.test', password: 'motdepasse' });
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /désactivé/i);
});

test('le même compte non archivé se connecte normalement', async () => {
    const db = seed();
    app.locals.setTestDb(db);

    const res = await login({ email: 'partie@templyo.test', password: 'motdepasse' });
    assert.equal(res.status, 200, 'sinon le garde-fou casse la connexion de tout le monde');
});

// ── Validation ───────────────────────────────────────────────────────────────

test('la route refuse un corps sans booléen, un id invalide, un inconnu', async () => {
    const db = seed();
    app.locals.setTestDb(db);

    assert.equal((await req('/api/staff/' + PARTIE + '/archive', PATRON,
        { method: 'PATCH', body: JSON.stringify({ archived: 'oui' }) })).status, 400);
    assert.equal((await archive('pas-un-id', true)).status, 400);
    assert.equal((await archive('0123456789abcdef0123ffff', true)).status, 404);
});

test('un équipier ne peut pas archiver ses collègues', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    const res = await archive(RESTANTE, true, EQUIPIER);
    assert.ok(res.status === 403 || res.status === 401, 'obtenu ' + res.status);
    assert.ok(!staffDoc(db, RESTANTE).archived);
});
