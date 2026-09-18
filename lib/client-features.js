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
//   • `requires` : features qui doivent être actives pour que celle-ci le soit. Une
//     dépendance éteinte l'emporte sur tout, `force` compris : un sous-module ne
//     s'allume jamais sans son module parent.
//
// Ajouter une feature = une entrée dans FEATURES + brancher UI/API sur `enabled()`.

const FEATURES = {
    // Offre commerciale — options payantes au-dessus du socle Templyo Planning.
    // Fail-closed : une instance "Planning seul" ne doit exposer aucun module optionnel
    // tant que son entitlement n'est pas explicitement activé dans l'environnement.
    //
    // Arbitrage A (2026-09-16) — Formule 3 Performance inclut la saisie *manuelle*
    // des heures réelles (patron/directeur). `time_tracking` reste le module terrain
    // (OTP, tablette, comptes établissement). Voir `canWriteRealHours` /
    // `requireFeatureAny(['time_tracking','performance'])` sur PATCH …/pointage.
    time_tracking: {
        env: 'FEATURE_TIME_TRACKING',
        defaultOn: false,
        label: 'Clôture & pointage terrain (OTP, tablette)',
        tier: 'option',
    },
    // Sous-module de `time_tracking` : le code OTP à 4 chiffres qui pointe le début et
    // la fin de service (carte code du Pointage, CTA « Pointer mon arrivée » / « Clôturer »
    // côté staff, routes `code-cloture` et `cloturer-par-code`). Séparé pour pouvoir
    // livrer le Pointage sans l'OTP tant que celui-ci n'est pas assez éprouvé. La
    // clôture manuelle, l'ajustement et le journal restent sous `time_tracking`.
    // Indépendant du code SEMAINE (`weekly_staff_validation`).
    otp_closure: {
        env: 'FEATURE_OTP_CLOSURE',
        requires: ['time_tracking'],
        defaultOn: false,
        label: 'Code OTP journalier (pointer début / fin de service)',
        tier: 'option',
    },
    performance: {
        env: 'FEATURE_PERFORMANCE',
        defaultOn: false,
        label: 'Pilotage, performance, simulation + saisie manuelle des heures',
        tier: 'option',
    },
    // Fonctions additionnelles/expérimentales non promises dans le socle contractuel.
    shift_swaps: {
        env: 'FEATURE_SHIFT_SWAPS',
        defaultOn: false,
        label: 'Échanges de shifts',
        tier: 'addon',
    },
    calendar_sync: {
        env: 'FEATURE_CALENDAR_SYNC',
        defaultOn: false,
        label: 'Synchronisation agenda iCal',
        tier: 'experimental',
    },
    // D-100 — validation hebdo staff (Castaniu).
    weekly_staff_validation: {
        env: 'FEATURE_WEEKLY_VALIDATION',
        profiles: ['castaniu'],
        defaultOn: false,
        label: 'Validation hebdomadaire staff (Castaniu)',
        tier: 'custom',
    },
    // D-101 — créneaux prédéfinis / candidatures (Castaniu, coexistence dispos).
    predefined_slots: {
        env: 'FEATURE_PREDEFINED_SLOTS',
        profiles: ['castaniu'],
        defaultOn: true,
        label: 'Créneaux prédéfinis N+1 (candidatures type Joker)',
        tier: 'custom',
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
    const requires = Array.isArray(def.requires) ? def.requires : [];
    if (requires.some(dep => !enabled(dep, { profile, env: opts && opts.env }))) return false;
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

/**
 * True si au moins une des clés est active.
 * @param {string[]} featureKeys
 * @param {{ profile?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
function enabledAny(featureKeys, opts) {
    if (!Array.isArray(featureKeys) || featureKeys.length === 0) return false;
    return featureKeys.some(k => enabled(k, opts));
}

/**
 * Écriture des heures réelles (PATCH …/pointage) : Formule 2 (terrain) **ou**
 * Formule 3 (saisie manuelle patron pour alimenter les KPI Performance).
 */
function canWriteRealHours(opts) {
    return enabledAny(['time_tracking', 'performance'], opts);
}

/** Middleware : 404 si aucune des features listées n'est active. */
function requireFeatureAny(featureKeys) {
    const keys = Array.isArray(featureKeys) ? featureKeys : [featureKeys];
    return function requireFeatureAnyMw(req, res, next) {
        if (!enabledAny(keys)) {
            return res.status(404).json({ error: 'Fonctionnalité non disponible sur cette instance' });
        }
        next();
    };
}

module.exports = {
    FEATURES,
    normalizeProfile,
    enabled,
    enabledAny,
    canWriteRealHours,
    resolveAll,
    requireFeature,
    requireFeatureAny,
};
