// E-22 (corrigé le 2026-08-04) — le directeur passe par le pipeline `availabilities`
// STANDARD : ses dispos sont validées par le patron, sa semaine-type ne fait que
// pré-remplir. Ces tests couvrent ce que les helpers purs ne peuvent pas atteindre :
//   • la jointure `manager_time_off` dans le filtre congés de POST /api/dispos ;
//   • le pré-remplissage EN CRÉATION SEULE (le régresser = revenir au bug où le cron
//     réécrivait la semaine et annulait les corrections du patron) ;
//   • la purge des dispos quand une absence est déclarée ;
//   • le repère « Directeur » dans la file de validation du patron.
// Harnais CD-05 : faux `db` en mémoire (app.locals.setTestDb) + session simulée par
// l'en-tête `x-test-user`. Aucun Mongo, aucune dépendance.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { disposWeekStart, toDateStr } = require('../lib/utils');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req, horizonWeekDates } = require('./helpers/harness');

// B2 — la semaine en cours de collecte. `POST /api/dispos` et la pastille sont désormais
// bornés sur l'horizon : une date fictive (`2099-…`) tombe hors plage. Utiliser la vraie
// semaine rend d'ailleurs les tests de deadline PLUS forts — la règle A ne protège que
// cette semaine-là, donc c'est bien elle qu'il faut viser pour prouver le refus.
const W = horizonWeekDates(1);

const MGR_STAFF   = '0123456789abcdef0123aaaa';
const MGR_USER    = '0123456789abcdef0123bbbb';
const STAFF_ID    = '0123456789abcdef0123cccc';
const DIRECTEUR   = { _id: MGR_USER, staff_id: MGR_STAFF, name: 'Dir Test', role: 'directeur' };
const PATRON      = { role: 'patron' };

// Le serveur matérialise TOUJOURS sur le lundi de la semaine suivante : on le
// recalcule ici avec le même helper plutôt que de figer une date (sinon le test
// pourrirait au fil du temps).
const NEXT_MONDAY = toDateStr(disposWeekStart(new Date()));
const dayOf = i => toDateStr(new Date(new Date(NEXT_MONDAY + 'T12:00:00').getTime() + i * 864e5));

// Semaine-type : lundi (0) + mercredi (2).
const TEMPLATE_DAYS = {
    0: { type: 'soir', start_time: 16, end_time: 26 },
    2: { type: 'midi', start_time: 10, end_time: 17 },
};

before(startApp);
after(stopApp);

const putTemplate = (days = TEMPLATE_DAYS) =>
    req('/api/me/manager-dispo-template', DIRECTEUR, { method: 'PUT', body: JSON.stringify({ days }) });

// Depuis le 2026-08-10, la semaine-type n'est plus matérialisée par le PUT ni par le
// cron de 10h : elle part au DÉCLENCHEMENT DE LA DEADLINE. Les tests la déclenchent donc
// à la main, via la poignée exposée sous la double garde du harnais.
const runCron = () => app.locals.runDispoTemplateCron();

// `custom_deadline` est un PATRON récurrent (jour de semaine + heure), jamais une date
// absolue : viser un LUNDI 00:00 rend la deadline « déjà franchie » quel que soit le jour
// où la suite tourne. Sans ça le résultat dépendrait du jour de la semaine — vert le
// samedi, rouge le mardi. Le cas « avant la deadline » est couvert à l'unité, sur dates
// gelées (`shouldMaterializeTemplate` dans utils.test.js) : aucune deadline effective ne
// peut être garantie dans le futur ici, elle tombe toujours dans la semaine courante.
const DEADLINE_FRANCHIE = '2026-01-05T00:00';   // 5 janvier 2026 = un lundi

// Base minimale : le directeur, son profil staff, la saisie ouverte.
function seed(extra = {}) {
    return makeDb({
        settings:       [{ key: 'dispo', open: true, force_open: true, custom_deadline: DEADLINE_FRANCHIE }],
        users:          [{ _id: MGR_USER, role: 'directeur', staff_id: MGR_STAFF, name: 'Dir Test' }],
        staff:          [{ _id: MGR_STAFF, name: 'Dir Test', venues: [], can_submit_dispos: true }],
        availabilities: [],
        manager_time_off: [],
        ...extra,
    });
}

