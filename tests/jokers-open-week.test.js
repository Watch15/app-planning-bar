'use strict';
// D-101 — ouverture masse créneaux prédéfinis (slot_offer)

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const PATRON = { _id: 'p1', role: 'patron', name: 'Patron' };

let db;

before(async () => {
    process.env.FEATURE_PREDEFINED_SLOTS = 'force';
    await startApp();
});
after(() => {
    delete process.env.FEATURE_PREDEFINED_SLOTS;
    stopApp();
});

beforeEach(() => {
    db = makeDb();
    app.locals.setTestDb(db);
});

test('open-week : 404 si feature off', async () => {
    const prev = process.env.FEATURE_PREDEFINED_SLOTS;
    process.env.FEATURE_PREDEFINED_SLOTS = 'false';
    try {
        const res = await req('/api/jokers/open-week', PATRON, {
            method: 'POST',
            body: JSON.stringify({ establishment_id: 'bar1', week_start: '2026-09-08' }),
        });
        assert.equal(res.status, 404);
    } finally {
        process.env.FEATURE_PREDEFINED_SLOTS = prev;
    }
});

test('open-week : pose joker_open + slot_offer', async () => {
    const id1 = new ObjectId();
    const id2 = new ObjectId();
    await db.collection('shifts').insertMany([
        {
            _id: id1,
            establishment_id: 'bar1',
            date: '2026-09-10',
            staff_id: '__joker__',
            is_joker: true,
            joker_group: 'Bar',
            start_time: 18, end_time: 22,
        },
        {
            _id: id2,
            establishment_id: 'bar1',
            date: '2026-09-11',
            staff_id: '__joker__',
            is_joker: true,
            joker_open: true,
            start_time: 18, end_time: 22,
        },
    ]);
    const res = await req('/api/jokers/open-week', PATRON, {
        method: 'POST',
        body: JSON.stringify({ establishment_id: 'bar1', week_start: '2026-09-08' }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    const data = await res.json();
    assert.equal(data.opened, 1);
    const opened = db.collection('shifts')._docs.find(s => String(s._id) === String(id1));
    assert.equal(opened.joker_open, true);
    assert.equal(opened.slot_offer, true);
    const already = db.collection('shifts')._docs.find(s => String(s._id) === String(id2));
    assert.equal(already.slot_offer, undefined);
});
