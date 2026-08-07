'use strict';
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Répare un compte branché sur un profil `staff` SUPPRIMÉ.                 ║
// ║  Rebranche le compte, et rapatrie ce qui s'était accumulé sur le mort.    ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// LE PROBLÈME (constaté en prod le 2026-08-07, compte « Antoine Bozo ») :
// `DELETE /api/staff/:id` (server.js) supprime le profil et ses shifts, mais ne touche
// NI `users.staff_id`, NI les `availabilities`, NI les `time_off`. Le compte reste donc
// branché sur un identifiant mort — et tout ce que la personne saisit ENSUITE s'accumule
// dessus, invisible pour tout le monde. Chez le client : 15 dispos et 3 congés, dont des
// vacances à venir que le patron ne voyait pas en construisant son planning.
//
// Ce script ne devine jamais : il ne rapproche que sur e-mail, puis sur nom normalisé, et
// s'abstient si le résultat n'est pas unique.
//
//   node scripts/fix-orphan-staff-link.js            → simulation (n'écrit RIEN)
//   node scripts/fix-orphan-staff-link.js --apply    → applique
//
// ⚠️ `openDb()` affiche la base ciblée : LIRE cette ligne avant --apply.

const { ObjectId } = require('mongodb');
const { openDb } = require('./_db');

const APPLY = process.argv.includes('--apply');

const norm = s => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();

async function main() {
    const { client, db, dbName } = await openDb();
    try {
        const staff = await db.collection('staff').find({}, { projection: { name: 1, email: 1 } }).toArray();
        const alive = new Set(staff.map(s => String(s._id)));
        const users = await db.collection('users')
            .find({ staff_id: { $ne: null } }, { projection: { name: 1, email: 1, role: 1, staff_id: 1 } }).toArray();
        const broken = users.filter(u => u.staff_id && !alive.has(String(u.staff_id)));

        console.log('\n' + (APPLY ? '⚙️  MODE APPLICATION' : '🔍 SIMULATION — aucune écriture')
            + '   ·   ' + broken.length + ' compte(s) branché(s) sur un profil supprimé\n');
        if (!broken.length) { console.log('  Rien à réparer.\n'); return; }

        for (const u of broken) {
            const label = u.name || u.email || String(u._id);
            let hits = u.email ? staff.filter(s => s.email && norm(s.email) === norm(u.email)) : [];
            if (!hits.length) hits = staff.filter(s => norm(s.name) === norm(u.name));

            const dead = String(u.staff_id);
            const [disp, cong, shifts] = await Promise.all([
                db.collection('availabilities').countDocuments({ staff_id: dead }),
                db.collection('time_off').countDocuments({ staff_id: dead }),
                db.collection('shifts').countDocuments({ staff_id: dead }),
            ]);

            if (hits.length !== 1) {
                console.log('  ⚠️  ' + label.padEnd(22) + (hits.length ? hits.length + ' profils candidats — AMBIGU, non touché'
                                                                      : 'aucun profil correspondant — non touché'));
                continue;
            }
            const target = hits[0];
            console.log('  ✅ ' + label.padEnd(22) + '→ profil « ' + target.name + ' » (' + target._id + ')');
            console.log('      profil mort ' + dead + ' : ' + disp + ' dispo(s), ' + cong + ' congé(s), ' + shifts + ' shift(s) à rapatrier');
            console.log('      retour arrière : users.staff_id = "' + dead + '"');

            if (!APPLY) continue;

            const newId = String(target._id);
            const [rd, rc, rs] = await Promise.all([
                db.collection('availabilities').updateMany({ staff_id: dead }, { $set: { staff_id: newId } }),
                db.collection('time_off').updateMany({ staff_id: dead }, { $set: { staff_id: newId } }),
                db.collection('shifts').updateMany({ staff_id: dead }, { $set: { staff_id: newId } }),
            ]);
            await db.collection('users').updateOne({ _id: u._id }, { $set: { staff_id: newId } });
            console.log('      → rapatriés : ' + rd.modifiedCount + ' dispo(s), ' + rc.modifiedCount
                + ' congé(s), ' + rs.modifiedCount + ' shift(s) · compte rebranché');
        }

        if (!APPLY) {
            console.log('\n  Relance avec --apply pour écrire.\n');
            return;
        }
        console.log('\n  ✅ Terminé dans « ' + dbName + ' »');
        console.log('  ⚠️ Les personnes concernées doivent SE RECONNECTER : `staff_id` est figé');
        console.log('     dans la session au login.\n');
    } catch (e) {
        console.error('❌', e.message);
        process.exitCode = 1;
    } finally {
        await client.close();
    }
}

main();