const disposOf = db => db.collection('availabilities')._docs;
const staffOf  = db => db.collection('staff')._docs;
const usersOf  = db => db.collection('users')._docs;

// ── Semaine-type : pré-remplissage en CRÉATION SEULE ──────────────────────────

// LA règle du 2026-08-10 : enregistrer son modèle n'envoie RIEN. Auparavant, un
// directeur qui sauvegardait sa semaine-type un lundi expédiait aussitôt 7 dispos dans
// la file du patron — quatre jours avant la deadline.
test('semaine-type : l\'enregistrer n\'envoie AUCUNE dispo', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    const res = await putTemplate();
    assert.equal(res.status, 200);
    assert.equal(disposOf(db).length, 0, 'rien ne part avant la deadline');
    // Le modèle, lui, est bien mémorisé — c'est tout ce que fait la route.
    assert.deepEqual(db.collection('manager_dispo_templates')._docs[0].days, TEMPLATE_DAYS);
});

test('semaine-type : matérialisée au déclenchement de la deadline, en `pending`', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    await putTemplate();
    await runCron();

    const saved = disposOf(db);
    assert.deepEqual(saved.map(d => d.date).sort(), [dayOf(0), dayOf(2)]);
    assert.ok(saved.every(d => d.status === 'pending'), 'les dispos partent en attente de validation patron');
    assert.ok(saved.every(d => d.staff_id === MGR_STAFF));
    // Aucun shift créé : une dispo n'est pas un créneau planifié.
    assert.equal(db.collection('shifts')._docs.length, 0);
});

test('semaine-type : un jour ayant DÉJÀ une dispo n\'est jamais écrasé', async () => {
    // Le lundi porte une dispo déjà validée par le patron, avec d'autres horaires.
    // C'est la moitié du nouveau modèle : la semaine-type est ce qui part À MA PLACE
    // si je n'ai rien envoyé — une saisie de la semaine gagne toujours.
    const existing = {
        staff_id: MGR_STAFF, date: dayOf(0), type: 'custom',
        start_time: 20, end_time: 25, status: 'confirmed',
    };
    const db = seed({ availabilities: [existing] });
    app.locals.setTestDb(db);
    await putTemplate();
    await runCron();

    const saved = disposOf(db);
    assert.equal(saved.length, 2, 'le lundi n\'est pas dupliqué');
    const monday = saved.find(d => d.date === dayOf(0));
    assert.equal(monday.status, 'confirmed', 'la validation du patron survit');
    assert.equal(monday.start_time, 20, 'les horaires du patron survivent');
    assert.ok(saved.some(d => d.date === dayOf(2)), 'le jour vide est bien comblé');
});

test('semaine-type : idempotente — deux passages ne créent rien de plus', async () => {
    // Le vérificateur repasse tous les quarts d'heure du vendredi 13h au dimanche soir.
    const db = seed();
    app.locals.setTestDb(db);
    await putTemplate();
    await runCron();
    await runCron();
    assert.equal(disposOf(db).length, 2);
});

test('semaine-type : le marqueur borne à UN passage par semaine cible', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    await putTemplate();
    await runCron();
    assert.equal(db.collection('manager_dispo_templates')._docs[0].last_materialized_week, NEXT_MONDAY);

    // Le directeur retire un jour après coup : le passage suivant ne doit pas le
    // ressusciter. Sans le marqueur, la « création seule » le recréerait aussitôt.
    db.collection('availabilities')._docs = disposOf(db).filter(d => d.date !== dayOf(2));
    await runCron();
    assert.deepEqual(disposOf(db).map(d => d.date), [dayOf(0)], 'le jour retiré reste retiré');
});

test('semaine-type : saute un jour couvert par une absence déclarée (E-19)', async () => {
    const db = seed({
        manager_time_off: [{ user_id: MGR_USER, start_date: dayOf(2), end_date: dayOf(2) }],
    });
    app.locals.setTestDb(db);
    await putTemplate();
    await runCron();
    assert.deepEqual(disposOf(db).map(d => d.date), [dayOf(0)]);
});

// ── POST /api/dispos : la jointure manager_time_off ───────────────────────────

