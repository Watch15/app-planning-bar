const { test } = require('node:test');
const assert = require('node:assert');
const { shouldRedirectOn401, samePathname, install } = require('../public/lib/auth-guard.js');

// A-14 — le garde qui rattrape un 401 survenu EN COURS de session.
// Le module s'auto-installe dans un navigateur ; sous Node il n'y a ni `window` ni
// `document`, donc rien n'est installé et on peut tester les règles à froid.

// ── Le prédicat : quand un 401 signifie « ta session est morte » ─────────────

test('401 sur une route API depuis une page applicative → redirection', () => {
    assert.strictEqual(shouldRedirectOn401(401, '/api/shifts/Josy/2026-08-10', '/planning.html'), true);
});

test('401 sur /auth/me en cours de session → redirection', () => {
    assert.strictEqual(shouldRedirectOn401(401, '/auth/me', '/pointage.html'), true);
});

test('une réponse OK ne redirige jamais', () => {
    assert.strictEqual(shouldRedirectOn401(200, '/api/dispos', '/planning.html'), false);
    assert.strictEqual(shouldRedirectOn401(204, '/api/dispos', '/planning.html'), false);
});

// Distinction qui porte tout le sens du garde : 403 = « connecté mais pas autorisé ».
// Déconnecter là-dessus renverrait au login un utilisateur parfaitement authentifié —
// et les routes de périmètre (S-02…S-06) rendent 403 en fonctionnement NORMAL.
test('un 403 ne déconnecte pas — périmètre refusé n\'est pas session morte', () => {
    assert.strictEqual(shouldRedirectOn401(403, '/api/performance', '/performance.html'), false);
});

test('un 503 (repli hors ligne du Service Worker) ne déconnecte pas', () => {
    assert.strictEqual(shouldRedirectOn401(503, '/api/shifts/Josy/2026-08-10', '/pointage.html'), false);
});

// ── Les exclusions ───────────────────────────────────────────────────────────

test('401 de /auth/login = mauvais mot de passe, pas session morte', () => {
    assert.strictEqual(shouldRedirectOn401(401, '/auth/login', '/login.html'), false);
    // Même depuis une autre page : c'est la ROUTE qui rend ce 401 métier.
    assert.strictEqual(shouldRedirectOn401(401, '/auth/login', '/index.html'), false);
});

test('les autres routes d\'entrée (mot de passe oublié / défini) sont exclues', () => {
    assert.strictEqual(shouldRedirectOn401(401, '/auth/forgot-password', '/login.html'), false);
    assert.strictEqual(shouldRedirectOn401(401, '/auth/set-password', '/set-password.html'), false);
    assert.strictEqual(shouldRedirectOn401(401, '/auth/reset-password', '/set-password.html'), false);
});

test('depuis /login.html, aucun 401 ne redirige — sinon boucle', () => {
    // `login.js` appelle /auth/me au chargement pour détecter une session existante :
    // le 401 est le cas NORMAL de quelqu'un qui n'est pas connecté.
    assert.strictEqual(shouldRedirectOn401(401, '/auth/me', '/login.html'), false);
    assert.strictEqual(shouldRedirectOn401(401, '/api/dispos', '/login.html'), false);
});

test('depuis /set-password.html non plus', () => {
    assert.strictEqual(shouldRedirectOn401(401, '/api/dispos', '/set-password.html'), false);
});

test('un 401 hors API/auth est ignoré', () => {
    assert.strictEqual(shouldRedirectOn401(401, '/planning.html', '/planning.html'), false);
    assert.strictEqual(shouldRedirectOn401(401, '/style.css', '/index.html'), false);
});

test('un 401 cross-origin (pathname null) ne dit rien de NOTRE session', () => {
    assert.strictEqual(shouldRedirectOn401(401, null, '/planning.html'), false);
});

// ── Résolution d'URL : ne réagir qu'au même domaine ──────────────────────────

