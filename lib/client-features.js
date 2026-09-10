'use strict';
// ── Feature flags par profil client ───────────────────────────────────────────
//
// Source UNIQUE : catalogue FEATURES + résolution via CLIENT_PROFILE / FEATURE_*.
// Le serveur l'expose dans `/auth/me` (et login) ; le front lit via
// `public/lib/client-features.js` (`ClientFeatures.enabled('…')`).
//
// Règles :
//   • `profiles` : liste des CLIENT_PROFILE autorisés (ex. ['castaniu']).
//     Vide / omis = tous les profils (feature produit générique, gateable par env).
//   • `env` : nom de variable FEATURE_* ; vaut `true` pour activer, absent = `defaultOn`.
//   • Castaniu-only : profil castaniu ET env true (sauf defaultOn).
//   • `force` (FEATURE_*=force) : active même hors profil — réservé à la recette locale.
//
// Ajouter une feature = une entrée dans FEATURES + brancher UI/API sur `enabled()`.

const FEATURES = {
    // D-100 — validation hebdo staff (Castaniu).
    weekly_staff_validation: {
        env: 'FEATURE_WEEKLY_VALIDATION',
        profiles: ['castaniu'],
        defaultOn: false,
        label: 'Validation hebdomadaire staff (Castaniu)',
    },
    // D-101 — créneaux prédéfinis / candidatures (Castaniu, coexistence dispos).
    predefined_slots: {
        env: 'FEATURE_PREDEFINED_SLOTS',
        profiles: ['castaniu'],
        defaultOn: false,
        label: 'Créneaux prédéfinis N+1 (candidatures type Joker)',
    },
};

function normalizeProfile(raw) {
    const p = String(raw == null ? 'default' : raw).trim().toLowerCase();
    return p || 'default';
}

function envTriState(name, env) {
    const src = env || process.env;
    const v = src[name];
    if (v == null || String(v).trim() === '') return null;
    const s = String(v).trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return 'on';
    if (s === 'force') return 'force';
    if (s === 'false' || s === '0' || s === 'no' || s === 'off') return 'off';
    return null;
}

/**
 * @param {string} featureKey
 * @param {{ profile?: string, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {boolean}
 */
function enabled(featureKey, opts) {
    const def = FEATURES[featureKey];
    if (!def) return false;
    const profile = normalizeProfile(opts && opts.profile != null ? opts.profile : process.env.CLIENT_PROFILE);
    const tri = envTriState(def.env, opts && opts.env);
    if (tri === 'force') return true;
    if (tri === 'off') return false;
    const profiles = Array.isArray(def.profiles) ? def.profiles : [];
    if (profiles.length && !profiles.includes(profile)) return false;
    if (tri === 'on') return true;
    return !!def.defaultOn;
}

/**
 * Snapshot pour /auth/me et le front.
 * @param {{ profile?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
function resolveAll(opts) {
    const profile = normalizeProfile(opts && opts.profile != null ? opts.profile : process.env.CLIENT_PROFILE);
    const features = {};
    Object.keys(FEATURES).forEach(key => {
        features[key] = enabled(key, { profile, env: opts && opts.env });
    });
    return { profile, features };
}

/** Middleware Express : 404 si la feature est off (comme une route absente). */
function requireFeature(featureKey) {
    return function requireFeatureMw(req, res, next) {
        if (!enabled(featureKey)) {
            return res.status(404).json({ error: 'Fonctionnalité non disponible sur cette instance' });
        }
        next();
    };
}

module.exports = {
    FEATURES,
    normalizeProfile,
    enabled,
    resolveAll,
    requireFeature,
};
