// F-12 — journal d'audit des dispos.
//
// Ce que ce fichier prouve :
//   • chacun des chemins qui MODIFIAIT ou SUPPRIMAIT une dispo sans trace laisse
//     désormais un événement — y compris les trois suppressions silencieuses
//     (purge congé, réouverture pour correction, absence directeur) ;
//   • une re-soumission À L'IDENTIQUE n'écrit RIEN — sans quoi le journal se remplirait
//     de non-événements et deviendrait illisible, donc inutile comme preuve ;
//   • une panne du journal NE CASSE PAS la saisie — auditer est second par rapport à
//     enregistrer ;
//   • la lecture du journal ne contourne pas le périmètre S-04.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { dispoEventDelta } = require('../lib/utils');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req, horizonWeekDates } = require('./helpers/harness');

const STAFF_ID = '0123456789abcdef01234567';
const STAFF    = { _id: '0123456789abcdef0123eeee', staff_id: STAFF_ID, name: 'Bob', role: 'staff' };
const PATRON   = { role: 'patron' };
const W = horizonWeekDates(1);

before(startApp);
after(stopApp);

const postDispos = (dispos, user = STAFF) =>
    req('/api/dispos', user, { method: 'POST', body: JSON.stringify({ dispos }) });
const day = (date, start = 18, end = 24, note = '') =>
    ({ date, type: 'custom', start_time: start, end_time: end, note });

const eventsOf = db => db.collection('dispo_events')._docs;
const disposOf = db => db.collection('availabilities')._docs;

function seed(extra = {}) {
    return makeDb({
        settings: [{ key: 'dispo', open: true, force_open: true, force_open_week: W[0] }],
        availabilities: [],
        dispo_events: [],
        ...extra,
    });
}

// ── Helper pur ───────────────────────────────────────────────────────────────

test('dispoEventDelta : rien de changé → null (le journal reste lisible)', () => {
    const v = { type: 'soir', start_time: 18, end_time: 24, status: 'pending' };
    assert.equal(dispoEventDelta(v, { ...v }), null);
});

test('dispoEventDelta : ne garde QUE les champs modifiés', () => {
    const d = dispoEventDelta(
        { type: 'soir', start_time: 18, end_time: 24, status: 'pending' },
        { type: 'soir', start_time: 20, end_time: 24, status: 'pending' });
    assert.deepEqual(d, { before: { start_time: 18 }, after: { start_time: 20 } });
});

test('dispoEventDelta : ignore le bruit hors périmètre d\'audit', () => {
    // `updated_at` change à chaque écriture : le consigner ferait un événement par clic.
    assert.equal(dispoEventDelta({ status: 'pending', updated_at: 1 },
                                 { status: 'pending', updated_at: 2 }), null);
});

test('dispoEventDelta : "18" et 18 sont la même heure', () => {
    assert.equal(dispoEventDelta({ start_time: 18 }, { start_time: '18' }), null);
});

test('dispoEventDelta : création et suppression passent par le même chemin', () => {
    assert.deepEqual(dispoEventDelta(null, { type: 'soir', status: 'pending' }),
        { before: {}, after: { type: 'soir', status: 'pending' } });
    assert.deepEqual(dispoEventDelta({ type: 'soir', status: 'confirmed' }, null),
        { before: { type: 'soir', status: 'confirmed' }, after: {} });
});

// ── Saisie : submit / update / re-soumission identique ───────────────────────

test('première saisie → un événement `submit`', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    await postDispos([day(W[0])]);
    const ev = eventsOf(db);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].action, 'submit');
    assert.equal(ev[0].staff_id, STAFF_ID);
    assert.equal(ev[0].date, W[0]);
    assert.equal(ev[0].by.name, 'Bob');
    assert.equal(ev[0].after.start_time, 18);
});

test('LE cas : re-soumettre À L\'IDENTIQUE n\'écrit RIEN', async () => {
    // `POST /api/dispos` renvoie la semaine ENTIÈRE à chaque enregistrement. Sans le
    // `null` de `dispoEventDelta`, chaque clic sur « Mettre à jour » ajouterait 7
    // événements « rien n'a changé » — et un journal illisible ne prouve rien.
    const db = seed();
    app.locals.setTestDb(db);
    await postDispos([day(W[0]), day(W[1])]);
    assert.equal(eventsOf(db).length, 2);
    await postDispos([day(W[0]), day(W[1])]);
    assert.equal(eventsOf(db).length, 2, 'aucun événement ajouté');
});

