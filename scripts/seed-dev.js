'use strict';
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  JEU DE DONNÉES DE RECETTE — relançable à volonté, sur n'importe quelle   ║
// ║  base non-cliente (templyo_dev, templyo_main, …).                         ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// OBJECTIF : rendre chaque feature OBSERVABLE en deux clics, pas simuler un vrai bar.
// D'où des choix délibérés — Alice et Bruno sur Josy (le bar de la directrice), Chloé et
// David ailleurs : sans cette répartition, le filtre de périmètre S-04 ne se verrait pas.
//
// ┌─ AJOUTER UNE FEATURE ────────────────────────────────────────────────────┐
// │ 1. Ajoute un bloc dans FEATURES ci-dessous : { id, label, howToTest, seed }│
// │ 2. `seed(ctx)` reçoit tout le contexte déjà construit (ctx.db, ctx.staff,  │
// │    ctx.users, ctx.day…) et insère ce qu'il lui faut.                       │
// │ 3. `howToTest` s'affiche en fin d'exécution : c'est la check-list de       │
// │    recette. Écris-la comme une consigne à quelqu'un qui ouvre l'app.       │
// │ Rien d'autre à toucher. L'ordre du tableau est l'ordre d'exécution.        │
// └───────────────────────────────────────────────────────────────────────────┘
//
//   npm run dev:seed          → base de .env.dev
//   npm run seed:all          → .env.dev ET .env.main
//   ENV_FILE=.env.main node scripts/seed-dev.js

const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const { openDb, APP_COLLECTIONS } = require('./_db');
const { toDateStr, weekStart } = require('../lib/utils');

const PASSWORD = process.env.SEED_PASSWORD || 'Templyo2026!';

// Collections remises à zéro à chaque passage : la liste vit dans `_db.js` (elle était
// recopiée ici ET dans `seed-demo.js`, et les deux copies avaient déjà pris du retard
// sur le produit).
// ⚠️ Les index NE sont PAS recréés — l'affirmation inverse figurait ici et était fausse :
// `connectDB()` n'en pose que 6 au démarrage, les ~19 autres viennent de `npm run init`
// (destructif, et il refuse la base de prod). Sur une base de recette fraîche, les requêtes
// tournent donc sans la plupart des index : sans effet à cette volumétrie, mais à savoir
// avant d'y mesurer quoi que ce soit.
const WIPE = APP_COLLECTIONS;

