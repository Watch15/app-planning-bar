'use strict';
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  SMOKE DE PRODUCTION — STRICTEMENT EN LECTURE SEULE                       ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// POURQUOI UN SECOND SCRIPT plutôt qu'un `--read-only` dans `smoke.js` : celui-ci
// ÉCRIT (il archive un staff, crée des shifts, bascule des publications, envoie des
// dispos) et se connecte avec les comptes de `seed-dev.js`. Un drapeau à poser sur
// ~700 lignes d'écritures, c'est une écriture oubliée un jour — dans la base d'un
// client, sur de vraies données de paie. Ici, la garantie est STRUCTURELLE : ce
// fichier n'émet que des GET, ne se connecte à aucun compte et ne connaît aucun mot
// de passe. Il n'y a rien à oublier.
//
//   node scripts/smoke-prod.js                        → http://localhost:3000
//   npm run smoke:prod:main                           → prod interne
//   npm run smoke:prod:client                         → instance client
//
// CE QU'IL PROUVE : l'instance est debout, sa base répond, elle porte EXACTEMENT le
// code attendu (fichiers servis comparés au commit, pas seulement l'étiquette de
// `/health`), ses pages et ses assets se servent, son Service Worker a bien reçu son
// jeton de build, et ses routes protégées sont fermées.
//
// CE QU'IL NE PROUVE PAS : les parcours métier. Ils demandent des comptes et des
// écritures — c'est `smoke.js`, sur une base de recette, jamais chez un client.
// Un smoke vert ici veut dire « le bon code est en ligne et l'accès est fermé »,
// pas « la feature marche ». Ne pas lui faire dire l'un pour l'autre.

const crypto = require('crypto');

const args = process.argv.slice(2);
const expectIdx = args.indexOf('--expect');
const EXPECT_REF = expectIdx > -1 ? args[expectIdx + 1] : (process.env.SMOKE_EXPECT || null);
// La cible : 1er argument NON-option, sinon SMOKE_URL, sinon le local. L'argument
// existe parce que `SMOKE_URL=… npm run x` est une syntaxe *sh* : elle échoue en
// PowerShell, où se fait le développement de ce projet.
const BASE = (args.filter((a, i) => !a.startsWith('--') && i !== expectIdx + 1)[0]
    || process.env.SMOKE_URL || 'http://localhost:3000').replace(/\/+$/, '');

// Les fichiers dont le contenu SERVI doit être identique au dépôt. Un `/health` juste
// ne suffit pas : le serveur peut annoncer le bon commit pendant qu'un cache sert un
// asset d'avant — c'est ce cas-là qui a fait chercher un bug de code là où il n'y en
// avait pas. `sw.js` est volontairement absent : son `%%BUILD_TIME%%` est substitué au
// déploiement, donc il ne peut pas être identique au dépôt (il a son propre contrôle).
const SERVED_FILES = [
    'public/index.html',
    'public/planning.html',
    'public/login.html',
    'public/planning.js',
    'public/script.js',
    'public/style.css',
    'public/lib/nouveautes.js',
    'public/lib/week.js',
    'public/lib/shift-hours.js',
];

// Routes protégées, TOUTES en GET. Un 401 prouve que la porte est fermée ; un 200 dirait
// que la production est ouverte à tout venant, un 500 que la garde plante au lieu de
// refuser — les deux sont des incidents, et aucun ne se voit depuis `/health`.
const GUARDED = [
    '/api/staff',
    '/api/establishments',
    '/api/my-shifts?from=2000-01-01&to=2000-01-07',
    '/api/dispo-settings',
    '/api/pointage-settings',
    '/api/swap-settings',
    '/api/shift-swaps/pending',
];

let pass = 0, fail = 0;
const results = [];

async function check(section, name, fn) {
    try {
        const detail = await fn();
        pass++; results.push(['✓', section, name, detail || '']);
    } catch (e) {
        fail++; results.push(['✗', section, name, e.message]);
    }
}
function eq(actual, expected, label) {
    if (actual !== expected) throw new Error(`${label} : attendu ${expected}, obtenu ${actual}`);
    return `${label}=${actual}`;
}

// LE point unique par lequel passe toute requête de ce script. Il n'accepte pas de
// méthode : `fetch` par défaut fait un GET, et ne pas offrir le paramètre est ce qui
// rend la promesse « lecture seule » vérifiable d'un coup d'œil plutôt que ligne à ligne.
async function get(path) {
    const res = await fetch(BASE + path, { headers: { accept: '*/*' } });
    return { status: res.status, headers: res.headers, text: () => res.text() };
}