test('modifier une dispo → `update`, avec l\'avant ET l\'après', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    await postDispos([day(W[0], 18, 24)]);
    await postDispos([day(W[0], 20, 26)]);
    const ev = eventsOf(db);
    assert.equal(ev.length, 2);
    assert.equal(ev[1].action, 'update');
    assert.deepEqual(ev[1].before, { start_time: 18, end_time: 24 });
    assert.deepEqual(ev[1].after,  { start_time: 20, end_time: 26 });
});

test('changer SEULEMENT la note est consigné (mais ne libère aucun créneau)', async () => {
    // Distinction volontaire avec `dispoMateriallyDiffers`, qui exclut la note : elle ne
    // dé-planifie personne, mais « j'avais précisé que je finissais tôt » est exactement
    // le genre de phrase qu'un litige oppose.
    const db = seed();
    app.locals.setTestDb(db);
    await postDispos([day(W[0], 18, 24, 'peux finir tôt')]);
    await postDispos([day(W[0], 18, 24, 'finalement non')]);
    const ev = eventsOf(db);
    assert.equal(ev.length, 2);
    assert.deepEqual(ev[1].before, { note: 'peux finir tôt' });
});

test('une dispo VALIDÉE re-soumise à l\'identique consigne le retour en attente', async () => {
    // L'upsert repasse le statut à `pending` : c'est un vrai changement, et c'est
    // précisément ce que le patron contestera (« je l'avais validée »).
    const db = seed();
    app.locals.setTestDb(db);
    db.collection('availabilities')._docs = [{
        staff_id: STAFF_ID, date: W[0], type: 'custom', start_time: 18, end_time: 24,
        note: '', status: 'confirmed', establishment_id: 'bar1',
    }];
    await postDispos([day(W[0], 18, 24)]);
    const ev = eventsOf(db);
    assert.equal(ev.length, 1);
    assert.deepEqual(ev[0].before, { status: 'confirmed' });
    assert.deepEqual(ev[0].after,  { status: 'pending' });
});

// ── Décisions du patron ──────────────────────────────────────────────────────

async function seedOnePending() {
    const db = seed();
    app.locals.setTestDb(db);
    await postDispos([day(W[0])]);
    db.collection('dispo_events')._docs = [];        // repartir du geste patron seul
    return db;
}

test('confirmer → un événement portant le statut ET l\'établissement', async () => {
    const db = await seedOnePending();
    const id = String(disposOf(db)[0]._id);
    const res = await req('/api/dispos/' + id + '/confirm', PATRON, {
        method: 'PATCH', body: JSON.stringify({ establishment_id: 'bar1' }),
    });
    assert.equal(res.status, 200);
    const ev = eventsOf(db);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].action, 'confirm');
    assert.equal(ev[0].by.role, 'patron');
    assert.deepEqual(ev[0].after, { status: 'confirmed', establishment_id: 'bar1' });
});

test('refuser → un événement `reject`', async () => {
    const db = await seedOnePending();
    const id = String(disposOf(db)[0]._id);
    await req('/api/dispos/' + id + '/reject', PATRON, { method: 'PATCH' });
    assert.equal(eventsOf(db)[0].action, 'reject');
});

test('ignorer → un événement `ignore` (la route ne relisait rien avant F-12)', async () => {
    const db = await seedOnePending();
    const id = String(disposOf(db)[0]._id);
    await req('/api/dispos/' + id + '/ignore', PATRON, { method: 'PATCH' });
    const ev = eventsOf(db);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].action, 'ignore');
    assert.deepEqual(ev[0].before, { status: 'pending' });
});

// ── Les trois suppressions qui ne laissaient aucune trace ────────────────────

test('purge congé : la dispo effacée est consignée avant de disparaître', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    await postDispos([day(W[0])]);
    db.collection('dispo_events')._docs = [];
    // Un congé couvre maintenant ce jour : la re-soumission purge la dispo posée.
    db.collection('time_off')._docs = [{
        staff_id: STAFF_ID, status: 'approved', start_date: W[0], end_date: W[0],
    }];
    await postDispos([day(W[0]), day(W[1])]);
    const purge = eventsOf(db).find(e => e.action === 'purge_conge');
    assert.ok(purge, 'la suppression est consignée');
    assert.equal(purge.date, W[0]);
    assert.equal(purge.before.start_time, 18);
    assert.deepEqual(purge.after, {}, 'plus rien après');
});

