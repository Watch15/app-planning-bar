// Rattrapage E-22 / Modèle A : garantit que chaque compte `directeur` a un profil
// `staff` lié (planifiable + compté comme un staff). Les directeurs promus depuis un
// staff ont déjà un `staff_id` → ignorés. Idempotent : relançable sans effet de bord.
//
// Usage : node scripts/backfill-director-staff.js
//         node scripts/dev-run.js scripts/backfill-director-staff.js   (base de recette)
const { pickStaffColor } = require('../lib/utils');
const { openDb } = require('./_db');

async function main() {
    // Non destructif (création seule), mais il ÉCRIT : il doit respecter `MONGO_DB`,
    // sinon un rattrapage lancé « sur la recette » atterrit en réalité sur la prod.
    const { client, db } = await openDb();
    try {
        const directors = await db.collection('users').find({ role: 'directeur' }).toArray();
        const used = new Set(
            (await db.collection('staff').find({}, { projection: { color: 1 } }).toArray()).map(s => s.color)
        );

        let created = 0, skipped = 0;
        for (const u of directors) {
            if (u.staff_id) { skipped++; continue; } // promu depuis un staff → déjà lié
            const color = pickStaffColor(used);
            used.add(color);
            const { insertedId } = await db.collection('staff').insertOne({
                name:   u.name || 'Directeur',
                color,
                email:  u.email || '',
                phone:  u.phone || '',
                venues: u.assigned_establishments || [],
                roles:  [],
                can_submit_dispos: true,
                is_manager: true, // informatif — cf. createManagerStaffProfile (server.js)
                created_at: new Date(),
            });
            await db.collection('users').updateOne({ _id: u._id }, { $set: { staff_id: String(insertedId) } });
            created++;
            console.log(`  + profil staff créé pour ${u.name || u.email || u.phone || u._id} → ${insertedId}`);
        }

        console.log(`\n✅ Rattrapage terminé : ${created} profil(s) créé(s), ${skipped} directeur(s) déjà lié(s).`);
    } catch (e) {
        console.error('❌', e.message);
        process.exitCode = 1;
    } finally {
        await client.close();
    }
}

main();
