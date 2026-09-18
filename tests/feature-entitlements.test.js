'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const PATRON = { _id: '0123456789abcdef01230001', role: 'patron', name: 'Patron' };
const SHIFT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

before(() => startApp());
after(stopApp);

beforeEach(() => {
    app.locals.setTestDb(makeDb({
        shifts: [{
            _id: new ObjectId(SHIFT_ID),
            establishment_id: 'bar1',
            date: '2026-09-15',
            staff_id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
            staff_name: 'Alice',
            start_time: 18,
            end_time: 23,
        }],
        staff: [],
        users: [],
        settings: [],
        establishments: [{ id: 'bar1', name: 'Bar 1' }],
        daily_revenue: [],
        shift_swaps: [],
    }));
});

function withFlags(flags, fn) {
    const previous = {
        time: process.env.FEATURE_TIME_TRACKING,
        perf: process.env.FEATURE_PERFORMANCE,
        swaps: process.env.FEATURE_SHIFT_SWAPS,
        calendar: process.env.FEATURE_CALENDAR_SYNC,
        otp: process.env.FEATURE_OTP_CLOSURE,
    };
    if (flags.time !== undefined) process.env.FEATURE_TIME_TRACKING = flags.time;
    if (flags.perf !== undefined) process.env.FEATURE_PERFORMANCE = flags.perf;
    if (flags.swaps !== undefined) process.env.FEATURE_SHIFT_SWAPS = flags.swaps;
    if (flags.calendar !== undefined) process.env.FEATURE_CALENDAR_SYNC = flags.calendar;
    if (flags.otp !== undefined) process.env.FEATURE_OTP_CLOSURE = flags.otp;
    return Promise.resolve()
        .then(fn)
        .finally(() => {
            process.env.FEATURE_TIME_TRACKING = previous.time;
            process.env.FEATURE_PERFORMANCE = previous.perf;
            process.env.FEATURE_SHIFT_SWAPS = previous.swaps;
            if (previous.calendar === undefined) delete process.env.FEATURE_CALENDAR_SYNC;
            else process.env.FEATURE_CALENDAR_SYNC = previous.calendar;
            process.env.FEATURE_OTP_CLOSURE = previous.otp;
        });
}

test('Planning seul : les API des modules optionnels répondent 404', async () => {
    await withFlags({
        time: 'false',
        perf: 'false',
        swaps: 'false',
        calendar: 'false',
    }, async () => {
        const calls = [
            req('/api/pointage/2026-09-15?establishment_id=bar1', PATRON),
            req('/api/performance?establishment_id=bar1&from=2026-09-15&to=2026-09-15', PATRON),
            req('/api/shift-swaps/mine', PATRON),
            req('/api/calendar-url', PATRON),
            req('/api/shifts/' + SHIFT_ID + '/pointage', PATRON, {
                method: 'PATCH',
                body: JSON.stringify({ real_start: 18, real_end: 23 }),
            }),
        ];
        const responses = await Promise.all(calls);
        for (const response of responses) {
            assert.equal(response.status, 404);
            assert.match((await response.json()).error, /Fonctionnalité/);
        }
    });
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

test('Formule 3 : Performance seule ouvre la saisie manuelle, pas le pointage terrain', async () => {
    await withFlags({ time: 'false', perf: 'true' }, async () => {
        const [pagePointage, perf, manual] = await Promise.all([
            req('/api/pointage/2026-09-15?establishment_id=bar1', PATRON),
            req('/api/performance?establishment_id=bar1&from=2026-09-15&to=2026-09-15', PATRON),
            req('/api/shifts/' + SHIFT_ID + '/pointage', PATRON, {
                method: 'PATCH',
                body: JSON.stringify({ real_start: 18.5, real_end: 23.25 }),
            }),
        ]);
        assert.equal(pagePointage.status, 404, 'OTP/tablette restent derrière time_tracking');
        assert.equal(perf.status, 200);
        assert.equal(manual.status, 200);
        assert.match((await manual.json()).message || '', /Heures réelles/);
    });
});

test('Pointage sans OTP : la carte code et le pointage par code répondent 404, le reste du Pointage passe', async () => {
    await withFlags({ time: 'true', otp: 'false' }, async () => {
        const [code, parCode, pointage, manual] = await Promise.all([
            req('/api/etablissements/bar1/code-cloture', PATRON),
            req('/api/shifts/' + SHIFT_ID + '/cloturer-par-code', PATRON, {
                method: 'POST',
                body: JSON.stringify({ code: '1234', phase: 'debut' }),
            }),
            req('/api/pointage/2026-09-15?establishment_id=bar1', PATRON),
            req('/api/shifts/' + SHIFT_ID + '/pointage', PATRON, {
                method: 'PATCH',
                body: JSON.stringify({ real_start: 18, real_end: 23 }),
            }),
        ]);
        assert.equal(code.status, 404, 'code OTP derrière otp_closure');
        assert.equal(parCode.status, 404, 'pointer par code derrière otp_closure');
        assert.equal(pointage.status, 200, 'la page Pointage reste sous time_tracking seul');
        assert.equal(manual.status, 200, 'la saisie manuelle ne dépend pas du code OTP');
    });
});

test('OTP sans Pointage : FEATURE_OTP_CLOSURE=force ne rallume pas le module parent', async () => {
    await withFlags({ time: 'false', perf: 'false', otp: 'force' }, async () => {
        const code = await req('/api/etablissements/bar1/code-cloture', PATRON);
        assert.equal(code.status, 404);
    });
});
