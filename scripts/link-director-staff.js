'use strict';
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Rattache chaque compte `directeur` à un profil `staff`.                   ║
// ║  Par défaut : LIE aux profils existants, ne crée rien.                     ║
// ║  Avec --create-missing : crée un profil pour ceux qui n'en ont AUCUN.      ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// A-09 (2026-08-11) — ce script a absorbé `backfill-director-staff.js`, supprimé.
//
// POURQUOI LES DEUX NE FONT PLUS QU'UN. « Directeur sans profil staff » a deux issues :
// le rapprocher d'un profil existant, ou lui en créer un. Le tri entre les deux est le
// MÊME calcul — chercher un homonyme. Deux scripts, c'était deux fois ce calcul, et
// l'ancien `backfill` créait d'abord et vérifiait ensuite : sur la base du premier client,
// 2 directeurs sur 3 travaillaient déjà en salle. Il leur fabriquait un SECOND profil —
// doublon dans la barre staff, historique de shifts scindé, paie comptée deux fois.
// Un garde-fou (A-08) a fini par l'en empêcher, mais il vivait à côté du danger.
//
// Ici le tri PRÉCÈDE l'écriture : `--create-missing` n'agit que sur le bucket `none`,
// qui est par construction « aucun profil ne correspond, ni par e-mail ni par nom ».
// Le doublon n'est plus interdit par un contrôle, il est devenu impossible à exprimer.
// Le bucket `ambiguous` (plusieurs homonymes) n'est JAMAIS créé ni lié automatiquement :
// choisir entre deux personnes reste une décision humaine.
//
//   node scripts/link-director-staff.js                            → simulation
//   node scripts/link-director-staff.js --apply                    → lie seulement
//   node scripts/link-director-staff.js --create-missing           → simulation, création incluse
//   node scripts/link-director-staff.js --create-missing --apply   → lie ET crée
//   ENV_FILE=.env.client node scripts/link-director-staff.js
//
// ⚠️ `openDb()` affiche la base ciblée avant toute chose : LIRE cette ligne avant --apply.

// Le TRI vit dans `lib/utils.js` (`classifyDirectorLinks`) et non ici : c'est lui qui
// rend le doublon impossible, il doit donc être couvert par des tests — cf. tests/utils.test.js.
const { openDb } = require('./_db');
const { pickStaffColor, classifyDirectorLinks } = require('../lib/utils');

const APPLY  = process.argv.includes('--apply');
const CREATE = process.argv.includes('--create-missing');