test('POST /api/dispos : une absence directeur ignore le jour, comme un congé staff', async () => {
    const db = seed({
        manager_time_off: [{ user_id: MGR_USER, start_date: W[1], end_date: W[1] }],
    });
    app.locals.setTestDb(db);
    const res = await req('/api/dispos', DIRECTEUR, {
        method: 'POST',
        body: JSON.stringify({ dispos: [
            { date: W[0], type: 'custom', start_time: 18, end_time: 24 },
            { date: W[1], type: 'custom', start_time: 18, end_time: 24 }, // absence
            { date: W[2], type: 'custom', start_time: 18, end_time: 24 },
        ] }),
    });
    assert.equal(res.status, 201);
    assert.match((await res.json()).message, /congé ignoré/);
    assert.deepEqual(disposOf(db).map(d => d.date).sort(), [W[0], W[2]]);
});

// ── Déclarer une absence purge les dispos de la période ───────────────────────

test('POST /api/me/manager-off : purge les dispos posées sur la période, pas les shifts', async () => {
    const db = seed({
        availabilities: [
            { staff_id: MGR_STAFF, date: '2099-03-02', type: 'soir', status: 'pending' },
            { staff_id: MGR_STAFF, date: '2099-03-09', type: 'soir', status: 'pending' }, // hors période
        ],
        shifts: [{ staff_id: MGR_STAFF, date: '2099-03-02', establishment_id: 'bar1' }],
    });
    app.locals.setTestDb(db);
    const res = await req('/api/me/manager-off', DIRECTEUR, {
        method: 'POST',
        body: JSON.stringify({ start_date: '2099-03-01', end_date: '2099-03-03' }),
    });
    assert.equal(res.status, 201);
    assert.deepEqual(disposOf(db).map(d => d.date), ['2099-03-09']);
    // Le planning reste la décision du patron : son shift n'est pas touché.
    assert.equal(db.collection('shifts')._docs.length, 1);
});

// ── File de validation du patron : même onglet, repère « Directeur » ──────────

test('GET /api/dispos/pending : les dispos directeur et staff sont dans la même file', async () => {
    const db = seed({
        users: [
            { _id: MGR_USER, role: 'directeur', staff_id: MGR_STAFF, name: 'Dir Test' },
            { _id: 'u-staff', role: 'staff', staff_id: STAFF_ID, name: 'Bob' },
        ],
        availabilities: [
            { staff_id: MGR_STAFF, date: '2099-01-05', status: 'pending', start_time: 18, end_time: 24 },
            { staff_id: STAFF_ID,  date: '2099-01-05', status: 'pending', start_time: 18, end_time: 24 },
            { staff_id: STAFF_ID,  date: '2099-01-06', status: 'confirmed', start_time: 18, end_time: 24 },
        ],
    });
    app.locals.setTestDb(db);
    const res = await req('/api/dispos/pending?from=2099-01-01&to=2099-01-31', PATRON);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.length, 2, 'seules les `pending`, directeur ET staff mélangés');
    assert.equal(body.find(d => d.staff_id === MGR_STAFF).is_directeur, true);
    assert.equal(body.find(d => d.staff_id === STAFF_ID).is_directeur, undefined);
});

// ── S-04 : périmètre de la file de validation ─────────────────────────────────
// Une dispo en attente n'a pas d'établissement (modèle E-22) : le rattachement passe
// par les `venues` du staff qui l'envoie. Bascule `scope=all` pour tout voir.

const DIR_BAR1 = { _id: MGR_USER, staff_id: MGR_STAFF, name: 'Dir Test', role: 'directeur',
                   assigned_establishments: ['bar1'] };

// Deux staff : un dans le bar du directeur, un ailleurs. Plus le directeur lui-même.
function seedPendingAcrossBars() {
    return seed({
        staff: [
            { _id: MGR_STAFF, name: 'Dir Test', venues: ['bar1'], can_submit_dispos: true },
            { _id: STAFF_ID,  name: 'Bob',      venues: ['bar1'], can_submit_dispos: true },
            { _id: '0123456789abcdef0123ffff', name: 'Zoé', venues: ['bar2'], can_submit_dispos: true },
        ],
        availabilities: [
            { staff_id: STAFF_ID, date: W[0], status: 'pending', start_time: 18, end_time: 24 },
            { staff_id: '0123456789abcdef0123ffff', date: W[0], status: 'pending', start_time: 18, end_time: 24 },
        ],
    });
}

