// Semaine-type ouverte à TOUT le staff (2026-08-24) — auparavant réservée aux directeurs.
//
// Le mécanisme est celui d'E-22 v2 : le modèle part au SEUL déclenchement de la deadline,
// en création seule. Ce fichier couvre ce que la généralisation ajoute, et que
// `manager-dispos.test.js` (directeurs) ne pouvait pas voir :
//   • les portes de `POST /api/dispos` reprises telles quelles (`templateEligible`) —
//     sans elles, la semaine-type serait un chemin parallèle contournant le patron ;
//   • la jointure `time_off`, absente tant que seuls les directeurs (qui déclarent dans
//     `manager_time_off`, E-19) avaient un modèle. C'est LA régression à empêcher : un
//     congé validé recouvert de dispos automatiques annulerait la purge du 2026-08-23 ;
//   • les jours de repos, que le formulaire staff ne propose même pas.
//
// Harnais CD-05 : faux `db` en mémoire + session simulée par l'en-tête `x-test-user`.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { disposWeekStart, toDateStr } = require('../lib/utils');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const STAFF_ID = '0123456789abcdef0123dddd';
const USER_ID  = '0123456789abcdef0123eeee';
const STAFF    = { _id: USER_ID, staff_id: STAFF_ID, name: 'Nina', role: 'staff' };

// Le serveur matérialise toujours sur le lundi de la semaine suivante : on le recalcule
// avec le même helper plutôt que de figer une date (sinon le test pourrirait avec le temps).
const NEXT_MONDAY = toDateStr(disposWeekStart(new Date()));
const dayOf = i => toDateStr(new Date(new Date(NEXT_MONDAY + 'T12:00:00').getTime() + i * 864e5));
// Modèle : lundi (0) + mercredi (2).
const TEMPLATE_DAYS = {
    0: { type: 'soir', start_time: 16, end_time: 26 },
    2: { type: 'midi', start_time: 10, end_time: 17 },
};

// Viser un LUNDI 00:00 rend la deadline « déjà franchie » quel que soit le jour où la
// suite tourne (cf. la même constante dans manager-dispos.test.js).
const DEADLINE_FRANCHIE = '2026-01-05T00:00';

before(startApp);
after(stopApp);

const putTemplate = (days = TEMPLATE_DAYS, path = '/api/me/dispo-template') =>
    req(path, STAFF, { method: 'PUT', body: JSON.stringify({ days }) });

const runCron = () => app.locals.runDispoTemplateCron();

// Le modèle tel qu'il existe DÉJÀ quand la deadline tombe — le cas réel, où il a été
// enregistré des jours plus tôt. On l'écrit directement en base : dans ces tests la
// deadline est TOUJOURS franchie, donc passer par le PUT poserait le marqueur « rendez-
// vous de cette semaine déjà pris » (cf. le test « enregistré après la deadline »), et
// plus rien ne se matérialiserait.
const seedTemplate = (db, days = TEMPLATE_DAYS) =>
    db.collection('manager_dispo_templates')._docs.push({
        staff_id: STAFF_ID, staff_name: 'Nina', days,
    });

// Base minimale : un staff ordinaire, saisie ouverte, deadline franchie.
function seed(extra = {}, staffOverrides = {}) {
    return makeDb({
        settings:       [{ key: 'dispo', open: true, custom_deadline: DEADLINE_FRANCHIE }],
        users:          [{ _id: USER_ID, role: 'staff', active: true, staff_id: STAFF_ID, name: 'Nina' }],
        staff:          [{ _id: STAFF_ID, name: 'Nina', venues: ['bar1'], can_submit_dispos: true, ...staffOverrides }],
        availabilities: [],
        time_off:       [],
        manager_time_off: [],
        ...extra,
    });
}

const disposOf = db => db.collection('availabilities')._docs;
const tplOf    = db => db.collection('manager_dispo_templates')._docs[0];

// ── Le chemin nominal ─────────────────────────────────────────────────────────

