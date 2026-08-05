'use strict';
// Tests de bout en bout sur une instance QUI TOURNE (dev, main, ou local).
//
// Les tests `npm test` tapent un faux Mongo : ils prouvent la logique, pas le câblage.
// Celui-ci parle HTTP à un vrai serveur, sur une vraie base, et rejoue les parcours —
// anciens ET nouveaux. C'est ce qu'on lance après chaque déploiement.
//
//   node scripts/smoke.js                          → http://localhost:3000
//   SMOKE_URL=https://dev.templyo.fr node scripts/smoke.js
//
// GARDE-FOU : il se connecte avec les comptes de `seed-dev.js` (@templyo.test). Sur une
// base client, ces comptes n'existent pas → il s'arrête à la 1re étape sans rien écrire.
// C'est volontaire : ce script ÉCRIT (dispos, validations), il ne doit jamais viser un client.

const BASE = (process.env.SMOKE_URL || 'http://localhost:3000').replace(/\/$/, '');
const PWD  = process.env.SEED_PASSWORD || 'Templyo2026!';

const { weekStart, toDateStr } = require('../lib/utils');
const nextMon = weekStart(new Date(Date.now() + 7 * 864e5));
const D = n => toDateStr(new Date(nextMon.getTime() + n * 864e5));
const FROM = D(0), TO = D(6);