// Un git absent, un clone superficiel ou une référence inconnue ne sont pas des erreurs :
// la comparaison au dépôt est un confort de diagnostic, pas une condition d'exécution.
function git(a) {
    try {
        return require('child_process')
            .execSync('git ' + a, { cwd: __dirname + '/..', stdio: ['ignore', 'pipe', 'ignore'] })
            .toString();
    } catch { return null; }
}
// Fins de ligne normalisées des DEUX côtés : le dépôt est en LF, un poste Windows peut
// avoir converti la copie de travail, et l'instance sert ce que son propre clone contient.
// Comparer les octets bruts ferait échouer le contrôle sur un détail qui ne regarde personne.
const digest = s => crypto.createHash('sha256').update(s.replace(/\r\n/g, '\n')).digest('hex').slice(0, 12);

function subjectOf(sha) {
    const s = git('log -1 --format=%s ' + sha);
    return s === null ? '  (inconnu de ce dépôt)' : (s.trim() ? '  « ' + s.trim() + ' »' : '');
}

// Même logique que `smoke.js` : il ARRÊTE seulement quand la comparaison est possible et
// négative. Sans `--expect`, sans git, ou sur une référence inconnue, on informe et on
// continue — refuser de tourner faute d'outillage rendrait le script inutilisable là où
// il sert le plus.
function verifyDeployedCommit(health) {
    const deployed = health && health.commit;
    if (!deployed) {
        console.log('ℹ️  L\'instance n\'annonce pas son commit (build antérieur au 2026-08-11).\n');
        return { ok: true, sha: null };
    }
    const short = deployed.slice(0, 8);
    if (!EXPECT_REF) {
        console.log('ℹ️  commit déployé : ' + short + ' (aucune référence attendue — passe `--expect origin/main`)\n');
        return { ok: true, sha: null };
    }
    const expected = (git('rev-parse ' + EXPECT_REF) || '').trim();
    if (!expected) {
        console.log('ℹ️  commit déployé : ' + short + ' — référence « ' + EXPECT_REF + ' » introuvable en local, comparaison sautée.\n');
        return { ok: true, sha: null };
    }
    if (expected === deployed) {
        console.log('✓ commit déployé : ' + short + ' = ' + EXPECT_REF + '\n');
        return { ok: true, sha: expected };
    }
    console.error('❌ L\'INSTANCE NE PORTE PAS LE CODE ATTENDU — arrêt avant toute vérification.');
    console.error('   déployé : ' + short + subjectOf(deployed));
    console.error('   attendu : ' + expected.slice(0, 8) + subjectOf(expected) + '  (' + EXPECT_REF + ')');
    console.error('   Un smoke vert sur un ancien build ne prouve rien. Vérifie la CI et le déploiement.\n');
    return { ok: false, sha: null };
}

