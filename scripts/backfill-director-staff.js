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

        // ⛔ GARDE-FOU (A-08, 2026-08-08) — ce script CRÉE un profil. Sur une base existante,
        // un directeur travaille souvent déjà en salle et en a donc déjà un : on en créerait
        // un SECOND (historique scindé, paie comptée deux fois). Constaté chez le premier
        // client : 2 directeurs sur 3. Si un homonyme existe, on refuse et on renvoie vers
        // `link-directors`, qui rapproche du profil existant sans rien créer.
        const norm = x => String(x || '').toLowerCase().normalize('NFD')
            .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
        const allStaff = await db.collection('staff').find({}, { projection: { name: 1, email: 1 } }).toArray();
        const collisions = directors.filter(u => !u.staff_id && allStaff.some(
            st => (u.email && st.email && norm(st.email) === norm(u.email)) || norm(st.name) === norm(u.name)));
        if (collisions.length) {
            console.error('');
            console.error('⛔ REFUS — ' + collisions.length + ' directeur(s) ont DEJA un profil staff homonyme :');
            collisions.forEach(u => console.error('     ' + (u.name || u.email)));
            console.error('');
            console.error('   Ce script en creerait un SECOND : historique scinde, paie comptee deux fois.');
            console.error('   Utilise `npm run link-directors` : il rapproche du profil existant, sans rien creer.');
            console.error('');
            process.exitCode = 1;
            return;
        }
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
