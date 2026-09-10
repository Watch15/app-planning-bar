'use strict';
// GET /api/performance/staff-rate-stats — D-98

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');
const { buildStaffRateStatsReport } = require('../lib/utils');

const PATRON = { _id: 'p1', role: 'patron', name: 'Patron' };
const STAFF_USER = { _id: 'u1', role: 'staff', name: 'Staff', staff_id: 's1' };

let db;

before(async () => { await startApp(); });
after(() => stopApp());

beforeEach(() => {
    db = makeDb();
    app.locals.setTestDb(db);
});

test('buildStaffRateStatsReport : mean/median + groupes', () => {
    const report = buildStaffRateStatsReport([
        { name: 'A', hourly_rate: 10, venues: ['bar1'], groups: ['salle'] },
        { name: 'B', hourly_rate: 20, venues: ['bar1'], groups: ['salle'] },
        { name: 'C', fixed_rate: 80, venues: ['bar1'], groups: ['cuisine'] },
        { name: 'D', hourly_rate: 30, venues: ['bar2'], groups: ['salle'] },
    ], { establishmentIds: ['bar1'] });
    assert.equal(report.overall.mean, 15);
    assert.equal(report.overall.median, 15);
    assert.equal(report.overall.sample_size, 2);
    assert.equal(report.overall.n_hourly, 2);
    assert.equal(report.overall.n_fixed, 1);
    const salle = report.groups.find(g => g.key === 'salle');
    assert.ok(salle);
    assert.equal(salle.mean, 15);
});

test('staff-rate-stats : refuse le staff', async () => {
    const res = await req('/api/performance/staff-rate-stats?establishment_ids=bar1', STAFF_USER);
    assert.equal(res.status, 403);
});

test('staff-rate-stats : agrège le pool', async () => {
    await db.collection('staff').insertMany([
        { name: 'Ada', hourly_rate: 10, venues: ['bar1'], groups: ['Bar'] },
        { name: 'Bob', hourly_rate: 20, venues: ['bar1'], groups: ['Bar'] },
        { name: 'Cara', hourly_rate: 40, venues: ['bar1'], groups: ['Cuisine'] },
    ]);
    const res = await req('/api/performance/staff-rate-stats?establishment_ids=bar1', PATRON);
    assert.equal(res.status, 200, await res.clone().text());
    const data = await res.json();
    assert.equal(data.overall.mean, 23.33);
    assert.equal(data.overall.median, 20);
    assert.equal(data.groups.length, 2);
    const bar = data.groups.find(g => g.key === 'Bar');
    assert.equal(bar.mean, 15);
});