async function main() {
    const { client, db, dbName } = await openDb();
    try {
        const dirs = await db.collection('users')
            .find({ role: 'directeur' }, { projection: { name: 1, email: 1, phone: 1, staff_id: 1, assigned_establishments: 1 } })
            .toArray();
        const staff = await db.collection('staff')
            .find({}, { projection: { name: 1, email: 1, venues: 1, color: 1 } }).toArray();

        console.log('\n' + (APPLY ? '⚙️  MODE APPLICATION — écriture réelle' : '🔍 SIMULATION — aucune écriture')
            + (CREATE ? '   ·   création des manquants ACTIVÉE' : '')
            + '\n   ' + dirs.length + ' compte(s) directeur, ' + staff.length + ' profil(s) staff\n');

        const { todo, already, none, ambiguous } = classifyDirectorLinks(dirs, staff);

        const label = u => (u.name || u.email || String(u._id));

        for (const { u, s } of todo) {
            const venues   = s.venues || [];
            const assigned = u.assigned_establishments || [];
            const same = JSON.stringify([...venues].sort()) === JSON.stringify([...assigned].sort());
            console.log('  ✅ ' + label(u).padEnd(24) + ' → profil « ' + s.name +' »');
            console.log('      venues=' + JSON.stringify(venues) + '  assigned=' + JSON.stringify(assigned)
                + (same ? '  (identiques)' : '  ⚠️ DIVERGENTS — la synchro les alignera à la 1re édition'));
        }
        already.forEach(u => console.log('  ⏭️  ' + label(u).padEnd(24) + ' déjà lié'));
        none.forEach(u => console.log('  ' + (CREATE ? '🆕' : '❔') + ' ' + label(u).padEnd(24)
            + (CREATE
                ? ' aucun profil → UN SERA CRÉÉ (bars : ' + JSON.stringify(u.assigned_establishments || []) + ')'
                : ' AUCUN profil staff correspondant — relance avec --create-missing pour en créer un')));
        // Jamais automatisé, ni en liaison ni en création : si deux « Martin Dupont »
        // existent, la machine n'a aucun moyen de savoir lequel est le directeur, et se
        // tromper attribue à quelqu'un l'historique de paie d'un autre.
        ambiguous.forEach(({ u, hits }) => console.log('  ⚠️  ' + label(u).padEnd(24)
            + ' AMBIGU (' + hits.length + ' profils : ' + hits.map(h => h.name).join(', ')
            + ') — non touché, même avec --create-missing'));

        // Un seul porteur du fait « ce que ce passage va créer », au lieu d'un booléen, d'un
        // compteur et d'un total attendu à tenir d'accord. Ce script est celui qu'on relit
        // sous tension, juste avant de le lancer sur une base client : trois variables pour
        // un même fait, c'est trois occasions de se demander laquelle fait foi.
        // `--create-missing` n'agit QUE sur `none` — hors de ce mode, rien n'est à créer.
        const toCreate = CREATE ? none : [];

        if (!APPLY) {
            console.log('\n  ' + todo.length + ' liaison(s) et ' + toCreate.length + ' création(s) à faire.'
                + '\n  Relance avec --apply pour les écrire.\n');
            return;
        }
        if (!todo.length && !toCreate.length) { console.log('\n  Rien à écrire.\n'); return; }

        const before  = await db.collection('staff').countDocuments();
        const touched = [...todo.map(t => t.u._id), ...toCreate.map(u => u._id)];

        for (const { u, s } of todo) {
            await db.collection('users').updateOne({ _id: u._id }, { $set: { staff_id: String(s._id) } });
        }

        // Couleurs déjà prises, pour ne pas donner deux fois la même dans la barre staff.
        const used = new Set(staff.map(s => s.color).filter(Boolean));
        for (const u of toCreate) {
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
            console.log('  + profil staff créé pour ' + label(u) + ' → ' + insertedId);
        }

        const after    = await db.collection('staff').countDocuments();
        const expected = before + toCreate.length;
        const verdict  = after !== expected
            ? '  ⚠️ ATTENDU ' + expected + ' — un profil a été créé hors de ce script !'
            : toCreate.length ? '  (+' + toCreate.length + ', attendu)'
                              : '  (inchangé — c\'est bien le but)';

        console.log('\n  ✅ ' + todo.length + ' compte(s) lié(s), ' + toCreate.length + ' profil(s) créé(s) dans « ' + dbName + ' »');
        console.log('  Profils staff : ' + before + ' → ' + after + verdict);

        // R-17 fait ça tout seul quand le changement passe par l'API. Ici on écrit
        // directement dans Mongo, donc rien ne l'a déclenché : sans ce nettoyage, un
        // directeur connecté garderait une session sans `staff_id` et resterait bloqué
        // sur le 400 « Aucun profil staff lié » sans comprendre pourquoi.
        if (touched.length) {
            const r = await db.collection('sessions')
                .deleteMany({ 'session.user._id': { $in: touched.map(String) } });
            console.log('  🔒 ' + r.deletedCount + ' session(s) supprimée(s) — les directeurs concernés');
            console.log('     devront se reconnecter, et retrouveront leur profil au login.\n');
        } else {
            console.log('');
        }
    } catch (e) {
        console.error('❌', e.message);
        process.exitCode = 1;
    } finally {
        await client.close();
    }
}

main();