test('réouverture pour correction : la version effacée est conservée', async () => {
    // C'est LA version qu'un litige réclamera — celle d'avant qu'on demande de refaire.
    const db = seed();
    app.locals.setTestDb(db);
    await postDispos([day(W[0], 18, 24)]);
    db.collection('dispo_events')._docs = [];
    const res = await req('/api/dispos/reopen-for-correction', PATRON, {
        method: 'POST', body: JSON.stringify({ staff_id: STAFF_ID, from: W[0], to: W[6] }),
    });
    assert.equal(res.status, 200);
    const ev = eventsOf(db);
    assert.equal(ev.length, 1);
    assert.equal(ev[0].action, 'reopen');
    assert.equal(ev[0].before.start_time, 18);
});

// ── Robustesse : auditer ne doit jamais casser une saisie ────────────────────

test('journal en panne → la saisie réussit quand même', async () => {
    // Propriété non négociable : si Mongo refuse le journal, le staff doit pouvoir
    // déclarer ses dispos. L'inverse ferait d'une fonctionnalité de traçabilité une
    // panne de production.
    const db = seed();
    db.collection('dispo_events').insertMany = async () => { throw new Error('mongo hs'); };
    app.locals.setTestDb(db);
    const res = await postDispos([day(W[0])]);
    assert.equal(res.status, 201, 'la dispo passe malgré le journal cassé');
    assert.equal(disposOf(db).length, 1, 'et elle est bien enregistrée');
});

// ── Lecture du journal ───────────────────────────────────────────────────────

test('GET /api/dispos/events : borné par dates, ordre chronologique', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    await postDispos([day(W[1]), day(W[0])]);
    const body = await (await req(
        '/api/dispos/events?from=' + W[0] + '&to=' + W[6], PATRON)).json();
    assert.equal(body.length, 2);
    assert.deepEqual(body.map(e => e.date), [W[0], W[1]], 'trié par date');
});

test('GET /api/dispos/events : hors plage, rien', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    await postDispos([day(W[0])]);
    const body = await (await req('/api/dispos/events?from=2020-01-01&to=2020-01-31', PATRON)).json();
    assert.deepEqual(body, []);
});

test('S-04 n\'est pas contourné : le directeur ne lit pas l\'historique d\'un staff hors de ses bars', async () => {
    // Le piège évité : fusionner le `staff_id` demandé avec celui du périmètre aurait
    // laissé l'un écraser l'autre — et n'importe quel historique se lire en le nommant.
    const db = seed({
        staff: [{ _id: STAFF_ID, name: 'Bob', venues: ['bar2'], can_submit_dispos: true }],
        users: [],
    });
    app.locals.setTestDb(db);
    await postDispos([day(W[0])]);
    const DIR = { _id: '0123456789abcdef0123bbbb', role: 'directeur', assigned_establishments: ['bar1'] };
    const res = await req('/api/dispos/events?from=' + W[0] + '&to=' + W[6] + '&staff_id=' + STAFF_ID, DIR);
    assert.equal(res.status, 403);
});

test('le patron, lui, lit l\'historique de n\'importe qui', async () => {
    const db = seed({
        staff: [{ _id: STAFF_ID, name: 'Bob', venues: ['bar2'], can_submit_dispos: true }],
        users: [],
    });
    app.locals.setTestDb(db);
    await postDispos([day(W[0])]);
    const res = await req('/api/dispos/events?from=' + W[0] + '&to=' + W[6] + '&staff_id=' + STAFF_ID, PATRON);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).length, 1);
});

// ── Les deux derniers points d'accrochage ────────────────────────────────────
//
// Ajoutés après vérification : 9 actions étaient instrumentées, 7 seulement sous test.
// `purge_absence` et `template` étaient branchées sans que rien ne le prouve — soit
// exactement le profil des trois tests vacants de F-14, à ceci près qu'ici il n'y avait
// même pas de test à rendre non vacant.

const MGR_STAFF = '0123456789abcdef0123aaaa';
const MGR_USER  = '0123456789abcdef0123bbbb';
const DIRECTEUR = { _id: MGR_USER, staff_id: MGR_STAFF, name: 'Dir Test', role: 'directeur' };