// ── Les features, dans l'ordre d'exécution ───────────────────────────────────
const FEATURES = [

{ id: 'bars', label: 'Établissements',
  howToTest: 'Barre d\'établissements en haut : Josy · Poni · FanFan.',
  async seed(ctx) {
    await ctx.db.collection('establishments').insertMany([
        { id: 'Josy_pub',          name: 'Josy',   type: 'pub',        hours: { open: 10, close: 26 } },
        { id: 'Poni_restaurant',   name: 'Poni',   type: 'restaurant', hours: { open: 10, close: 26 } },
        { id: 'FanFan_restaurant', name: 'FanFan', type: 'restaurant', hours: { open: 10, close: 26 } },
    ]);
} },

{ id: 'roles', label: 'Rôles — le niveau FIN (métier précis)',
  howToTest: "Modale Staff → badges de rôle. Alice porte « Responsable de soirée » : un rôle `responsable` déclenche l'alerte « ! » sur une journée qui n'en a aucun. Les autres sont informatifs.",
  async seed(ctx) {
    // ⚠️ Ne PAS mettre « Bar » / « Cuisine » ici : c'est le niveau GROSSIER, il est porté
    // par les GROUPES (cf. bloc `groupes`). Un rôle décrit le métier exact d'une personne.
    // ⚠️ `staff.roles` contient les **_id** des rôles, PAS leurs noms — c'est ce que
    // pose le front (`btn.dataset.role = String(r._id)`) et ce que compare le serveur
    // (`isResponsablePourSoiree`). Ce seed stockait les NOMS : personne n'était donc
    // reconnu responsable, et toute la recette était aveugle au pointage de soirée (E-03).
    const defs = [
        { name: 'Responsable de soirée', type: 'responsable' },
        { name: 'Chef de rang',          type: 'informatif' },
        { name: 'Second de cuisine',     type: 'informatif' },
        { name: 'Plongeur',              type: 'informatif' },
    ];
    const r = await ctx.db.collection('roles').insertMany(defs);
    defs.forEach((d, i) => { ctx.roles[d.name] = String(r.insertedIds[i]); });
} },

{ id: 'staff', label: 'Staff + profil staff de la directrice (E-22)',
  howToTest: 'Barre staff : 6 personnes. Diane a un profil staff comme les autres — c\'est E-22 Modèle A : une directrice est planifiable et comptée en paie.',
  async seed(ctx) {
    const defs = [
        { name: 'Alice', color: '#3498db', venues: ['Josy_pub'],                    roles: [ctx.roles['Responsable de soirée']], hourly_rate: 13 },
        { name: 'Bruno', color: '#9b59b6', venues: ['Josy_pub', 'Poni_restaurant'], roles: [ctx.roles['Chef de rang']],          hourly_rate: 12 },
        { name: 'Chloé', color: '#e67e22', venues: ['Poni_restaurant'],             roles: [ctx.roles['Second de cuisine']],     hourly_rate: 12.5 },
        { name: 'David', color: '#2ecc71', venues: ['FanFan_restaurant'],           roles: [],                        hourly_rate: 11.9 },
        { name: 'Elena', color: '#e74c3c', venues: [],                              roles: [],                        hourly_rate: 12 },
    ];
    const r = await ctx.db.collection('staff').insertMany(defs.map(s => ({
        ...s, email: '', phone: '', can_submit_dispos: true, created_at: new Date(),
    })));
    defs.forEach((s, i) => { ctx.staff[s.name] = String(r.insertedIds[i]); ctx.color[s.name] = s.color; });

    // `venues` DOIT rester aligné sur `assigned_establishments` du compte (R-06),
    // sinon la directrice ne peut plus saisir la moindre dispo.
    const dir = await ctx.db.collection('staff').insertOne({
        name: 'Diane', color: '#1abc9c', email: 'directeur@templyo.test', phone: '',
        venues: ['Josy_pub'], roles: [], can_submit_dispos: true,
        is_manager: true, hourly_rate: 16, created_at: new Date(),
    });
    ctx.staff.Diane = String(dir.insertedId); ctx.color.Diane = '#1abc9c';
} },

{ id: 'groupes', label: 'Groupes — le niveau GROSSIER (Bar / Cuisine)',
  howToTest: "Sélecteur de groupe en haut : « Bar » ne laisse que Josy et Poni dans les onglets, et ne montre qu'Alice, Bruno et Elena dans la barre staff. « Cuisine » laisse Poni et FanFan, avec Chloé, David et Elena. Elena n'a AUCUN groupe : elle reste visible partout — c'est la règle « sans groupe = polyvalent ».",
  async seed(ctx) {
    // Un groupe est un tag LIBRE porté à la fois par les établissements et le staff
    // (`GET /api/groups` en renvoie l'union distincte). Il filtre les deux à la fois.
    // À ne pas confondre avec les RÔLES, qui décrivent le métier précis d'une personne :
    // le groupe dit « côté bar ou côté cuisine », le rôle dit « chef de rang ».
    // Poni porte les DEUX : un restaurant a un bar et une cuisine — c'est le cas qui
    // montre qu'un établissement n'appartient pas à un seul groupe.
    const byEstab = { Josy_pub: ['Bar'], Poni_restaurant: ['Bar', 'Cuisine'], FanFan_restaurant: ['Cuisine'] };
    await ctx.db.collection('establishments').bulkWrite(Object.entries(byEstab).map(
        ([id, groups]) => ({ updateOne: { filter: { id }, update: { $set: { groups } } } })));

    // Elena reste SANS groupe : un staff sans groupe est visible dans tous les filtres.
    // Elena reste absente de cette liste : sans groupe, elle est visible partout.
    // La directrice suit son bar.
    // Filtré par _id (via ctx.staff), JAMAIS par nom : un nom n'est pas un identifiant —
    // deux homonymes, un renommage, et la mise à jour touche la mauvaise personne ou aucune,
    // en silence. `ctx.staff` porte les _id retournés à l'insertion.
    const byStaff = { Alice: ['Bar'], Bruno: ['Bar'], 'Chloé': ['Cuisine'], David: ['Cuisine'], Diane: ['Bar'] };
    await ctx.db.collection('staff').bulkWrite(Object.entries(byStaff).map(
        ([name, groups]) => ({ updateOne: {
            filter: { _id: new ObjectId(ctx.staff[name]) },
            update: { $set: { groups } },
        } })));
} },

{ id: 'comptes', label: 'Comptes — les 4 rôles',
  howToTest: 'Connexion avec chacun. L\'observateur voit tout mais ne peut rien écrire ; la directrice est limitée à Josy.',
  async seed(ctx) {
    const hash = await bcrypt.hash(PASSWORD, 12);
    const defs = [
        { email: 'patron@templyo.test',      role: 'patron',      name: 'Paul',  staff_id: null,           assigned_establishments: [] },
        { email: 'directeur@templyo.test',   role: 'directeur',   name: 'Diane', staff_id: ctx.staff.Diane, assigned_establishments: ['Josy_pub'] },
        { email: 'observateur@templyo.test', role: 'observateur', name: 'Oscar', staff_id: null,           assigned_establishments: [] },
        { email: 'alice@templyo.test',       role: 'staff',       name: 'Alice', staff_id: ctx.staff.Alice, assigned_establishments: [] },
        { email: 'bruno@templyo.test',       role: 'staff',       name: 'Bruno', staff_id: ctx.staff.Bruno, assigned_establishments: [] },
        { email: 'chloe@templyo.test',       role: 'staff',       name: 'Chloé', staff_id: ctx.staff['Chloé'], assigned_establishments: [] },
    ];
    const r = await ctx.db.collection('users').insertMany(defs.map(u => ({
        ...u, password_hash: hash, active: true, created_at: new Date(),
    })));
    // Keyé par NOM (comme ctx.staff) : par rôle, les 3 comptes `staff` s'écrasaient
    // et ctx.users.staff finissait silencieusement sur le dernier.
    defs.forEach((u, i) => { ctx.users[u.name] = String(r.insertedIds[i]); });
} },

{ id: 'planning-passe', label: 'Semaine passée + heures réelles',
  howToTest: 'Récap mensuel : écart planifié / réel. Onglet Pointage : Alice a fait 30 min de plus que prévu.',
  async seed(ctx) {
    await ctx.db.collection('shifts').insertMany([
        ctx.shift('Josy_pub', 'Alice', ctx.day(ctx.lastMon, 1), 18, 26, { real_start: 18, real_end: 26.5, pointage_resp: true, hourly_rate_snapshot: 13 }),
        ctx.shift('Josy_pub', 'Bruno', ctx.day(ctx.lastMon, 1), 20, 26, { real_start: 20, real_end: 26, hourly_rate_snapshot: 12 }),
        ctx.shift('Poni_restaurant', 'Chloé', ctx.day(ctx.lastMon, 3), 12, 22, { real_start: 12, real_end: 22, hourly_rate_snapshot: 12.5 }),
    ]);
} },

{ id: 'planning-courant', label: 'Semaine courante publiée + Joker ouvert',
  howToTest: 'Vue staff : la semaine est publiée, donc visible. Le samedi porte un Joker ouvert aux candidatures.',
  async seed(ctx) {
    await ctx.db.collection('shifts').insertMany([
        ctx.shift('Josy_pub', 'Alice', ctx.day(ctx.thisMon, 2), 18, 26, { pointage_resp: true }),
        ctx.shift('Josy_pub', 'Diane', ctx.day(ctx.thisMon, 2), 17, 24),
        ctx.shift('Poni_restaurant', 'Bruno', ctx.day(ctx.thisMon, 3), 12, 20),
        ctx.shift('FanFan_restaurant', 'David', ctx.day(ctx.thisMon, 4), 18, 24),
        { establishment_id: 'Josy_pub', staff_id: '__joker__', staff_name: 'Joker', color: '#888',
          date: ctx.day(ctx.thisMon, 5), start_time: 19, end_time: 26,
          is_joker: true, joker_open: true, joker_candidates: [], note: 'Renfort samedi soir' },
    ]);
    await ctx.db.collection('settings').insertOne({
        // Forme COURANTE : `establishments` ('ALL' ou liste d'ids). `published: true`
        // marche encore mais c'est la branche LEGACY de `normalizePublishDoc`.
        key: 'publish_' + toDateStr(ctx.thisMon), establishments: 'ALL', published_at: new Date(),
    });
} },

{ id: 'dispos', label: 'File de validation + périmètre directeur (S-04)',
  howToTest: 'Modale Dispos, semaine prochaine. Le patron voit 7 dispos, la directrice 4 (ses bars seulement) et le bouton « Voir tout le staff » lui rend les 7. Le bouton « Tout confirmer (N) » valide le lot affiché.',
  async seed(ctx) {
    const p = (name, off, type, s, e) => ({
        staff_id: ctx.staff[name], staff_name: name, date: ctx.day(ctx.nextMon, off),
        type, start_time: s, end_time: e, note: '', status: 'pending',
        created_at: new Date(), updated_at: new Date(),
    });
    await ctx.db.collection('availabilities').insertMany([
        p('Alice', 0, 'soir', 18, 26),      // Josy → dans le périmètre
        p('Alice', 1, 'soir', 18, 26),
        p('Bruno', 1, 'midi', 10, 17),      // Josy + Poni
        p('Chloé', 2, 'custom', 14, 22),    // Poni → HORS périmètre
        p('David', 3, 'soir', 19, 26),      // FanFan → HORS périmètre
        p('Diane', 0, 'soir', 17, 24),      // la directrice passe par la MÊME file (E-22)
        { staff_id: ctx.staff.Elena, staff_name: 'Elena', date: ctx.day(ctx.nextMon, 4),
          type: 'off', start_time: null, end_time: null, note: 'Indispo',
          status: 'pending', created_at: new Date() },
        // Contre-épreuve : une déjà validée ne doit PAS apparaître dans la file.
        { staff_id: ctx.staff.Bruno, staff_name: 'Bruno', date: ctx.day(ctx.nextMon, 5),
          type: 'soir', start_time: 18, end_time: 26, status: 'confirmed',
          establishment_id: 'Josy_pub', created_at: new Date() },
    ]);
} },

{ id: 'semaine-type', label: 'Semaine-type — directrice ET staff (E-22 v2, ouvert à tous le 2026-08-24)',
  howToTest: "OBSERVER L'ENVOI AUTOMATIQUE — le cas que le jeu ne fournissait pas avant le 2026-08-25. "
      + "La deadline de recette est TOUJOURS dépassée (bloc « reglages ») et le cron tourne AU DÉMARRAGE "
      + "en plus de son quart d'heure : redémarrer le serveur après le seed suffit à le déclencher. "
      + "Chloé a un modèle sur lundi / mercredi / jeudi / vendredi, et SEULS LUNDI ET VENDREDI doivent "
      + "arriver dans la file du patron — mercredi est déjà pris par sa dispo semée (création seule), "
      + "jeudi tombe sur son congé validé (bloc « conges »). Les deux règles se lisent sur un seul profil. "
      + "Une 2e exécution ne doit RIEN ajouter (marqueur last_materialized_week). "
      + "TESTER L'ENREGISTREMENT côté staff : se connecter en alice@ — seule rouverte nominativement, "
      + "donc seule à voir le bouton « Enregistrer cette semaine comme modèle » malgré la deadline "
      + "passée. Sur bruno@ / chloe@ le bouton est ABSENT, et c'est voulu : un modèle enregistré après "
      + "la deadline ne rattrape pas la semaine déjà figée.",
  async seed(ctx) {
    await ctx.db.collection('manager_dispo_templates').insertMany([
        { staff_id: ctx.staff.Diane,
          days: { 0: { type: 'soir', start_time: 17, end_time: 24 },
                  2: { type: 'soir', start_time: 17, end_time: 24 } },
          updated_at: new Date() },
        // Le cas STAFF. Mercredi (2) et jeudi (3) sont là EXPRÈS pour être écartés :
        // sans eux, un envoi automatique qui recouvrirait un congé validé passerait
        // inaperçu sur la recette — c'était la quasi-régression du 2026-08-24.
        { staff_id: ctx.staff['Chloé'], staff_name: 'Chloé',
          days: { 0: { type: 'midi',   start_time: 11, end_time: 17 },
                  2: { type: 'soir',   start_time: 18, end_time: 26 },   // ≠ de sa dispo semée (custom 14→22)
                  3: { type: 'midi',   start_time: 11, end_time: 17 },
                  4: { type: 'soir',   start_time: 18, end_time: 26 } },
          updated_at: new Date() },
    ]);
} },

{ id: 'conges', label: 'Congés staff (F-10) + absence directrice (E-19)',
  howToTest: 'Onglet Congés de la modale Dispos : la demande de Chloé est à valider. David est en congé validé cette semaine — il apparaît grisé dans le planning. L\'absence de Diane bloque ses dispos sur ces jours.',
  async seed(ctx) {
    await ctx.db.collection('time_off').insertMany([
        { staff_id: ctx.staff['Chloé'], staff_name: 'Chloé', mode: 'request', status: 'pending',
          start_date: ctx.day(ctx.nextMon, 8), end_date: ctx.day(ctx.nextMon, 12),
          reason: 'Vacances', created_at: new Date() },   // `reason`, pas `note` (server.js)
        { staff_id: ctx.staff.David, staff_name: 'David', mode: 'info', status: 'approved',
          start_date: ctx.day(ctx.thisMon, 5), end_date: ctx.day(ctx.thisMon, 6),
          reason: 'Week-end', created_at: new Date() },
        // Jeudi de la semaine EN COURS DE COLLECTE : le jour que la semaine-type de Chloé
        // couvre et que l'envoi automatique doit sauter. Un congé validé recouvert de
        // dispos à chaque deadline annulerait la purge des congés, semaine après semaine —
        // sans ce congé-là, rien sur la recette ne le montrerait.
        { staff_id: ctx.staff['Chloé'], staff_name: 'Chloé', mode: 'request', status: 'approved',
          start_date: ctx.day(ctx.nextMon, 3), end_date: ctx.day(ctx.nextMon, 3),
          reason: 'RDV médical', created_at: new Date() },
    ]);
    await ctx.db.collection('manager_time_off').insertOne({
        user_id: ctx.users.Diane, name: 'Diane', start_date: ctx.day(ctx.nextMon, 3),
        end_date: ctx.day(ctx.nextMon, 4), type: 'off', note: 'Formation', created_at: new Date(),
    });
} },

{ id: 'echanges', label: "Échanges de services (F-05) — double validation + inter-établissements",
  howToTest: "3e semaine à venir (publiée, la seule où le staff a des services échangeables). 1) ÉTAPE 1 — bruno@ : son JEUDI, et LUI SEUL, porte « à confirmer » → toucher la journée → Accepter / Refuser (Alice a proposé son mardi). Bruno n'est mêlé à aucune autre demande, sinon l'écran d'acceptation se confond avec un « en attente du patron ». 2) ÉTAPE 2 — patron@ : bouton « Échanges » = 2 demandes, chacune marquée « Accepté par … » ; directeur@ n'en voit qu'UNE (Josy). Celle d'Alice→Bruno n'apparaît chez PERSONNE tant que Bruno n'a pas répondu. 3) INTER-ÉTABLISSEMENTS — bruno@ : toucher son LUNDI (Josy) → « Proposer un échange » liste Diane (Josy) ET Chloé (Poni) ; le patron décoche « Autoriser les échanges entre établissements différents » en tête de la modale « Échanges » → Chloé disparaît de la liste.",
  async seed(ctx) {
    // Une semaine FUTURE ENTIÈRE et publiée : la route n'accepte que des shifts futurs
    // (`date >= aujourd'hui`) et de semaine publiée (B2-b). Semé un vendredi, la semaine
    // courante n'a plus assez de jours devant elle — le jeu périmerait selon l'heure du
    // seed, le travers qu'on paie déjà sur la deadline de recette.
    // ⚠️ nextMon+14 et PAS nextMon+7 : `scripts/smoke.js` s'est réservé nextMon+7 (`D(7)`)
    // pour le bloc B2-b, qui s'y crée son propre shift et COMPTE ce que le staff y voit.
    // Y semer quoi que ce soit fait échouer « une fois publiée, le staff la voit ».
    const futureMon = new Date(ctx.nextMon.getTime() + 14 * 864e5);
    const d = n => ctx.day(futureMon, n);

    // ⚠️ BRUNO N'EST CIBLE QUE DE LA DEMANDE 1. Première version du jeu : il était aussi
    // la cible de la demande semée en `pending` — donc « déjà acceptée par lui ». En
    // ouvrant son planning il tombait sur un jour « en attente du patron » signé de sa
    // propre main et concluait que l'écran d'acceptation n'existait pas. Le porteur de
    // l'étape 1 ne doit être mêlé à AUCUNE demande déjà acceptée.
    const shifts = [
        // Les 6 services engagés dans les 3 demandes ci-dessous.
        ctx.shift('Josy_pub',        'Alice', d(1), 18, 26),   // 0 · swap 1 — proposé
        ctx.shift('Josy_pub',        'Bruno', d(3), 18, 24),   // 1 · swap 1 — convoité (LE jour de Bruno)
        ctx.shift('Josy_pub',        'Alice', d(6), 18, 26),   // 2 · swap 2 — proposé
        ctx.shift('Josy_pub',        'Diane', d(5), 17, 24),   // 3 · swap 2 — convoité
        ctx.shift('Poni_restaurant', 'Chloé', d(2), 12, 20),   // 4 · swap 3 — proposé
        ctx.shift('Poni_restaurant', 'David', d(4), 12, 20),   // 5 · swap 3 — convoité (renfort, Poni est « Cuisine » comme lui)
        // Les 4 services LIBRES. Sans les deux services de Bruno, `shifts-for-swap` ne
        // lui ouvre qu'un seul bar — et le réglage inter-établissements devient
        // intestable, faute de cible dans l'autre.
        ctx.shift('Josy_pub',        'Bruno', d(0), 18, 24),   // 6 · le sien, Josy
        ctx.shift('Poni_restaurant', 'Bruno', d(2), 12, 20),   // 7 · le sien, Poni
        ctx.shift('Josy_pub',        'Diane', d(1), 17, 23),   // 8 · cible libre, MÊME bar
        ctx.shift('Poni_restaurant', 'Chloé', d(5), 12, 20),   // 9 · cible libre, AUTRE bar
    ];
    const ins = await ctx.db.collection('shifts').insertMany(shifts);
    const id = i => String(ins.insertedIds[i]);

    await ctx.db.collection('settings').insertOne({
        key: 'publish_' + toDateStr(futureMon), establishments: 'ALL', published_at: new Date(),
    });

    // Le doc d'échange est recopié à la main (le serveur le construit dans la route) :
    // garder les MÊMES champs, sinon l'écran patron affiche des créneaux vides.
    const swap = (fromI, toI, status, note) => {
        const f = shifts[fromI], t = shifts[toI];
        return {
            from_shift_id: id(fromI),      to_shift_id:   id(toI),
            from_staff_id: f.staff_id,     from_staff_name: f.staff_name,
            to_staff_id:   t.staff_id,     to_staff_name:   t.staff_name,
            from_establishment_id: f.establishment_id,
            to_establishment_id:   t.establishment_id,
            from_date: f.date, from_start_time: f.start_time, from_end_time: f.end_time,
            to_date:   t.date, to_start_time:   t.start_time, to_end_time:   t.end_time,
            note, status,
            created_at: new Date(Date.now() - 864e5),
            // `pending` = le collègue a DÉJÀ accepté (étape 1). C'est la seule façon
            // d'avoir quelque chose d'arbitrable dans la file du patron sans passer
            // par l'écran staff — et l'étape 1 reste testable sur la demande 1.
            staff_accepted_at: status === 'pending' ? new Date(Date.now() - 3600e3) : null,
            decided_at: null, decided_by: null, rejected_by: null,
        };
    };

    await ctx.db.collection('shift_swaps').insertMany([
        // 1 — chez le COLLÈGUE : invisible du patron tant que Bruno n'a pas répondu.
        swap(0, 1, 'pending_staff', "Je suis pris ce soir-là, tu peux prendre mon mardi ?"),
        // 2 — chez le PATRON, sur Josy : celle-là, la directrice la voit.
        swap(2, 3, 'pending', ""),
        // 3 — chez le PATRON, sur Poni : la directrice (Josy) ne doit PAS la voir.
        swap(4, 5, 'pending', "Rendez-vous médical le mercredi."),
    ]);
} },

{ id: 'reglages', label: 'Réglages dispos + performance (S-02/S-03, §9.1)',
  howToTest: 'La deadline est VOLONTAIREMENT dépassée : la directrice peut quand même envoyer ses dispos (§9.1), un staff non. Réglages perf : la directrice ne voit que Josy, l\'observateur lit mais n\'écrit pas.',
  async seed(ctx) {
    await ctx.db.collection('settings').insertMany([
        // La deadline de recette est toujours dépassée — pratique pour §9.1, mais elle rend
        // la SAISIE d'une semaine-type intestable pour un staff ordinaire (bouton masqué, et
        // un PUT tardif ne rattrape pas la semaine figée). Alice est donc rouverte en
        // permanence : c'est le seul profil staff sur lequel l'écran d'enregistrement du
        // modèle se montre. Forme CHAÎNE et non { staff_id, week_start } volontairement :
        // elle ne porte pas de semaine, donc le jeu ne périme pas au lundi suivant.
        { key: 'dispo', open: true, force_open: false, message: null,
          custom_deadline: '2026-01-05T00:00', force_open_staff: [ctx.staff.Alice] }, // lundi 00:00 = toujours passée
        { key: 'performance',          target_charged: 30, charge_rate: 45 },
        { key: 'performance_Josy_pub', target_charged: 28, charge_rate: 42 },
    ]);
} },

{ id: 'ca', label: 'CA quotidien → coefficient masse salariale (E-24)',
  howToTest: 'Page Performance : le coefficient se calcule, les pastilles se colorent contre l\'objectif du bar sélectionné.',
  async seed(ctx) {
    // ⚠️ Le champ est `revenue`, PAS `amount` — c'est ce qu'écrit `POST /api/revenue`
    // (server.js) et ce que lit `GET /api/performance`. Le seed utilisait `amount` : le CA
    // ressortait `undefined`, le coefficient à 0 %, et E-24 était intestable sur la recette.
    await ctx.db.collection('daily_revenue').insertMany([
        { establishment_id: 'Josy_pub',        date: ctx.day(ctx.lastMon, 1), revenue: 2400 },
        { establishment_id: 'Josy_pub',        date: ctx.day(ctx.thisMon, 2), revenue: 2750 },
        { establishment_id: 'Poni_restaurant', date: ctx.day(ctx.lastMon, 3), revenue: 1900 },
    ]);
} },

];

