'use strict';
// `ClientFeatures.applyDom` — la gate DOM côté front (`public/lib/client-features.js`).
//
// Pourquoi une suite dédiée : cette fonction a ouvert toute seule deux modales du patron
// (« Saisir un CA », « Échanges de shifts à valider ») et l'écran d'échange du planning
// staff, parce qu'elle posait `display: ''` sur les nœuds dont le flag était ACTIF —
// effaçant le `display:none` inline qui les tenait fermés. Le défaut ne se voyait que
// sur une instance où les modules sont allumés, donc ni en CI ni sur dev.
//
// Pas de jsdom : un faux DOM de quinze lignes suffit à décrire le contrat, et le module
// est UMD (il s'exporte en CommonJS quand `module.exports` existe).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const ClientFeatures = require('../public/lib/client-features');

/** Élément minimal : ce que `applyDom` touche, et rien d'autre. */
function fakeEl(feature, inlineDisplay) {
    return {
        attrs: { 'data-feature': feature },
        style: { display: inlineDisplay === undefined ? '' : inlineDisplay },
        hidden: false,
        getAttribute(name) { return this.attrs[name]; },
        setAttribute(name, value) { this.attrs[name] = value; },
    };
}

function fakeRoot(els) {
    return { querySelectorAll() { return els; } };
}

test('flag actif : une modale fermée le reste (display inline intact)', () => {
    ClientFeatures.apply({ profile: 'default', features: { performance: true, shift_swaps: true } });
    const revenue = fakeEl('performance', 'none');
    const swaps = fakeEl('shift_swaps', 'none');
    ClientFeatures.applyDom(fakeRoot([revenue, swaps]));

    assert.equal(revenue.style.display, 'none', 'la modale CA s\'ouvrirait au chargement');
    assert.equal(swaps.style.display, 'none', 'la modale Échanges s\'ouvrirait au chargement');
    assert.equal(revenue.hidden, false);
    assert.equal(revenue.attrs['aria-hidden'], 'false');
});

test('flag actif : un élément visible par défaut n\'est pas touché', () => {
    ClientFeatures.apply({ profile: 'default', features: { shift_swaps: true } });
    const bouton = fakeEl('shift_swaps');
    ClientFeatures.applyDom(fakeRoot([bouton]));

    assert.equal(bouton.style.display, '');
    assert.equal(bouton.hidden, false);
});

test('flag off : masquage effectif, même contre une règle de classe', () => {
    ClientFeatures.apply({ profile: 'default', features: { performance: false, shift_swaps: false } });
    // `.modal-overlay` pose `display:flex` : l'attribut `hidden` seul ne l'emporte pas,
    // il faut le style inline. C'est le seul cas où `applyDom` écrit `display`.
    const modale = fakeEl('performance', '');
    const bouton = fakeEl('shift_swaps');
    ClientFeatures.applyDom(fakeRoot([modale, bouton]));

    assert.equal(modale.style.display, 'none');
    assert.equal(modale.hidden, true);
    assert.equal(modale.attrs['aria-hidden'], 'true');
    assert.equal(bouton.style.display, 'none');
    assert.equal(bouton.hidden, true);
});

test('feature inconnue : traitée comme off', () => {
    ClientFeatures.apply({ profile: 'default', features: {} });
    const el = fakeEl('feature_qui_nexiste_pas');
    ClientFeatures.applyDom(fakeRoot([el]));

    assert.equal(el.hidden, true);
    assert.equal(el.style.display, 'none');
});
