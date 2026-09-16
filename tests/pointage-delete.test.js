'use strict';
// D-106 — suppression pointage : patron/directeur peuvent effacer un shift déjà pointé ;
// tablette / staff restent bloqués (409).

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const ESTAB = 'bar1';
const SHIFT_POINTED = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const SHIFT_OPEN = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const STAFF_ID = 'cccccccccccccccccccccccc';

const PATRON = { _id: '111111111111111111111111', role: 'patron', name: 'Patron' };
const DIR = {
    _id: '222222222222222222222222',
    role: 'directeur',
    name: 'Dir',
    assigned_establishments: [ESTAB],
};
const ETAB = {
    _id: '333333333333333333333333',
    role: 'etablissement',
    name: 'Tablette',
    establishment_id: ESTAB,
};
const STAFF_USER = {
    _id: '444444444444444444444444',
    role: 'staff',
    name: 'Resp',
    staff_id: STAFF_ID,
};

before(startApp);
after(stopApp);

beforeEach(() => {
    app.locals.setTestDb(makeDb({
        establishments: [{ id: ESTAB, name: 'Le Bar' }],
        settings: [{ key: 'pointage', cutoff_hour: 9 }],
        staff: [{ _id: new ObjectId(STAFF_ID), name: 'Alice', venues: [ESTAB] }],
        shifts: [
            {
                _id: new ObjectId(SHIFT_POINTED),
                establishment_id: ESTAB,
                date: '2026-09-15',
                staff_id: STAFF_ID,
                staff_name: 'Alice',
                start_time: 18,
                end_time: 23,
                real_start: 18.25,
                real_end: 23.5,
                color: '#111',
            },
            {
                _id: new ObjectId(SHIFT_OPEN),
                establishment_id: ESTAB,
                date: '2026-09-15',
                staff_id: STAFF_ID,
                staff_name: 'Alice',
                start_time: 12,
                end_time: 14,
                color: '#222',
            },
        ],
        users: [],
    }));
});

test('D-106 : patron peut supprimer un shift déjà pointé', async () => {
    const res = await req('/api/shifts/' + SHIFT_POINTED + '/pointage', PATRON, { method: 'DELETE' });
    assert.equal(res.status, 200);
    const list = await req('/api/pointage/2026-09-15?establishment_id=' + ESTAB, PATRON);
    assert.equal(list.status, 200);
    const shifts = await list.json();
    assert.equal(shifts.some(s => String(s._id) === SHIFT_POINTED), false);
});

test('D-106 : directeur peut supprimer un shift déjà pointé dans son périmètre', async () => {
    const res = await req('/api/shifts/' + SHIFT_POINTED + '/pointage', DIR, { method: 'DELETE' });
    assert.equal(res.status, 200);
});

test('D-106 : tablette refuse de supprimer un shift déjà pointé', async () => {
    const res = await req('/api/shifts/' + SHIFT_POINTED + '/pointage', ETAB, { method: 'DELETE' });
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /déjà pointé/);
});

test('D-106 : tablette peut encore supprimer un shift non pointé', async () => {
    const res = await req('/api/shifts/' + SHIFT_OPEN + '/pointage', ETAB, { method: 'DELETE' });
    assert.equal(res.status, 200);
});

test('D-106 : staff hors responsable ne peut pas supprimer', async () => {
    const res = await req('/api/shifts/' + SHIFT_OPEN + '/pointage', STAFF_USER, { method: 'DELETE' });
    assert.equal(res.status, 403);
});
