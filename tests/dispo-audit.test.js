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
const shiftsOf = db => db.collection('shifts')._docs;

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
    // Le VOCABULAIRE des actions est `HISTORY_ACTIONS` (un libellé par action). On part
    // de lui et non des appels serveur : ces appels changent de forme au gré des
    // refontes — l'extraction de `purgeDisposAvecTrace` le 2026-08-23 a fait passer trois
    // actions d'un littéral en argument direct à un paramètre, et une regex sur
    // `recordDispoEvents(` cessait de les voir. Le vocabulaire, lui, est stable.
    const fs   = require('node:fs');
    const path = require('node:path');
    const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'script.js'), 'utf8');
    const bloc   = (from, to) => {
        const start = script.indexOf(from), end = script.indexOf(to);
        assert.ok(start > 0 && end > start, from + ' introuvable dans public/script.js');
        return script.slice(start, end);
    };
    const vocabulaire = [...bloc('const HISTORY_ACTIONS', 'const HISTORY_FAMILIES')
        .matchAll(/^\s{4}([a-z_]+):/gm)].map(m => m[1]);
    assert.ok(vocabulaire.length >= 9, 'le relevé de HISTORY_ACTIONS ne matche plus');

    const classees = new Set([...bloc('const HISTORY_FAMILIES', 'const HISTORY_FAMILY_OF')
        .matchAll(/'([a-z_]+)'/g)].map(m => m[1]));
    for (const action of vocabulaire)
        assert.ok(classees.has(action), 'action « ' + action + ' » absente de HISTORY_FAMILIES');

    // Et l'autre moitié du couplage : une action écrite par le serveur mais absente du
    // vocabulaire s'afficherait sous son nom technique (`purge_conge`) dans le journal.
    // Les deux seuls écrivains du journal : l'appel direct, et le helper de purge qui
    // reçoit l'action en 3ᵉ argument. Le `[^;]*?` non gourmand s'arrête sur le premier
    // littéral de la liste d'arguments — les autres arguments (filtres de dates, `req`)
    // n'en contiennent aucun. Un compte plancher fait échouer ce test si une refonte
    // rend les actions invisibles à ce relevé, au lieu de le laisser passer à vide.
    const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const ecrites = new Set([
        ...[...server.matchAll(/recordDispoEvents\(\s*'([a-z_]+)'/g)].map(m => m[1]),
        // Le lookbehind écarte la DÉCLARATION du helper : son corps contient
        // `'week_note'`, qui n'est pas une action mais le type qu'elle refuse d'effacer.
        ...[...server.matchAll(/(?<!function )purgeDisposAvecTrace\([^;]*?'([a-z_]+)'/g)].map(m => m[1]),
    ]);
    assert.ok(ecrites.size >= 8, 'le relevé des actions écrites par le serveur ne matche plus');
    const connues = new Set(vocabulaire);
    for (const action of ecrites)
        assert.ok(connues.has(action), 'action « ' + action + ' » écrite par le serveur mais absente de HISTORY_ACTIONS');
});

// ── Le congé APPROUVÉ nettoie les dispos (le trou du 2026-08-23) ─────────────
//
// `purge_conge` existait, mais sur une seule porte : il ne se déclenchait que si la
// personne RENVOYAIT ses dispos après que son congé a été validé. Valider un congé ne
// touchait donc rien, et elle restait « disponible » sur des jours où on venait de
// l'autoriser à ne pas venir — ses dispos continuant de remonter dans la file.

const CONGE_ID = 'dddddddddddddddddddddddd';

// Passe par `seed` : le document `settings` y est écrit UNE fois. Le redéclarer ici
// laisserait ces tests tourner contre un état de réglages périmé le jour où il évolue —
// verts pour la mauvaise raison.
const seedConge = (extra = {}) => seed({
    time_off: [{
        _id: CONGE_ID, staff_id: STAFF_ID, staff_name: 'Bob',
        start_date: W[1], end_date: W[3], status: 'pending',
    }],
    availabilities: [
        { staff_id: STAFF_ID, staff_name: 'Bob', date: W[0], type: 'custom', start_time: 18, end_time: 24, status: 'pending' },
        { staff_id: STAFF_ID, staff_name: 'Bob', date: W[2], type: 'custom', start_time: 18, end_time: 24, status: 'confirmed' },
    ],
    ...extra,
});

const decide     = (decision) => req('/api/conges/' + CONGE_ID + '/decision', PATRON,
    { method: 'PATCH', body: JSON.stringify({ decision }) });
const decideJson = (decision) => decide(decision).then(r => r.json());

test('congé approuvé : les dispos de la période sont retirées, les autres restent', async () => {
    const db = seedConge();
    app.locals.setTestDb(db);
    const res = await decide('approved');
    assert.equal(res.status, 200);
    // W[2] est dans le congé (W[1]→W[3]), W[0] est en dehors.
    assert.deepEqual(disposOf(db).map(d => d.date), [W[0]], 'seul le jour hors congé survit');
    assert.match((await res.json()).message, /dispo\(s\) retirée/);
});

