'use strict';
// Connexion partagée par les scripts CLI + GARDE-FOU sur la base ciblée.
//
// Pourquoi ce fichier existe : `init-db.js` et `seed.js` faisaient `deleteMany({})` sur
// `users`, `staff`, `shifts`… dans une base écrite EN DUR (`gestion_bar`). Lancer
// `npm run init` avec le `.env` de prod dans le dossier effaçait donc les comptes réels,
// sans confirmation ni message. Le nom de base est maintenant choisi par `MONGO_DB`, et
// tout script destructif doit passer par `openDb({ destructive: true })`, qui REFUSE la
// base de production sauf `--force` explicite.

const { MongoClient } = require('mongodb');

const PROD_DB_NAME = 'gestion_bar';

function loadEnv() {
    require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
}

// Masque les identifiants d'une URI Mongo avant affichage.
function safeUri(uri) {
    return String(uri || '').replace(/\/\/[^@]+@/, '//<identifiants masqués>@');
}

/**
 * @param {{ destructive?: boolean }} opts
 * @returns {Promise<{ client, db, dbName }>}
 */
async function openDb({ destructive = false } = {}) {
    loadEnv();
    const uri = process.env.MONGO_URI;
    if (!uri) {
        console.error('❌ MONGO_URI manquant (fichier ' + (process.env.ENV_FILE || '.env') + ').');
        process.exit(1);
    }
    const dbName = process.env.MONGO_DB || PROD_DB_NAME;
    const forced = process.argv.includes('--force');

    if (destructive && dbName === PROD_DB_NAME && !forced) {
        console.error('\n⛔ REFUS — ce script EFFACE des données, et la base ciblée est « ' + PROD_DB_NAME + ' »,');
        console.error('   celle qui porte tes comptes et tes plannings réels.\n');
        console.error('   Pour travailler sur une base de recette :');
        console.error('     ENV_FILE=.env.dev npm run <script>      (ou MONGO_DB=gestion_bar_dev)\n');
        console.error('   Si tu veux VRAIMENT écraser « ' + PROD_DB_NAME +' », relance avec --force.\n');
        process.exit(1);
    }

    const client = new MongoClient(uri);
    await client.connect();
    console.log('🔗 ' + safeUri(uri));
    console.log('📂 base : ' + dbName + (destructive && forced ? '   ⚠️  --force ACTIF' : ''));
    return { client, db: client.db(dbName), dbName };
}

module.exports = { openDb, PROD_DB_NAME };
