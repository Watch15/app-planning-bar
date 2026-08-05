// S-02 / S-03 — contrôle d'accès des réglages de performance (objectifs + taux de
// charges). Deux trous corrigés le 2026-08-05 :
//   • S-03 : `GET` était en `requireAuth` seul et transmettait `establishment_id` tel
//     quel → n'importe quel staff lisait les objectifs et le taux de charges de
//     n'importe quel bar en devinant l'id (slug `Nom_bar`).
//   • S-02 : le contrôle d'accès du `PATCH` ne tournait QUE si `establishment_id` était
//     fourni. Sans le champ, on écrivait le doc GLOBAL `performance`, dont `charge_rate`
//     alimente tous les établissements par fallback (`resolvePerfSettings`) — donc un
//     directeur limité à un bar déplaçait les chiffres des autres. Et `requirePatron`
//     laisse passer l'`observateur` : un rôle lecture seule pouvait écrire.
//
// Harnais CD-05 : faux `db` en mémoire + session simulée par l'en-tête `x-test-user`.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const PATRON      = { _id: 'u-patron', role: 'patron', name: 'Chef' };
const OBSERVATEUR = { _id: 'u-obs',    role: 'observateur', name: 'Audit' };
// Directeur limité à UN bar : c'est lui que les deux trous concernaient.
const DIRECTEUR   = { _id: 'u-dir', role: 'directeur', name: 'Dir', assigned_establishments: ['bar1'] };
const STAFF       = { _id: 'u-staff', role: 'staff', name: 'Bob', staff_id: '0123456789abcdef0123cccc' };

before(startApp);
after(stopApp);

const patch = (user, body) => req('/api/performance-settings', user, { method: 'PATCH', body: JSON.stringify(body) });

let db;
const settingsOf = key => db.collection('settings')._docs.find(d => d.key === key);

beforeEach(() => {
    db = makeDb({
        settings: [
            { key: 'performance',      target_charged: 30, charge_rate: 45 },
            { key: 'performance_bar2', target_charged: 25, charge_rate: 50 },
        ],
    });
    app.locals.setTestDb(db);
});

// ── S-03 : lecture ────────────────────────────────────────────────────────────

test('S-03 : un staff ne peut plus lire les réglages d\'un bar', async () => {
    const res = await req('/api/performance-settings?establishment_id=bar1', STAFF);
    assert.equal(res.status, 403);
});

test('S-03 : un directeur ne lit pas les réglages d\'un bar qui n\'est pas le sien', async () => {
    const res = await req('/api/performance-settings?establishment_id=bar2', DIRECTEUR);
    assert.equal(res.status, 403);
});

test('S-03 : le directeur lit bien les réglages de SON bar (contre-épreuve)', async () => {
    const res = await req('/api/performance-settings?establishment_id=bar1', DIRECTEUR);
    assert.equal(res.status, 200);
    // bar1 n'a pas d'override → fallback sur le doc global.
    assert.equal((await res.json()).charge_rate, 45);
});

test('S-03 : le patron lit n\'importe quel bar, override compris', async () => {
    const res = await req('/api/performance-settings?establishment_id=bar2', PATRON);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).charge_rate, 50);
});

test('S-03 : lecture globale (sans establishment_id) refusée au directeur', async () => {
    assert.equal((await req('/api/performance-settings', DIRECTEUR)).status, 403);
    assert.equal((await req('/api/performance-settings', PATRON)).status, 200);
});

// ── S-02 : écriture ───────────────────────────────────────────────────────────

test('S-02 : un directeur ne peut plus écrire le doc GLOBAL en omettant establishment_id', async () => {
    // Le cœur du trou : sans le champ, l'ancien code sautait tout contrôle d'accès et
    // écrivait `performance`, dont `charge_rate` retombe sur TOUS les bars.
    const res = await patch(DIRECTEUR, { charge_rate: 99 });
    assert.equal(res.status, 403);
    assert.equal(settingsOf('performance').charge_rate, 45, 'le taux global est intact');
});

test('S-02 : un directeur n\'écrit pas les réglages d\'un bar qui n\'est pas le sien', async () => {
    const res = await patch(DIRECTEUR, { charge_rate: 99, establishment_id: 'bar2' });
    assert.equal(res.status, 403);
    assert.equal(settingsOf('performance_bar2').charge_rate, 50);
});

test('S-02 : le directeur écrit bien SON bar (contre-épreuve)', async () => {
    const res = await patch(DIRECTEUR, { charge_rate: 42, establishment_id: 'bar1' });
    assert.equal(res.status, 200);
    assert.equal(settingsOf('performance_bar1').charge_rate, 42);
    assert.equal(settingsOf('performance').charge_rate, 45, 'sans toucher au global');
});

test('S-02 : l\'observateur est en lecture seule — il lit mais n\'écrit pas', async () => {
    assert.equal((await req('/api/performance-settings?establishment_id=bar2', OBSERVATEUR)).status, 200);
    const res = await patch(OBSERVATEUR, { charge_rate: 99, establishment_id: 'bar2' });
    assert.equal(res.status, 403);
    assert.equal(settingsOf('performance_bar2').charge_rate, 50);
});

test('S-02 : le patron reste seul à pouvoir écrire le doc global', async () => {
    const res = await patch(PATRON, { charge_rate: 38 });
    assert.equal(res.status, 200);
    assert.equal(settingsOf('performance').charge_rate, 38);
});

test('S-02 : un staff ne peut pas écrire du tout', async () => {
    assert.equal((await patch(STAFF, { charge_rate: 99, establishment_id: 'bar1' })).status, 403);
});
