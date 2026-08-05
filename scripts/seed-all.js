'use strict';
// Alimente TOUTES les bases de recette d'un coup (templyo_dev + templyo_main).
// Chaque base est semée dans un process séparé : `dotenv` ne réécrit pas une variable
// déjà définie, donc charger deux fichiers d'env dans le même process viserait deux fois
// la même base — le bug serait silencieux et on croirait les deux à jour.

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const TARGETS = ['.env.dev', '.env.main'];
const root = path.resolve(__dirname, '..');

function seed(envFile) {
    return new Promise(resolve => {
        if (!fs.existsSync(path.join(root, envFile))) {
            console.log('\n⏭️  ' + envFile + ' absent — ignoré');
            return resolve(0);
        }
        console.log('\n━━━ ' + envFile + ' ━━━');
        const child = spawn(process.execPath, ['scripts/seed-dev.js'], {
            stdio: 'inherit', cwd: root,
            env: { ...process.env, ENV_FILE: envFile },
        });
        child.on('exit', code => resolve(code == null ? 1 : code));
    });
}

(async () => {
    let failed = 0;
    for (const t of TARGETS) failed += (await seed(t)) ? 1 : 0;
    if (failed) { console.error('\n❌ ' + failed + ' base(s) en échec'); process.exit(1); }
    console.log('✅ Toutes les bases de recette sont à jour.\n');
})();
