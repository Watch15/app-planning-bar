'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    FEATURES,
    normalizeProfile,
    enabled,
    resolveAll,
} = require('../lib/client-features');

test('normalizeProfile : vide → default', () => {
    assert.equal(normalizeProfile(''), 'default');
    assert.equal(normalizeProfile(null), 'default');
    assert.equal(normalizeProfile('Castaniu'), 'castaniu');
});

test('weekly_staff_validation : off hors castaniu même si FEATURE_=true', () => {
    assert.equal(enabled('weekly_staff_validation', {
        profile: 'default',
        env: { FEATURE_WEEKLY_VALIDATION: 'true' },
    }), false);
});

test('weekly_staff_validation : on si castaniu + FEATURE_=true', () => {
    assert.equal(enabled('weekly_staff_validation', {
        profile: 'castaniu',
        env: { FEATURE_WEEKLY_VALIDATION: 'true' },
    }), true);
});

test('weekly_staff_validation : off si castaniu sans env', () => {
    assert.equal(enabled('weekly_staff_validation', {
        profile: 'castaniu',
        env: {},
    }), false);
});

test('force active hors profil', () => {
    assert.equal(enabled('predefined_slots', {
        profile: 'default',
        env: { FEATURE_PREDEFINED_SLOTS: 'force' },
    }), true);
});

test('predefined_slots : on par défaut sur castaniu sans FEATURE_*', () => {
    assert.equal(enabled('predefined_slots', {
        profile: 'castaniu',
        env: {},
    }), true);
});

test('predefined_slots : off hors profil sans force', () => {
    assert.equal(enabled('predefined_slots', {
        profile: 'default',
        env: {},
    }), false);
});

test('off explicite bat defaultOn', () => {
    assert.equal(enabled('predefined_slots', {
        profile: 'castaniu',
        env: { FEATURE_PREDEFINED_SLOTS: 'false' },
    }), false);
});

test('resolveAll expose profile + toutes les clés du catalogue', () => {
    const snap = resolveAll({
        profile: 'castaniu',
        env: { FEATURE_WEEKLY_VALIDATION: 'true' },
    });
    assert.equal(snap.profile, 'castaniu');
    for (const key of Object.keys(FEATURES)) {
        assert.equal(typeof snap.features[key], 'boolean', key);
    }
    assert.equal(snap.features.weekly_staff_validation, true);
    assert.equal(snap.features.predefined_slots, true);
});

test('clé inconnue → false', () => {
    assert.equal(enabled('does_not_exist', { profile: 'castaniu', env: {} }), false);
});
