'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    FEATURES,
    normalizeProfile,
    enabled,
    enabledAny,
    canWriteRealHours,
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

test('canWriteRealHours : Formule 3 (perf seule) autorise la saisie manuelle', () => {
    const opts = {
        profile: 'default',
        env: { FEATURE_PERFORMANCE: 'true', FEATURE_TIME_TRACKING: 'false' },
    };
    assert.equal(enabled('performance', opts), true);
    assert.equal(enabled('time_tracking', opts), false);
    assert.equal(canWriteRealHours(opts), true);
    assert.equal(enabledAny(['time_tracking', 'performance'], opts), true);
});

test('canWriteRealHours : Planning seul refuse', () => {
    assert.equal(canWriteRealHours({ profile: 'default', env: {} }), false);
});

test('canWriteRealHours : Formule 2 (pointage seul) autorise', () => {
    assert.equal(canWriteRealHours({
        profile: 'default',
        env: { FEATURE_TIME_TRACKING: 'true' },
    }), true);
});

// ── otp_closure : sous-module de time_tracking ───────────────────────────────

test('otp_closure : off par défaut, même avec le Pointage allumé', () => {
    assert.equal(enabled('otp_closure', {
        profile: 'castaniu',
        env: { FEATURE_TIME_TRACKING: 'true' },
    }), false);
});

test('otp_closure : on si Pointage + FEATURE_OTP_CLOSURE=true', () => {
    assert.equal(enabled('otp_closure', {
        profile: 'default',
        env: { FEATURE_TIME_TRACKING: 'true', FEATURE_OTP_CLOSURE: 'true' },
    }), true);
});

test('otp_closure : jamais sans time_tracking — même avec force', () => {
    assert.equal(enabled('otp_closure', {
        profile: 'castaniu',
        env: { FEATURE_OTP_CLOSURE: 'true' },
    }), false, 'parent absent');
    assert.equal(enabled('otp_closure', {
        profile: 'castaniu',
        env: { FEATURE_TIME_TRACKING: 'false', FEATURE_OTP_CLOSURE: 'force' },
    }), false, 'parent explicitement off');
});

test('otp_closure : indépendant du code semaine (weekly_staff_validation)', () => {
    const opts = {
        profile: 'castaniu',
        env: { FEATURE_TIME_TRACKING: 'true', FEATURE_OTP_CLOSURE: 'false', FEATURE_WEEKLY_VALIDATION: 'true' },
    };
    assert.equal(enabled('otp_closure', opts), false);
    assert.equal(enabled('weekly_staff_validation', opts), true);
    const inverse = {
        profile: 'castaniu',
        env: { FEATURE_TIME_TRACKING: 'true', FEATURE_OTP_CLOSURE: 'true', FEATURE_WEEKLY_VALIDATION: 'false' },
    };
    assert.equal(enabled('otp_closure', inverse), true);
    assert.equal(enabled('weekly_staff_validation', inverse), false);
});
