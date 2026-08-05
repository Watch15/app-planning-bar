'use strict';
// Harnais commun des tests d'intégration HTTP (CD-05).
//
// Il existe parce que S-01 a rendu le coût visible : ajouter UNE variable d'environnement
// (`ALLOW_TEST_AUTH`) a demandé la même édition dans 4 fichiers, et un oubli ne se serait
// pas vu — le harnais `x-test-user` ne serait simplement pas monté, et les tests
// échoueraient en 401 opaque plutôt qu'avec un message clair.
//
// ⚠️ Les variables d'env DOIVENT être posées avant `require('../../server')` : `dotenv`
// tourne à l'import du serveur et ne réécrit pas ce qui est déjà défini. C'est la raison
// pour laquelle ce module les pose lui-même, en tête, avant d'importer l'app.
process.env.NODE_ENV        = 'test';
process.env.ALLOW_TEST_AUTH = '1'; // 2e garde du harnais (S-01)
process.env.MONGO_URI       = process.env.MONGO_URI      || 'mongodb://127.0.0.1:27017/templyo_test';
process.env.SESSION_SECRET  = process.env.SESSION_SECRET || 'integration-test-secret-0123456789abcdef';

const app = require('../../server');

let server = null;
let base   = '';

// Démarre l'app sur un port éphémère. À passer directement à `before(...)`.
async function startApp() {
    server = app.listen(0);
    await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
    });
    base = 'http://127.0.0.1:' + server.address().port;
}

// À passer directement à `after(...)`.
function stopApp() { if (server) server.close(); }

// Requête authentifiée : la session est simulée par l'en-tête `x-test-user` (JSON).
const req = (path, user, init = {}) => fetch(base + path, {
    ...init,
    headers: {
        'content-type': 'application/json',
        ...(user ? { 'x-test-user': JSON.stringify(user) } : {}),
        ...(init.headers || {}),
    },
});

// Pour les rares tests qui construisent l'URL eux-mêmes (routes sans session).
const baseUrl = () => base;

module.exports = { app, startApp, stopApp, req, baseUrl };
