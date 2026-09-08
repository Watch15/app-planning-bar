'use strict';
// Panel vérification Pointage — count / pending / journal / observateur.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const ESTAB  = 'bar1';
const ESTAB2 = 'bar2';
const STAFF  = '0123456789abcdef0123a101';
const STAFF2 = '0123456789abcdef0123a102';
const SHIFT  = '0123456789abcdef0123c101';
const SHIFT2 = '0123456789abcdef0123c102';
const SHIFT3 = '0123456789abcdef0123c103';
const USER_S = '0123456789abcdef0123b101';
const USER_O = '0123456789abcdef0123b200';
const USER_D = '0123456789abcdef0123b201';

const PATRON = { role: 'patron', _id: '0123456789abcdef0123b000' };
const OBS    = { role: 'observateur', _id: USER_O };
const DIR    = { role: 'directeur', _id: USER_D, assigned_establishments: [ESTAB] };
const EQUIPIER = { role: 'staff', _id: USER_S, staff_id: STAFF };

before(startApp);
after(stopApp);

let db;
beforeEach(() => {
    db = seed();
    app.locals.setTestDb(db);
});

function todayStr() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function mondayOf(d = new Date()) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    const pad = n => String(n).padStart(2, '0');
    return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
}

function seed(extra = {}) {
    const today = todayStr();
    return makeDb({
        establishments: [
            { id: ESTAB, name: 'Le Bar' },
            { id: ESTAB2, name: 'Autre' },
        ],
        settings: [{ key: 'pointage', cutoff_hour: 9 }],
        users: [
            { _id: USER_S, role: 'staff', active: true, staff_id: STAFF, name: 'Alice' },
            { _id: USER_O, role: 'observateur', active: true, name: 'Obs' },
            { _id: USER_D, role: 'directeur', active: true, assigned_establishments: [ESTAB], name: 'Dir' },
        ],
        staff: [
            { _id: STAFF, name: 'Alice', venues: [ESTAB] },
            { _id: STAFF2, name: 'Bob', venues: [ESTAB2] },
        ],
        shifts: [
            {
                _id: SHIFT, staff_id: STAFF, staff_name: 'Alice',
                establishment_id: ESTAB, date: today,
                start_time: 18, end_time: 23,
            },
            {
                _id: SHIFT2, staff_id: STAFF, staff_name: 'Alice',
                establishment_id: ESTAB, date: today,
                start_time: 18, end_time: 24,
                debut_valide_code: '18:00', debut_valide_finale: '18:00', debut_source: 'code',
                heure_validee_code: '23:00', heure_validee_finale: '23:00', cloture_source: 'manuelle',
                patron_valide: false,
            },
            {
                _id: SHIFT3, staff_id: STAFF2, staff_name: 'Bob',
                establishment_id: ESTAB2, date: today,
                start_time: 19, end_time: 23,
                debut_valide_code: '19:00', debut_valide_finale: '19:00', debut_source: 'code',
                heure_validee_code: '23:00', heure_validee_finale: '23:00', cloture_source: 'code',
                patron_valide: false,
            },
        ],
        time_validations: [
            {
                etablissement_id: ESTAB,
                shift_id: SHIFT2,
                staff_id: STAFF,
                acteur_role: 'staff',
                action: 'pointer_debut',
                source: 'code',
                heure_saisie: { year: 2026, month: 9, day: 8, hour: 18, minute: 0, second: 0 },
                resultat: 'accepte',
                phase: 'debut',
            },
            {
                etablissement_id: ESTAB,
                shift_id: SHIFT2,
                staff_id: '0123456789abcdef0123b000',
                acteur_role: 'patron',
                action: 'manuel_fin',
                source: 'manuelle',
                heure_saisie: { year: 2026, month: 9, day: 8, hour: 23, minute: 5, second: 0 },
                resultat: 'accepte',
                phase: 'fin',
            },
        ],
        ...extra,
    });
}

test('GET verif/count : non_clotures + a_valider', async () => {
    const res = await req('/api/pointage/verif/count', PATRON);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.non_clotures >= 1);
    assert.ok(data.a_valider >= 2);
    assert.equal(data.total, data.non_clotures + data.a_valider);
    assert.ok(data.week_start);
});

test('GET verif/pending : sources OTP/manuel + statuts', async () => {
    const res = await req('/api/pointage/verif/pending?week_start=' + mondayOf(), PATRON);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.items));
    const closed = data.items.find(i => String(i._id) === SHIFT2);
    assert.ok(closed);
    assert.equal(closed.statut, 'a_valider');
    assert.equal(closed.debut_source, 'code');
    assert.equal(closed.debut_source_label, 'Code OTP');
    assert.equal(closed.cloture_source, 'manuelle');
    assert.equal(closed.cloture_source_label, 'Saisie manuelle');
    const open = data.items.find(i => String(i._id) === SHIFT);
    assert.ok(open);
    assert.equal(open.statut, 'non_cloture');
});

test('directeur : pending limité à ses établissements', async () => {
    const res = await req('/api/pointage/verif/pending?week_start=' + mondayOf(), DIR);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.items.every(i => i.establishment_id === ESTAB));
    assert.ok(!data.items.some(i => String(i._id) === SHIFT3));
});

test('GET verif/journal : acteur_name + source_label', async () => {
    const from = mondayOf();
    const toDate = new Date(from + 'T12:00:00');
    toDate.setDate(toDate.getDate() + 6);
    const pad = n => String(n).padStart(2, '0');
    const to = toDate.getFullYear() + '-' + pad(toDate.getMonth() + 1) + '-' + pad(toDate.getDate());

    const res = await req('/api/pointage/verif/journal?from=' + from + '&to=' + to, PATRON);
    assert.equal(res.status, 200);
    const docs = await res.json();
    assert.ok(docs.length >= 2);
    assert.ok(docs.some(d => d.source_label === 'Code OTP'));
    assert.ok(docs.some(d => d.source_label === 'Saisie manuelle'));
    assert.ok(docs.some(d => d.acteur_name === 'Alice'));
});

test('observateur : peut lire journal et valider-recap', async () => {
    const from = mondayOf();
    const j = await req('/api/pointage/verif/journal?from=' + from + '&to=' + todayStr(), OBS);
    assert.equal(j.status, 200);

    const val = await req('/api/etablissements/' + ESTAB + '/valider-recap', OBS, {
        method: 'POST',
        body: JSON.stringify({ week_start: mondayOf() }),
    });
    assert.equal(val.status, 200);
    const data = await val.json();
    assert.ok(data.modified >= 1);

    const shift = db.collection('shifts')._docs.find(s => String(s._id) === SHIFT2);
    assert.equal(shift.patron_valide, true);

    const audits = db.collection('time_validations')._docs.filter(d => d.action === 'valider_recap');
    assert.ok(audits.length >= 1);
    assert.equal(audits[0].source, 'valider_recap');
});

test('staff équipier : pas d\'accès verif', async () => {
    const res = await req('/api/pointage/verif/count', EQUIPIER);
    assert.equal(res.status, 403);
});
