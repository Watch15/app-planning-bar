'use strict';
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  LIE un compte `directeur` à son profil `staff` EXISTANT.                 ║
// ║  Ne crée rien. Ne supprime rien. N'écrit qu'un seul champ : users.staff_id ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// POURQUOI CE SCRIPT PLUTÔT QUE `backfill-director-staff.js` :
// le backfill ne rapproche que sur `users.staff_id` et CRÉE un profil neuf sinon. Or sur
// une base ancienne, un directeur travaille souvent déjà en salle : son profil staff
// existe, avec son taux, ses rôles et tout son historique de shifts. Le backfill en
// créerait un SECOND — doublon dans la barre staff, historique scindé, et la personne
// comptée DEUX FOIS dans la masse salariale. Constaté sur la base du premier client :
// 2 directeurs sur 3 étaient dans ce cas.
//
// Ici on ne fait que poser le lien manquant, et uniquement quand il est certain.
//
//   node scripts/link-director-staff.js                  → simulation (n'écrit RIEN)
//   node scripts/link-director-staff.js --apply          → applique
//   ENV_FILE=.env.client node scripts/link-director-staff.js
//
// ⚠️ `openDb()` affiche la base ciblée avant toute chose : LIRE cette ligne avant --apply.

const { openDb } = require('./_db');

const APPLY = process.argv.includes('--apply');

// Comparaison tolérante : casse, accents, ponctuation et espaces multiples ignorés.
// « Alexandre  Housset » et « alexandre housset » doivent se rapprocher.
const norm = s => String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

async function main() {
    const { client, db, dbName } = await openDb();
    try {
        const dirs = await db.collection('users')
            .find({ role: 'directeur' }, { projection: { name: 1, email: 1, staff_id: 1, assigned_establishments: 1 } })
            .toArray();
        const staff = await db.collection('staff')
            .find({}, { projection: { name: 1, email: 1, venues: 1 } }).toArray();

        console.log('\n' + (APPLY ? '⚙️  MODE APPLICATION — écriture réelle' : '🔍 SIMULATION — aucune écriture')
            + '   ·   ' + dirs.length + ' compte(s) directeur, ' + staff.length + ' profil(s) staff\n');

        const todo = [], already = [], none = [], ambiguous = [];

        for (const u of dirs) {
            if (u.staff_id) { already.push(u); continue; }
            // E-mail d'abord (identifiant fort), nom normalisé ensuite.
            let hits = u.email ? staff.filter(s => s.email && norm(s.email) === norm(u.email)) : [];
            if (!hits.length) hits = staff.filter(s => norm(s.name) === norm(u.name));
            if (hits.length === 1)      todo.push({ u, s: hits[0] });
            else if (hits.length === 0) none.push(u);
            else                        ambiguous.push({ u, hits });
        }

        const label = u => (u.name || u.email || String(u._id));

        for (const { u, s } of todo) {
            const venues   = s.venues || [];
            const assigned = u.assigned_establishments || [];
            const same = JSON.stringify([...venues].sort()) === JSON.stringify([...assigned].sort());
            console.log('  ✅ ' + label(u).padEnd(24) + ' → profil « ' + s.name + ' »');
            console.log('      venues=' + JSON.stringify(venues) + '  assigned=' + JSON.stringify(assigned)
                + (same ? '  (identiques)' : '  ⚠️ DIVERGENTS — la synchro les alignera à la 1re édition'));
        }
        already.forEach(u => console.log('  ⏭️  ' + label(u).padEnd(24) + ' déjà lié'));
        none.forEach(u => console.log('  ❔ ' + label(u).padEnd(24) + ' AUCUN profil staff correspondant'
            + ' — création volontairement NON faite, décision humaine'));
        ambiguous.forEach(({ u, hits }) => console.log('  ⚠️  ' + label(u).padEnd(24)
            + ' AMBIGU (' + hits.length + ' profils : ' + hits.map(h => h.name).join(', ') + ') — non touché'));

        if (!APPLY) {
            console.log('\n  ' + todo.length + ' liaison(s) à faire. Relance avec --apply pour les écrire.\n');
            return;
        }
        if (!todo.length) { console.log('\n  Rien à écrire.\n'); return; }

        const before = await db.collection('staff').countDocuments();
        for (const { u, s } of todo) {
            await db.collection('users').updateOne({ _id: u._id }, { $set: { staff_id: String(s._id) } });
        }
        const after = await db.collection('staff').countDocuments();

        console.log('\n  ✅ ' + todo.length + ' compte(s) lié(s) dans « ' + dbName + ' »');
        console.log('  Profils staff : ' + before + ' → ' + after
            + (before === after ? '  (inchangé — c\'est bien le but)' : '  ⚠️ A CHANGÉ, ce script ne devait rien créer !'));
        console.log('\n  ⚠️ Les directeurs liés doivent SE RECONNECTER : `staff_id` est figé');
        console.log('     dans la session au login, sinon ils gardent le 400 « Aucun profil staff lié ».\n');
    } catch (e) {
        console.error('❌', e.message);
        process.exitCode = 1;
    } finally {
        await client.close();
    }
}

main();