test('staff : enregistrer sa semaine-type n\'envoie AUCUNE dispo', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    const res = await putTemplate();
    assert.equal(res.status, 200);
    assert.equal(disposOf(db).length, 0, 'rien ne part avant la deadline');
    assert.deepEqual(tplOf(db).days, TEMPLATE_DAYS);
});

test('staff : le modèle part au déclenchement de la deadline, en `pending`', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    seedTemplate(db);
    await runCron();

    const saved = disposOf(db);
    assert.deepEqual(saved.map(d => d.date).sort(), [dayOf(0), dayOf(2)]);
    assert.ok(saved.every(d => d.status === 'pending'), 'le patron valide comme pour une saisie manuelle');
    assert.ok(saved.every(d => d.staff_id === STAFF_ID));
    assert.equal(saved.find(d => d.date === dayOf(0)).start_time, 16);
    // Une dispo n'est pas un créneau planifié : aucun shift créé.
    assert.equal(db.collection('shifts')._docs.length, 0);
});

test('staff : une dispo déjà envoyée n\'est jamais écrasée par le modèle', async () => {
    // La moitié qui définit le mécanisme : le modèle est ce qui part À MA PLACE si je
    // n'ai rien envoyé — une saisie réelle gagne toujours.
    const db = seed({ availabilities: [{
        staff_id: STAFF_ID, date: dayOf(0), type: 'custom',
        start_time: 20, end_time: 25, status: 'confirmed',
    }] });
    app.locals.setTestDb(db);
    seedTemplate(db);
    await runCron();

    const lundi = disposOf(db).filter(d => d.date === dayOf(0));
    assert.equal(lundi.length, 1, 'pas de doublon sur le lundi');
    assert.equal(lundi[0].start_time, 20, 'les horaires envoyés par le staff survivent');
    assert.equal(lundi[0].status, 'confirmed', 'la validation du patron survit');
});

test('staff : l\'envoi automatique est tracé au nom du MODÈLE, pas de la personne', async () => {
    // F-12 — ces dispos apparaissent dans la file du patron sans que Nina ait rien fait
    // ce jour-là. « Je n'ai jamais saisi ça » est vrai : le journal doit le dire.
    const db = seed();
    app.locals.setTestDb(db);
    seedTemplate(db);
    await runCron();

    const ev = db.collection('dispo_events')._docs.filter(e => e.action === 'template');
    assert.equal(ev.length, 2);
    assert.equal(ev[0].by.role, 'system');
    assert.equal(ev[0].by.name, 'Semaine-type');
    assert.equal(ev[0].staff_name, 'Nina', 'la dispo reste rattachée à la bonne personne');
});

// ── Les portes reprises de POST /api/dispos ───────────────────────────────────

test('staff : rien ne part si la saisie est fermée pour son établissement', async () => {
    const db = seed({ settings: [{ key: 'dispo', open: false, open_venues: ['bar2'],
        custom_deadline: DEADLINE_FRANCHIE }] });
    app.locals.setTestDb(db);
    seedTemplate(db);
    await runCron();
    assert.equal(disposOf(db).length, 0, 'le modèle ne contourne pas la fermeture décidée par le patron');
});

test('staff : un établissement fermé ne CONSOMME pas le rendez-vous de la semaine', async () => {
    // Pas de marqueur posé sur un modèle écarté : si le patron rouvre la saisie dans la
    // foulée, le modèle doit encore pouvoir partir pour cette semaine-là.
    const db = seed({ settings: [{ key: 'dispo', open: false, open_venues: [],
        custom_deadline: DEADLINE_FRANCHIE }] });
    app.locals.setTestDb(db);
    seedTemplate(db);
    await runCron();
    assert.equal(tplOf(db).last_materialized_week, undefined, 'aucun marqueur posé');

    db.collection('settings')._docs[0].open_venues = ['bar1'];
    await runCron();
    assert.equal(disposOf(db).length, 2, 'la réouverture laisse le modèle partir');
});

