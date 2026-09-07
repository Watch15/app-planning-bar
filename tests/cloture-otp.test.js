'use strict';
// Clôture de service par code OTP — atomicité, TTL, ajustement, append-only.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const ESTAB  = 'bar1';
const STAFF  = '0123456789abcdef0123a101';
const STAFF2 = '0123456789abcdef0123a102';
const SHIFT  = '0123456789abcdef0123c101';
const SHIFT2 = '0123456789abcdef0123c102';
const JOKER  = '0123456789abcdef0123c103';
const USER_S = '0123456789abcdef0123b101';
const USER_S2 = '0123456789abcdef0123b102';

const PATRON = { role: 'patron', _id: '0123456789abcdef0123b000' };
const EQUIPIER = { role: 'staff', _id: USER_S, staff_id: STAFF };
const EQUIPIER2 = { role: 'staff', _id: USER_S2, staff_id: STAFF2 };

before(startApp);
after(stopApp);

let db;
beforeEach(() => {
    db = seed();
    app.locals.setTestDb(db);
});

function todayStr() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function mondayOf(d = new Date()) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    const pad = n => String(n).padStart(2, '0');
    return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
}

function seed(extra = {}) {
    const now = Date.now();
    return makeDb({
        establishments: [{ id: ESTAB, name: 'Le Bar' }],
        users: [
            { _id: USER_S, role: 'staff', active: true, staff_id: STAFF, name: 'Alice' },
            { _id: USER_S2, role: 'staff', active: true, staff_id: STAFF2, name: 'Bob' },
        ],
        staff: [
            { _id: STAFF, name: 'Alice', venues: [ESTAB] },
            { _id: STAFF2, name: 'Bob', venues: [ESTAB] },
        ],
        shifts: [
            {
                _id: SHIFT, staff_id: STAFF, staff_name: 'Alice',
                establishment_id: ESTAB, date: todayStr(),
                start_time: 18, end_time: 24,
            },
            {
                _id: SHIFT2, staff_id: STAFF2, staff_name: 'Bob',
                establishment_id: ESTAB, date: todayStr(),
                start_time: 18, end_time: 23,
            },
            {
                _id: JOKER, staff_id: '__joker__', staff_name: 'Joker', is_joker: true,
                establishment_id: ESTAB, date: todayStr(),
                start_time: 20, end_time: 24,
            },
        ],
        codes_cloture: [{
            etablissement_id: ESTAB,
            code_actuel: '4827',
            expire_ms: now + 15 * 60 * 1000,
            code_utilise: false,
            utilise_par: null,
            utilise_le: null,
            genere_le: { year: 2026, month: 1, day: 1, hour: 12, minute: 0, second: 0 },
            expire_le: { year: 2026, month: 1, day: 1, hour: 12, minute: 15, second: 0 },
        }],
        time_validations: [],
        ...extra,
    });
}

test('GET code-cloture renvoie le code courant au patron', async () => {
    const res = await req('/api/etablissements/' + ESTAB + '/code-cloture', PATRON);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.code, '4827');
    assert.ok(data.expire_ms > Date.now());
});

test('GET code-cloture régénère si expiré (lazy)', async () => {
    db.collection('codes_cloture')._docs[0].expire_ms = Date.now() - 1000;
    const res = await req('/api/etablissements/' + ESTAB + '/code-cloture', PATRON);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.notEqual(data.code, '4827');
    assert.match(data.code, /^\d{4}$/);
    assert.ok(data.expire_ms > Date.now());
});