test('congé approuvé : la suppression laisse une trace `purge_conge`', async () => {
    // Sans trace, « je n'ai jamais retiré cette dispo » est indémontrable — et c'est
    // l'application qui l'a retirée, pas la personne.
    const db = seedConge();
    app.locals.setTestDb(db);
    await decide('approved');
    const ev = eventsOf(db).filter(e => e.action === 'purge_conge');
    assert.equal(ev.length, 1);
    assert.equal(ev[0].date, W[2]);
    assert.deepEqual(ev[0].after, {}, 'une suppression : rien après (convention du journal)');
    assert.equal(ev[0].before.status, 'confirmed', 'et on sait ce qu\'elle valait');
});

test('congé REFUSÉ : rien n\'est touché', async () => {
    // Le test à dents du lot : sans la garde sur `decision`, refuser purgerait aussi.
    const db = seedConge();
    app.locals.setTestDb(db);
    await decide('rejected');
    assert.equal(disposOf(db).length, 2, 'les deux dispos sont intactes');
    assert.equal(eventsOf(db).length, 0);
});

test('congé approuvé : les créneaux déjà planifiés sont COMPTÉS, pas retirés', async () => {
    // Règle de l'archivage : ne jamais trouer un planning que l'équipe a déjà reçu. Le
    // patron décide d'un congé, pas de qui remplace — c'est une décision distincte.
    const db = seedConge({
        shifts: [{ _id: 'eeeeeeeeeeeeeeeeeeeeeeee', staff_id: STAFF_ID, staff_name: 'Bob',
                   establishment_id: 'bar1', date: W[2], start_time: 18, end_time: 24 }],
    });
    app.locals.setTestDb(db);
    const body = await decideJson('approved');
    assert.equal(shiftsOf(db).length, 1, 'le créneau est toujours là');
    assert.equal(shiftsOf(db)[0].staff_id, STAFF_ID, 'et toujours au même nom');
    assert.equal(body.planned_shifts, 1);
    assert.match(body.message, /à réattribuer/, 'le patron l\'apprend au moment où il décide');
});

test('congé approuvé sans dispo ni créneau : message sobre, aucun bruit', async () => {
    const db = seedConge({ availabilities: [] });
    app.locals.setTestDb(db);
    const body = await decideJson('approved');
    assert.equal(body.message, 'Congé validé');
    assert.equal(body.purged_dispos, 0);
    assert.equal(body.planned_shifts, 0);
});

test('congé déclaré en mode `info` : il NAÎT approuvé, donc il purge aussi', async () => {
    // Le trou d'altitude : accrocher le nettoyage au bouton « Valider » laissait ce
    // chemin-ci ouvert. `POST /api/conges` en mode `info` insère directement en
    // `approved` — c'est une déclaration, pas une demande, et elle est opposable tout de
    // suite. Ce test échoue si le nettoyage retourne vivre dans la route de décision.
    const db = seed({
        time_off: [],
        staff: [{ _id: STAFF_ID, name: 'Bob', conge_mode: 'info' }],
        availabilities: [
            { staff_id: STAFF_ID, staff_name: 'Bob', date: W[2], type: 'custom', start_time: 18, end_time: 24, status: 'confirmed' },
            { staff_id: STAFF_ID, staff_name: 'Bob', date: W[5], type: 'custom', start_time: 18, end_time: 24, status: 'pending' },
        ],
    });
    app.locals.setTestDb(db);
    const res = await req('/api/conges', STAFF, {
        method: 'POST',
        body: JSON.stringify({ start_date: W[1], end_date: W[3], mode: 'info', reason: 'Mariage' }),
    });
    assert.equal(res.status, 201);
    assert.deepEqual(disposOf(db).map(d => d.date), [W[5]], 'seule la dispo hors période survit');
    assert.equal(eventsOf(db).filter(e => e.action === 'purge_conge').length, 1, 'et la trace est là');
});

// ── Le flux du runner reste propre ───────────────────────────────────────────

test('les fonctions d\'envoi n\'écrivent pas sur stdout', () => {
    // `node --test` PARSE le stdout de chaque worker pour en recevoir les résultats. Une
    // ligne applicative qui y tombe peut couper une trame en deux, et le runner abandonne
    // le fichier ENTIER — sans qu'une seule assertion n'échoue, et avec un décompte de
    // tests qui baisse en silence. C'est arrivé en août (48bd333, CI rouge 3 jours), puis
    // le 2026-08-23 : `sendSMS` et `sendPushToStaff` avaient gardé cinq `console.log`, et
    // cinq tests de congé de plus — chacun déclenchant un push — ont suffi à refaire
    // tomber ce fichier-ci sur Node 20 ET 22.
    //
    // Ces deux fonctions sont visées parce qu'elles sont sur le chemin d'une REQUÊTE et
    // journalisent une ligne par envoi : c'est le profil qui met en danger le flux. Les
    // logs de démarrage et de cron ne tournent pas pendant les tests, et `console.error` /
    // `console.warn` partent sur stderr, que le runner ne parse pas.
    const fs     = require('node:fs');
    const path   = require('node:path');
    const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const debut  = server.indexOf('async function sendSMS(');
    const fin    = server.indexOf('async function notifyPatrons(');
    assert.ok(debut > 0 && fin > debut, 'bornes des fonctions d\'envoi introuvables');
    const bloc = server.slice(debut, fin);
    assert.ok(!/console\.log\(/.test(bloc),
        'un console.log a été ajouté dans sendSMS/sendPushToStaff — utiliser `logInfo`, ' +
        'sinon il écrit sur le flux que le runner de tests parse');
});
