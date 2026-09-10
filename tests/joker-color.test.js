'use strict';
// Couleurs Joker : palette auto + override patron par établissement.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const JokerGroupColor = require('../public/lib/joker-group-color');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const PATRON = { _id: 'u-pat', role: 'patron', name: 'Paul' };
const DIR    = { _id: 'u-dir', role: 'directeur', name: 'Diane', assigned_establishments: ['bar1'] };
const OBS    = { _id: 'u-obs', role: 'observateur', name: 'Oscar' };

before(startApp);
after(stopApp);

beforeEach(() => {
    JokerGroupColor.setCustoms(null);
    app.locals.setTestDb(makeDb({
        establishments: [
            { id: 'bar1', name: 'Bar 1', groups: ['Bar', 'Cuisine'] },
            { id: 'bar2', name: 'Bar 2', groups: ['Salle'] },
        ],
    }));
});

test('JokerGroupColor : Bar / Cuisine / sans groupe restent stables', () => {
    assert.equal(JokerGroupColor.of('Bar').bg, '#6C63FF');
    assert.equal(JokerGroupColor.of('Cuisine').bg, '#0d9488');
    assert.equal(JokerGroupColor.of(null).bg, JokerGroupColor.FALLBACK.bg);
});

test('JokerGroupColor : setCustoms prime sur la palette auto', () => {
    JokerGroupColor.setCustoms({ Bar: '#ff00aa', _: '#111111' });
    assert.equal(JokerGroupColor.of('Bar').bg, '#ff00aa');
    assert.equal(JokerGroupColor.of(null).bg, '#111111');
    assert.equal(JokerGroupColor.of('Cuisine').bg, '#0d9488');
    JokerGroupColor.setCustoms(null);
    assert.equal(JokerGroupColor.of('Bar').bg, '#6C63FF');
});

test('joker-color : le patron pose une couleur par groupe', async () => {
    const res = await req('/api/establishments/joker-color', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ establishment_id: 'bar1', group: 'Bar', color: '#aabbcc' }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    const data = await res.json();
    assert.equal(data.joker_colors.Bar, '#aabbcc');
    const list = await (await req('/api/establishments', PATRON)).json();
    const bar1 = list.find(e => e.id === 'bar1');
    assert.equal(bar1.joker_colors.Bar, '#aabbcc');
});

test('joker-color : color null revient à la palette auto', async () => {
    await req('/api/establishments/joker-color', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ establishment_id: 'bar1', group: 'Bar', color: '#aabbcc' }),
    });
    const res = await req('/api/establishments/joker-color', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ establishment_id: 'bar1', group: 'Bar', color: null }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.joker_colors.Bar, undefined);
});

test('joker-color : hex invalide → 400', async () => {
    const res = await req('/api/establishments/joker-color', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ establishment_id: 'bar1', group: 'Bar', color: 'red' }),
    });
    assert.equal(res.status, 400);
});

test('joker-color : directeur dans son périmètre peut changer', async () => {
    const res = await req('/api/establishments/joker-color', DIR, {
        method: 'PATCH',
        body: JSON.stringify({ establishment_id: 'bar1', group: 'Cuisine', color: '#00ffaa' }),
    });
    assert.equal(res.status, 200, await res.clone().text());
    const data = await res.json();
    assert.equal(data.joker_colors.Cuisine, '#00ffaa');
});

test('joker-color : directeur hors périmètre → 403', async () => {
    const res = await req('/api/establishments/joker-color', DIR, {
        method: 'PATCH',
        body: JSON.stringify({ establishment_id: 'bar2', group: 'Salle', color: '#aabbcc' }),
    });
    assert.equal(res.status, 403);
});

test('joker-color : observateur → 403', async () => {
    const res = await req('/api/establishments/joker-color', OBS, {
        method: 'PATCH',
        body: JSON.stringify({ establishment_id: 'bar1', group: 'Bar', color: '#aabbcc' }),
    });
    assert.equal(res.status, 403);
});
