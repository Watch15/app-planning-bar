'use strict';
// Couleurs stables par nom de groupe Joker (planning + staff open-jokers).
// Hash déterministe → même groupe = même teinte partout, sans stocker en base.

(function (root) {
    const PALETTE = [
        { key: 'violet', bg: '#6C63FF', soft: '#ede9fe', stripe: '#c4b5fd', text: '#3730a3' },
        { key: 'teal',   bg: '#0d9488', soft: '#ccfbf1', stripe: '#5eead4', text: '#115e59' },
        { key: 'orange', bg: '#ea580c', soft: '#ffedd5', stripe: '#fdba74', text: '#9a3412' },
        { key: 'blue',   bg: '#2563eb', soft: '#dbeafe', stripe: '#93c5fd', text: '#1e3a8a' },
        { key: 'rose',   bg: '#db2777', soft: '#fce7f3', stripe: '#f9a8d4', text: '#9d174d' },
        { key: 'amber',  bg: '#ca8a04', soft: '#fef9c3', stripe: '#fde047', text: '#854d0e' },
        { key: 'lime',   bg: '#65a30d', soft: '#ecfccb', stripe: '#bef264', text: '#3f6212' },
        { key: 'cyan',   bg: '#0891b2', soft: '#cffafe', stripe: '#67e8f9', text: '#155e75' },
    ];

    // Groupes fréquents → index fixe (évite un hash qui change si on réordonne la palette)
    const KNOWN = {
        Bar: 0, bar: 0,
        Cuisine: 1, cuisine: 1,
        Salle: 2, salle: 2,
    };

    const FALLBACK = { key: 'neutral', bg: '#6b7280', soft: '#f3f4f6', stripe: '#d1d5db', text: '#374151' };

    function hash(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function of(group) {
        if (group == null || String(group).trim() === '' || group === '_') {
            return Object.assign({}, FALLBACK);
        }
        const name = String(group);
        if (KNOWN[name] != null) return Object.assign({}, PALETTE[KNOWN[name]]);
        return Object.assign({}, PALETTE[hash(name) % PALETTE.length]);
    }

    function stripeBackground(group) {
        const c = of(group);
        return 'repeating-linear-gradient(45deg, ' + c.bg + '55, ' + c.bg + '55 4px, ' + c.soft + ' 4px, ' + c.soft + ' 10px)';
    }

    root.JokerGroupColor = { of, stripeBackground, PALETTE, FALLBACK };
})(typeof window !== 'undefined' ? window : globalThis);
