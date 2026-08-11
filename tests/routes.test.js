// Premier test d'intégration de routes — démarre l'app Express sur un port
// éphémère et tape les routes via HTTP (fetch natif). Aucune dépendance ajoutée,
// AUCUNE base de données : on cible des routes qui répondent SANS Mongo
// (401 sans session, 503 si la base est absente via le middleware checkDB).
//
// Prérequis (D-82) : server.js exporte `app` et n'écoute/ne se connecte que
// lorsqu'il est lancé directement (`require.main === module`).

// Variables d'env sûres AVANT le require — `dotenv.config()` (dans server.js) ne
// réécrit pas les vars déjà définies. Évite le hard-crash prod et toute connexion
// à la vraie base (connectDB n'est de toute façon jamais appelé en require).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startApp, stopApp, baseUrl } = require('./helpers/harness');

before(startApp);
after(stopApp);

test('GET /auth/me sans session → 401 JSON', async () => {
    const res = await fetch(baseUrl() + '/auth/me');
    assert.equal(res.status, 401);
    assert.match(res.headers.get('content-type') || '', /application\/json/);
    const body = await res.json();
    assert.equal(body.error, 'Non authentifié');
});

test('GET /api/establishments sans base → 503 (middleware checkDB)', async () => {
    const res = await fetch(baseUrl() + '/api/establishments');
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'Base de données non disponible');
});

// Anti-injection NoSQL : un opérateur Mongo passé en query (`?from[$gt]=x`) est
// parsé en objet par qs → rejeté en 400 AVANT d'atteindre la moindre requête.
test('query param objet ($gt) → 400 (anti-injection NoSQL)', async () => {
    const res = await fetch(baseUrl() + '/api/establishments?' + encodeURIComponent('from[$gt]') + '=2020');
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'Paramètre de requête invalide');
});

// Contre-épreuve : un query param scalaire normal n'est PAS bloqué par le
// middleware (il poursuit jusqu'à checkDB → 503 sans base).
test('query param scalaire normal → traverse le middleware anti-injection', async () => {
    const res = await fetch(baseUrl() + '/api/establishments?from=2020-01-01');
    assert.equal(res.status, 503);
});

// ── /health annonce le commit déployé ────────────────────────────────────────
//
// Ajouté le 2026-08-11. Du 07 au 10 août, la production a tourné sur un build vieux de
// deux jours : la CI était rouge, Railway refusait de déployer, et le smoke passait au
// vert — sur l'ancien code. Personne n'a rien vu parce que rien ne reliait l'instance
// qui répond au commit qu'elle est censée porter. `smoke.js --expect <ref>` s'arrête
// désormais là-dessus, ce qui n'a de sens que si le champ existe vraiment.
test('GET /health expose le commit déployé', async () => {
    const res  = await fetch(baseUrl() + '/health');
    const body = await res.json();
    // Sans Mongo le healthcheck rend 503 : c'est le CORPS qui nous intéresse ici.
    assert.ok('commit' in body, 'le champ doit exister, même vide — smoke.js le lit');
    // Sous test, il est résolu depuis .git ; sur Railway, depuis RAILWAY_GIT_COMMIT_SHA.
    if (body.commit !== null) assert.match(body.commit, /^[0-9a-f]{40}$/);
});

test('GET /health ne divulgue rien d\'autre', async () => {
    const body = await (await fetch(baseUrl() + '/health')).json();
    assert.deepEqual(Object.keys(body).sort(), ['commit', 'db', 'ok', 'uptime'],
        'un healthcheck public ne doit pas devenir une fenêtre sur la configuration');
});
