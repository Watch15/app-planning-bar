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

// ── Personne sans taux : costée comme un Joker (choix du 2026-09-10) ──────────
// Avant, sa ligne valait 0 € en silence — la masse était sous-comptée et le
// coefficient faux sans que rien ne le signale.

test('simulate : staff sans taux sur un créneau estimé prend le taux Joker de son groupe', async () => {
    const sans = new ObjectId();
    await db.collection('staff').insertMany([
        { _id: sans, name: 'Zoé', venues: ['bar1'], groups: ['salle'] },   // AUCUN taux
        { name: 'Bob', hourly_rate: 20, venues: ['bar1'], groups: ['salle'] },
    ]);
    await db.collection('shifts').insertMany([
        {
            establishment_id: 'bar1', date: '2026-09-10',
            staff_id: '__joker__', is_joker: true, joker_group: 'salle',
            start_time: 18, end_time: 22,
        },
        {
            establishment_id: 'bar1', date: '2026-09-10',
            staff_id: String(sans), staff_name: 'Zoé',
            start_time: 18, end_time: 22,      // planifié, pas pointé
        },
    ]);

    const res = await req('/api/performance/simulate', PATRON, {
        method: 'POST',
        body: JSON.stringify({
            establishment_id: 'bar1', from: '2026-09-08', to: '2026-09-14',
            joker_mode: 'manual_hourly', joker_hourly_by_group: { salle: 12 },
        }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    const data = await res.json();
    const jour = data.days.find(d => d.date === '2026-09-10');
    const ligne = jour.staff_detail.find(l => l.staff_name === 'Zoé');

    assert.equal(ligne.missing_rate, false, 'plus « taux manquant »');
    assert.equal(ligne.rate_fallback, true, 'la ligne dit que le taux vient du groupe');
    assert.equal(ligne.fallback_group, 'salle');
    assert.equal(ligne.hourly_rate, 12, 'le taux Joker du groupe, pas un autre');
    assert.equal(ligne.wage_gross, 48);                       // 4 h × 12
    assert.equal(jour.wage_sim_gross, 96);                    // Joker 48 + Zoé 48
});

test('simulate : le taux d’une personne AVEC taux n’est jamais remplacé', async () => {
    const avec = new ObjectId();
    await db.collection('staff').insertOne(
        { _id: avec, name: 'Ada', hourly_rate: 30, venues: ['bar1'], groups: ['salle'] },
    );
    await db.collection('shifts').insertMany([
        {
            establishment_id: 'bar1', date: '2026-09-10',
            staff_id: '__joker__', is_joker: true, joker_group: 'salle',
            start_time: 18, end_time: 22,
        },
        {
            establishment_id: 'bar1', date: '2026-09-10',
            staff_id: String(avec), staff_name: 'Ada',
            start_time: 18, end_time: 22,
        },
    ]);

    const res = await req('/api/performance/simulate', PATRON, {
        method: 'POST',
        body: JSON.stringify({
            establishment_id: 'bar1', from: '2026-09-08', to: '2026-09-14',
            joker_mode: 'manual_hourly', joker_hourly_by_group: { salle: 12 },
        }),
    });
    const data = await res.json();
    const ligne = data.days.find(d => d.date === '2026-09-10')
        .staff_detail.find(l => l.staff_name === 'Ada');
    assert.equal(ligne.rate_fallback, false);
    assert.equal(ligne.hourly_rate, 30);
    assert.equal(ligne.wage_gross, 120);   // 4 h × 30, son propre taux
});

test('simulate : côté RÉEL, un taux absent reste « taux manquant » et ne s’estime pas', async () => {
    const sans = new ObjectId();
    await db.collection('staff').insertMany([
        { _id: sans, name: 'Zoé', venues: ['bar1'], groups: ['salle'] },
        { name: 'Bob', hourly_rate: 20, venues: ['bar1'], groups: ['salle'] },
    ]);
    await db.collection('shifts').insertMany([
        {
            establishment_id: 'bar1', date: '2026-09-10',
            staff_id: '__joker__', is_joker: true, joker_group: 'salle',
            start_time: 18, end_time: 22,
        },
        {
            establishment_id: 'bar1', date: '2026-09-10',
            staff_id: String(sans), staff_name: 'Zoé',
            start_time: 18, end_time: 22,
            real_start: 18, real_end: 22,      // POINTÉ : pas de snapshot, pas de taux
        },
    ]);

    const res = await req('/api/performance/simulate', PATRON, {
        method: 'POST',
        body: JSON.stringify({
            establishment_id: 'bar1', from: '2026-09-08', to: '2026-09-14',
            joker_mode: 'manual_hourly', joker_hourly_by_group: { salle: 12 },
        }),
    });
    const data = await res.json();
    const jour = data.days.find(d => d.date === '2026-09-10');
    const ligne = jour.staff_detail.find(l => l.staff_name === 'Zoé');

    assert.equal(ligne.source, 'real');
    assert.equal(ligne.missing_rate, true, 'un coût jamais payé ne s’invente pas');
    assert.equal(ligne.rate_fallback, false);
    assert.equal(ligne.wage_gross, 0);
    assert.equal(jour.wage_real_gross, 0, 'la colonne « réel » reste réelle');
});

test('simulate : groupe sans aucun Joker → moyenne dérivée, pas de 400 en impasse', async () => {
    const sans = new ObjectId();
    await db.collection('staff').insertMany([
        { _id: sans, name: 'Zoé', venues: ['bar1'], groups: ['cuisine'] },  // aucun taux
        { name: 'Bob', hourly_rate: 10, venues: ['bar1'], groups: ['cuisine'] },
        { name: 'Cara', hourly_rate: 20, venues: ['bar1'], groups: ['cuisine'] },
    ]);
    await db.collection('shifts').insertOne({
        establishment_id: 'bar1', date: '2026-09-10',
        staff_id: String(sans), staff_name: 'Zoé',
        start_time: 18, end_time: 22,
    });

    // Mode manuel, mais AUCUN Joker cuisine → aucune carte à l'écran pour saisir
    // ce taux. Bloquer ici renverrait une erreur désignant un champ inexistant.
    const res = await req('/api/performance/simulate', PATRON, {
        method: 'POST',
        body: JSON.stringify({
            establishment_id: 'bar1', from: '2026-09-08', to: '2026-09-14',
            joker_mode: 'manual_hourly', joker_hourly_by_group: { salle: 12 },
        }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    const data = await res.json();
    const ligne = data.days.find(d => d.date === '2026-09-10')
        .staff_detail.find(l => l.staff_name === 'Zoé');
    assert.equal(ligne.rate_fallback, true);
    assert.equal(ligne.hourly_rate, 15, 'moyenne cuisine = (10+20)/2');
    assert.deepEqual(data.staff_fallback_groups, ['cuisine']);
});

test('simulate : sans aucun taux dérivable, la ligne retombe sur « taux manquant »', async () => {
    const sans = new ObjectId();
    await db.collection('staff').insertOne(
        { _id: sans, name: 'Zoé', venues: ['bar1'], groups: ['cuisine'] },
    );
    await db.collection('shifts').insertOne({
        establishment_id: 'bar1', date: '2026-09-10',
        staff_id: String(sans), staff_name: 'Zoé',
        start_time: 18, end_time: 22,
    });

    const res = await req('/api/performance/simulate', PATRON, {
        method: 'POST',
        body: JSON.stringify({
            establishment_id: 'bar1', from: '2026-09-08', to: '2026-09-14',
            joker_mode: 'manual_hourly', joker_hourly_by_group: { salle: 12 },
        }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    const data = await res.json();
    const ligne = data.days.find(d => d.date === '2026-09-10')
        .staff_detail.find(l => l.staff_name === 'Zoé');
    assert.equal(ligne.missing_rate, true);
    assert.equal(ligne.wage_gross, 0);
});

test('simulate : multi-groupes → le premier par ordre alphabétique, de façon stable', async () => {
    const sans = new ObjectId();
    await db.collection('staff').insertMany([
        { _id: sans, name: 'Zoé', venues: ['bar1'], groups: ['salle', 'Bar'] },
        { name: 'Bob', hourly_rate: 20, venues: ['bar1'], groups: ['salle'] },
    ]);
    await db.collection('shifts').insertMany([
        {
            establishment_id: 'bar1', date: '2026-09-10',
            staff_id: '__joker__', is_joker: true, joker_group: 'Bar',
            start_time: 18, end_time: 22,
        },
        {
            establishment_id: 'bar1', date: '2026-09-10',
            staff_id: '__joker__', is_joker: true, joker_group: 'salle',
            start_time: 18, end_time: 22,
        },
        {
            establishment_id: 'bar1', date: '2026-09-10',
            staff_id: String(sans), staff_name: 'Zoé',
            start_time: 18, end_time: 22,
        },
    ]);

    const res = await req('/api/performance/simulate', PATRON, {
        method: 'POST',
        body: JSON.stringify({
            establishment_id: 'bar1', from: '2026-09-08', to: '2026-09-14',
            joker_mode: 'manual_hourly', joker_hourly_by_group: { Bar: 11, salle: 22 },
        }),
    });
    const data = await res.json();
    const ligne = data.days.find(d => d.date === '2026-09-10')
        .staff_detail.find(l => l.staff_name === 'Zoé');
    assert.equal(ligne.fallback_group, 'Bar', '« Bar » avant « salle » en tri français');
    assert.equal(ligne.hourly_rate, 11);
});