const fakeWin = (path) => ({
    location: {
        href:     'https://app.templyo.fr' + path,
        origin:   'https://app.templyo.fr',
        pathname: path,
    },
});

test('samePathname : URL relative → pathname', () => {
    assert.strictEqual(samePathname('/api/dispos?from=2026-08-10', fakeWin('/planning.html')), '/api/dispos');
});

test('samePathname : URL absolue du même domaine → pathname', () => {
    assert.strictEqual(samePathname('https://app.templyo.fr/api/dispos', fakeWin('/planning.html')), '/api/dispos');
});

test('samePathname : domaine tiers → null', () => {
    assert.strictEqual(samePathname('https://exemple.test/api/dispos', fakeWin('/planning.html')), null);
});

test('samePathname : objet Request (propriété .url) accepté', () => {
    assert.strictEqual(samePathname({ url: '/api/staff' }, fakeWin('/index.html')), '/api/staff');
});

test('samePathname : entrée illisible → null, jamais d\'exception', () => {
    assert.strictEqual(samePathname(undefined, fakeWin('/index.html')), null);
});

// ── L'installation : l'enveloppe de `fetch` ──────────────────────────────────

// Faux `window` minimal : un `fetch` scriptable et une `location` dont on observe
// l'écriture de `href` (dans un navigateur, elle déclencherait la navigation).
function makeWindow(statuses) {
    const calls = [];
    return {
        location: {
            href:     'https://app.templyo.fr/pointage.html',
            origin:   'https://app.templyo.fr',
            pathname: '/pointage.html',
        },
        fetch(input) {
            calls.push(String(input && input.url ? input.url : input));
            return Promise.resolve({ status: statuses.shift(), url: String(input) });
        },
        _calls: calls,
    };
}

test('install : un 401 en cours de session écrit la redirection', async () => {
    const w = makeWindow([401]);
    assert.strictEqual(install(w), true);
    const res = await w.fetch('/api/pointage/2026-08-10');
    assert.strictEqual(w.location.href, '/login.html?expired=1');
    // La réponse est rendue INTACTE : le code appelant garde son comportement.
    assert.strictEqual(res.status, 401);
});

test('install : une réponse OK ne touche pas à location', async () => {
    const w = makeWindow([200]);
    install(w);
    await w.fetch('/api/pointage/2026-08-10');
    assert.strictEqual(w.location.href, 'https://app.templyo.fr/pointage.html');
});

test('install : dix 401 simultanés ne déclenchent qu\'UNE redirection', async () => {
    const w = makeWindow(Array(10).fill(401));
    install(w);
    let writes = 0;
    let href = w.location.href;
    Object.defineProperty(w.location, 'href', {
        get: () => href,
        // ⚠️ Le navigateur RÉSOUT toute affectation de `location.href` en URL absolue.
        // Une première version stockait la valeur brute : après la 1re redirection,
        // `href` valait « /login.html?expired=1 », base relative que `new URL` refuse —
        // les 9 appels suivants tombaient donc dans le `catch` de `samePathname` et le
        // test passait MÊME SANS le verrou qu'il prétend vérifier (vacuité attrapée par
        // mutation). Fidéliser le faux `location` est ce qui rend ce test non vide.
        set: (v) => { writes++; href = new URL(v, 'https://app.templyo.fr').href; },
    });
    await Promise.all(Array.from({ length: 10 }, () => w.fetch('/api/dispos')));
    assert.strictEqual(writes, 1);
});

test('install : idempotent — deux installs n\'empilent pas deux couches', () => {
    const w = makeWindow([200]);
    assert.strictEqual(install(w), true);
    const wrapped = w.fetch;
    assert.strictEqual(install(w), false);
    assert.strictEqual(w.fetch, wrapped);
});

test('install : la requête d\'origine est bien transmise', async () => {
    const w = makeWindow([200]);
    install(w);
    await w.fetch('/api/staff');
    assert.deepStrictEqual(w._calls, ['/api/staff']);
});
