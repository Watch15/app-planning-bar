'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const PATRON = { _id: '0123456789abcdef01230001', role: 'patron', name: 'Patron' };

before(() => {
    app.locals.setTestDb(makeDb({
        shifts: [],
        staff: [],
        users: [],
        settings: [],
        establishments: [{ id: 'bar1', name: 'Bar 1' }],
        daily_revenue: [],
        shift_swaps: [],
    }));
    return startApp();
});
after(stopApp);

test('Planning seul : les API des modules optionnels répondent 404', async () => {
    const previous = {
        time: process.env.FEATURE_TIME_TRACKING,
        perf: process.env.FEATURE_PERFORMANCE,
        swaps: process.env.FEATURE_SHIFT_SWAPS,
        calendar: process.env.FEATURE_CALENDAR_SYNC,
    };
    process.env.FEATURE_TIME_TRACKING = 'false';
    process.env.FEATURE_PERFORMANCE = 'false';
    process.env.FEATURE_SHIFT_SWAPS = 'false';
    process.env.FEATURE_CALENDAR_SYNC = 'false';

    try {
        const calls = [
            req('/api/pointage/2026-09-15?establishment_id=bar1', PATRON),
            req('/api/performance?establishment_id=bar1&from=2026-09-15&to=2026-09-15', PATRON),
            req('/api/shift-swaps/mine', PATRON),
            req('/api/calendar-url', PATRON),
        ];
        const responses = await Promise.all(calls);
        for (const response of responses) {
            assert.equal(response.status, 404);
            assert.match((await response.json()).error, /Fonctionnalité/);
        }
    } finally {
        process.env.FEATURE_TIME_TRACKING = previous.time;
        process.env.FEATURE_PERFORMANCE = previous.perf;
        process.env.FEATURE_SHIFT_SWAPS = previous.swaps;
        if (previous.calendar === undefined) delete process.env.FEATURE_CALENDAR_SYNC;
        else process.env.FEATURE_CALENDAR_SYNC = previous.calendar;
    }
});

test('Pack complet : les middlewares laissent passer vers la logique métier', async () => {
    const [pointage, performance, swaps] = await Promise.all([
        req('/api/pointage/2026-09-15?establishment_id=bar1', PATRON),
        req('/api/performance?establishment_id=bar1&from=2026-09-15&to=2026-09-15', PATRON),
        req('/api/shift-swaps/mine', PATRON),
    ]);
    assert.equal(pointage.status, 200);
    assert.equal(performance.status, 200);
    assert.equal(swaps.status, 200);
});
