'use strict';
// Jeu de données de RECETTE — base de dev, à relancer autant de fois que voulu.
//
// But : pouvoir vérifier d'un coup d'œil que les nouveautés marchent ET que rien
// d'ancien n'a cassé. Le jeu est donc construit pour rendre chaque feature
// OBSERVABLE, pas pour être réaliste :
//   • dispos en attente réparties sur DEUX bars → le périmètre directeur (S-04) et sa
//     bascule « Voir tout le staff » se voient immédiatement ;
//   • un directeur avec profil staff + venues → E-22 / R-06 (il peut saisir ses dispos) ;
//   • un observateur → S-02 (il lit les réglages perf, il ne peut pas les écrire) ;
//   • congés posés + absence directeur → F-10 / E-19 ;
//   • shifts passés + CA → récap mensuel, pointage, coefficient (E-24) ;
//   • semaine publiée / semaine suivante non publiée → vue staff.
//
// Toutes les dates sont RELATIVES à aujourd'hui : le jeu ne périme pas.
// Idempotent : il vide les collections métier de la base ciblée avant d'insérer.

const bcrypt = require('bcryptjs');
const { openDb } = require('./_db');
const { toDateStr, weekStart } = require('../lib/utils');

const PASSWORD = process.env.SEED_PASSWORD || 'Templyo2026!';

const day = (base, n) => toDateStr(new Date(base.getTime() + n * 864e5));

// Collections vidées à chaque passage (tout le métier, pas les index).
const WIPE = [
    'establishments', 'staff', 'users', 'sessions', 'shifts', 'availabilities',
    'time_off', 'manager_time_off', 'manager_dispo_templates', 'roles', 'settings',
    'daily_revenue', 'notifications', 'staff_notifications', 'push_subscriptions',
];

const ESTABS = [
    { id: 'Josy_pub',          name: 'Josy',   type: 'pub',        hours: { open: 10, close: 26 } },
    { id: 'Poni_restaurant',   name: 'Poni',   type: 'restaurant', hours: { open: 10, close: 26 } },
    { id: 'FanFan_restaurant', name: 'FanFan', type: 'restaurant', hours: { open: 10, close: 26 } },
];