test('staff : rien ne part si le patron lui a retiré le droit d\'envoyer des dispos', async () => {
    const db = seed({}, { can_submit_dispos: false });
    app.locals.setTestDb(db);
    seedTemplate(db);
    await runCron();
    assert.equal(disposOf(db).length, 0);
});

test('staff : un profil supprimé ne matérialise rien (et ne casse pas la passe)', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    seedTemplate(db);
    db.collection('staff')._docs = [];
    await runCron();
    assert.equal(disposOf(db).length, 0);
});

// ── Congés : la régression à ne jamais rouvrir ────────────────────────────────

test('staff : un congé VALIDÉ n\'est pas recouvert par le modèle', async () => {
    // Sans la jointure `time_off`, le mercredi repartirait en dispo à chaque deadline —
    // ce qui annulerait, semaine après semaine, la purge posée le 2026-08-23 à
    // l'approbation du congé.
    const db = seed({ time_off: [{
        staff_id: STAFF_ID, status: 'approved',
        start_date: dayOf(2), end_date: dayOf(4),
    }] });
    app.locals.setTestDb(db);
    seedTemplate(db);
    await runCron();

    assert.deepEqual(disposOf(db).map(d => d.date), [dayOf(0)],
        'le mercredi couvert par le congé reste vide');
});

test('staff : un congé EN ATTENTE bloque aussi le modèle', async () => {
    // Même règle que `POST /api/dispos` : tout ce qui n'est pas `rejected` compte. Poser
    // une dispo sur une demande en cours obligerait à refaire le ménage à l'approbation.
    const db = seed({ time_off: [{
        staff_id: STAFF_ID, status: 'pending',
        start_date: dayOf(0), end_date: dayOf(0),
    }] });
    app.locals.setTestDb(db);
    seedTemplate(db);
    await runCron();
    assert.deepEqual(disposOf(db).map(d => d.date), [dayOf(2)]);
});

test('staff : un congé REFUSÉ ne bloque rien', async () => {
    const db = seed({ time_off: [{
        staff_id: STAFF_ID, status: 'rejected',
        start_date: dayOf(0), end_date: dayOf(6),
    }] });
    app.locals.setTestDb(db);
    seedTemplate(db);
    await runCron();
    assert.equal(disposOf(db).length, 2);
});

// ── Jours de repos ────────────────────────────────────────────────────────────

test('staff : un jour devenu repos est sauté', async () => {
    // Le modèle a pu être enregistré AVANT que le patron ne pose le repos : la question
    // se tranche à l'envoi, pas à la sauvegarde. `rest_days` suit `getDay()` (0 = dimanche),
    // et le lundi du modèle (index 0) tombe donc sur 1.
    const db = seed({}, { rest_days: [1] });
    app.locals.setTestDb(db);
    seedTemplate(db);
    await runCron();
    assert.deepEqual(disposOf(db).map(d => d.date), [dayOf(2)], 'le lundi de repos ne part pas');
});

// ── Enregistrement du modèle ──────────────────────────────────────────────────

