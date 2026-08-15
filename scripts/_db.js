'use strict';
// Connexion partagée par les scripts CLI + GARDE-FOU sur la base ciblée.
//
// Pourquoi ce fichier existe : `init-db.js` et l'ancien `seed.js` (supprimé) faisaient
// `deleteMany({})` sur `users`, `staff`, `shifts`… dans une base écrite EN DUR
// (`gestion_bar`). Lancer `npm run init` avec le `.env` de prod dans le dossier effaçait
// donc les comptes réels, sans confirmation ni message. Le nom de base est maintenant
// choisi par `MONGO_DB`, et tout script destructif doit passer par
// `openDb({ destructive: true })`, qui REFUSE la base de production sauf `--force`
// explicite — et, avec `expect`, toute base qui n'est pas celle que le script vise.

const { MongoClient } = require('mongodb');

const PROD_DB_NAME = 'gestion_bar';

// TOUTES les collections écrites par l'application. Domicile unique : cette liste vivait
// recopiée dans `seed-dev.js` et `seed-demo.js`, et les deux copies avaient déjà divergé
// du produit — il y manquait `shift_swaps` et `dispo_events`. Un jeu « relançable à
// volonté » laissait donc survivre des échanges de shifts en attente et un journal
// d'audit peuplé de gens qui n'existent plus dans la base fraîchement semée.
// Toute nouvelle collection s'ajoute ICI et nulle part ailleurs.
const APP_COLLECTIONS = [
    'establishments', 'staff', 'users', 'sessions', 'shifts', 'availabilities',
    'dispo_events', 'time_off', 'manager_time_off', 'manager_dispo_templates',
    'roles', 'settings', 'daily_revenue', 'notifications', 'staff_notifications',
    'push_subscriptions', 'shift_swaps',
];

function loadEnv() {
    require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
}

// Masque les identifiants d'une URI Mongo avant affichage.
function safeUri(uri) {
    return String(uri || '').replace(/\/\/[^@]+@/, '//<identifiants masqués>@');
}

/**
 * @param {{ destructive?: boolean, expect?: RegExp }} opts
 *   `expect` : motif que le nom de base DOIT vérifier. Sans lui, la seule règle est
 *   « pas la prod » — ce qui laissait `npm run demo:seed` écraser la recette et
 *   `npm run dev:seed` écraser la démo, en silence. Chaque script destructif déclare
 *   donc sa cible ici plutôt que de rebâtir son propre garde-fou par-dessus celui-ci.
 * @returns {Promise<{ client, db, dbName }>}
 */
async function openDb({ destructive = false, expect = null } = {}) {
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

    if (destructive && expect && !expect.test(dbName) && !forced) {
        console.error('\n⛔ REFUS — ce script EFFACE des données, et la base ciblée est « ' + dbName + ' »,');
        console.error('   qui ne correspond pas à ce qu\'il attend (' + expect + ').\n');
        console.error('   Vérifie ENV_FILE / MONGO_DB, ou relance avec --force si c\'est voulu.\n');
        process.exit(1);
    }

    const client = new MongoClient(uri);
    await client.connect();
    console.log('🔗 ' + safeUri(uri));
    console.log('📂 base : ' + dbName + (destructive && forced ? '   ⚠️  --force ACTIF' : ''));
    return { client, db: client.db(dbName), dbName };
}

module.exports = { openDb, PROD_DB_NAME, APP_COLLECTIONS };
