// F-14 — « F-13 n'est appliqué qu'à une porte sur six ».
//
// F-13 (cf. `staff-archive.test.js`) a livré l'archivage et l'a prouvé sur les chemins
// qu'il touchait. La revue d'altitude du 2026-08-12 a montré que la règle FUYAIT partout
// ailleurs : le refus ne vivait que dans `POST /api/shifts`, alors que cinq autres routes
// écrivent un `staff_id` dans `shifts`.
//
// Ces tests ne re-prouvent pas l'archivage — ils tiennent chaque porte qui restait ouverte.
// La question posée à chacun est la même : « une personne partie peut-elle rentrer PAR ICI ? »
//
// Deux comportements distincts, à ne pas confondre en les lisant :
//   • gestes UNITAIRES (créer, remplacer, confirmer, extra) → refus 409, rien n'est écrit ;
//   • gestes EN MASSE (copier un jour / une semaine)        → le créneau est CONSERVÉ mais
//     passe en Joker. Refuser 40 shifts parce qu'un seul est archivé serait hostile ;
//     les supprimer en silence ferait disparaître un poste qui était bel et bien tenu.
//
// Harnais CD-05 : faux `db` en mémoire + session simulée par l'en-tête `x-test-user`.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const PARTIE   = '0123456789abcdef0123a001'; // archivée dès l'amorçage
const RESTANTE = '0123456789abcdef0123a002'; // en poste
const DIRECTEUR = '0123456789abcdef0123a003'; // directeur archivé (semaine-type)
const USER_P    = '0123456789abcdef0123b001';
const USER_DIR  = '0123456789abcdef0123b003';
const PATRON    = { role: 'patron' };

// Les routes en `/:id` valident le format AVANT toute logique (`isValidObjectId`) : un id
// lisible comme « sh1 » ferait répondre 400 et le test passerait au vert pour la mauvaise
// raison — il ne prouverait plus rien sur l'archivage.
const SH1 = '0123456789abcdef0123c001';
const AV1 = '0123456789abcdef0123c002';
const JK1 = '0123456789abcdef0123c003';

before(startApp);
after(stopApp);

const HIER   = '2026-08-01';
const DEMAIN = '2099-01-01'; // « à venir » quel que soit le jour d'exécution
const LUN_SRC = '2099-01-05'; // lundi source pour la copie de semaine
const LUN_DST = '2099-01-12'; // lundi cible

let db;
beforeEach(() => {
    db = makeDb({
        settings: [{ key: 'dispo', open: true, force_open: true,
                     custom_deadline: '2026-01-05T00:00' }], // un lundi → toujours franchie
        establishments: [{ id: 'bar1', name: 'Le Bar' }],
        users: [
            { _id: USER_P,   role: 'staff',     active: true, staff_id: PARTIE,    name: 'Partie' },
            { _id: USER_DIR, role: 'directeur', active: true, staff_id: DIRECTEUR, name: 'Dir',
              assigned_establishments: ['bar1'] },
        ],
        staff: [
            // Déjà archivée : ces tests portent sur ce qui se passe APRÈS, pas sur l'archivage.
            { _id: PARTIE,    name: 'Partie',    venues: ['bar1'], archived: true, archived_at: new Date() },
            { _id: RESTANTE,  name: 'Restante',  venues: ['bar1'] },
            { _id: DIRECTEUR, name: 'Dir',       venues: ['bar1'], archived: true, archived_at: new Date() },
        ],
        shifts: [],
        availabilities: [],
        push_subscriptions: [],
        staff_notifications: [],
        manager_dispo_templates: [],
        sessions: [],
    });
    app.locals.setTestDb(db);
});

const shifts = () => db.collection('shifts')._docs;
const staffDoc = (id) => db.collection('staff')._docs.find(s => String(s._id) === id);

// ── Porte 1 : le remplacement de staff sur un shift existant ─────────────────
//
// `PATCH /api/shifts/:id` est le chemin du bouton « Remplacer par ». Le front proposait
// encore les archivés (`openReplaceStaffModal` itérait `allStaff`) : c'était le trajet le
// plus court pour faire réapparaître quelqu'un dans une semaine DÉJÀ PUBLIÉE.