async function run() {
    const { client, db } = await openDb({ destructive: true });
    try {
        for (const c of WIPE) await db.collection(c).deleteMany({});

        const hash = await bcrypt.hash(PASSWORD, 12);
        const now  = new Date();
        const thisMonday = weekStart(now);                       // semaine courante
        const nextMonday = weekStart(new Date(now.getTime() + 7 * 864e5)); // semaine des dispos
        const lastMonday = weekStart(new Date(now.getTime() - 7 * 864e5)); // semaine passée

        await db.collection('establishments').insertMany(ESTABS);

        // ── Rôles ────────────────────────────────────────────────────────────
        await db.collection('roles').insertMany([
            { name: 'Responsable de soirée', type: 'responsable' },
            { name: 'Barman',                type: 'informatif' },
            { name: 'Cuisine',               type: 'informatif' },
        ]);

        // ── Staff ────────────────────────────────────────────────────────────
        // Répartition VOLONTAIRE : Alice/Bruno sur Josy (le bar du directeur),
        // Chloé/David ailleurs → c'est ce qui rend le filtre S-04 visible.
        const staffDefs = [
            { name: 'Alice',  color: '#3498db', venues: ['Josy_pub'],                        roles: ['Responsable de soirée'], hourly_rate: 13 },
            { name: 'Bruno',  color: '#9b59b6', venues: ['Josy_pub', 'Poni_restaurant'],     roles: ['Barman'],                hourly_rate: 12 },
            { name: 'Chloé',  color: '#e67e22', venues: ['Poni_restaurant'],                 roles: ['Cuisine'],               hourly_rate: 12.5 },
            { name: 'David',  color: '#2ecc71', venues: ['FanFan_restaurant'],               roles: [],                        hourly_rate: 11.9 },
            { name: 'Elena',  color: '#e74c3c', venues: [],                                  roles: [],                        hourly_rate: 12 },
        ];
        const staffRes = await db.collection('staff').insertMany(staffDefs.map(s => ({
            ...s, email: '', phone: '', can_submit_dispos: true, created_at: new Date(),
        })));
        const S = {}; staffDefs.forEach((s, i) => { S[s.name] = String(staffRes.insertedIds[i]); });

        // Profil staff du DIRECTEUR (E-22 Modèle A : un directeur EST un staff).
        // `venues` doit rester aligné sur `assigned_establishments` — c'est R-06.
        const dirStaff = await db.collection('staff').insertOne({
            name: 'Diane (directrice)', color: '#1abc9c', email: 'directeur@templyo.test', phone: '',
            venues: ['Josy_pub'], roles: [], can_submit_dispos: true,
            is_manager: true, hourly_rate: 16, created_at: new Date(),
        });
        const DIR_STAFF = String(dirStaff.insertedId);

        // ── Comptes ──────────────────────────────────────────────────────────
        const users = [
            { email: 'patron@templyo.test',      role: 'patron',       name: 'Paul Patron',   staff_id: null,      assigned_establishments: [] },
            { email: 'directeur@templyo.test',   role: 'directeur',    name: 'Diane',         staff_id: DIR_STAFF, assigned_establishments: ['Josy_pub'] },
            { email: 'observateur@templyo.test', role: 'observateur',  name: 'Oscar Audit',   staff_id: null,      assigned_establishments: [] },
            { email: 'alice@templyo.test',       role: 'staff',        name: 'Alice',         staff_id: S.Alice,   assigned_establishments: [] },
            { email: 'bruno@templyo.test',       role: 'staff',        name: 'Bruno',         staff_id: S.Bruno,   assigned_establishments: [] },
            { email: 'chloe@templyo.test',       role: 'staff',        name: 'Chloé',         staff_id: S['Chloé'],assigned_establishments: [] },
        ];
        await db.collection('users').insertMany(users.map(u => ({
            ...u, password_hash: hash, active: true, created_at: new Date(),
        })));

        // ── Shifts ───────────────────────────────────────────────────────────
        const mk = (estab, staffName, staffId, d, start, end, extra = {}) => ({
            establishment_id: estab, staff_id: staffId, staff_name: staffName,
            color: (staffDefs.find(s => s.name === staffName) || {}).color || '#1abc9c',
            date: d, start_time: start, end_time: end, ...extra,
        });
        const shifts = [
            // Semaine PASSÉE, avec heures réelles → récap mensuel + pointage
            mk('Josy_pub', 'Alice', S.Alice, day(lastMonday, 1), 18, 26, { real_start: 18, real_end: 26.5, pointage_resp: true, hourly_rate_snapshot: 13 }),
            mk('Josy_pub', 'Bruno', S.Bruno, day(lastMonday, 1), 20, 26, { real_start: 20, real_end: 26,   hourly_rate_snapshot: 12 }),
            mk('Poni_restaurant', 'Chloé', S['Chloé'], day(lastMonday, 3), 12, 22, { real_start: 12, real_end: 22, hourly_rate_snapshot: 12.5 }),
            // Semaine COURANTE (publiée, cf. settings plus bas)
            mk('Josy_pub', 'Alice', S.Alice, day(thisMonday, 2), 18, 26, { pointage_resp: true }),
            mk('Josy_pub', 'Diane (directrice)', DIR_STAFF, day(thisMonday, 2), 17, 24),
            mk('Poni_restaurant', 'Bruno', S.Bruno, day(thisMonday, 3), 12, 20),
            mk('FanFan_restaurant', 'David', S.David, day(thisMonday, 4), 18, 24),
            // Un Joker ouvert aux candidatures (F-03 / 3.3bis)
            mk('Josy_pub', 'Joker', '__joker__', day(thisMonday, 5), 19, 26,
               { is_joker: true, joker_open: true, joker_candidates: [], note: 'Renfort samedi soir' }),
        ];
        await db.collection('shifts').insertMany(shifts);

        // ── Dispos en attente (semaine PROCHAINE) ────────────────────────────
        // C'est l'écran de validation du patron. Réparti sur 2 bars exprès.
        const pending = (staffId, name, offset, type, start, end) => ({
            staff_id: staffId, staff_name: name, date: day(nextMonday, offset),
            type, start_time: start, end_time: end, note: '', status: 'pending',
            created_at: new Date(), updated_at: new Date(),
        });
        await db.collection('availabilities').insertMany([
            pending(S.Alice, 'Alice', 0, 'soir', 18, 26),          // Josy → dans le périmètre directeur
            pending(S.Alice, 'Alice', 1, 'soir', 18, 26),
            pending(S.Bruno, 'Bruno', 1, 'midi', 10, 17),          // Josy + Poni
            pending(S['Chloé'], 'Chloé', 2, 'custom', 14, 22),     // Poni → HORS périmètre directeur
            pending(S.David, 'David', 3, 'soir', 19, 26),          // FanFan → HORS périmètre
            { staff_id: S.Elena, staff_name: 'Elena', date: day(nextMonday, 4), type: 'off',
              start_time: null, end_time: null, note: 'Indispo', status: 'pending', created_at: new Date() },
            // Le DIRECTEUR passe par la même file (E-22)
            pending(DIR_STAFF, 'Diane (directrice)', 0, 'soir', 17, 24),
            // Une déjà validée, pour la contre-épreuve
            { staff_id: S.Bruno, staff_name: 'Bruno', date: day(nextMonday, 5), type: 'soir',
              start_time: 18, end_time: 26, status: 'confirmed', establishment_id: 'Josy_pub', created_at: new Date() },
        ]);

        // Semaine-type du directeur (E-22 v2) — pré-remplissage, création seule
        await db.collection('manager_dispo_templates').insertOne({
            staff_id: DIR_STAFF,
            days: { 0: { type: 'soir', start_time: 17, end_time: 24 },
                    2: { type: 'soir', start_time: 17, end_time: 24 } },
            updated_at: new Date(),
        });

        // ── Congés (F-10) et absence directeur (E-19) ────────────────────────
        await db.collection('time_off').insertMany([
            { staff_id: S['Chloé'], staff_name: 'Chloé', mode: 'request', status: 'pending',
              start_date: day(nextMonday, 8), end_date: day(nextMonday, 12), note: 'Vacances', created_at: new Date() },
            { staff_id: S.David, staff_name: 'David', mode: 'info', status: 'approved',
              start_date: day(thisMonday, 5), end_date: day(thisMonday, 6), note: 'Week-end', created_at: new Date() },
        ]);
        const dirUser = await db.collection('users').findOne({ email: 'directeur@templyo.test' });
        await db.collection('manager_time_off').insertOne({
            user_id: String(dirUser._id), start_date: day(nextMonday, 3), end_date: day(nextMonday, 4),
            type: 'off', note: 'Formation', created_at: new Date(),
        });

        // ── Réglages ─────────────────────────────────────────────────────────
        await db.collection('settings').insertMany([
            // Saisie des dispos OUVERTE partout, deadline déjà passée → permet de
            // tester l'exemption de deadline du directeur (§9.1) sans attendre.
            { key: 'dispo', open: true, force_open: false, message: null,
              custom_deadline: '2026-01-05T00:00', force_open_staff: [] },
            { key: 'performance',              target_charged: 30, charge_rate: 45 },
            { key: 'performance_Josy_pub',     target_charged: 28, charge_rate: 42 },
            { key: 'publish_' + toDateStr(thisMonday), published: true, published_at: new Date() },
        ]);

        // CA quotidien → coefficient masse salariale (E-24)
        await db.collection('daily_revenue').insertMany([
            { establishment_id: 'Josy_pub',        date: day(lastMonday, 1), amount: 2400 },
            { establishment_id: 'Josy_pub',        date: day(thisMonday, 2), amount: 2750 },
            { establishment_id: 'Poni_restaurant', date: day(lastMonday, 3), amount: 1900 },
        ]);

        console.log('\n✅ Base de recette prête.\n');
        console.log('   Comptes (mot de passe commun : ' + PASSWORD + ')');
        console.log('   ┌─────────────────────────────┬──────────────┬────────────────────────┐');
        console.log('   │ patron@templyo.test         │ patron       │ voit tout              │');
        console.log('   │ directeur@templyo.test      │ directeur    │ Josy uniquement        │');
        console.log('   │ observateur@templyo.test    │ observateur  │ lecture seule          │');
        console.log('   │ alice@templyo.test          │ staff        │ responsable de soirée  │');
        console.log('   │ bruno@templyo.test          │ staff        │ 2 bars                 │');
        console.log('   │ chloe@templyo.test          │ staff        │ congé en attente       │');
        console.log('   └─────────────────────────────┴──────────────┴────────────────────────┘');
        console.log('\n   7 dispos en attente : 3 sur Josy (périmètre directeur), 2 ailleurs,');
        console.log('   1 indispo, 1 du directeur lui-même.\n');
    } catch (e) {
        console.error('❌', e);
        process.exitCode = 1;
    } finally {
        await client.close();
    }
}

run();
