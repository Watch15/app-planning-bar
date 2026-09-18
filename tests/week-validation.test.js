'use strict';
// D-100 — validation hebdomadaire (signature via code staff)

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const PATRON = { _id: 'p1', role: 'patron', name: 'Patron' };
const STAFF_USER = { _id: 'u1', role: 'staff', name: 'Ada', staff_id: null };

let db;
let staffId;

function currentWeekDates() {
    const monday = new Date();
    monday.setHours(12, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const dateStr = d => d.getFullYear() + '-'
        + String(d.getMonth() + 1).padStart(2, '0') + '-'
        + String(d.getDate()).padStart(2, '0');
    const plus = days => {
        const d = new Date(monday);
        d.setDate(d.getDate() + days);
        return dateStr(d);
    };
    return { weekStart: dateStr(monday), plus };
}

before(async () => {
    process.env.FEATURE_WEEKLY_VALIDATION = 'force';
    await startApp();
});
after(() => {
    delete process.env.FEATURE_WEEKLY_VALIDATION;
    stopApp();
});

beforeEach(() => {
    db = makeDb();
    app.locals.setTestDb(db);
    staffId = new ObjectId();
    STAFF_USER.staff_id = String(staffId);
});

test('validation/week : 404 si feature off', async () => {
    const prev = process.env.FEATURE_WEEKLY_VALIDATION;
    process.env.FEATURE_WEEKLY_VALIDATION = 'false';
    try {
        const res = await req('/api/validation/week?week_start=2026-09-01', PATRON);
        assert.equal(res.status, 404);
    } finally {
        process.env.FEATURE_WEEKLY_VALIDATION = prev;
    }
});

test('sign + garde valider-recap', async () => {
    const { weekStart, plus } = currentWeekDates();
    await db.collection('shifts').insertMany([
        {
            _id: new ObjectId(),
            establishment_id: 'bar1',
            date: plus(1),
            staff_id: String(staffId),
            staff_name: 'Ada',
            start_time: 18, end_time: 22,
            heure_validee_finale: '22:00',
            debut_valide_finale: '18:00',
        },
        {
            _id: new ObjectId(),
            establishment_id: 'bar2',
            date: plus(2),
            staff_id: String(staffId),
            staff_name: 'Ada',
            start_time: 18, end_time: 22,
            heure_validee_finale: '22:00',
            debut_valide_finale: '18:00',
        },
    ]);
    await db.collection('staff').insertOne({ _id: staffId, name: 'Ada', venues: ['bar1', 'bar2'] });

    // Code staff
    const codeRes = await req('/api/me/week-sign-code?week_start=' + weekStart, STAFF_USER);
    assert.equal(codeRes.status, 200, await codeRes.clone().text());
    const codeData = await codeRes.json();
    assert.ok(codeData.code);
    assert.equal(codeData.signed, false);

    // Recap bloqué sans signature
    const blocked = await req('/api/etablissements/bar1/valider-recap', PATRON, {
        method: 'POST',
        body: JSON.stringify({ week_start: weekStart }),
    });
    assert.equal(blocked.status, 409);

    // Signature multi-affaires
    const sign = await req('/api/validation/sign', PATRON, {
        method: 'POST',
        body: JSON.stringify({
            staff_id: String(staffId),
            week_start: weekStart,
            code: codeData.code,
        }),
    });
    assert.equal(sign.status, 200, await sign.clone().text());
    const signed = await sign.json();
    assert.ok(signed.establishment_ids.includes('bar1'));
    assert.ok(signed.establishment_ids.includes('bar2'));

    const week = await req('/api/validation/week?week_start=' + weekStart, PATRON);
    assert.equal(week.status, 200);
    const weekData = await week.json();
    assert.equal(weekData.staff[0].signed, true);

    const ok = await req('/api/etablissements/bar1/valider-recap', PATRON, {
        method: 'POST',
        body: JSON.stringify({ week_start: weekStart }),
    });
    assert.equal(ok.status, 200, await ok.clone().text());
});

test('reopen régénère un code', async () => {
    const { weekStart, plus } = currentWeekDates();
    await db.collection('shifts').insertOne({
        establishment_id: 'bar1',
        date: plus(1),
        staff_id: String(staffId),
        staff_name: 'Ada',
        start_time: 18, end_time: 22,
    });
    await db.collection('staff').insertOne({ _id: staffId, name: 'Ada', venues: ['bar1'] });
    const codeRes = await req('/api/me/week-sign-code?week_start=' + weekStart, STAFF_USER);
    const { code } = await codeRes.json();
    await req('/api/validation/sign', PATRON, {
        method: 'POST',
        body: JSON.stringify({ staff_id: String(staffId), week_start: weekStart, code }),
    });
    const reopen = await req('/api/validation/reopen', PATRON, {
        method: 'POST',
        body: JSON.stringify({ staff_id: String(staffId), week_start: weekStart }),
    });
    assert.equal(reopen.status, 200, await reopen.clone().text());
    const again = await req('/api/me/week-sign-code?week_start=' + weekStart, STAFF_USER);
    const againData = await again.json();
    assert.equal(againData.signed, false);
    assert.ok(againData.code);
    assert.notEqual(againData.code, code);
});

// Chez Castaniu, ce sont les responsables (staff au rôle responsable) qui tapent les
// codes — n'importe lequel, pas seulement celui des soirées où il était désigné. Un
// compte staff n'a pas d'`assigned_establishments` : l'ancien filtre rendait une page
// vide + « Aucun shift à signer ».
test('staff au rôle responsable : voit et signe tout le monde', async () => {
    const { weekStart, plus } = currentWeekDates();
    const roleId = new ObjectId();
    const respId = new ObjectId();
    const RESP_USER = { _id: 'u2', role: 'staff', name: 'Rémi', staff_id: String(respId) };
    await db.collection('roles').insertOne({ _id: roleId, type: 'responsable', name: 'Responsable' });
    await db.collection('staff').insertMany([
        { _id: staffId, name: 'Ada', venues: ['bar1'] },
        { _id: respId, name: 'Rémi', venues: ['bar1'], roles: [String(roleId)] },
    ]);
    await db.collection('shifts').insertMany([
        // Rémi responsable désigné au bar1 mardi
        { establishment_id: 'bar1', date: plus(1), staff_id: String(respId), staff_name: 'Rémi',
            start_time: 18, end_time: 23, pointage_resp: true },
        // Ada au bar1 mardi → dans le périmètre de Rémi
        { establishment_id: 'bar1', date: plus(1), staff_id: String(staffId), staff_name: 'Ada',
            start_time: 18, end_time: 22 },
        // Ada au bar2 jeudi → hors périmètre pour la liste, mais signée avec (multi-affaires)
        { establishment_id: 'bar2', date: plus(3), staff_id: String(staffId), staff_name: 'Ada',
            start_time: 18, end_time: 22 },
    ]);

    await db.collection('establishments').insertOne({ id: 'bar1', name: 'Le Bar' });
    const week = await req('/api/validation/week?week_start=' + weekStart, RESP_USER);
    assert.equal(week.status, 200, await week.clone().text());
    const weekData = await week.json();
    const names = weekData.staff.map(s => s.staff_name).sort();
    assert.deepEqual(names, ['Ada', 'Rémi']);
    // Noms d'établissements pour le regroupement de la page (bar2 sans doc → id lisible)
    assert.deepEqual(weekData.establishments.sort((x, y) => x.id.localeCompare(y.id)),
        [{ id: 'bar1', name: 'Le Bar' }, { id: 'bar2', name: 'bar2' }]);
    const me = await (await req('/api/me/week-sign-code?week_start=' + weekStart, RESP_USER)).json();
    assert.equal(me.can_validate, true);

    const { code } = await (await req('/api/me/week-sign-code?week_start=' + weekStart, STAFF_USER)).json();
    const sign = await req('/api/validation/sign', RESP_USER, {
        method: 'POST',
        body: JSON.stringify({ staff_id: String(staffId), week_start: weekStart, code }),
    });
    assert.equal(sign.status, 200, await sign.clone().text());
    assert.deepEqual((await sign.json()).establishment_ids.sort(), ['bar1', 'bar2']);
});

test('staff sans rôle responsable : 403, et pas de bouton', async () => {
    const { weekStart, plus } = currentWeekDates();
    const roleId = new ObjectId();
    const otherId = new ObjectId();
    const OTHER_USER = { _id: 'u2', role: 'staff', name: 'Léo', staff_id: String(otherId) };
    await db.collection('roles').insertOne({ _id: roleId, type: 'responsable', name: 'Responsable' });
    await db.collection('staff').insertMany([
        { _id: staffId, name: 'Ada', venues: ['bar1'] },
        { _id: otherId, name: 'Léo', venues: ['bar1'], roles: [] },
    ]);
    await db.collection('shifts').insertMany([
        // Léo est même désigné responsable ce soir-là, mais n'a pas le rôle
        { establishment_id: 'bar1', date: plus(1), staff_id: String(otherId), staff_name: 'Léo', start_time: 18, end_time: 23, pointage_resp: true },
        { establishment_id: 'bar1', date: plus(1), staff_id: String(staffId), staff_name: 'Ada', start_time: 18, end_time: 22 },
    ]);
    const week = await req('/api/validation/week?week_start=' + weekStart, OTHER_USER);
    assert.equal(week.status, 403);
    const me = await (await req('/api/me/week-sign-code?week_start=' + weekStart, OTHER_USER)).json();
    assert.equal(me.can_validate, false);
    const { code } = await (await req('/api/me/week-sign-code?week_start=' + weekStart, STAFF_USER)).json();
    const sign = await req('/api/validation/sign', OTHER_USER, {
        method: 'POST',
        body: JSON.stringify({ staff_id: String(staffId), week_start: weekStart, code }),
    });
    assert.equal(sign.status, 403);
});