const PENDING = '/api/dispos/pending?from=' + W[0] + '&to=' + W[6];

test('S-04 : le directeur ne voit que les dispos du staff de ses bars', async () => {
    app.locals.setTestDb(seedPendingAcrossBars());
    const body = await (await req(PENDING, DIR_BAR1)).json();
    assert.deepEqual(body.map(d => d.staff_id), [STAFF_ID], 'Zoé (bar2) est hors périmètre');
});

test('S-04 : la bascule scope=all lui rend la file complète', async () => {
    app.locals.setTestDb(seedPendingAcrossBars());
    const body = await (await req(PENDING + '&scope=all', DIR_BAR1)).json();
    assert.equal(body.length, 2, 'ce n\'est pas un cloisonnement — la bascule est ouverte');
});

test('S-04 : le patron n\'est jamais filtré', async () => {
    app.locals.setTestDb(seedPendingAcrossBars());
    assert.equal((await (await req(PENDING, PATRON)).json()).length, 2);
});

test('S-04 : un directeur sans bar assigné ne voit rien par défaut', async () => {
    // Cohérent avec canAccessEstablishment, où `assigned_establishments: []` vaut
    // « aucun accès » — et non « tous les accès ».
    app.locals.setTestDb(seedPendingAcrossBars());
    const nomad = { ...DIR_BAR1, assigned_establishments: [] };
    assert.equal((await (await req(PENDING, nomad)).json()).length, 0);
    assert.equal((await (await req(PENDING + '&scope=all', nomad)).json()).length, 2);
});

test('S-04 : la pastille compte le même périmètre que la file', async () => {
    // Sinon elle annonce 2 en attente et la liste n'en montre qu'une.
    app.locals.setTestDb(seedPendingAcrossBars());
    assert.equal((await (await req('/api/dispos/count', DIR_BAR1)).json()).count, 1);
    assert.equal((await (await req('/api/dispos/count?scope=all', DIR_BAR1)).json()).count, 2);
    assert.equal((await (await req('/api/dispos/count', PATRON)).json()).count, 2);
});

// ── Exemption de deadline (câblage ; le POURQUOI est sur `dispoDeadlineWaived`) ─
//
// Deadline garantie passée quelle que soit la date d'exécution : cible = LUNDI 00:00.
// computeEffectiveDeadline ramène toujours la deadline dans la semaine courante ;
// un lundi minuit est donc soit aujourd'hui à 0h (déjà passé), soit un jour révolu.
const PAST_DEADLINE = '2026-01-05T00:00'; // 5 janvier 2026 = un lundi
const closedSettings = { key: 'dispo', open: true, force_open: false, custom_deadline: PAST_DEADLINE };
const STAFF_USER = { _id: '0123456789abcdef0123eeee', staff_id: STAFF_ID, name: 'Bob', role: 'staff' };

const postOneDispo = user => req('/api/dispos', user, {
    method: 'POST',
    body: JSON.stringify({ dispos: [{ date: W[0], type: 'custom', start_time: 18, end_time: 24 }] }),
});

test('deadline passée : le directeur peut quand même envoyer ses dispos', async () => {
    const db = seed({ settings: [closedSettings] });
    app.locals.setTestDb(db);
    const res = await postOneDispo(DIRECTEUR);
    assert.equal(res.status, 201, 'le directeur n\'est pas bloqué par la deadline');
    assert.deepEqual(disposOf(db).map(d => d.date), [W[0]]);
});

test('deadline passée : le staff ordinaire reste bloqué', async () => {
    // Garde-fou : l'exemption est une exception de RÔLE, pas un trou dans la deadline.
    const db = seed({
        settings: [closedSettings],
        staff: [{ _id: STAFF_ID, name: 'Bob', venues: [], can_submit_dispos: true }],
    });
    app.locals.setTestDb(db);
    const res = await postOneDispo(STAFF_USER);
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /deadline/i);
    assert.equal(disposOf(db).length, 0);
});