const jar = {};
async function req(who, path, { method = 'GET', body } = {}) {
    const res = await fetch(BASE + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(jar[who] ? { cookie: jar[who] } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (set.length) jar[who] = set.map(c => c.split(';')[0]).join('; ');
    let data = null;
    try { data = await res.json(); } catch { /* corps vide */ }
    return { status: res.status, data };
}
const login = (who, email) => req(who, '/auth/login', { method: 'POST', body: { email, password: PWD } });

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

async function main() {
    console.log('\n🎯 cible : ' + BASE + '\n');

    const health = await req('anon', '/health');
    if (health.status !== 200) {
        console.error('❌ /health ne répond pas (' + health.status + ') — le serveur tourne ?');
        process.exit(1);
    }

    const pat = await login('pat', 'patron@templyo.test');
    if (pat.status !== 200) {
        console.error('❌ Connexion patron impossible (' + pat.status + ').');
        console.error('   Base non alimentée par seed-dev.js, ou instance CLIENT — arrêt sans rien écrire.');
        process.exit(1);
    }
    await login('dir', 'directeur@templyo.test');
    await login('obs', 'observateur@templyo.test');
    await login('bru', 'bruno@templyo.test');

    // ── Socle : ce qui marchait déjà ─────────────────────────────────────────
    await check('socle', 'session patron', async () =>
        eq((await req('pat', '/auth/me')).data.user.role, 'patron', 'role'));
    await check('socle', 'établissements listés', async () => {
        const r = await req('pat', '/api/establishments');
        if (!Array.isArray(r.data) || r.data.length === 0) throw new Error('aucun établissement');
        return r.data.length + ' bars';
    });
    await check('socle', 'staff listé', async () => {
        const r = await req('pat', '/api/staff');
        if (r.data.length < 5) throw new Error('staff incomplet (' + r.data.length + ')');
        return r.data.length + ' membres';
    });
    await check('socle', 'planning semaine (patron)', async () =>
        eq((await req('pat', '/api/week-full/Josy_pub?from=' + FROM + '&to=' + TO)).status, 200, 'status'));
    await check('socle', 'planning perso (staff)', async () =>
        eq((await req('bru', '/api/my-shifts?from=' + FROM + '&to=' + TO)).status, 200, 'status'));
    await check('socle', 'anonyme rejeté', async () =>
        eq((await req('anon', '/api/staff')).status, 401, 'status'));

    // ── S-04 : périmètre de la file de validation ────────────────────────────
    let nPat = 0, nDir = 0;
    await check('S-04', 'patron voit toute la file', async () => {
        nPat = (await req('pat', `/api/dispos/pending?from=${FROM}&to=${TO}`)).data.length;
        if (nPat === 0) throw new Error('file vide — base non alimentée ?');
        return nPat + ' dispos';
    });
    await check('S-04', 'directeur limité à son périmètre', async () => {
        nDir = (await req('dir', `/api/dispos/pending?from=${FROM}&to=${TO}`)).data.length;
        if (nDir >= nPat) throw new Error(`pas de filtrage (dir=${nDir}, patron=${nPat})`);
        return nDir + ' < ' + nPat;
    });
    await check('S-04', 'bascule scope=all rend tout', async () =>
        eq((await req('dir', `/api/dispos/pending?from=${FROM}&to=${TO}&scope=all`)).data.length, nPat, 'dispos'));
    await check('S-04', 'pastille alignée sur la file', async () => {
        const d = (await req('dir', '/api/dispos/count')).data.count;
        const a = (await req('dir', '/api/dispos/count?scope=all')).data.count;
        if (d >= a) throw new Error(`pastille non scopée (${d} vs ${a})`);
        return d + ' / ' + a;
    });

    // ── S-02 / S-03 : réglages de performance ────────────────────────────────
    await check('S-03', 'directeur lit SON bar', async () =>
        eq((await req('dir', '/api/performance-settings?establishment_id=Josy_pub')).status, 200, 'status'));
    await check('S-03', 'directeur bloqué sur un autre bar', async () =>
        eq((await req('dir', '/api/performance-settings?establishment_id=Poni_restaurant')).status, 403, 'status'));
    await check('S-03', 'staff bloqué', async () =>
        eq((await req('bru', '/api/performance-settings?establishment_id=Josy_pub')).status, 403, 'status'));
    await check('S-02', 'directeur ne peut pas écrire le doc global', async () =>
        eq((await req('dir', '/api/performance-settings', { method: 'PATCH', body: { charge_rate: 99 } })).status, 403, 'status'));
    await check('S-02', 'observateur en lecture seule', async () =>
        eq((await req('obs', '/api/performance-settings', { method: 'PATCH', body: { charge_rate: 99, establishment_id: 'Josy_pub' } })).status, 403, 'status'));
    await check('S-02', 'le 99 n\'a atterri nulle part', async () => {
        const g = (await req('pat', '/api/performance-settings')).data;
        if (g.charge_rate === 99) throw new Error('le taux global a été écrasé !');
        return 'global=' + g.charge_rate;
    });

    // ── §9.1 : exemption de deadline du directeur ────────────────────────────
    await check('§9.1', 'directeur accepté après deadline', async () =>
        eq((await req('dir', '/api/dispos', { method: 'POST', body: {
            dispos: [{ date: D(0), type: 'soir', start_time: 17, end_time: 24 }] } })).status, 201, 'status'));
    await check('§9.1', 'staff refusé après deadline', async () =>
        eq((await req('bru', '/api/dispos', { method: 'POST', body: {
            dispos: [{ date: D(1), type: 'soir', start_time: 18, end_time: 26 }] } })).status, 403, 'status'));

    // ── Congés (F-10) ────────────────────────────────────────────────────────
    await check('F-10', 'congés en attente visibles du patron', async () => {
        const r = await req('pat', `/api/conges?from=${FROM}&to=${D(30)}`);
        if (r.status !== 200) throw new Error('status ' + r.status);
        return (Array.isArray(r.data) ? r.data.length : '?') + ' congés';
    });

    // ── R-06 : resync venues (écrit puis remet en place) ─────────────────────
    await check('R-06', 'réaffecter le directeur propage sur staff.venues', async () => {
        const users = (await req('pat', '/api/users')).data;
        const dir = users.find(u => u.role === 'directeur');
        if (!dir) throw new Error('compte directeur introuvable');
        const venues = async () => ((await req('pat', '/api/staff')).data.find(s => /Diane/.test(s.name)) || {}).venues;
        const before = await venues();
        await req('pat', `/api/users/${dir._id}/establishments`, { method: 'PATCH', body: { assigned_establishments: ['Poni_restaurant'] } });
        const after = await venues();
        await req('pat', `/api/users/${dir._id}/establishments`, { method: 'PATCH', body: { assigned_establishments: before } });
        if (JSON.stringify(after) !== JSON.stringify(['Poni_restaurant']))
            throw new Error('venues non resynchronisées : ' + JSON.stringify(after));
        return JSON.stringify(before) + ' → Poni → remis';
    });

    // ── Restitution ──────────────────────────────────────────────────────────
    let section = '';
    for (const [mark, sec, name, detail] of results) {
        if (sec !== section) { console.log('  ' + sec); section = sec; }
        console.log('    ' + mark + ' ' + name.padEnd(46) + (detail ? '· ' + detail : ''));
    }
    console.log('\n  ' + pass + ' OK · ' + fail + ' échec(s)\n');
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
