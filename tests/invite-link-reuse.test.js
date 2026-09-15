'use strict';

// Régression : une personne reçoit un lien SMS, active son compte, puis rouvre
// le même lien en croyant que c'est la connexion. Avant : 404 opaque + pas de
// session → impression de « ne plus pouvoir se connecter ».

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { hashToken } = require('../lib/utils');
const { makeDb } = require('./helpers/fake-db');
const { app, startApp, stopApp, req } = require('./helpers/harness');

const USER_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const token = 'invite-sms-token-secret-001';

let db;

before(startApp);
after(stopApp);

beforeEach(() => {
    db = makeDb({
        users: [{
            _id: new ObjectId(USER_ID),
            phone: '+33612345678',
            role: 'staff',
            name: 'Alice',
            active: false,
            password_hash: null,
            invite_token: hashToken(token),
            invite_expires: new Date(Date.now() + 60 * 60 * 1000),
        }],
    });
    app.locals.setTestDb(db);
});

test('activation SMS : crée le mot de passe, connecte, et login téléphone marche ensuite', async () => {
    const activate = await req('/auth/set-password', null, {
        method: 'POST',
        body: JSON.stringify({ token, password: 'MotDePasseAlice1' }),
    });
    assert.equal(activate.status, 200);
    const body = await activate.json();
    assert.equal(body.user.role, 'staff');
    assert.equal(body.user.phone, '+33612345678');

    const user = db.collection('users')._docs[0];
    assert.ok(user.password_hash);
    assert.equal(user.active, true);
    // Le hash du token d'invite est conservé pour reconnaître une réouverture du SMS.
    assert.equal(user.invite_token, hashToken(token));

    const login = await req('/auth/login', null, {
        method: 'POST',
        body: JSON.stringify({ phone: '0612345678', password: 'MotDePasseAlice1' }),
    });
    assert.equal(login.status, 200);
});

test('réouverture du lien SMS : 409 clair already_activated (pas un 404 opaque)', async () => {
    await req('/auth/set-password', null, {
        method: 'POST',
        body: JSON.stringify({ token, password: 'MotDePasseAlice1' }),
    });

    const reuse = await req('/auth/set-password', null, {
        method: 'POST',
        body: JSON.stringify({ token, password: 'AutreMotDePasse99' }),
    });
    assert.equal(reuse.status, 409);
    const body = await reuse.json();
    assert.equal(body.code, 'already_activated');
    assert.equal(body.login_hint, 'phone');

    // Le mot de passe d'origine n'a PAS été écrasé.
    const login = await req('/auth/login', null, {
        method: 'POST',
        body: JSON.stringify({ phone: '+33612345678', password: 'MotDePasseAlice1' }),
    });
    assert.equal(login.status, 200);
});

test('GET /auth/password-link annonce already_activated après usage', async () => {
    let preview = await req('/auth/password-link?token=' + token, null);
    assert.equal(preview.status, 200);
    assert.equal((await preview.json()).status, 'ok');

    await req('/auth/set-password', null, {
        method: 'POST',
        body: JSON.stringify({ token, password: 'MotDePasseAlice1' }),
    });

    preview = await req('/auth/password-link?token=' + token, null);
    const data = await preview.json();
    assert.equal(data.status, 'already_activated');
    assert.equal(data.login_hint, 'phone');
});