test('GET /api/dispo-settings : le client voit la même règle que le serveur', async () => {
    const db = seed({
        settings: [closedSettings],
        staff: [
            { _id: MGR_STAFF, name: 'Dir Test', venues: [], can_submit_dispos: true },
            { _id: STAFF_ID,  name: 'Bob',      venues: [], can_submit_dispos: true },
        ],
    });
    app.locals.setTestDb(db);

    const dir = await (await req('/api/dispo-settings', DIRECTEUR)).json();
    assert.equal(dir.deadlinePassed, true, 'la deadline EST passée — on ne la maquille pas');
    assert.equal(dir.deadlineWaived, true);
    assert.equal(dir.canSubmit, true, 'le formulaire doit rester ouvert au directeur');

    const bob = await (await req('/api/dispo-settings', STAFF_USER)).json();
    assert.equal(bob.deadlineWaived, false);
    assert.equal(bob.canSubmit, false, 'sinon le staff voit un formulaire que le serveur refusera');
});

// ── R-06 : `users.assigned_establishments` ↔ `staff.venues` ───────────────────

test('R-06 : réaffecter un directeur recale ses `staff.venues`', async () => {
    const db = seed({
        staff: [{ _id: MGR_STAFF, name: 'Dir Test', venues: ['bar1'], can_submit_dispos: true }],
    });
    app.locals.setTestDb(db);
    const res = await req('/api/users/' + MGR_USER + '/establishments', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ assigned_establishments: ['bar2', 'bar3'] }),
    });
    assert.equal(res.status, 200);
    const staffDoc = staffOf(db).find(s => String(s._id) === MGR_STAFF);
    assert.deepEqual(staffDoc.venues, ['bar2', 'bar3'],
        'sans ça le directeur garde bar1 et perd la saisie des dispos sur ses vrais bars');
});

test('R-06 : promouvoir un compte sans profil staff en directeur en crée un', async () => {
    const OBS = '0123456789abcdef0123dddd';
    const db = seed({
        users: [{ _id: OBS, role: 'observateur', name: 'Chloé', email: 'c@x.fr' }],
        staff: [],
    });
    app.locals.setTestDb(db);
    const res = await req('/api/users/' + OBS + '/role', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ role: 'directeur', assigned_establishments: ['bar1'] }),
    });
    assert.equal(res.status, 200);

    const staffDocs = staffOf(db);
    assert.equal(staffDocs.length, 1, 'un profil staff est créé, sinon POST /api/dispos répond 400 à vie');
    assert.deepEqual(staffDocs[0].venues, ['bar1']);
    assert.equal(staffDocs[0].name, 'Chloé');
    const user = usersOf(db).find(u => String(u._id) === OBS);
    assert.equal(String(user.staff_id), String(staffDocs[0]._id), 'le lien user → staff est posé');
});

test('R-06 : rétrograder un directeur ne détruit pas son profil staff', async () => {
    // Son historique (shifts passés, heures, taux) vit sur le profil staff.
    const db = seed({
        staff: [{ _id: MGR_STAFF, name: 'Dir Test', venues: ['bar1'], can_submit_dispos: true }],
    });
    app.locals.setTestDb(db);
    const res = await req('/api/users/' + MGR_USER + '/role', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ role: 'staff' }),
    });
    assert.equal(res.status, 200);
    assert.equal(staffOf(db).length, 1);
    assert.deepEqual(staffOf(db)[0].venues, ['bar1']);
});

// ── R-05 / R-12 : profil staff du directeur — réutilisé, jamais dupliqué ──────

const inviteDir = (body) => req('/api/users', PATRON, { method: 'POST', body: JSON.stringify(body) });

