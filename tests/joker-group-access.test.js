'use strict';
// Jokers ouverts : filtre par groupe staff (polyvalent = tous)

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { weekStart, toDateStr } = require('../lib/utils');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const CUR = toDateStr(weekStart(new Date()));
const day = (monday, i) => toDateStr(new Date(new Date(monday + 'T12:00:00').getTime() + i * 864e5));
const VISIBLE = day(CUR, 6);

const BAR_ID = new ObjectId();
const CUIS_ID = new ObjectId();
const POLY_ID = new ObjectId();

const STAFF_BAR = { _id: 'u-bar', staff_id: String(BAR_ID), name: 'Barman', role: 'staff' };
const STAFF_CUIS = { _id: 'u-cuis', staff_id: String(CUIS_ID), name: 'Cuisto', role: 'staff' };
const STAFF_POLY = { _id: 'u-poly', staff_id: String(POLY_ID), name: 'Poly', role: 'staff' };

let db;

before(startApp);
after(stopApp);

beforeEach(() => {
    db = makeDb({
        establishments: [{ id: 'bar1', name: 'Bar 1', groups: ['Bar', 'Cuisine'] }],
        settings: [{ key: 'publish_' + CUR, establishments: 'ALL', published_at: new Date() }],
        staff: [
            { _id: BAR_ID, name: 'Barman', venues: ['bar1'], groups: ['Bar'] },
            { _id: CUIS_ID, name: 'Cuisto', venues: ['bar1'], groups: ['Cuisine'] },
            { _id: POLY_ID, name: 'Poly', venues: ['bar1'], groups: [] },
        ],
        shifts: [
            {
                _id: new ObjectId(), staff_id: '__joker__', is_joker: true, joker_open: true,
                joker_group: 'Bar', establishment_id: 'bar1',
                date: VISIBLE, start_time: 18, end_time: 22,
            },
            {
                _id: new ObjectId(), staff_id: '__joker__', is_joker: true, joker_open: true,
                joker_group: 'Cuisine', establishment_id: 'bar1',
                date: VISIBLE, start_time: 18, end_time: 22,
            },
            {
                _id: new ObjectId(), staff_id: '__joker__', is_joker: true, joker_open: true,
                establishment_id: 'bar1',
                date: VISIBLE, start_time: 19, end_time: 23,
            },
        ],
    });
    app.locals.setTestDb(db);
});

test('joker-ouverts : staff Bar ne voit que Bar (+ sans groupe)', async () => {
    const body = await (await req('/api/shifts/joker-ouverts', STAFF_BAR)).json();
    assert.equal(body.length, 2);
    assert.ok(body.some(j => j.joker_group === 'Bar'));
    assert.ok(body.some(j => j.joker_group == null));
    assert.ok(!body.some(j => j.joker_group === 'Cuisine'));
});

test('joker-ouverts : staff Cuisine ne voit que Cuisine (+ sans groupe)', async () => {
    const body = await (await req('/api/shifts/joker-ouverts', STAFF_CUIS)).json();
    assert.equal(body.length, 2);
    assert.ok(body.some(j => j.joker_group === 'Cuisine'));
    assert.ok(body.some(j => j.joker_group == null));
    assert.ok(!body.some(j => j.joker_group === 'Bar'));
});

test('joker-ouverts : polyvalent voit tous les Jokers', async () => {
    const body = await (await req('/api/shifts/joker-ouverts', STAFF_POLY)).json();
    assert.equal(body.length, 3);
});

test('joker-candidature : refus si mauvais groupe', async () => {
    const cuisine = db.collection('shifts')._docs.find(s => s.joker_group === 'Cuisine');
    const res = await req('/api/shifts/' + String(cuisine._id) + '/joker-candidature', STAFF_BAR, {
        method: 'POST',
        body: '{}',
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /groupe/i);
});
