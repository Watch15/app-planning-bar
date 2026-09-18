'use strict';
// Ancien pointage (real_start / real_end : tablette, saisie directe, modale planning)
// → présent dans le nouveau (clôture du jour, récap, file à valider). Sans ce miroir, un
// shift pointé sur la tablette restait « Non commencé » côté clôture.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const ESTAB = 'bar1';
const SHIFT_OPEN = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const SHIFT_OTP = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const SHIFT_VALIDE = 'cccccccccccccccccccccccc';
const STAFF_ID = 'dddddddddddddddddddddddd';

const PATRON = { _id: '111111111111111111111111', role: 'patron', name: 'Patron' };
const ETAB = {
    _id: '333333333333333333333333',
    role: 'etablissement',
    name: 'Tablette',
    establishment_id: ESTAB,
};

let dbRef;
const shiftDoc = id => dbRef.collection('shifts').findOne({ _id: new ObjectId(id) });
const patchHours = (id, user, body) => req('/api/shifts/' + id + '/pointage', user, {
    method: 'PATCH', body: JSON.stringify(body),
});

before(startApp);
after(stopApp);

beforeEach(() => {
    dbRef = makeDb({
        establishments: [{ id: ESTAB, name: 'Le Bar' }],
        settings: [{ key: 'pointage', cutoff_hour: 9 }],
        staff: [{ _id: new ObjectId(STAFF_ID), name: 'Alice', venues: [ESTAB], hourly_rate: 12 }],
        shifts: [
            {
                _id: new ObjectId(SHIFT_OPEN),
                establishment_id: ESTAB, date: '2026-09-15',
                staff_id: STAFF_ID, staff_name: 'Alice',
                start_time: 18, end_time: 23, color: '#111',
            },
            {
                // Début pointé par code OTP, fin encore ouverte
                _id: new ObjectId(SHIFT_OTP),
                establishment_id: ESTAB, date: '2026-09-15',
                staff_id: STAFF_ID, staff_name: 'Alice',
                start_time: 18, end_time: 23, color: '#222',
                debut_valide_code: '18:05', debut_valide_finale: '18:05', debut_source: 'code',
            },
            {
                // Clôturé et récap validé
                _id: new ObjectId(SHIFT_VALIDE),
                establishment_id: ESTAB, date: '2026-09-15',
                staff_id: STAFF_ID, staff_name: 'Alice',
                start_time: 18, end_time: 23, color: '#333',
                real_start: 18, real_end: 23,
                debut_valide_code: '18:00', debut_valide_finale: '18:00', debut_source: 'manuelle',
                heure_validee_code: '23:00', heure_validee_finale: '23:00', cloture_source: 'manuelle',
                patron_valide: true,
            },
        ],
        users: [],
        time_validations: [],
    });
    app.locals.setTestDb(dbRef);
});

test('tablette : début + fin saisis → shift clôturé (source manuelle) et journalisé', async () => {
    const res = await patchHours(SHIFT_OPEN, ETAB, { real_start: 18.25, real_end: 23.5 });
    assert.equal(res.status, 200);
    const s = await shiftDoc(SHIFT_OPEN);
    assert.equal(s.real_start, 18.25);
    assert.equal(s.debut_valide_code, '18:15');
    assert.equal(s.debut_valide_finale, '18:15');
    assert.equal(s.debut_source, 'manuelle');
    assert.equal(s.heure_validee_code, '23:30');
    assert.equal(s.heure_validee_finale, '23:30');
    assert.equal(s.cloture_source, 'manuelle');
    const logs = await dbRef.collection('time_validations').find({ shift_id: SHIFT_OPEN }).toArray();
    assert.equal(logs.length, 1);
    assert.equal(logs[0].action, 'saisie_directe');
    assert.equal(logs[0].code_saisi, 'DIRECT');
    assert.equal(logs[0].fin_retenue, '23:30');
});

test('tablette : début seul → phase début, pas de fin', async () => {
    const res = await patchHours(SHIFT_OPEN, ETAB, { real_start: 18 });
    assert.equal(res.status, 200);
    const s = await shiftDoc(SHIFT_OPEN);
    assert.equal(s.debut_valide_finale, '18:00');
    assert.equal(s.heure_validee_finale, undefined);
});

test('la clôture le voit « Clôturé » et le récap le prend', async () => {
    await patchHours(SHIFT_OPEN, ETAB, { real_start: 18, real_end: 23 });
    const list = await req('/api/etablissements/' + ESTAB + '/clotures-semaine?week_start=2026-09-14', PATRON);
    assert.equal(list.status, 200);
    const row = (await list.json()).find(s => String(s._id) === SHIFT_OPEN);
    assert.equal(row.heure_validee_finale, '23:00');
    assert.equal(row.cloture_source, 'manuelle');
    const recap = await req('/api/etablissements/' + ESTAB + '/valider-recap', PATRON, {
        method: 'POST', body: JSON.stringify({ week_start: '2026-09-14' }),
    });
    assert.equal(recap.status, 200);
    assert.equal((await shiftDoc(SHIFT_OPEN)).patron_valide, true);
});

test('début déjà pointé par code : le code reste, seul le retenu bouge', async () => {
    const res = await patchHours(SHIFT_OTP, PATRON, { real_start: 18.5, real_end: 23 });
    assert.equal(res.status, 200);
    const s = await shiftDoc(SHIFT_OTP);
    assert.equal(s.debut_valide_code, '18:05');
    assert.equal(s.debut_source, 'code');
    assert.equal(s.debut_valide_finale, '18:30');
    assert.equal(s.heure_validee_code, '23:00');
    assert.equal(s.cloture_source, 'manuelle');
});

test('effacer les heures rouvre la clôture', async () => {
    await patchHours(SHIFT_OPEN, ETAB, { real_start: 18, real_end: 23 });
    const res = await patchHours(SHIFT_OPEN, PATRON, { real_start: null, real_end: null });
    assert.equal(res.status, 200);
    const s = await shiftDoc(SHIFT_OPEN);
    assert.equal(s.real_start, null);
    assert.equal(s.debut_valide_code, undefined);
    assert.equal(s.heure_validee_finale, undefined);
    assert.equal(s.cloture_source, undefined);
});

test('récap validé : impossible d\'effacer les heures (409)', async () => {
    const res = await patchHours(SHIFT_VALIDE, PATRON, { real_start: null, real_end: null });
    assert.equal(res.status, 409);
    assert.equal((await shiftDoc(SHIFT_VALIDE)).heure_validee_finale, '23:00');
});

test('récap validé : corriger les heures reste possible', async () => {
    const res = await patchHours(SHIFT_VALIDE, PATRON, { real_start: 18, real_end: 23.25 });
    assert.equal(res.status, 200);
    const s = await shiftDoc(SHIFT_VALIDE);
    assert.equal(s.heure_validee_finale, '23:15');
    assert.equal(s.heure_validee_code, '23:00');
});
