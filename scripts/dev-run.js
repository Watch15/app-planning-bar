'use strict';
// Lance une commande Node avec `ENV_FILE=.env.dev` — portable Windows/macOS/Linux,
// là où `ENV_FILE=… node x.js` dans un script npm échoue sous PowerShell.
//
// Volontairement un SPAWN et non un `require` : l'enfant garde
// `require.main === module`, donc (a) le bloc `app.listen` de server.js s'exécute
// normalement, et (b) la garde structurelle du harnais de test (S-01) reste intacte —
// un `require` l'aurait fait basculer du mauvais côté.
//
//   node scripts/dev-run.js server.js
//   node scripts/dev-run.js scripts/seed-dev.js

const { spawn } = require('child_process');
const path = require('path');

// `--env <fichier>` en tête choisit l'environnement ; sans lui, `.env.dev`. Ajouté parce
// que seul le côté `dev` était outillé alors que `smoke:dev`/`smoke:main` et
// `db:uri:dev`/`db:uri:main` existent en paire — l'asymétrie envoyait vers un
// `npm run main:seed` inexistant, puis vers une commande à composer à la main.
const argv = process.argv.slice(2);
let envFile = null;
if (argv[0] === '--env') { envFile = argv[1]; argv.splice(0, 2); }

const [target, ...rest] = argv;
if (!target) {
    console.error('Usage : node scripts/dev-run.js [--env .env.main] <fichier.js> [args…]');
    process.exit(1);
}

const child = spawn(process.execPath, [target, ...rest], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, ENV_FILE: envFile || process.env.ENV_FILE || '.env.dev' },
});

// Sans ceci, tuer ce lanceur laisse `node server.js` ORPHELIN : il continue de tourner,
// garde le port 3000 et la connexion Mongo, et le `npm run dev:server` suivant échoue en
// EADDRINUSE. Constaté en vrai — la tâche était signalée arrêtée, le serveur répondait
// encore. On relaie donc l'arrêt dans les deux sens.
let stopping = false;
const stopChild = signal => {
    if (stopping) return;
    stopping = true;
    if (child.exitCode === null && child.signalCode === null) child.kill(signal || 'SIGTERM');
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.on(sig, () => stopChild(sig === 'SIGINT' ? 'SIGINT' : 'SIGTERM'));
}
process.on('exit', () => stopChild('SIGTERM'));

child.on('exit', (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code == null ? 1 : code);
});
