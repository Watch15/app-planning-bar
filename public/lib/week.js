// Lundi de la semaine — logique partagée navigateur (front) / Node (serveur + tests).
// Source UNIQUE de `weekStart` : `lib/utils.js` la ré-exporte (serveur), et les pages
// front (`planning.html`, `performance.html`, `script.js`) y délèguent leur `getMondayOf`.
// Chargé dans le navigateur via <script src="/lib/week.js"> (expose `window.Week`),
// et `require()`-able côté Node.
//
// Convention : semaine du lundi au dimanche. Dimanche → recule de 6 jours.
// Retourne une **Date locale à minuit** (00:00:00.000) et n'altère JAMAIS l'argument.
// La normalisation à minuit évite toute dérive d'heure (ex. DST) lors des `±N jours`.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();          // Node / CommonJS (serveur, tests)
    } else {
        root.Week = factory();               // Navigateur → window.Week
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function weekStart(date) {
        const d   = new Date(date);          // copie défensive : n'altère pas l'argument
        const day = d.getDay();              // 0 = dimanche … 6 = samedi
        d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
        d.setHours(0, 0, 0, 0);
        return d;
    }

    // Heure de bascule de la semaine « opérationnelle ». La plupart des fermetures
    // se terminent vers 2h : avant cette heure le lundi, on est encore sur la soirée
    // (donc la semaine) précédente. Constante unique → ajustable simplement plus tard
    // (ou branchable sur un réglage en passant `cutoffHour`).
    const WEEK_CUTOFF_HOUR = 6;

    // Lundi de la semaine « en cours » à l'instant `now`, en tenant compte du cutoff :
    // avant `cutoffHour` (défaut 6h), on rattache l'instant à la veille avant de
    // calculer le lundi. Ne change la semaine QUE dans la fenêtre lundi 00:00–cutoff.
    // À n'utiliser que pour « quelle semaine est-on MAINTENANT » — pas pour mapper une
    // date calendaire à sa semaine (utiliser `weekStart` pour ça).
    function currentWeekStart(now, cutoffHour) {
        const cutoff = (cutoffHour == null) ? WEEK_CUTOFF_HOUR : cutoffHour;
        const d = (now == null) ? new Date() : new Date(now);
        if (d.getHours() < cutoff) d.setDate(d.getDate() - 1);
        return weekStart(d);
    }

    // Formate une Date en "YYYY-MM-DD" en heure LOCALE.
    // NE JAMAIS utiliser toISOString() — il convertit en UTC et peut décaler d'un jour
    // (convention architecture.md §3.1). `lib/utils.js` ré-exporte celle-ci.
    function toDateStr(date) {
        const pad = n => String(n).padStart(2, '0');
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    // Le lundi de la semaine ciblée pour la saisie des disponibilités : toujours la
    // semaine suivante (now + 7 jours, recalé au lundi). Un lundi → le lundi de N+1.
    // C'est la semaine « en cours de collecte » — celle que la deadline protège (B2 §3
    // règle A), et le point de départ de tout horizon multi-semaines.
    function disposWeekStart(now) {
        const d7 = new Date(now);
        d7.setDate(d7.getDate() + 7);
        return weekStart(d7);
    }

    // B2 — garde-fou de l'horizon réglable par le patron. 12 semaines = un trimestre :
    // au-delà, on fait entrer dans la file des dispos qui auront changé avant d'être
    // utilisées. Borne HAUTE seulement ; 1 = comportement d'avant B2.
    const DISPO_HORIZON_MAX = 12;

    function clampHorizonWeeks(weeks) {
        const n = parseInt(weeks, 10);
        if (!Number.isFinite(n) || n < 1) return 1;      // absent, 0, négatif, NaN → 1
        return Math.min(n, DISPO_HORIZON_MAX);
    }

    // B2 — la plage de dates couverte par un horizon de `weeks` semaines, en chaînes
    // "YYYY-MM-DD" (le format stocké dans `availabilities.date`).
    //
    // ⚠️ C'est la fonction qui tient l'alignement pastille/file. S-04 avait déjà corrigé
    // cette asymétrie à la main sur l'axe du périmètre ; elle est revenue sur l'axe du
    // temps (`/api/dispos/count` sans borne alors que la file en a une). Faire dériver
    // la file, la pastille ET la borne de saisie du MÊME calcul supprime la cause.
    //
    // ⚠️ Mais l'alignement n'est PAS garanti par le serveur, contrairement à ce que
    // ce commentaire a d'abord affirmé : `GET /api/dispos/count` dérive sa plage
    // côté serveur, tandis que `GET /api/dispos/pending` accepte encore le `from`/`to`
    // du client. Les deux coïncident parce que les deux côtés appellent CETTE fonction,
    // donc via une horloge locale — un appareil déréglé, autour de la bascule
    // dimanche→lundi, peut demander une autre plage. Le vrai verrou serait que
    // `pending` écrête sa plage sur `dispoHorizons(settings).y` comme `count` le fait.
    //
    // « n semaines consécutives à partir du lundi `start` », les deux formes dont on a
    // besoin partout : la plage [lundi .. dimanche de la n-ième] et la liste des lundis.
    // Extraites parce que DEUX horizons s'en servent maintenant (dispos et planning) et
    // qu'ils ne se distinguent QUE par leur point de départ — c'est ce point de départ,
    // et rien d'autre, qui doit rester lisible sur chaque call site.
    function rangeFrom(start, n) {
        const end = new Date(start);
        end.setDate(start.getDate() + n * 7 - 1);        // dimanche de la n-ième semaine
        return { from: toDateStr(start), to: toDateStr(end) };
    }

    function mondaysFrom(start, n) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i * 7);
            out.push(toDateStr(d));
        }
        return out;
    }

    // weeks=1 → exactement la semaine N+1, soit le comportement d'avant B2.
    function disposHorizonRange(now, weeks) {
        return rangeFrom(disposWeekStart(now), clampHorizonWeeks(weeks));
    }

    // Les lundis des `weeks` semaines de l'horizon, dans l'ordre. Le front en a besoin
    // pour construire sa navigation et ses notes de semaine (une par semaine, cf. B2 §4).
    function disposHorizonMondays(now, weeks) {
        return mondaysFrom(disposWeekStart(now), clampHorizonWeeks(weeks));
    }

    // ── Horizon de CONSULTATION du planning (≠ horizon de saisie des dispos) ──────
    //
    // Le lundi de la première semaine qu'un staff peut consulter EN PLUS de celle qu'il
    // a sous les yeux. Calé sur `currentWeekStart` — donc sur le cutoff — et NON sur
    // `disposWeekStart`.
    //
    // ⚠️ C'est la correction du bug « planning invisible la nuit » (signalé le 2026-08-17).
    // `disposWeekStart` = weekStart(now + 7j) ignore le cutoff. Le lundi entre 00:00 et
    // 06:00, la vue principale du staff montre encore la semaine écoulée (cutoff), pendant
    // que la liste des semaines à venir démarrait déjà à lundi+7 : la semaine qui VENAIT DE
    // COMMENCER n'était alors dans AUCUNE DES DEUX, et devenait inatteignable pendant six
    // heures — l'onglet « À venir » ne navigue que dans cette liste, et l'historique ne va
    // que vers le passé. Fenêtre nocturne = précisément l'heure où le staff sort de service
    // et consulte son planning.
    //
    // Ne PAS corriger en touchant `disposWeekStart` : il pilote aussi le cycle de collecte
    // des dispos et les rappels (`checkDispoRappels`), qui n'ont pas la même sémantique —
    // la saisie se raisonne en semaines calendaires, la consultation en soirées de travail.
    // Hors de la fenêtre lundi 00:00–06:00, les deux calculs coïncident exactement.
    function upcomingWeekStart(now, cutoffHour) {
        const d = currentWeekStart(now, cutoffHour);     // rend déjà une copie
        d.setDate(d.getDate() + 7);
        return d;
    }

    function upcomingWeekRange(now, weeks, cutoffHour) {
        return rangeFrom(upcomingWeekStart(now, cutoffHour), clampHorizonWeeks(weeks));
    }

    function upcomingWeekMondays(now, weeks, cutoffHour) {
        return mondaysFrom(upcomingWeekStart(now, cutoffHour), clampHorizonWeeks(weeks));
    }

    return {
        weekStart, currentWeekStart, WEEK_CUTOFF_HOUR, toDateStr,
        disposWeekStart, disposHorizonRange, disposHorizonMondays,
        upcomingWeekStart, upcomingWeekRange, upcomingWeekMondays,
        clampHorizonWeeks, DISPO_HORIZON_MAX,
    };
});
