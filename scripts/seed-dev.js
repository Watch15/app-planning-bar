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
const { openDb } = require('./_db');
const { toDateStr, weekStart } = require('../lib/utils');

const PASSWORD = process.env.SEED_PASSWORD || 'Templyo2026!';

// Collections remises à zéro à chaque passage.
// ⚠️ Les index NE sont PAS recréés — l'affirmation inverse figurait ici et était fausse :
// `connectDB()` n'en pose que 6 au démarrage, les ~19 autres viennent de `npm run init`
// (destructif, et il refuse la base de prod). Sur une base de recette fraîche, les requêtes
// tournent donc sans la plupart des index : sans effet à cette volumétrie, mais à savoir
// avant d'y mesurer quoi que ce soit.
const WIPE = [
    'establishments', 'staff', 'users', 'sessions', 'shifts', 'availabilities',
    'time_off', 'manager_time_off', 'manager_dispo_templates', 'roles', 'settings',
    'daily_revenue', 'notifications', 'staff_notifications', 'push_subscriptions',
];

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
    const byStaff = { Alice: ['Bar'], Bruno: ['Bar'], 'Chloé': ['Cuisine'], David: ['Cuisine'], Diane: ['Bar'] };
    await ctx.db.collection('staff').bulkWrite(Object.entries(byStaff).map(
        ([name, groups]) => ({ updateOne: { filter: { name }, update: { $set: { groups } } } })));
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
        key: 'publish_' + toDateStr(ctx.thisMon), published: true, published_at: new Date(),
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

{ id: 'semaine-type', label: 'Semaine-type de la directrice (E-22 v2)',
  howToTest: 'Modale « Ma semaine-type » côté directrice. Elle PRÉ-REMPLIT les jours vides en `pending` — elle n\'écrase jamais une saisie existante.',
  async seed(ctx) {
    await ctx.db.collection('manager_dispo_templates').insertOne({
        staff_id: ctx.staff.Diane,
        days: { 0: { type: 'soir', start_time: 17, end_time: 24 },
                2: { type: 'soir', start_time: 17, end_time: 24 } },
        updated_at: new Date(),
    });
} },

{ id: 'conges', label: 'Congés staff (F-10) + absence directrice (E-19)',
  howToTest: 'Onglet Congés de la modale Dispos : la demande de Chloé est à valider. David est en congé validé cette semaine — il apparaît grisé dans le planning. L\'absence de Diane bloque ses dispos sur ces jours.',
  async seed(ctx) {
    await ctx.db.collection('time_off').insertMany([
        { staff_id: ctx.staff['Chloé'], staff_name: 'Chloé', mode: 'request', status: 'pending',
          start_date: ctx.day(ctx.nextMon, 8), end_date: ctx.day(ctx.nextMon, 12),
          note: 'Vacances', created_at: new Date() },
        { staff_id: ctx.staff.David, staff_name: 'David', mode: 'info', status: 'approved',
          start_date: ctx.day(ctx.thisMon, 5), end_date: ctx.day(ctx.thisMon, 6),
          note: 'Week-end', created_at: new Date() },
    ]);
    await ctx.db.collection('manager_time_off').insertOne({
        user_id: ctx.users.Diane, start_date: ctx.day(ctx.nextMon, 3),
        end_date: ctx.day(ctx.nextMon, 4), type: 'off', note: 'Formation', created_at: new Date(),
    });
} },

{ id: 'reglages', label: 'Réglages dispos + performance (S-02/S-03, §9.1)',
  howToTest: 'La deadline est VOLONTAIREMENT dépassée : la directrice peut quand même envoyer ses dispos (§9.1), un staff non. Réglages perf : la directrice ne voit que Josy, l\'observateur lit mais n\'écrit pas.',
  async seed(ctx) {
    await ctx.db.collection('settings').insertMany([
        { key: 'dispo', open: true, force_open: false, message: null,
          custom_deadline: '2026-01-05T00:00', force_open_staff: [] }, // lundi 00:00 = toujours passée
        { key: 'performance',          target_charged: 30, charge_rate: 45 },
        { key: 'performance_Josy_pub', target_charged: 28, charge_rate: 42 },
    ]);
} },

{ id: 'ca', label: 'CA quotidien → coefficient masse salariale (E-24)',
  howToTest: 'Page Performance : le coefficient se calcule, les pastilles se colorent contre l\'objectif du bar sélectionné.',
  async seed(ctx) {
    await ctx.db.collection('daily_revenue').insertMany([
        { establishment_id: 'Josy_pub',        date: ctx.day(ctx.lastMon, 1), amount: 2400 },
        { establishment_id: 'Josy_pub',        date: ctx.day(ctx.thisMon, 2), amount: 2750 },
        { establishment_id: 'Poni_restaurant', date: ctx.day(ctx.lastMon, 3), amount: 1900 },
    ]);
} },

];

// ── Exécution ────────────────────────────────────────────────────────────────
async function run() {
    const { client, db, dbName } = await openDb({ destructive: true });
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
