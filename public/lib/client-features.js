// Feature flags client — miroir front de `lib/client-features.js`.
// Alimenté par `/auth/me` ou `/auth/login` (`data.client`).
// Usage : ClientFeatures.enabled('weekly_staff_validation')
//
// Ne pas hardcoder CLIENT_PROFILE ici : seule la réponse serveur fait foi.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.ClientFeatures = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    let _state = { profile: 'default', features: {} };

    function apply(payload) {
        if (!payload || typeof payload !== 'object') return _state;
        _state = {
            profile: payload.profile || 'default',
            features: Object.assign({}, payload.features || {}),
        };
        // Compat : anciennes clés plates (weekly_staff_validation au top-level)
        Object.keys(payload).forEach(k => {
            if (k === 'profile' || k === 'features') return;
            if (typeof payload[k] === 'boolean') _state.features[k] = payload[k];
        });
        try {
            root.__clientFlags = _state;
        } catch { /* ignore */ }
        return _state;
    }

    function fromAuthPayload(data) {
        if (data && data.client) return apply(data.client);
        return _state;
    }

    function enabled(featureKey) {
        return !!(_state.features && _state.features[featureKey]);
    }

    function profile() {
        return _state.profile || 'default';
    }

    function snapshot() {
        return {
            profile: _state.profile,
            features: Object.assign({}, _state.features),
        };
    }

    /** Affiche/masque des nœuds `[data-feature="clé"]` selon le flag. */
    function applyDom(rootEl) {
        const rootNode = rootEl || (typeof document !== 'undefined' ? document : null);
        if (!rootNode || !rootNode.querySelectorAll) return;
        rootNode.querySelectorAll('[data-feature]').forEach(el => {
            const key = el.getAttribute('data-feature');
            const on = enabled(key);
            el.hidden = !on;
            el.style.display = on ? '' : 'none';
            el.setAttribute('aria-hidden', on ? 'false' : 'true');
        });
    }

    return { apply, fromAuthPayload, enabled, profile, snapshot, applyDom };
});
