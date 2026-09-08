'use strict';
// Smoke DEV complet — enchaîne les 3 batteries sur l'instance de recette :
//   1. smoke.js          → parcours produit existants (dispos, périmètres, F-13…)
//   2. smoke-cloture.js  → clôture OTP début/fin + sync real_* + récap
//   3. smoke-simulate.js → prévisions Performance (hybride + taux joker)
//
// Cible par défaut : https://dev.templyo.fr (override : 1er argument ou SMOKE_URL).
// Passe aussi `--expect origin/dev` à smoke.js pour verrouiller le commit déployé.
//
//   npm run smoke:dev:full
//   node scripts/smoke-dev.js
//   node scripts/smoke-dev.js http://localhost:3000
//   node scripts/smoke-dev.js https://dev.templyo.fr --expect origin/dev
//
// Prérequis : base seedée (`npm run dev:seed`) + instance joignable.
// ⚠️ Écrit sur la base (dispos, clôture, archivage…) — jamais sur un client.

const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_BASE = 'https://dev.templyo.fr';

const args = process.argv.slice(2);
const expectIdx = args.indexOf('--expect');
const EXPECT = expectIdx > -1
    ? args[expectIdx + 1]
    : (process.env.SMOKE_EXPECT || 'origin/dev');
const positional = args.filter((a, i) => a !== '--expect' && i !== expectIdx + 1);
const BASE = (positional[0] || process.env.SMOKE_URL || DEFAULT_BASE).replace(/\/+$/, '');

const steps = [
    {
        name: 'Parcours produit (smoke.js)',
        script: 'scripts/smoke.js',
        // Seul smoke.js comprend --expect (commit déployé)
        extra: ['--expect', EXPECT],
    },
    {
        name: 'Clôture OTP (smoke-cloture.js)',
        script: 'scripts/smoke-cloture.js',
        extra: [],
    },
    {
        name: 'Simulation / prévisions (smoke-simulate.js)',
        script: 'scripts/smoke-simulate.js',
        extra: [],
    },
];

function runStep(step) {
    console.log('\n══════════════════════════════════════════════════');
    console.log('▶ ' + step.name);
    console.log('══════════════════════════════════════════════════\n');
    const r = spawnSync(
        process.execPath,
        [path.join(ROOT, step.script), BASE, ...step.extra],
        { cwd: ROOT, stdio: 'inherit', env: process.env }
    );
    if (r.error) {
        console.error('❌ Impossible de lancer ' + step.script + ' : ' + r.error.message);
        return 1;
    }
    return r.status == null ? 1 : r.status;
}

console.log('\n🔥 Smoke DEV complet');
console.log('   cible  : ' + BASE);
console.log('   expect : ' + EXPECT);
console.log('   étapes : ' + steps.map(s => s.script.replace('scripts/', '')).join(' → '));

const report = [];
let failed = 0;
for (const step of steps) {
    const code = runStep(step);
    report.push({ name: step.name, ok: code === 0 });
    if (code !== 0) failed++;
}

console.log('\n══════════════════════════════════════════════════');
console.log('Récap smoke DEV');
console.log('══════════════════════════════════════════════════');
for (const r of report) {
    console.log('  ' + (r.ok ? '✓' : '✗') + '  ' + r.name);
}
console.log('');

if (failed) {
    console.error(failed + ' batterie(s) en échec sur ' + BASE + '\n');
    process.exit(1);
}
console.log('Tout vert sur ' + BASE + '\n');
process.exit(0);
