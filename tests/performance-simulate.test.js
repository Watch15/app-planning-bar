'use strict';
// POST /api/performance/simulate — hybride réel/estimé + taux joker

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const PATRON = { _id: 'p1', role: 'patron', name: 'Patron' };
const STAFF_USER = { _id: 'u1', role: 'staff', name: 'Staff', staff_id: 's1' };

let db;

before(async () => { await startApp(); });
after(() => stopApp());

beforeEach(() => {
    db = makeDb();
    app.locals.setTestDb(db);
});

test('simulate : refuse le staff', async () => {
    const res = await req('/api/performance/simulate', STAFF_USER, {
        method: 'POST',
        body: JSON.stringify({
            establishment_id: 'bar1', from: '2026-09-08', to: '2026-09-14',
            joker_mode: 'manual_hourly', joker_hourly: 14,
        }),
    });
    assert.equal(res.status, 403);
});

test('simulate : hybride pointé + joker planifié + moyenne', async () => {
    const sid = new ObjectId();
    await db.collection('settings').insertOne({
        key: 'performance_bar1', charge_rate: 45, target_charged: 43,
    });
    await db.collection('staff').insertMany([
        { _id: sid, name: 'Ada', hourly_rate: 10, venues: ['bar1'], groups: ['salle'] },
        { name: 'Bob', hourly_rate: 20, venues: ['bar1'], groups: ['salle'] },
        { name: 'Cara', hourly_rate: 30, venues: ['bar2'], groups: ['bar'] },
    ]);
    await db.collection('daily_revenue').insertOne({
        establishment_id: 'bar1', date: '2026-09-08', revenue: 1000,
    });
    await db.collection('shifts').insertMany([
        {
            establishment_id: 'bar1', date: '2026-09-08',
            staff_id: String(sid), staff_name: 'Ada',
            start_time: 18, end_time: 22,
            real_start: 18, real_end: 22,
            hourly_rate_snapshot: 10,
        },
        {
            establishment_id: 'bar1', date: '2026-09-10',
            staff_id: '__joker__', is_joker: true, staff_name: 'Joker · salle',
            joker_group: 'salle',
            start_time: 18, end_time: 22,
        },
    ]);

    const res = await req('/api/performance/simulate', PATRON, {
        method: 'POST',
        body: JSON.stringify({
            establishment_id: 'bar1',
            from: '2026-09-08',
            to: '2026-09-14',
            hypo_revenue_by_date: { '2026-09-10': 800 },
            joker_mode: 'mean',
            source_establishment_ids: ['bar1'],
        }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    const data = await res.json();
    // moyenne bar1 + groupe salle = (10+20)/2 = 15
    assert.equal(data.joker_rate_used, 15);
    assert.equal(data.joker_rates_by_group.salle.rate, 15);
    assert.equal(data.totals.revenue, 1800);
    assert.equal(data.totals.wage_real_gross, 40); // 4h × 10
    assert.equal(data.totals.wage_sim_gross, 60);  // 4h × 15
    const mon = data.days.find(d => d.date === '2026-09-08');
    const wed = data.days.find(d => d.date === '2026-09-10');
    assert.equal(mon.revenue_source, 'real');
    assert.equal(wed.revenue_source, 'hypo');
    assert.equal(wed.staff_detail[0].source, 'simulated');
    assert.equal(wed.staff_detail[0].is_joker, true);
});

test('simulate : taux manuel distinct par groupe', async () => {
    await db.collection('settings').insertOne({ key: 'performance', charge_rate: 0 });
    await db.collection('shifts').insertMany([
        {
            establishment_id: 'bar1', date: '2026-09-10',
            staff_id: '__joker__', is_joker: true, joker_group: 'Bar',
            staff_name: 'Joker · Bar', start_time: 18, end_time: 22,
        },
        {
            establishment_id: 'bar1', date: '2026-09-11',
            staff_id: '__joker__', is_joker: true, joker_group: 'Cuisine',
            staff_name: 'Joker · Cuisine', start_time: 18, end_time: 22,
        },
    ]);
    const res = await req('/api/performance/simulate', PATRON, {
        method: 'POST',
        body: JSON.stringify({
            establishment_id: 'bar1',
            from: '2026-09-08', to: '2026-09-14',
            joker_mode: 'manual_hourly',
            joker_hourly_by_group: { Bar: 10, Cuisine: 20 },
        }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    const data = await res.json();
    assert.equal(data.joker_rates_by_group.Bar.rate, 10);
    assert.equal(data.joker_rates_by_group.Cuisine.rate, 20);
    assert.equal(data.totals.wage_sim_gross, 4 * 10 + 4 * 20);
});

test('simulate : pool vide → 400', async () => {
    await db.collection('settings').insertOne({ key: 'performance', charge_rate: 45 });
    await db.collection('staff').insertOne({
        name: 'ForfaitOnly', fixed_rate: 80, venues: ['bar1'], groups: [],
    });
    await db.collection('shifts').insertOne({
        establishment_id: 'bar1', date: '2026-09-10',
        staff_id: '__joker__', is_joker: true, joker_group: 'salle',
        start_time: 18, end_time: 22,
    });
    const res = await req('/api/performance/simulate', PATRON, {
        method: 'POST',
        body: JSON.stringify({
            establishment_id: 'bar1',
            from: '2026-09-08',
            to: '2026-09-14',
            joker_mode: 'median',
            source_establishment_ids: ['bar1'],
        }),
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Aucun taux horaire/);
});

test('simulate : modes distincts par groupe (D-99)', async () => {
    const sid = new ObjectId();
    await db.collection('settings').insertOne({ key: 'performance', charge_rate: 0 });
    await db.collection('staff').insertMany([
        { _id: sid, name: 'Ada', hourly_rate: 10, venues: ['bar1'], groups: ['Cuisine'] },
        { name: 'Bob', hourly_rate: 20, venues: ['bar1'], groups: ['Cuisine'] },
    ]);
    await db.collection('shifts').insertMany([
        {
            establishment_id: 'bar1', date: '2026-09-10',
            staff_id: '__joker__', is_joker: true, joker_group: 'Bar',
            staff_name: 'Joker · Bar', start_time: 18, end_time: 22,
        },
        {
            establishment_id: 'bar1', date: '2026-09-11',
            staff_id: '__joker__', is_joker: true, joker_group: 'Cuisine',
            staff_name: 'Joker · Cuisine', start_time: 18, end_time: 22,
        },
    ]);
    const res = await req('/api/performance/simulate', PATRON, {
        method: 'POST',
        body: JSON.stringify({
            establishment_id: 'bar1',
            from: '2026-09-08', to: '2026-09-14',
            joker_mode: 'manual_hourly',
            joker_mode_by_group: { Bar: 'manual_fixed', Cuisine: 'mean' },
            joker_fixed_by_group: { Bar: 100 },
            source_establishment_ids: ['bar1'],
        }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    const data = await res.json();
    assert.equal(data.joker_modes_by_group.Bar, 'manual_fixed');
    assert.equal(data.joker_modes_by_group.Cuisine, 'mean');
    assert.equal(data.joker_rates_by_group.Bar.rate, 100);
    assert.equal(data.joker_rates_by_group.Bar.kind, 'fixed');
    assert.equal(data.joker_rates_by_group.Cuisine.rate, 15);
    assert.equal(data.totals.wage_sim_gross, 100 + 4 * 15);
});