test('R-05 : promouvoir un staff EXISTANT en directeur réutilise SON profil', async () => {
    // Le cœur du bug : le staff_id fourni était ignoré et un 2e profil créé, laissant
    // le taux horaire, les rôles et tout l'historique sur l'ancien.
    const db = seed({
        staff: [{ _id: STAFF_ID, name: 'Bob', venues: ['bar1'], hourly_rate: 14,
                  roles: ['Barman'], can_submit_dispos: true }],
        users: [],
    });
    app.locals.setTestDb(db);
    const res = await inviteDir({ email: 'bob@templyo.test', name: 'Bob', role: 'directeur',
                                  staff_id: STAFF_ID, assigned_establishments: ['bar2'] });
    assert.ok(res.status < 400, 'invitation acceptée (' + res.status + ')');

    assert.equal(staffOf(db).length, 1, 'AUCUN second profil staff ne doit être créé');
    const bob = staffOf(db)[0];
    assert.equal(bob.hourly_rate, 14, 'son taux horaire survit');
    assert.deepEqual(bob.roles, ['Barman'], 'ses rôles survivent');
    assert.deepEqual(bob.venues, ['bar2'], 'ses venues suivent sa nouvelle affectation (R-06)');

    const user = usersOf(db).find(u => u.email === 'bob@templyo.test');
    assert.equal(String(user.staff_id), STAFF_ID, 'le compte pointe sur le profil EXISTANT');
});

test('R-05 : sans nom, le directeur n\'est pas un « Directeur » de plus', async () => {
    const db = seed({ staff: [], users: [] });
    app.locals.setTestDb(db);
    await inviteDir({ email: 'chef.nord@templyo.test', role: 'directeur', assigned_establishments: ['bar1'] });
    const created = staffOf(db).find(s => s.email === 'chef.nord@templyo.test');
    assert.ok(created, 'un profil est bien créé');
    assert.notEqual(created.name, 'Directeur', 'un nom générique rend les lignes indistinguables');
    assert.equal(created.name, 'chef.nord');
});

test('R-12 : supprimer un compte directeur purge sa semaine-type, garde son profil', async () => {
    const db = seed({
        manager_dispo_templates: [{ staff_id: MGR_STAFF, days: { 0: { type: 'soir', start_time: 17, end_time: 24 } } }],
    });
    app.locals.setTestDb(db);
    const res = await req('/api/users/' + MGR_USER, PATRON, { method: 'DELETE' });
    assert.equal(res.status, 200);
    assert.equal(db.collection('manager_dispo_templates')._docs.length, 0,
        'la semaine-type est de la config : sans compte, le cron la matérialiserait encore');
    assert.equal(staffOf(db).length, 1,
        'le profil staff SURVIT — shifts passés, pointage et masse salariale le référencent (cf. F-13)');
});

// ── R-15 : l'invariant R-06 tient dans LES DEUX SENS ─────────────────────────
// `syncManagerStaffVenues` recale staff.venues quand on écrit users.assigned_establishments.
// Il manquait le retour : « Gestion staff » écrit staff.venues directement.

test('R-15 : éditer les venues d\'un directeur recale son assigned_establishments', async () => {
    const db = seed({
        staff: [{ _id: MGR_STAFF, name: 'Dir Test', venues: ['bar1'], can_submit_dispos: true }],
        users: [{ _id: MGR_USER, role: 'directeur', staff_id: MGR_STAFF, name: 'Dir Test',
                  assigned_establishments: ['bar1'] }],
    });
    app.locals.setTestDb(db);
    const res = await req('/api/staff/' + MGR_STAFF, PATRON, {
        method: 'PATCH', body: JSON.stringify({ venues: ['bar2', 'bar3'] }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(staffOf(db)[0].venues, ['bar2', 'bar3']);
    const user = usersOf(db).find(u => String(u._id) === MGR_USER);
    assert.deepEqual(user.assigned_establishments, ['bar2', 'bar3'],
        'sans ça il saisit ses dispos sur les nouveaux bars mais garde les écrans des anciens');
});

test('R-15 : un staff ordinaire ne reçoit PAS d\'assigned_establishments', async () => {
    // Ce champ n'a de sens que pour un directeur ; le poser ailleurs brouillerait
    // canAccessEstablishment.
    const db = seed({
        staff: [{ _id: STAFF_ID, name: 'Bob', venues: ['bar1'], can_submit_dispos: true }],
        users: [{ _id: 'u-bob', role: 'staff', staff_id: STAFF_ID, name: 'Bob' }],
    });
    app.locals.setTestDb(db);
    await req('/api/staff/' + STAFF_ID, PATRON, {
        method: 'PATCH', body: JSON.stringify({ venues: ['bar2'] }),
    });
    const bob = usersOf(db).find(u => u._id === 'u-bob');
    assert.equal(bob.assigned_establishments, undefined);
});