test('cloturer-par-code accepte et pose heure_validee_* sans toucher real_end', async () => {
    const res = await req('/api/shifts/' + SHIFT + '/cloturer-par-code', EQUIPIER, {
        method: 'POST', body: JSON.stringify({ code: '4827' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.match(data.heure_validee_code, /^\d{2}:\d{2}$/);
    assert.equal(data.heure_validee_code, data.heure_validee_finale);

    const shift = db.collection('shifts')._docs.find(s => String(s._id) === SHIFT);
    assert.equal(shift.cloture_source, 'code');
    assert.equal(shift.heure_validee_code, data.heure_validee_code);
    assert.equal(shift.real_end, undefined);

    const vals = db.collection('time_validations')._docs;
    assert.equal(vals.length, 1);
    assert.equal(vals[0].resultat, 'accepte');
    assert.equal(vals[0].code_saisi, '4827');
    assert.ok(vals[0].heure_saisie.year);
    assert.ok(vals[0].heure_saisie.month);
});

test('deuxième usage du même code → refuse_code_deja_utilise + insert audit', async () => {
    const r1 = await req('/api/shifts/' + SHIFT + '/cloturer-par-code', EQUIPIER, {
        method: 'POST', body: JSON.stringify({ code: '4827' }),
    });
    assert.equal(r1.status, 200);

    // Après succès le code a été régénéré — on force un code déjà utilisé pour le 2e staff
    db.collection('codes_cloture')._docs[0].code_actuel = '1111';
    db.collection('codes_cloture')._docs[0].code_utilise = true;
    db.collection('codes_cloture')._docs[0].expire_ms = Date.now() + 60000;

    const r2 = await req('/api/shifts/' + SHIFT2 + '/cloturer-par-code', EQUIPIER2, {
        method: 'POST', body: JSON.stringify({ code: '1111' }),
    });
    assert.equal(r2.status, 400);
    const err = await r2.json();
    assert.equal(err.resultat, 'refuse_code_deja_utilise');

    const refuses = db.collection('time_validations')._docs.filter(v => v.resultat === 'refuse_code_deja_utilise');
    assert.equal(refuses.length, 1);
});

test('staff ne peut pas clôturer le shift d\'un autre', async () => {
    const res = await req('/api/shifts/' + SHIFT2 + '/cloturer-par-code', EQUIPIER, {
        method: 'POST', body: JSON.stringify({ code: '4827' }),
    });
    assert.equal(res.status, 403);
});

test('Joker : staff du bar peut clôturer avec le code', async () => {
    const res = await req('/api/shifts/' + JOKER + '/cloturer-par-code', EQUIPIER, {
        method: 'POST', body: JSON.stringify({ code: '4827' }),
    });
    assert.equal(res.status, 200);
    const shift = db.collection('shifts')._docs.find(s => String(s._id) === JOKER);
    assert.equal(shift.cloture_source, 'code');
    assert.equal(shift.staff_id, '__joker__');
});

test('ajuster-heure ne mute pas heure_validee_code', async () => {
    await req('/api/shifts/' + SHIFT + '/cloturer-par-code', EQUIPIER, {
        method: 'POST', body: JSON.stringify({ code: '4827' }),
    });
    const before = db.collection('shifts')._docs.find(s => String(s._id) === SHIFT).heure_validee_code;

    const res = await req('/api/shifts/' + SHIFT + '/ajuster-heure', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ heure_validee_finale: '23:30', motif: 'Sortie anticipée' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.heure_validee_code, before);
    assert.equal(data.heure_validee_finale, '23:30');

    const shift = db.collection('shifts')._docs.find(s => String(s._id) === SHIFT);
    assert.equal(shift.heure_validee_code, before);
    assert.equal(shift.heure_validee_finale, '23:30');
    assert.equal(shift.motif_modification, 'Sortie anticipée');
});

test('clôture manuelle trace source manuelle + MANUEL dans time_validations', async () => {
    const res = await req('/api/shifts/' + SHIFT + '/cloturer-manuel', PATRON, {
        method: 'POST', body: JSON.stringify({ heure: '23:55' }),
    });
    assert.equal(res.status, 200);
    const shift = db.collection('shifts')._docs.find(s => String(s._id) === SHIFT);
    assert.equal(shift.cloture_source, 'manuelle');
    assert.equal(shift.heure_validee_code, '23:55');
    assert.equal(db.collection('time_validations')._docs[0].code_saisi, 'MANUEL');
});

test('valider-recap pose patron_valide sur les shifts clôturés de la semaine', async () => {
    await req('/api/shifts/' + SHIFT + '/cloturer-par-code', EQUIPIER, {
        method: 'POST', body: JSON.stringify({ code: '4827' }),
    });
    const weekStart = mondayOf();
    const res = await req('/api/etablissements/' + ESTAB + '/valider-recap', PATRON, {
        method: 'POST', body: JSON.stringify({ week_start: weekStart }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.modified >= 1);

    const shift = db.collection('shifts')._docs.find(s => String(s._id) === SHIFT);
    assert.equal(shift.patron_valide, true);
    assert.ok(shift.patron_valide_le.year);

    // Plus d'ajustement après validation
    const adj = await req('/api/shifts/' + SHIFT + '/ajuster-heure', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ heure_validee_finale: '22:00' }),
    });
    assert.equal(adj.status, 409);
});

test('time_validations : aucune update/delete dans le flux (append-only)', async () => {
    await req('/api/shifts/' + SHIFT + '/cloturer-par-code', EQUIPIER, {
        method: 'POST', body: JSON.stringify({ code: '9999' }),
    });
    await req('/api/shifts/' + SHIFT + '/cloturer-par-code', EQUIPIER, {
        method: 'POST', body: JSON.stringify({ code: '4827' }),
    });
    const docs = db.collection('time_validations')._docs;
    assert.ok(docs.length >= 2);
    // Tous les docs d'origine restent présents (pas de suppression)
    assert.ok(docs.some(d => d.resultat === 'accepte'));
    assert.ok(docs.some(d => d.resultat && d.resultat.startsWith('refuse_')));
});
