'use strict';
// Affiche l'URI de connexion complète (base incluse) d'un environnement, prête à coller
// dans mongosh ou Compass.
//
// Existe parce que la forme `mongosh "$(node -e "…")"` documentée au départ est de la
// syntaxe *sh* : elle échoue en PowerShell et en cmd, où se fait le développement ici.
//
//   node scripts/db-uri.js .env.dev
//   npm run db:uri:dev
//
// ⚠️ Imprime des identifiants en clair : à ne pas coller dans un ticket ou un chat.

const fs = require('fs');
const { PROD_DB_NAME } = require('./_db');
const path = require('path');

const envFile = process.argv[2] || '.env.dev';
const full = path.resolve(__dirname, '..', envFile);
if (!fs.existsSync(full)) {
    console.error('❌ ' + envFile + ' introuvable.');
    process.exit(1);
}
const cfg = require('dotenv').parse(fs.readFileSync(full));
if (!cfg.MONGO_URI) {
    console.error('❌ MONGO_URI absent de ' + envFile + '.');
    process.exit(1);
}
const db = cfg.MONGO_DB || PROD_DB_NAME; // 3e copie du littéral évitée
// Insérer le nom de base AVANT la query string : mongodb+srv://…/<base>?options
const [head, query] = cfg.MONGO_URI.split('?');
console.log(head.replace(/\/+$/, '') + '/' + db + (query ? '?' + query : ''));