async function main() {
    console.log('\n🎯 cible : ' + BASE + '   (lecture seule — aucune écriture, aucune connexion)\n');

    const h = await get('/health');
    if (h.status !== 200) {
        console.error('❌ /health ne répond pas (' + h.status + ') — l\'instance est-elle debout ?');
        process.exit(1);
    }
    let health;
    try { health = JSON.parse(await h.text()); }
    catch { console.error('❌ /health ne rend pas du JSON — un proxy répond à la place ?'); process.exit(1); }

    const { ok, sha } = verifyDeployedCommit(health);
    if (!ok) process.exit(1);

    // ── L'instance et sa base ────────────────────────────────────────────────
    await check('santé', 'l\'application se déclare en état', async () =>
        eq(health.ok, true, 'ok'));
    await check('santé', 'la base de données répond', async () => {
        // `db:false` = l'app sert des pages mais aucune donnée. Sans ce contrôle, la
        // page de connexion s'affiche et tout paraît normal jusqu'au premier login.
        if (health.db !== true) throw new Error('db=' + health.db + ' — Mongo injoignable depuis l\'instance');
        return 'db=true · debout depuis ' + Math.round((health.uptime || 0) / 60) + ' min';
    });

    // ── Le code réellement servi ─────────────────────────────────────────────
    // `/health` annonce un commit ; ces contrôles vérifient que les FICHIERS servis
    // sont bien ceux de ce commit. Les deux peuvent diverger (cache, build partiel),
    // et c'est la divergence qui coûte cher à diagnostiquer.
    if (sha) {
        for (const file of SERVED_FILES) {
            const url = '/' + file.replace(/^public\//, '');
            await check('code servi', file.replace(/^public\//, ''), async () => {
                const blob = git('show ' + sha + ':' + file);
                if (blob === null) throw new Error('absent du dépôt à ce commit');
                const r = await get(url === '/index.html' ? '/' : url);
                if (r.status !== 200) throw new Error('servi en ' + r.status);
                const served = await r.text();
                const a = digest(blob), b = digest(served);
                if (a !== b) throw new Error('le fichier servi diffère du dépôt (' + b + ' ≠ ' + a + ') — cache ou build partiel');
                return a;
            });
        }
    } else {
        console.log('ℹ️  Comparaison fichier par fichier sautée : elle demande `--expect` et un dépôt local.\n');
    }

    // ── Service Worker ───────────────────────────────────────────────────────
    await check('PWA', 'le Service Worker a reçu son jeton de build', async () => {
        const r = await get('/sw.js');
        if (r.status !== 200) throw new Error('/sw.js servi en ' + r.status);
        const body = await r.text();
        // `npm start` remplace %%BUILD_TIME%% par un horodatage. S'il reste tel quel, le
        // nom du cache ne change JAMAIS d'un déploiement à l'autre : les navigateurs
        // gardent l'ancienne version indéfiniment et personne ne voit la mise à jour.
        if (body.includes('%%BUILD_TIME%%')) {
            throw new Error('jeton %%BUILD_TIME%% NON substitué — le cache ne tournera jamais');
        }
        const m = body.match(/const CACHE\s*=\s*'templyo-'\s*\+\s*'([^']+)'/);
        return m ? 'cache templyo-' + m[1] : 'jeton substitué';
    });

    // ── Pages servies ────────────────────────────────────────────────────────
    for (const [path, label] of [['/', 'accueil patron'], ['/login.html', 'connexion'], ['/planning.html', 'planning staff']]) {
        await check('pages', label, async () => {
            const r = await get(path);
            if (r.status !== 200) throw new Error(path + ' servi en ' + r.status);
            const ct = r.headers.get('content-type') || '';
            if (!ct.includes('text/html')) throw new Error(path + ' rend « ' + ct +' » au lieu de HTML');
            return path;
        });
    }

    // ── La porte est-elle fermée ? ───────────────────────────────────────────
    await check('accès', 'les routes protégées refusent un anonyme', async () => {
        const bad = [];
        for (const path of GUARDED) {
            const r = await get(path);
            if (r.status !== 401) bad.push(path + ' → ' + r.status);
        }
        if (bad.length) throw new Error('devrait rendre 401 : ' + bad.join(' · '));
        return GUARDED.length + ' routes en 401';
    });

    // ── En-têtes de sécurité ─────────────────────────────────────────────────
    await check('sécurité', 'les en-têtes de protection sont posés', async () => {
        const r = await get('/login.html');
        const attendus = ['content-security-policy', 'x-content-type-options', 'x-frame-options', 'referrer-policy'];
        const manquants = attendus.filter(h => !r.headers.get(h));
        if (manquants.length) throw new Error('en-têtes absents : ' + manquants.join(', '));
        // HSTS n'a de sens qu'en HTTPS : l'exiger en local ferait échouer le script là
        // où il sert à mettre au point les autres contrôles.
        if (BASE.startsWith('https://') && !r.headers.get('strict-transport-security')) {
            throw new Error('strict-transport-security absent alors que l\'instance est en HTTPS');
        }
        return attendus.length + ' en-têtes' + (BASE.startsWith('https://') ? ' + HSTS' : '');
    });

    // ── Rapport ──────────────────────────────────────────────────────────────
    console.log('');
    let section = null;
    for (const [icon, sec, name, detail] of results) {
        if (sec !== section) { console.log('  ' + sec); section = sec; }
        console.log('    ' + icon + ' ' + name.padEnd(44) + (detail ? '· ' + detail : ''));
    }
    console.log('\n  ' + pass + ' OK · ' + fail + ' échec(s)\n');
    if (fail === 0) {
        console.log('  Lecture seule : « le bon code est en ligne et l\'accès est fermé ».');
        console.log('  Les parcours métier restent à vérifier par `npm run smoke` — base de recette UNIQUEMENT.\n');
    }
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error('❌', e); process.exit(1); });