// ── Exécution ────────────────────────────────────────────────────────────────
async function run() {
    // `expect` : la recette vise les bases en `…_dev` / `…_main`. Sans cette borne, un
    // `ENV_FILE=.env.demo npm run dev:seed` écrasait la base de démo par le jeu minimal,
    // sans rien dire — les deux scripts purgent exactement les mêmes collections.
    const { client, db, dbName } = await openDb({ destructive: true, expect: /(dev|main)$/ });
    try {
        // 15 purges indépendantes : en série c'était 15 allers-retours Atlas (~1,5 s).
        await Promise.all(WIPE.map(c => db.collection(c).deleteMany({})));

        const now = new Date();
        const ctx = {
            db, staff: {}, color: {}, users: {}, roles: {},
            thisMon: weekStart(now),
            nextMon: weekStart(new Date(now.getTime() + 7 * 864e5)),
            lastMon: weekStart(new Date(now.getTime() - 7 * 864e5)),
            // Dates RELATIVES à aujourd'hui : le jeu ne périme jamais.
            day: (base, n) => toDateStr(new Date(base.getTime() + n * 864e5)),
            shift: (estab, name, date, start, end, extra = {}) => ({
                establishment_id: estab, staff_id: ctx.staff[name], staff_name: name,
                color: ctx.color[name] || '#888', date, start_time: start, end_time: end, ...extra,
            }),
        };

        for (const f of FEATURES) {
            await f.seed(ctx);
            console.log('   ✓ ' + f.label);
        }

        console.log('\n╭─ Base « ' + dbName +' » prête · mot de passe commun : ' + PASSWORD);
        console.log('│  patron@templyo.test · directeur@templyo.test · observateur@templyo.test');
        console.log('│  alice@ · bruno@ · chloe@templyo.test');
        console.log('╰─ Check-list de recette :\n');
        FEATURES.forEach((f, i) => {
            console.log('  ' + String(i + 1).padStart(2) + '. ' + f.label);
            console.log('      ' + f.howToTest);
        });
        console.log('\n  Validation automatique : npm run smoke\n');
    } catch (e) {
        console.error('❌', e);
        process.exitCode = 1;
    } finally {
        await client.close();
    }
}

run();