test('remplacer par un archivé est refusé', async () => {
    shifts().push({ _id: SH1, staff_id: RESTANTE, staff_name: 'Restante',
        establishment_id: 'bar1', date: DEMAIN, start_time: 18, end_time: 24 });

    const res = await req('/api/shifts/' + SH1 + '', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ staff_id: PARTIE, staff_name: 'Partie' }),
    });

    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /archiv/i);
    assert.equal(shifts()[0].staff_id, RESTANTE, 'le shift ne doit pas avoir changé de titulaire');
});

test('remplacer par quelqu\'un d\'actif marche toujours', async () => {
    shifts().push({ _id: SH1, staff_id: '__joker__', staff_name: '', is_joker: true,
        establishment_id: 'bar1', date: DEMAIN, start_time: 18, end_time: 24 });

    const res = await req('/api/shifts/' + SH1 + '', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ staff_id: RESTANTE, staff_name: 'Restante', is_joker: false }),
    });

    assert.equal(res.status, 200, 'le garde-fou ne doit pas déborder sur les vivants');
    assert.equal(shifts()[0].staff_id, RESTANTE);
});

// ── Porte 2 : la copie de semaine ────────────────────────────────────────────
//
// Le point le plus visible par le client : c'est le geste hebdomadaire le plus courant,
// et il faisait revenir l'archivé EN MASSE, publication et push compris.

test('copier une semaine convertit l\'archivé en Joker et garde les autres', async () => {
    shifts().push(
        { _id: 'a', staff_id: PARTIE,   staff_name: 'Partie',   establishment_id: 'bar1',
          date: LUN_SRC, start_time: 18, end_time: 24, color: '#111' },
        { _id: 'b', staff_id: RESTANTE, staff_name: 'Restante', establishment_id: 'bar1',
          date: LUN_SRC, start_time: 20, end_time: 26, color: '#222' },
    );

    const res = await req('/api/copy-week', PATRON, {
        method: 'POST',
        body: JSON.stringify({ establishment_id: 'bar1', from_week_start: LUN_SRC,
                               to_week_starts: [LUN_DST], mode: 'staff' }),
    });
    assert.equal(res.status, 200);

    const copies = shifts().filter(s => s.date === LUN_DST);
    assert.equal(copies.length, 2, 'les DEUX créneaux sont copiés — on ne perd pas un poste');

    const exPartie = copies.find(s => s.start_time === 18);
    assert.equal(exPartie.staff_id, '__joker__', 'la personne partie ne revient pas');
    assert.equal(exPartie.is_joker, true);
    assert.equal(exPartie.staff_name, '');

    const active = copies.find(s => s.start_time === 20);
    assert.equal(active.staff_id, RESTANTE, 'celle qui reste garde son shift');
});

test('la copie annonce les créneaux passés en Joker', async () => {
    shifts().push({ _id: 'a', staff_id: PARTIE, staff_name: 'Partie',
        establishment_id: 'bar1', date: LUN_SRC, start_time: 18, end_time: 24 });

    const res = await req('/api/copy-week', PATRON, {
        method: 'POST',
        body: JSON.stringify({ establishment_id: 'bar1', from_week_start: LUN_SRC,
                               to_week_starts: [LUN_DST] }),
    });

    // Sans ce message, la conversion est silencieuse : le patron croit sa semaine complète
    // et découvre le trou le soir même.
    assert.match((await res.json()).message, /Joker.*archiv/i);
});

test('copier un jour applique la même règle', async () => {
    const res = await req('/api/copy-day', PATRON, {
        method: 'POST',
        body: JSON.stringify({
            establishment_id: 'bar1',
            to_dates: [DEMAIN],
            shifts: [
                { staff_id: PARTIE,   staff_name: 'Partie',   start_time: 18, end_time: 24 },
                { staff_id: RESTANTE, staff_name: 'Restante', start_time: 20, end_time: 26 },
            ],
        }),
    });
    assert.equal(res.status, 200);

    const copies = shifts().filter(s => s.date === DEMAIN);
    assert.equal(copies.length, 2);
    assert.equal(copies.find(s => s.start_time === 18).staff_id, '__joker__');
    assert.equal(copies.find(s => s.start_time === 20).staff_id, RESTANTE);
});

