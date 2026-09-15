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

test('socle Planning : les modules commerciaux optionnels sont off par défaut', () => {
    const snap = resolveAll({ profile: 'default', env: {} });
    assert.equal(snap.features.time_tracking, false);
    assert.equal(snap.features.performance, false);
    assert.equal(snap.features.shift_swaps, false);
    assert.equal(snap.features.calendar_sync, false);
});

test('Pack complet : pointage et performance sont activables indépendamment', () => {
    const snap = resolveAll({
        profile: 'default',
        env: {
            FEATURE_TIME_TRACKING: 'true',
            FEATURE_PERFORMANCE: 'true',
        },
    });
    assert.equal(snap.features.time_tracking, true);
    assert.equal(snap.features.performance, true);
    assert.equal(snap.features.shift_swaps, false);
});

test('options additionnelles : false explicite force la désactivation', () => {
    assert.equal(enabled('shift_swaps', {
        profile: 'default',
        env: { FEATURE_SHIFT_SWAPS: 'false' },
    }), false);
    assert.equal(enabled('calendar_sync', {
        profile: 'default',
        env: { FEATURE_CALENDAR_SYNC: 'true' },
    }), true);
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
