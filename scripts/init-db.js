'use strict';
// Pose les INDEX de la base. Rien d'autre.
//
// Ce script insérait aussi 4 établissements (`Josy`, `Poni`, `FanFan`, `Caval`) et
// 3 membres du staff (`Julien`, `Marc`, `Sophie`), après un `deleteMany({})` sur
// `establishments`, `staff`, `shifts`, `users` et `sessions`. C'était un jeu de données
// de 2024 qui ne correspond plus à rien : ni à la recette (`seed-dev.js`), ni à la démo
// (`seed-demo.js`), ni à la base client. Le lancer « pour créer les index » effaçait donc
// les comptes et les plannings pour les remplacer par des établissements fantômes — et
// `npm run init` est la première commande des deux guides de démarrage.
//
// Les données sont maintenant l'affaire des seeds, exclusivement :
//   npm run dev:seed    → jeu de recette   (base de .env.dev)
//   npm run demo:seed   → jeu de démo      (base de .env.demo)
//   npm run create-patron → le compte patron
//
// Reste `destructive: true` : ce script REPOSE tous les index. Aucune donnée n'est perdue,
// mais le faire sur la base client lui coûte ses index le temps de la reconstruction.

const { openDb } = require('./_db');

// ── Les index, par collection ────────────────────────────────────────────────
// Source UNIQUE : la liste des collections à purger de leurs index était écrite à part,
// et rien ne garantissait qu'elle corresponde aux index effectivement recréés en dessous.
// Elles ne peuvent plus diverger : on droppe exactement les clés de cette table.
//
// ⚠️ Ne PAS remplacer cette liste par `APP_COLLECTIONS` de `_db.js` : celle-ci recense
// les collections que l'application ÉCRIT (pour les purger), celle-là uniquement celles
// qui portent un index sur mesure. `time_off`, `manager_time_off`, `dispo_events`… sont
// dans la première et n'ont rien à faire ici — les dropper sans les recréer serait une
// régression silencieuse.
const TTL_30_JOURS = { expireAfterSeconds: 30 * 24 * 60 * 60 };
const INDEXES = {
    establishments:      [[{ id: 1 }, { unique: true }]],
    shifts:              [[{ establishment_id: 1, date: 1 }],
                          [{ staff_id: 1, date: 1 }]],
    users:               [[{ email: 1 }, { unique: true, sparse: true }],
                          [{ phone: 1 }, { sparse: true }],
                          [{ invite_token: 1 }, { sparse: true }],
                          [{ reset_token: 1 }, { sparse: true }],
                          [{ staff_id: 1 }, { sparse: true }]],
    sessions:            [[{ sid: 1 }, { unique: true }],
                          [{ expires: 1 }, { expireAfterSeconds: 0 }]],
    availabilities:      [[{ staff_id: 1, date: 1 }],
                          [{ date: 1, status: 1 }],
                          [{ status: 1 }],
                          [{ status: 1, staff_id: 1 }]],          // S-04 — count scopé
    staff:               [[{ venues: 1 }]],                       // S-04 — périmètre directeur (multikey)
    push_subscriptions:  [[{ user_id: 1 }]],
    notifications:       [[{ user_id: 1, read: 1, created_at: -1 }],
                          [{ created_at: 1 }, TTL_30_JOURS]],     // cleanup auto
    shift_swaps:         [[{ status: 1, created_at: -1 }],
                          [{ from_staff_id: 1 }],
                          [{ to_staff_id: 1 }]],
    settings:            [[{ key: 1 }, { unique: true }]],
    roles:               [[{ type: 1, name: 1 }]],
    daily_revenue:       [[{ establishment_id: 1, date: 1 }, { unique: true }]],
    staff_notifications: [[{ staff_id: 1, created_at: -1 }],
                          [{ created_at: 1 }, TTL_30_JOURS]],
};

async function main() {
    const { client, db, dbName } = await openDb({ destructive: true });
    try {
        // Drop puis recréation : sans le drop, changer les options d'un index existant
        // (unique, sparse, TTL) échoue en IndexOptionsConflict au lieu de le remplacer.
        await Promise.all(Object.keys(INDEXES).map(async col => {
            try { await db.collection(col).dropIndexes(); }
            catch { /* collection inexistante — normal sur une base neuve */ }
        }));

        let count = 0;
        await Promise.all(Object.entries(INDEXES).flatMap(([col, defs]) =>
            defs.map(([keys, opts]) => {
                count++;
                return db.collection(col).createIndex(keys, opts || {});
            })));
        console.log('✅ ' + count + ' index posés sur ' + Object.keys(INDEXES).length
            + ' collections — base « ' + dbName + ' »');

        // Saisie des dispos ouverte par défaut. `$setOnInsert` : relancer ce script ne
        // doit pas rouvrir la saisie sur une base où le patron l'a fermée.
        await db.collection('settings').updateOne(
            { key: 'dispo' },
            { $setOnInsert: { key: 'dispo', open: true, message: null } },
            { upsert: true }
        );

        console.log('\n   Base vide : ce script ne crée AUCUNE donnée. Ensuite :');
        console.log('     npm run create-patron      le compte patron');
        console.log('     npm run dev:seed           un jeu de recette complet\n');
    } catch (e) {
        console.error('❌ Erreur :', e.message);
        process.exitCode = 1;
    } finally {
        await client.close();
    }
}

main();