// ── Porte 3 : la confirmation de dispo qui crée un shift ─────────────────────

test('confirmer avec création de shift est refusé pour un archivé', async () => {
    db.collection('availabilities')._docs.push({
        _id: AV1, staff_id: PARTIE, staff_name: 'Partie', date: DEMAIN,
        start_time: 18, end_time: 24, status: 'pending',
    });

    const res = await req('/api/dispos/' + AV1 + '/confirm', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ establishment_id: 'bar1', create_shift: true }),
    });

    assert.equal(res.status, 409);
    assert.equal(shifts().length, 0, 'aucun shift créé');
    // Le refus tombe AVANT l'écriture du statut : sinon la dispo resterait « confirmée »
    // pour un shift qui n'existe pas.
    assert.equal(db.collection('availabilities')._docs[0].status, 'pending',
        'le statut ne doit pas avoir bougé');
});

test('confirmer SANS créer de shift reste possible — le patron doit pouvoir vider sa file', async () => {
    db.collection('availabilities')._docs.push({
        _id: AV1, staff_id: PARTIE, staff_name: 'Partie', date: DEMAIN,
        start_time: 18, end_time: 24, status: 'pending',
    });

    const res = await req('/api/dispos/' + AV1 + '/confirm', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ establishment_id: 'bar1', create_shift: false }),
    });

    // Portée volontairement étroite : on bloque la PLANIFICATION, pas le ménage. Une dispo
    // déposée avant l'archivage doit pouvoir quitter la file.
    assert.equal(res.status, 200);
    assert.equal(shifts().length, 0);
});

// ── Porte 4 : le pointage « extra », qui résout PAR NOM ──────────────────────

test('un shift extra sur un archivé est refusé, même désigné par son nom', async () => {
    const res = await req('/api/shifts/extra', PATRON, {
        method: 'POST',
        body: JSON.stringify({ staff_name: 'Partie', establishment_id: 'bar1',
                               date: HIER, real_start: 18, real_end: 24 }),
    });

    // C'est la seule route qui résout par nom : l'autocomplete du pointage proposait
    // encore les archivés, donc 3 lettres suffisaient à recréer des heures — donc de la paie.
    assert.equal(res.status, 409);
    assert.equal(shifts().length, 0);
});

