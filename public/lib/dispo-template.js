// Projection de la semaine-type sur une semaine réelle — logique partagée
// navigateur (front staff + front patron) / Node (serveur + tests).
//
// Source UNIQUE de `buildTemplateDispos` : `lib/utils.js` la ré-exporte (serveur), et les
// deux pages qui affichent un prévisionnel de semaine-type (`planning.js` côté staff,
// `script.js` côté directeur) l'appellent au lieu de rejouer la règle.
//
// ⚠️ Pourquoi ce module existe (2026-08-24) : la même règle vivait en TROIS exemplaires —
// le helper pur, plus une copie inline dans chaque front — et elle avait déjà divergé.
// Le serveur sautait les congés et les absences déclarées, `script.js` ne sautait rien :
// la directrice voyait donc en « 🕓 prévu » des jours que la matérialisation allait
// écarter. Une règle de gestion recopiée dans un fichier sans test finit toujours par
// mentir à quelqu'un.
//
// Chargé dans le navigateur via <script src="/lib/dispo-template.js"> (expose
// `window.DispoTemplate`), et `require()`-able côté Node.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./week.js'));   // Node / CommonJS
    } else {
        root.DispoTemplate = factory(root.Week);          // Navigateur → window.DispoTemplate
    }
})(typeof self !== 'undefined' ? self : this, function (Week) {
    'use strict';

    const toDateStr = Week.toDateStr;

    // Matérialise la semaine-type (E-22 v2) sur une semaine : pour chaque jour de
    // [weekStart .. +6] qui a une entrée horaire dans le modèle ET n'est pas déjà pris
    // (`takenDates` = jours ayant déjà une dispo, quelle qu'en soit l'origine, + jours de
    // congé ou d'absence déclarée), renvoie { date, type, start_time, end_time }.
    //
    // CRÉATION SEULE : le modèle comble les trous, il ne remplace jamais l'existant.
    // C'est toute la sémantique du mécanisme — « ce qui part à ma place si je n'ai rien
    // envoyé moi-même ».
    //
    // `template.days` est keyé lundi=0 … dimanche=6 ; `weekStart` doit être un lundi
    // ('YYYY-MM-DD'). Midi local → insensible au DST.
    //
    // `restDays` suit la convention `getDay()` (0 = dimanche), comme `staff.rest_days` et
    // comme le formulaire du staff. La conversion des deux index se fait ICI, une fois :
    // c'est la seule ligne du projet où les deux conventions se croisent, et la recopier
    // ailleurs serait rouvrir la porte à une erreur d'un jour, muette et hebdomadaire.
    function buildTemplateDispos(template, weekStart, takenDates, restDays) {
        const taken = takenDates instanceof Set ? takenDates : new Set(takenDates || []);
        const rest  = Array.isArray(restDays) ? restDays : [];
        const days  = (template && template.days) || {};
        const base  = new Date(weekStart + 'T12:00:00');
        const out = [];
        for (let i = 0; i < 7; i++) {
            const d    = new Date(base.getTime() + i * 864e5);
            const date = toDateStr(d);
            if (taken.has(date)) continue;
            if (rest.includes(d.getDay())) continue;
            const cell = days[i];
            if (!cell || cell.start_time == null || cell.end_time == null) continue;
            out.push({ date, type: cell.type || 'custom', start_time: cell.start_time, end_time: cell.end_time });
        }
        return out;
    }

    return { buildTemplateDispos };
});
