// Rattrapage E-22 / Modèle A : garantit que chaque compte `directeur` a un profil
// `staff` lié (planifiable + compté comme un staff). Les directeurs promus depuis un
// staff ont déjà un `staff_id` → ignorés. Idempotent : relançable sans effet de bord.
//
// Usage : node scripts/backfill-director-staff.js   (MONGO_URI dans .env)
const { MongoClient } = require('mongodb');
const { pickStaffColor } = require('../lib/utils');
require('dotenv').config();

async function main() {
    const client = new MongoClient(process.env.MONGO_URI);
    try {
        await client.connect();
        const db = client.db('gestion_bar');

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
                is_manager: true,
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