test('un extra sur quelqu\'un d\'actif passe, et récupère son profil', async () => {
    const res = await req('/api/shifts/extra', PATRON, {
        method: 'POST',
        body: JSON.stringify({ staff_name: 'restante', establishment_id: 'bar1',
                               date: HIER, real_start: 18, real_end: 24 }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.staff_id, RESTANTE, 'la résolution par nom (insensible à la casse) fonctionne toujours');
    assert.equal(body.staff_name, 'Restante');
});

// ── Porte 5 : les notifications ──────────────────────────────────────────────
//
// Le filtre vit dans `sendPushToStaff`, la porte unique — pas chez ses appelants.
// Une personne archivée ne peut plus se connecter : la laisser recevoir des sollicitations,
// c'est lui envoyer des messages qu'elle N'A AUCUN MOYEN d'arrêter.

const destinataires = () =>
    db.collection('staff_notifications')._docs.map(n => String(n.staff_id));

test('un archivé n\'est plus sollicité sur un Joker ouvert', async () => {
    shifts().push({ _id: JK1, staff_id: '__joker__', is_joker: true, joker_open: false,
        establishment_id: 'bar1', date: DEMAIN, start_time: 18, end_time: 24 });

    const res = await req('/api/shifts/' + JK1 + '/joker-open', PATRON, {
        method: 'PATCH', body: JSON.stringify({ open: true }),
    });
    assert.equal(res.status, 200);

    assert.ok(!destinataires().includes(PARTIE), 'la personne partie ne doit pas être sollicitée');
    assert.ok(destinataires().includes(RESTANTE), 'celle qui reste doit l\'être');
});

// ⚠️ Ce test-ci est le SEUL qui prouve le filtre de `sendPushToStaff`, et il a été ajouté
// après coup : la vérification par mutation a montré que le test « Joker ouvert » ci-dessus
// ne le prouvait PAS. La requête de `joker-open` filtre déjà les archivés en amont, donc
// neutraliser `sendPushToStaff` ne cassait rien — deux gardes redondantes, aucune tenue.
// La publication, elle, part de `shifts.distinct('staff_id')` : la liste n'est filtrée
// nulle part avant, c'est donc `sendPushToStaff` seul qui décide.
test('publier une semaine ne notifie pas les archivés qui y figurent encore', async () => {
    // Décision F-13 : archiver ne troue pas un planning déjà annoncé — les shifts futurs
    // de la personne partie RESTENT. Ils sont donc bien présents au moment de publier.
    shifts().push(
        { _id: SH1, staff_id: PARTIE,   staff_name: 'Partie',   establishment_id: 'bar1',
          date: LUN_SRC, start_time: 18, end_time: 24 },
        { _id: '0123456789abcdef0123c009', staff_id: RESTANTE, staff_name: 'Restante',
          establishment_id: 'bar1', date: LUN_SRC, start_time: 20, end_time: 26 },
    );

    const res = await req('/api/publish/' + LUN_SRC, PATRON, {
        method: 'PATCH', body: JSON.stringify({ establishments: ['bar1'] }),
    });
    assert.equal(res.status, 200);
    // La notification part dans une promesse non attendue par la route.
    await new Promise(r => setTimeout(r, 50));

    assert.ok(!destinataires().includes(PARTIE),
        'une personne partie ne peut plus se connecter : la notifier, c\'est lui envoyer '
        + 'un message qu\'elle n\'a AUCUN moyen d\'arrêter');
    assert.ok(destinataires().includes(RESTANTE), 'les autres sont bien prévenus');
});

// ── Porte 6 : le cron de semaine-type du directeur ───────────────────────────

// ⚠️ La deadline DOIT être franchie, sinon `shouldMaterializeTemplate` sort avant même
// d'atteindre le contrôle d'archivage et le test passe au vert sans rien prouver — c'est
// exactement ce que la vérification par mutation a attrapé sur une première version.
// `custom_deadline` est un patron récurrent (jour + heure) : viser un LUNDI 00:00 la rend
// franchie quel que soit le jour où la suite tourne (même procédé que manager-dispos.test.js).
const poserTemplate = (staffId, nom) =>
    db.collection('manager_dispo_templates')._docs.push({
        staff_id: staffId, staff_name: nom,
        days: { 0: { type: 'soir', start_time: 18, end_time: 26 } },
        last_materialized_week: null,
    });

const disposDe = (staffId) =>
    db.collection('availabilities')._docs.filter(d => String(d.staff_id) === staffId);

test('la semaine-type d\'un directeur archivé ne se matérialise plus', async () => {
    poserTemplate(DIRECTEUR, 'Dir');
    poserTemplate(RESTANTE, 'Restante'); // témoin : le cron doit continuer de tourner

    await app.locals.runDispoTemplateCron();

    // Le témoin prouve que la deadline est bien franchie et que la boucle écrit vraiment.
    // Sans lui, « 0 dispo pour l'archivé » serait vrai même si le cron ne faisait rien.
    assert.ok(disposDe(RESTANTE).length > 0,
        'le cron doit matérialiser le directeur ACTIF — sinon ce test ne prouve rien');
    // Sans le filtre, le cron rejoue CHAQUE SEMAINE, indéfiniment : des dispos `pending`
    // que personne n'a saisies et que personne ne peut retirer s'empilent chez le patron.
    assert.equal(disposDe(DIRECTEUR).length, 0,
        'aucune dispo ne doit être matérialisée pour un directeur archivé');
});

test('le modèle est SAUTÉ, pas supprimé — l\'archivage est réversible', async () => {
    poserTemplate(DIRECTEUR, 'Dir');

    await app.locals.runDispoTemplateCron();

    const tpl = db.collection('manager_dispo_templates')._docs
        .find(t => String(t.staff_id) === DIRECTEUR);
    assert.ok(tpl, 'détruire la semaine-type ferait perdre sa config à la réactivation');
    assert.equal(tpl.last_materialized_week, null,
        'ne pas marquer la semaine : à la réactivation, la matérialisation doit reprendre');
});

// ── Porte 7 : l'invitation de compte ─────────────────────────────────────────
//
// Relevée par la revue d'altitude qui a suivi le premier jet de F-14 : le filtre n'avait
// été posé que dans le FRONT (`populateStaffSelect`), ce qui est précisément le
// raisonnement que F-14 corrige partout ailleurs. Inviter un archivé envoie un vrai SMS
// ou un vrai e-mail, la personne choisit son mot de passe, et se prend un 403 au login.

test('inviter un archivé est refusé', async () => {
    const res = await req('/api/users', PATRON, {
        method: 'POST',
        body: JSON.stringify({ email: 'partie@templyo.test', staff_id: PARTIE, role: 'staff' }),
    });

    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /archiv/i);
    assert.equal(db.collection('users')._docs.length, 2, 'aucun compte créé');
});

test('inviter quelqu\'un d\'actif marche toujours', async () => {
    const res = await req('/api/users', PATRON, {
        method: 'POST',
        body: JSON.stringify({ email: 'restante@templyo.test', staff_id: RESTANTE, role: 'staff' }),
    });

    assert.ok(res.status < 400, 'le garde-fou ne doit pas bloquer les invitations normales, obtenu ' + res.status);
});

test('l\'import en masse saute l\'archivé, avec la raison, et traite les autres', async () => {
    // L'import résout PAR NOM : c'est le chemin qui envoie une invitation à quelqu'un
    // qu'on n'a jamais sélectionné dans une liste.
    const res = await req('/api/users/bulk', PATRON, {
        method: 'POST',
        body: JSON.stringify({ entries: [
            { name: 'Partie',   email: 'partie2@templyo.test' },
            { name: 'Restante', email: 'restante2@templyo.test' },
        ] }),
    });
    assert.equal(res.status, 201);

    const body = await res.json();
    assert.equal(body.skipped.length, 1, 'la ligne archivée doit être sautée');
    assert.match(body.skipped[0].reason, /archiv/i, 'le patron doit savoir POURQUOI');
    assert.equal(body.skipped[0].name, 'Partie');
    // L'autre ligne passe : sauter n'est pas interrompre.
    assert.ok(body.created.length + body.updated.length >= 1, 'Restante doit être traitée');
});

// ── Porte 8 : la suppression de compte ───────────────────────────────────────

test('supprimer un compte archive son profil staff au lieu de le laisser actif', async () => {
    staffDoc(RESTANTE).archived = undefined;
    db.collection('users')._docs.push({
        _id: '0123456789abcdef0123b002', role: 'staff', active: true, staff_id: RESTANTE, name: 'Restante',
    });

    const res = await req('/api/users/0123456789abcdef0123b002', PATRON, { method: 'DELETE' });
    assert.equal(res.status, 200);

    const prof = staffDoc(RESTANTE);
    // Le profil SURVIT (la paie et les récaps le référencent) mais quitte la vie courante.
    // Avant F-14, il restait planifiable et notifiable alors que le compte n'existait plus.
    assert.ok(prof, 'le profil ne doit jamais être détruit — les récaps édités portent son nom');
    assert.equal(prof.archived, true);
    assert.ok(prof.archived_at instanceof Date);
});

test('supprimer un compte ne réécrit pas la date d\'un archivage plus ancien', async () => {
    const vieille = new Date('2020-01-01T00:00:00Z');
    staffDoc(PARTIE).archived_at = vieille;
    db.collection('users')._docs.push({
        _id: '0123456789abcdef0123b009', role: 'staff', active: true, staff_id: PARTIE, name: 'Partie',
    });

    await req('/api/users/0123456789abcdef0123b009', PATRON, { method: 'DELETE' });

    assert.equal(staffDoc(PARTIE).archived_at.getTime(), vieille.getTime(),
        'la date de sortie réelle ne doit pas être écrasée par la suppression du compte');
});
