'use strict';
// Clôture OTP début + fin — atomicité, TTL, ajustement, append-only.

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

async function currentCode() {
    const res = await req('/api/etablissements/' + ESTAB + '/code-cloture', PATRON);
    assert.equal(res.status, 200);
    return (await res.json()).code;
}

async function pointerDebut(shiftId, user, code) {
    return req('/api/shifts/' + shiftId + '/cloturer-par-code', user, {
        method: 'POST', body: JSON.stringify({ code, phase: 'debut' }),
    });
}

async function pointerFin(shiftId, user, code) {
    return req('/api/shifts/' + shiftId + '/cloturer-par-code', user, {
        method: 'POST', body: JSON.stringify({ code, phase: 'fin' }),
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

test('début puis fin OK avec 2 codes + phase dans time_validations', async () => {
    const r1 = await pointerDebut(SHIFT, EQUIPIER, '4827');
    assert.equal(r1.status, 200);
    const d1 = await r1.json();
    assert.equal(d1.phase, 'debut');
    assert.match(d1.debut_valide_code, /^\d{2}:\d{2}$/);
    assert.equal(d1.debut_valide_code, d1.debut_valide_finale);

    const shiftMid = db.collection('shifts')._docs.find(s => String(s._id) === SHIFT);
    assert.equal(shiftMid.debut_source, 'code');
    assert.equal(shiftMid.heure_validee_code, undefined);
    assert.equal(shiftMid.real_start, undefined);

    const code2 = await currentCode();
    assert.notEqual(code2, '4827');

    const r2 = await pointerFin(SHIFT, EQUIPIER, code2);
    assert.equal(r2.status, 200);
    const d2 = await r2.json();
    assert.equal(d2.phase, 'fin');
    assert.match(d2.heure_validee_code, /^\d{2}:\d{2}$/);

    const shift = db.collection('shifts')._docs.find(s => String(s._id) === SHIFT);
    assert.equal(shift.cloture_source, 'code');
    assert.equal(shift.real_end, undefined);

    const vals = db.collection('time_validations')._docs.filter(v => v.resultat === 'accepte');
    assert.equal(vals.length, 2);
    assert.equal(vals[0].phase, 'debut');
    assert.equal(vals[1].phase, 'fin');
});

test('fin refusée sans début', async () => {
    const res = await pointerFin(SHIFT, EQUIPIER, '4827');
    assert.equal(res.status, 409);
    const err = await res.json();
    assert.match(err.error, /début/i);
});

test('double début → 409', async () => {
    assert.equal((await pointerDebut(SHIFT, EQUIPIER, '4827')).status, 200);
    const code2 = await currentCode();
    const r2 = await pointerDebut(SHIFT, EQUIPIER, code2);
    assert.equal(r2.status, 409);
});

test('deuxième usage du même code → refuse_code_deja_utilise + insert audit', async () => {
    assert.equal((await pointerDebut(SHIFT, EQUIPIER, '4827')).status, 200);

    db.collection('codes_cloture')._docs[0].code_actuel = '1111';
    db.collection('codes_cloture')._docs[0].code_utilise = true;
    db.collection('codes_cloture')._docs[0].expire_ms = Date.now() + 60000;

    const r2 = await pointerDebut(SHIFT2, EQUIPIER2, '1111');
    assert.equal(r2.status, 400);
    const err = await r2.json();
    assert.equal(err.resultat, 'refuse_code_deja_utilise');

    const refuses = db.collection('time_validations')._docs.filter(v => v.resultat === 'refuse_code_deja_utilise');
    assert.equal(refuses.length, 1);
    assert.equal(refuses[0].phase, 'debut');
});

test('staff ne peut pas clôturer le shift d\'un autre', async () => {
    const res = await pointerDebut(SHIFT2, EQUIPIER, '4827');
    assert.equal(res.status, 403);
});

test('Joker : staff du bar peut pointer début + fin', async () => {
    assert.equal((await pointerDebut(JOKER, EQUIPIER, '4827')).status, 200);
    const code2 = await currentCode();
    assert.equal((await pointerFin(JOKER, EQUIPIER, code2)).status, 200);
    const shift = db.collection('shifts')._docs.find(s => String(s._id) === JOKER);
    assert.equal(shift.debut_source, 'code');
    assert.equal(shift.cloture_source, 'code');
    assert.equal(shift.staff_id, '__joker__');
});

test('ajuster debut_valide_finale ne mute pas debut_valide_code', async () => {
    assert.equal((await pointerDebut(SHIFT, EQUIPIER, '4827')).status, 200);
    const before = db.collection('shifts')._docs.find(s => String(s._id) === SHIFT).debut_valide_code;

    const res = await req('/api/shifts/' + SHIFT + '/ajuster-heure', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ debut_valide_finale: '18:15', motif: 'Retard toléré' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.debut_valide_code, before);
    assert.equal(data.debut_valide_finale, '18:15');

    const shift = db.collection('shifts')._docs.find(s => String(s._id) === SHIFT);
    assert.equal(shift.debut_valide_code, before);
    assert.equal(shift.debut_valide_finale, '18:15');
});

test('ajuster-heure fin ne mute pas heure_validee_code', async () => {
    assert.equal((await pointerDebut(SHIFT, EQUIPIER, '4827')).status, 200);
    const code2 = await currentCode();
    assert.equal((await pointerFin(SHIFT, EQUIPIER, code2)).status, 200);
    const before = db.collection('shifts')._docs.find(s => String(s._id) === SHIFT).heure_validee_code;

    const res = await req('/api/shifts/' + SHIFT + '/ajuster-heure', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ heure_validee_finale: '23:30', motif: 'Sortie anticipée' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.heure_validee_code, before);
    assert.equal(data.heure_validee_finale, '23:30');
});

test('clôture manuelle début puis fin + MANUEL dans time_validations', async () => {
    const r1 = await req('/api/shifts/' + SHIFT + '/cloturer-manuel', PATRON, {
        method: 'POST', body: JSON.stringify({ phase: 'debut', heure: '18:05' }),
    });
    assert.equal(r1.status, 200);
    let shift = db.collection('shifts')._docs.find(s => String(s._id) === SHIFT);
    assert.equal(shift.debut_source, 'manuelle');
    assert.equal(shift.debut_valide_code, '18:05');

    const r2 = await req('/api/shifts/' + SHIFT + '/cloturer-manuel', PATRON, {
        method: 'POST', body: JSON.stringify({ phase: 'fin', heure: '23:55' }),
    });
    assert.equal(r2.status, 200);
    shift = db.collection('shifts')._docs.find(s => String(s._id) === SHIFT);
    assert.equal(shift.cloture_source, 'manuelle');
    assert.equal(shift.heure_validee_code, '23:55');
    const manuels = db.collection('time_validations')._docs.filter(v => v.code_saisi === 'MANUEL');
    assert.equal(manuels.length, 2);
    assert.equal(manuels[0].phase, 'debut');
    assert.equal(manuels[1].phase, 'fin');
});

test('fin manuelle sans début exige heure_debut pour forcer', async () => {
    const bad = await req('/api/shifts/' + SHIFT + '/cloturer-manuel', PATRON, {
        method: 'POST', body: JSON.stringify({ phase: 'fin', heure: '23:00' }),
    });
    assert.equal(bad.status, 409);

    const ok = await req('/api/shifts/' + SHIFT + '/cloturer-manuel', PATRON, {
        method: 'POST', body: JSON.stringify({ phase: 'fin', heure: '23:00', heure_debut: '18:00' }),
    });
    assert.equal(ok.status, 200);
    const shift = db.collection('shifts')._docs.find(s => String(s._id) === SHIFT);
    assert.equal(shift.debut_valide_code, '18:00');
    assert.equal(shift.heure_validee_code, '23:00');
});

test('valider-recap pose patron_valide sur les shifts clôturés de la semaine', async () => {
    assert.equal((await pointerDebut(SHIFT, EQUIPIER, '4827')).status, 200);
    const code2 = await currentCode();
    assert.equal((await pointerFin(SHIFT, EQUIPIER, code2)).status, 200);

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

    const adj = await req('/api/shifts/' + SHIFT + '/ajuster-heure', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ heure_validee_finale: '22:00' }),
    });
    assert.equal(adj.status, 409);
});

test('time_validations : aucune update/delete dans le flux (append-only)', async () => {
    await pointerDebut(SHIFT, EQUIPIER, '9999');
    await pointerDebut(SHIFT, EQUIPIER, '4827');
    const docs = db.collection('time_validations')._docs;
    assert.ok(docs.length >= 2);
    assert.ok(docs.some(d => d.resultat === 'accepte'));
    assert.ok(docs.some(d => d.resultat && d.resultat.startsWith('refuse_')));
});