test('modèle : « Indisponible » est ignoré, pas rejeté', async () => {
    // `off` n'a pas d'horaires : rien à envoyer ce jour-là, exactement l'effet d'un jour
    // absent du modèle. Rejeter le lot sur « horaires invalides » n'aurait aucun sens
    // pour qui vient de cliquer « Indispo » puis « enregistrer comme modèle ».
    const db = seed();
    app.locals.setTestDb(db);
    const res = await putTemplate({
        0: { type: 'soir', start_time: 16, end_time: 26 },
        1: { type: 'off',  start_time: null, end_time: null },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(tplOf(db).days), ['0']);
});

test('modèle : des horaires incohérents sont refusés', async () => {
    const db = seed();
    app.locals.setTestDb(db);
    const res = await putTemplate({ 0: { type: 'custom', start_time: 20, end_time: 12 } });
    assert.equal(res.status, 400);
});

test('modèle : l\'ancien chemin `manager-dispo-template` répond encore', async () => {
    // Une route qui disparaît d'un déploiement à l'autre casse l'onglet resté ouvert et
    // la PWA dont le service worker n'a pas encore repris le nouveau JS.
    const db = seed();
    app.locals.setTestDb(db);
    const put = await putTemplate(TEMPLATE_DAYS, '/api/me/manager-dispo-template');
    assert.equal(put.status, 200);
    const get = await req('/api/me/dispo-template', STAFF);
    assert.deepEqual((await get.json()).days, TEMPLATE_DAYS, 'les deux chemins servent le même modèle');
});

test('modèle : un modèle vidé n\'envoie plus rien', async () => {
    // Semé vide plutôt que vidé par le PUT : passer par la route poserait le marqueur
    // (deadline franchie dans ces tests), et le test passerait sans rien prouver.
    const db = seed();
    app.locals.setTestDb(db);
    seedTemplate(db, {});
    await runCron();
    assert.equal(disposOf(db).length, 0);
});

// ── La deadline n'est pas contournable par le modèle ──────────────────────────

test('modèle : enregistré APRÈS la deadline, il ne rattrape pas la semaine figée', async () => {
    // Le trou que la revue a trouvé : le staff lit « cette semaine est figée depuis la
    // deadline », enregistre son modèle pour la fois d'après, et ses 7 jours tombaient
    // dans la file du patron dans le quart d'heure — sur la semaine même que
    // `POST /api/dispos` venait de lui refuser en 403. Le modèle démarre à la deadline
    // SUIVANTE.
    const db = seed();
    app.locals.setTestDb(db);
    const res = await putTemplate();
    assert.equal(res.status, 200, 'enregistrer reste permis — c\'est l\'envoi qui attend');
    assert.equal(tplOf(db).last_materialized_week, NEXT_MONDAY,
        'le rendez-vous de cette semaine est marqué comme déjà passé');

    await runCron();
    assert.equal(disposOf(db).length, 0, 'rien ne part sur la semaine figée');
});

test('modèle : le staff rouvert nominativement n\'est PAS neutralisé', async () => {
    // La deadline ne s'applique pas à lui (`force_open_staff`) : il n'y a donc aucune
    // règle à faire respecter, et son modèle doit partir dès cette deadline-ci.
    const db = seed({ settings: [{ key: 'dispo', open: true, custom_deadline: DEADLINE_FRANCHIE,
        force_open_staff: [{ staff_id: STAFF_ID, week_start: NEXT_MONDAY }] }] });
    app.locals.setTestDb(db);
    await putTemplate();
    assert.equal(tplOf(db).last_materialized_week, undefined, 'aucun marqueur : il est exempté');

    await runCron();
    assert.deepEqual(disposOf(db).map(d => d.date).sort(), [dayOf(0), dayOf(2)]);
});

test('modèle : le GET expose `last_materialized_week` — l\'écran doit savoir QUELLE deadline', async () => {
    // Sans ce champ, la carte annonce « ça partira pour la semaine du X » alors que le
    // rendez-vous de X a déjà eu lieu : le modèle vise la SUIVANTE. Le smoke s'appuie
    // aussi dessus pour vérifier la garde de deadline sur une instance réelle — c'est la
    // seule façon de l'observer en HTTP, le cron n'ayant aucune route pour le déclencher.
    const db = seed();
    app.locals.setTestDb(db);

    const avant = await (await req('/api/me/dispo-template', STAFF)).json();
    assert.equal(avant.last_materialized_week, null, 'aucun modèle ⇒ aucun rendez-vous passé');

    await putTemplate();   // deadline franchie dans ces tests ⇒ marqueur posé
    const apres = await (await req('/api/me/dispo-template', STAFF)).json();
    assert.equal(apres.last_materialized_week, NEXT_MONDAY);
});