test('déclarer une absence : les dispos purgées sont consignées (`purge_absence`)', async () => {
    // Troisième suppression silencieuse d'avant F-12. La dispo disparaît du planning du
    // directeur sans qu'il ait rien saisi ce jour-là : c'est précisément ce qu'un litige
    // lui reprochera de ne pas pouvoir expliquer.
    const db = makeDb({
        settings: [{ key: 'dispo', open: true, force_open: true, force_open_week: W[0] }],
        users:    [{ _id: MGR_USER, role: 'directeur', staff_id: MGR_STAFF, name: 'Dir Test' }],
        staff:    [{ _id: MGR_STAFF, name: 'Dir Test', venues: [], can_submit_dispos: true }],
        availabilities: [
            { staff_id: MGR_STAFF, staff_name: 'Dir Test', date: W[1], type: 'soir',
              start_time: 16, end_time: 26, status: 'pending' },
        ],
        manager_time_off: [],
        dispo_events: [],
    });
    app.locals.setTestDb(db);
    const res = await req('/api/me/manager-off', DIRECTEUR, {
        method: 'POST', body: JSON.stringify({ start_date: W[0], end_date: W[2] }),
    });
    assert.equal(res.status, 201);
    assert.equal(disposOf(db).length, 0, 'la dispo a bien été purgée');

    const ev = eventsOf(db).filter(e => e.action === 'purge_absence');
    assert.equal(ev.length, 1, 'et la purge est consignée');
    assert.equal(ev[0].date, W[1]);
    assert.equal(ev[0].before.start_time, 16);
    assert.deepEqual(ev[0].after, {}, 'plus rien après');
    assert.equal(ev[0].by.role, 'directeur');
});

test('semaine-type : les dispos pré-remplies sont consignées au nom du MODÈLE', async () => {
    // LE cas où « je n'ai jamais saisi ça » est littéralement vrai : ces dispos partent
    // dans la file du patron sans le moindre geste du directeur ce jour-là. L'acteur
    // consigné doit donc être le système, pas la personne — sinon le journal ment.
    const db = makeDb({
        // Deadline franchie (lundi 00:00) : c'est elle qui déclenche la matérialisation.
        settings: [{ key: 'dispo', open: true, force_open: true, force_open_week: W[0], custom_deadline: '2026-01-05T00:00' }],
        users:    [{ _id: MGR_USER, role: 'directeur', staff_id: MGR_STAFF, name: 'Dir Test' }],
        staff:    [{ _id: MGR_STAFF, name: 'Dir Test', venues: [], can_submit_dispos: true }],
        availabilities: [],
        manager_time_off: [],
        dispo_events: [],
    });
    app.locals.setTestDb(db);
    await req('/api/me/manager-dispo-template', DIRECTEUR, {
        method: 'PUT',
        body: JSON.stringify({ days: { 0: { type: 'soir', start_time: 16, end_time: 26 } } }),
    });
    await app.locals.runManagerTemplateCron();

    assert.equal(disposOf(db).length, 1, 'la semaine-type a bien matérialisé');
    const ev = eventsOf(db).filter(e => e.action === 'template');
    assert.equal(ev.length, 1);
    assert.equal(ev[0].by.role, 'system', 'l\'acteur est le modèle, pas le directeur');
    assert.equal(ev[0].staff_id, MGR_STAFF);
    assert.equal(ev[0].after.start_time, 16);
    assert.deepEqual(ev[0].before, {}, 'création : rien avant');
});

// ── Le journal côté patron : filtre par type ─────────────────────────────────

test('toute action journalisée appartient à une famille de filtre', () => {
    // Le journal du patron regroupe les neuf actions en trois familles
    // (`HISTORY_FAMILIES`, public/script.js) pour ses puces Saisies / Validations /
    // Suppressions. Une action enregistrée par le serveur mais absente de ce mapping
    // resterait visible dans « Tout » et disparaîtrait de TOUS les filtres : un trou
    // muet, qui ne se voit qu'en cliquant la bonne puce sur la bonne semaine. Le
    // couplage est réel (deux fichiers, aucun import possible entre eux), donc il se
    // vérifie ici plutôt qu'à l'œil au moment d'ajouter une dixième action.
    const fs   = require('node:fs');
    const path = require('node:path');
    const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'script.js'), 'utf8');

    const recorded = new Set([...server.matchAll(/recordDispoEvents\(\s*'([a-z_]+)'/g)].map(m => m[1]));
    assert.ok(recorded.size >= 8, 'le relevé des actions serveur ne matche plus — regex à revoir');

    const start = script.indexOf('const HISTORY_FAMILIES');
    const end   = script.indexOf('const HISTORY_FAMILY_OF');
    assert.ok(start > 0 && end > start, 'HISTORY_FAMILIES introuvable dans public/script.js');
    const classified = new Set([...script.slice(start, end).matchAll(/'([a-z_]+)'/g)].map(m => m[1]));

    for (const action of recorded)
        assert.ok(classified.has(action), 'action « ' + action + ' » absente de HISTORY_FAMILIES');
});
