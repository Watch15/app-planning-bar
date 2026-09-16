// Feature flags client — miroir front de `lib/client-features.js`.
// Alimenté par `/auth/me` ou `/auth/login` (`data.client`).
// Usage : ClientFeatures.enabled('weekly_staff_validation')
//
// Ne pas hardcoder CLIENT_PROFILE ici : seule la réponse serveur fait foi.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.ClientFeatures = factory(root);
    }
})(typeof self !== 'undefined' ? self : this, function (root) {
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

    /** True si au moins une des clés est active (ex. hours manuelles = pointage OU perf). */
    function enabledAny(featureKeys) {
        if (!Array.isArray(featureKeys) || featureKeys.length === 0) return false;
        return featureKeys.some(enabled);
    }

    /**
     * Saisie manuelle des heures réelles : Formule 2 (terrain) ou Formule 3 (Performance).
     * OTP / tablette / comptes établissement restent derrière `time_tracking` seul.
     */
    function canWriteRealHours() {
        return enabledAny(['time_tracking', 'performance']);
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

    /**
     * MASQUE les nœuds `[data-feature="clé"]` dont le flag est off. Ne RÉVÈLE rien :
     * un flag actif rend seulement l'élément éligible à être affiché par le code qui
     * le pilote (ouverture d'une modale, bouton contextuel), il ne l'affiche pas.
     *
     * La version précédente posait `el.style.display = ''` quand le flag était actif.
     * Cela effaçait le `display:none` INLINE qui tient une modale fermée — et comme
     * `.modal-overlay` vaut `display:flex`, « Saisir un CA » et « Échanges de shifts à
     * valider » s'ouvraient tout seuls au chargement, dès que `/auth/me` répondait.
     * Même effet sur la modale d'échange du planning staff, qui couvre tout l'écran.
     * Aucun nœud gaté ne dépend de cette fonction pour s'afficher : chacun a son
     * propre chemin (`openRevenueModal`, `openSwapsModal`, `refreshProposeSlotsButton`).
     */
    function applyDom(rootEl) {
        const rootNode = rootEl || (typeof document !== 'undefined' ? document : null);
        if (!rootNode || !rootNode.querySelectorAll) return;
        rootNode.querySelectorAll('[data-feature]').forEach(el => {
            const key = el.getAttribute('data-feature');
            const on = enabled(key);
            el.hidden = !on;
            el.setAttribute('aria-hidden', on ? 'false' : 'true');
            // `hidden` seul ne suffit pas : une règle de classe (`.modal-overlay`) qui
            // pose `display` l'emporte sur l'attribut. On force donc l'invisibilité —
            // mais uniquement dans ce sens-là.
            if (!on) el.style.display = 'none';
        });
    }

    return { apply, fromAuthPayload, enabled, enabledAny, canWriteRealHours, profile, snapshot, applyDom };
});
