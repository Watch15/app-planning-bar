'use strict';

// Régressions des deux P0 relevés lors de l'audit du 2026-09-15 :
// 1. aucun rôle administratif délégué ne peut prendre le contrôle d'un compte ;
// 2. forgot-password ne divulgue jamais son token dans la réponse publique.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { hashToken } = require('../lib/utils');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const PATRON = { _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role: 'patron', name: 'Patron' };
const DIRECTEUR = {
    _id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    role: 'directeur',
    name: 'Direction',
    assigned_establishments: ['bar1'],
};
const OBSERVATEUR = { _id: 'cccccccccccccccccccccccc', role: 'observateur', name: 'Comptabilité' };

const TARGET_ID = '111111111111111111111111';
const STAFF_ID = '222222222222222222222222';
const ESTAB_ID = '333333333333333333333333';
const ROLE_ID = '444444444444444444444444';

let db;

before(startApp);
after(stopApp);

beforeEach(() => {
    db = makeDb({
        users: [{
            _id: new ObjectId(TARGET_ID),
            email: 'cible@example.com',
            phone: '+33600000000',
            role: 'staff',
            active: true,
            password_hash: 'ancien-hash',
        }],
        staff: [{ _id: new ObjectId(STAFF_ID), name: 'Cible' }],
        establishments: [{ _id: new ObjectId(ESTAB_ID), id: 'bar1', name: 'Bar 1' }],
        roles: [{ _id: new ObjectId(ROLE_ID), name: 'Responsable', type: 'responsable' }],
    });
    app.locals.setTestDb(db);
});

test('P0 : directeur et observateur ne peuvent pas prendre le contrôle d’un compte', async () => {
    const protectedCalls = [
        ['/api/users/' + TARGET_ID + '/reset-password', 'PATCH', { password: 'NouveauMotDePasse123!' }],
        ['/api/users/' + TARGET_ID + '/invite-link', 'POST', {}],
        ['/api/users/' + TARGET_ID, 'DELETE', undefined],
        ['/api/users/' + TARGET_ID + '/establishments', 'PATCH', { assigned_establishments: ['bar1'] }],
    ];

    for (const actor of [DIRECTEUR, OBSERVATEUR]) {
        for (const [path, method, body] of protectedCalls) {
            const res = await req(path, actor, {
                method,
                ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
            });
            assert.equal(res.status, 403, actor.role + ' ne doit pas pouvoir appeler ' + method + ' ' + path);
        }
    }

    const target = db.collection('users')._docs.find(u => String(u._id) === TARGET_ID);
    assert.equal(target.password_hash, 'ancien-hash');
});

test('P0 : les suppressions irréversibles sont réservées au patron', async () => {
    const destructiveCalls = [
        ['/api/staff/' + STAFF_ID, 'DELETE'],
        ['/api/establishments/' + ESTAB_ID, 'DELETE'],
        ['/api/roles/' + ROLE_ID, 'DELETE'],
    ];

    for (const [path, method] of destructiveCalls) {
        const res = await req(path, OBSERVATEUR, { method });
        assert.equal(res.status, 403, 'l’observateur ne doit pas pouvoir appeler ' + method + ' ' + path);
    }
});

test('P0 : le patron conserve le reset administratif légitime', async () => {
    const res = await req('/api/users/' + TARGET_ID + '/reset-password', PATRON, {
        method: 'PATCH',
        body: JSON.stringify({ password: 'NouveauMotDePasse123!' }),
    });
    assert.equal(res.status, 200);

    const target = db.collection('users')._docs.find(u => String(u._id) === TARGET_ID);
    assert.notEqual(target.password_hash, 'ancien-hash');
});

test('P0 : forgot-password ne divulgue jamais le lien email ou SMS', async () => {
    const emailRes = await req('/auth/forgot-password', null, {
        method: 'POST',
        body: JSON.stringify({ email: 'cible@example.com' }),
    });
    assert.equal(emailRes.status, 200);
    const emailBody = await emailRes.json();
    assert.equal(emailBody.link, undefined);
    assert.equal(emailBody.manual, undefined);

    const smsRes = await req('/auth/forgot-password', null, {
        method: 'POST',
        body: JSON.stringify({ phone: '+33600000000' }),
    });
    assert.equal(smsRes.status, 200);
    const smsBody = await smsRes.json();
    assert.equal(smsBody.link, undefined);
    assert.equal(smsBody.manual, undefined);

    const target = db.collection('users')._docs.find(u => String(u._id) === TARGET_ID);
    assert.match(target.reset_token, /^[a-f0-9]{64}$/);
});

test('sécurité : un reset public réussi révoque les sessions existantes', async () => {
    const token = 'token-reset-secret';
    const target = db.collection('users')._docs.find(u => String(u._id) === TARGET_ID);
    target.reset_token = hashToken(token);
    target.reset_expires = new Date(Date.now() + 60_000);
    db.collection('sessions')._docs.push({
        sid: 'session-cible',
        session: { user: { _id: TARGET_ID, role: 'staff' } },
    });

    const res = await req('/auth/reset-password', null, {
        method: 'PATCH',
        body: JSON.stringify({ token, password: 'MotDePasseRenouvele123!' }),
    });
    assert.equal(res.status, 200);
    assert.equal(db.collection('sessions')._docs.length, 0);
});
