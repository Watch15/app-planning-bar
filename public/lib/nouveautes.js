// ── Nouveautés — le journal des évolutions, écrit pour l'utilisateur ───────────
//
// RÈGLE D'ÉCRITURE (c'est elle qui produit la clarté, pas le mécanisme) :
//   • une entrée = UN changement VISIBLE. Un refactor ne s'annonce pas, et un rôle
//     qui ne voit rien changer n'a pas d'entrée — zéro annonce vaut mieux qu'une
//     annonce creuse ;
//   • trois champs, dans cet ordre de lecture : `titre` (ce que la personne
//     obtient), `quoi` (le SYMPTÔME et jamais la cause technique), `ou` (le chemin
//     réel, avec les libellés EXACTS affichés à l'écran) ;
//   • ni nom de champ, ni numéro de ticket, ni vocabulaire de développeur.
// La version longue reste `docs/note-client-mise-a-jour.md` ; une entrée d'ici en
// est le résumé de trois lignes. Les deux s'écrivent dans le même geste — sinon la
// liste pourrit et ment au bout de deux mois, et c'est le seul vrai risque ici.
//
// CIBLAGE PAR RÔLE et non par écran : `patron`, `directeur` et `observateur`
// partagent index.html sans y voir les mêmes boutons. Annoncer à un directeur une
// fonction réservée au patron, c'est lui promettre un bouton qu'il ne trouvera pas.
// À l'inverse le directeur n'atteint jamais planning.html : `checkAuth()` l'y
// renvoie sur `/` (planning.js), donc pas de double casquette malgré le Modèle A
// d'E-22. ⚠️ Le commentaire « seul le staff et directeur ont accès à cette page »
// dans `init()` de planning.js est trompeur — c'est `checkAuth`, en amont, qui
// tranche.
//
// `id` est stable et ne se réutilise JAMAIS : c'est la seule chose qui survive à une
// reformulation. `date` porte le « déjà lu » (tout ce qui la précède est lu) et
// masque les entrées datées dans le futur — on peut donc préparer une annonce avant
// le déploiement sans qu'elle fuite.
//
// ⚠️ Cette liste ne suit PAS les versions, et c'est délibéré : `package.json` est
// figé à 3.0.0 et le token %%BUILD_TIME%% de sw.js change à CHAQUE déploiement, y
// compris pour un correctif invisible. Ni l'un ni l'autre ne peut répondre à « cette
// personne a-t-elle déjà vu cette nouveauté ». Trois déploiements peuvent n'annoncer
// rien, et une annonce peut couvrir trois déploiements.
//
// ⚠️ Une entrée se date du JOUR DE SON DÉPLOIEMENT, jamais du passé. Le repère de
// lecture n'a que la granularité du jour : une entrée ajoutée l'après-midi avec la
// date du matin serait comptée comme déjà lue par qui a ouvert la fenêtre le matin.
// Deux livraisons annonçables le même jour ? La seconde prend la date du lendemain.
//
// Le libellé affiché est « Du neuf », plus court que « Nouveautés » dans un en-tête
// déjà serré. Le vocabulaire INTERNE (fichier, routes, `news_seen_at`) garde le mot
// du domaine : renommer une route pour suivre un libellé d'écran ferait bouger un
// contrat serveur à chaque retouche de formulation.
//
// Chargé dans le navigateur via <script src="/lib/nouveautes.js"> (expose
// `window.Nouveautes`), et `require()`-able côté Node : `filtrer` porte toutes les
// règles de ciblage et se teste sans DOM.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./week.js'));   // Node / CommonJS (tests)
    } else {
        root.Nouveautes = factory(root.Week);             // Navigateur → window.Nouveautes
    }
})(typeof self !== 'undefined' ? self : this, function (Week) {
    'use strict';

    const toDateStr = Week.toDateStr;

    const NOUVEAUTES = [
        {
            id: 'conges-lisible', date: '2026-08-28',
            roles: ['patron', 'directeur', 'observateur'],
            titre: 'Les congés se lisent maintenant en liste',
            quoi: 'Le calendrier des congés écrit « Marie, du 3 au 7 août » au lieu de cinq '
                + 'cases orange à relier du regard. Les jours très chargés n\'avalent plus les '
                + 'derniers noms en silence. Sur téléphone, seule la liste s\'affiche : plus '
                + 'besoin de faire défiler la grille de côté pour voir la fin du mois.',
            ou: 'Récap mensuel → onglet « Calendrier congés »'
        },
        {
            id: 'conge-retire-dispos', date: '2026-08-23',
            roles: ['patron', 'directeur', 'staff'],
            titre: 'Un congé validé retire les disponibilités de la période',
            quoi: 'Avant, une personne en congé restait affichée comme disponible sur les jours '
                + 'qu\'on venait pourtant de lui accorder, et il fallait qu\'elle renvoie ses '
                + 'disponibilités pour que ça se nettoie. C\'est automatique désormais. Les '
                + 'créneaux DÉJÀ placés au planning, eux, restent en place : l\'application ne '
                + 'troue jamais un planning que l\'équipe a déjà reçu, elle le signale pour que '
                + 'quelqu\'un décide qui remplace.',
            ou: 'Congés → à la validation'
        },
        {
            id: 'historique-dispos-filtres', date: '2026-08-23',
            roles: ['patron', 'directeur', 'observateur'],
            titre: 'Le journal des disponibilités se filtre',
            quoi: 'Trois filtres — Saisies, Validations, Suppressions — avec le nombre de '
                + 'mouvements de chaque type, et un regroupement par journée. De quoi répondre à '
                + 'la question qu\'on se pose vraiment devant ce journal : « qu\'est-ce qui a '
                + 'disparu, et pourquoi ? ». Le filtre par nom reste là et se combine avec eux.',
            ou: 'Disponibilités → onglet « Historique »'
        },
        {
            id: 'urgence-auto-decoche', date: '2026-08-23',
            roles: ['patron', 'directeur'],
            titre: 'L\'ouverture d\'urgence se referme seule chaque semaine',
            quoi: 'La case « Ignorer deadline (urgence) » restait cochée jusqu\'à ce qu\'on y '
                + 'repense. Une urgence ouverte un vendredi soir levait donc la deadline des '
                + 'semaines suivantes sans que rien ne le signale — et éteignait au passage les '
                + 'rappels automatiques. Elle vaut maintenant pour la semaine en cours de '
                + 'collecte, et pour elle seule.',
            ou: 'Disponibilités → Réglages → « Ignorer deadline (urgence) »'
        },
        {
            id: 'fiches-personnel-mobile', date: '2026-08-23',
            roles: ['patron', 'directeur'],
            titre: 'Fiches du personnel lisibles sur téléphone',
            quoi: 'Les fenêtres d\'ajout et de modification d\'un membre de l\'équipe débordaient '
                + 'de l\'écran en mode portrait sur certains téléphones. Corrigé.',
            ou: 'Personnel → ajouter ou modifier une fiche'
        },
        {
            id: 'semaine-bascule-9h', date: '2026-08-23',
            roles: ['patron', 'directeur', 'staff'],
            titre: 'La semaine de l\'équipe bascule à l\'heure du pointage',
            quoi: 'Le lundi matin jusqu\'à 9 h, les employés voient encore la semaine qui '
                + 's\'achève en haut de leur planning ; la semaine neuve est juste en dessous, à '
                + 'portée de défilement. Rien n\'est caché, seul l\'ordre change, et seulement '
                + 'pendant ces trois heures. Un responsable qui pointe le service du dimanche à '
                + '7 h du matin retrouve enfin la journée qu\'il est en train de pointer.',
            ou: 'Disponibilités → Réglages → « Fenêtre de saisie pointage »'
        },
        {
            id: 'planning-liste-continue', date: '2026-08-23',
            roles: ['staff'],
            titre: 'Plus besoin de changer d\'onglet pour voir la suite',
            quoi: 'L\'onglet « À venir » disparaît. La semaine en cours s\'affiche en haut, les '
                + 'semaines suivantes s\'empilent dessous, séparées par un titre de semaine : il '
                + 'suffit de faire défiler.',
            ou: 'Onglet « Mon planning »'
        },
        {
            id: 'planning-nuit-lundi', date: '2026-08-23',
            roles: ['staff'],
            titre: 'Corrigé : le planning invisible la nuit du dimanche au lundi',
            quoi: 'Entre minuit et 6 h du matin le lundi, la semaine qui venait de commencer '
                + 'était introuvable, puis réapparaissait toute seule à 6 h — pile à l\'heure où '
                + 'on sort de service et où on regarde son téléphone. C\'est réparé.',
            ou: 'Onglet « Mon planning »'
        },
    ];

    // ── Les règles de ciblage ────────────────────────────────────────────────
    // Tout ce qui décide QUI VOIT QUOI vit ici, sans DOM ni réseau : c'est la partie
    // qui se trompe en silence, donc la seule qui doit être testable sous Node.
    //   `seen` — repère de lecture (horodatage ISO) ou null si jamais ouvert
    //   `now`  — instant de référence, injectable par les tests
    // Renvoie `visibles` (du plus récent au plus ancien) et `neuves`, son préfixe non lu.
    function filtrer(liste, role, seen, now) {
        const aujourdhui = toDateStr(now || new Date());
        const visibles = liste
            .filter(n => n.roles.includes(role) && n.date <= aujourdhui)
            .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
        // Le repère porte un INSTANT, une entrée porte un JOUR : on ramène le repère à
        // son jour LOCAL. Le découper en UTC (`seen.slice(0, 10)`) décalerait d'un jour
        // entre minuit et 2 h l'été — l'anti-patron nommé par architecture.md §3.1, et
        // exactement la panne nocturne qu'une des entrées ci-dessus annonce corrigée.
        const repere = seen ? toDateStr(new Date(seen)) : '';
        return { visibles, neuves: visibles.filter(n => n.date > repere) };
    }

    // ── Mécanique d'affichage ────────────────────────────────────────────────
    // Deux points d'accroche déclaratifs, pour que les trois pages n'aient aucun code
    // spécifique à écrire :
    //   • [data-nv-open] → ouvre la fenêtre au clic ;
    //   • [data-nv-dot]  → reçoit la pastille tant qu'il reste du non-lu.
    const API = '/api/nouveautes/vues';
    const LS  = 'templyo_news_seen_at';   // miroir local, cf. `charger()`

    let _role     = null;
    let _seen     = null;    // horodatage ISO, ou null = jamais ouvert
    let _connu    = false;   // a-t-on RÉUSSI à établir l'état de lecture ?
    let _visibles = [];
    let _neuves   = [];
    let _dots     = [];      // éléments à pastiller, résolus une fois : ils sont statiques
    let _compte   = -1;      // dernier nombre écrit dans la pastille
    let _overflow = null;    // valeur de `body.overflow` avant ouverture

    const esc = s => String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    // Tant qu'on n'a pas pu lire le repère, rien n'est déclaré neuf : une annonce ratée
    // coûte moins cher qu'une pastille qui reparaît à chaque démarrage parce que le
    // réseau a mal répondu.
    function recalculer() {
        const r = filtrer(NOUVEAUTES, _role, _seen, new Date());
        _visibles = r.visibles;
        _neuves   = _connu ? r.neuves : [];
    }

    function dateFr(ds) {
        return new Date(ds + 'T12:00:00').toLocaleDateString('fr-FR',
            { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function majPastille() {
        const n = _neuves.length;
        if (n === _compte) return;     // `data-nv-count` alimente un `content: attr()`
        _compte = n;
        _dots.forEach(el => {
            el.classList.toggle('nv-dot-on', n > 0);
            el.setAttribute('data-nv-count', n > 9 ? '9+' : String(n));
        });
    }

    async function charger() {
        // Le miroir local n'est PAS la source de vérité : il ne sert qu'à éviter que la
        // fenêtre se rouvre au rechargement suivant quand le POST n'est pas passé
        // (hors ligne). On garde le repère le plus récent des deux.
        const local = (() => { try { return localStorage.getItem(LS); } catch { return null; } })();
        try {
            const r = await fetch(API, { credentials: 'include' });
            if (!r.ok) return;
            const d = await r.json();
            _seen  = [d.seen_at, local].filter(Boolean).sort().pop() || null;
            _connu = true;
        } catch { /* hors ligne : on reste muet, cf. recalculer() */ }
    }

    async function marquerLu() {
        // Rouvrir pour relire ne doit rien coûter : sans ce garde, chaque consultation
        // déclenchait une écriture serveur pour déplacer un repère que rien n'utilise.
        if (_connu && _seen && !_neuves.length) return;
        const maintenant = new Date().toISOString();
        _seen = maintenant; _connu = true;
        try { localStorage.setItem(LS, maintenant); } catch { /* mode privé */ }
        recalculer();
        majPastille();
        try { await fetch(API, { method: 'POST', credentials: 'include' }); } catch { /* le miroir local prend le relais */ }
    }

    function surEchap(e) { if (e.key === 'Escape') fermer(); }

    function fermer() {
        const o = document.getElementById('nv-overlay');
        if (o) o.remove();
        document.removeEventListener('keydown', surEchap);
        // On REND la valeur d'avant plutôt que de la vider : si la fenêtre est un jour
        // ouverte par-dessus une autre modale, la vider déverrouillerait le fond.
        if (_overflow !== null) { document.body.style.overflow = _overflow; _overflow = null; }
    }

    function carte(n, neuves) {
        return '<article class="nv-item">'
            + '<h3>' + esc(n.titre) + (neuves.has(n.id) ? '<span class="nv-tag">Nouveau</span>' : '') + '</h3>'
            + '<p>' + esc(n.quoi) + '</p>'
            + (n.ou ? '<p class="nv-ou">Où : ' + esc(n.ou) + '</p>' : '')
            + '</article>';
    }

    function ouvrir() {
        fermer();
        const neuves = new Set(_neuves.map(n => n.id));

        // Regroupement par date : sept entrées livrées le même jour se lisent comme une
        // mise à jour, pas comme sept événements distincts. `_visibles` est déjà trié par
        // date décroissante et une Map garde l'ordre d'insertion, d'où le groupement en
        // une passe — sans balises ouvertes à refermer douze lignes plus bas.
        const parDate = new Map();
        for (const n of _visibles) {
            if (!parDate.has(n.date)) parDate.set(n.date, []);
            parDate.get(n.date).push(n);
        }
        const corps = _visibles.length
            ? [...parDate].map(([date, items]) =>
                '<div class="nv-groupe">'
                + '<div class="nv-date">' + esc(dateFr(date)) + '</div>'
                + items.map(n => carte(n, neuves)).join('')
                + '</div>').join('')
            : '<p class="nv-vide">Rien de neuf pour l\'instant. Les évolutions qui vous '
              + 'concernent apparaîtront ici.</p>';

        const o = document.createElement('div');
        o.id = 'nv-overlay';
        o.className = 'nv-overlay';
        o.innerHTML =
            '<div class="nv-modal" role="dialog" aria-modal="true" aria-label="Du neuf">'
          +   '<header class="nv-head">'
          +     '<span class="nv-titre">Du neuf</span>'
          +     '<button type="button" class="nv-close" aria-label="Fermer">✕</button>'
          +   '</header>'
          +   '<div class="nv-corps">' + corps + '</div>'
          + '</div>';
        o.addEventListener('click', e => { if (e.target === o) fermer(); });
        o.querySelector('.nv-close').addEventListener('click', fermer);
        document.body.appendChild(o);
        // Le planning derrière défile déjà sur deux axes : sans ce verrou, un geste sur
        // le rideau de nouveautés emportait la page au lieu du texte.
        _overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', surEchap);

        marquerLu();
    }

    // Les boutons partent masqués et ne se révèlent que si le rôle a QUELQUE CHOSE à
    // lire. Un « Du neuf » qui n'ouvre jamais que « Rien de neuf » — le cas du compte
    // d'établissement, la tablette partagée du bar, qu'aucune entrée ne vise — est du
    // bruit dans un en-tête déjà chargé. Piloté par la donnée, pas par le rôle : le jour
    // où une entrée le visera, le bouton apparaîtra tout seul. Et rien à lire = rien à
    // aller chercher : on sort avant le réseau, sur la page la plus rechargée du lot.
    //
    // `autoOuvrir` n'agit QUE si la personne avait déjà un repère de lecture : au tout
    // premier passage, la liste entière serait « neuve » et lui sauterait au visage sans
    // qu'elle ait rien demandé. Dans ce cas la pastille suffit à inviter.
    async function init(role, opts) {
        _role = role;
        recalculer();
        const boutons = document.querySelectorAll('[data-nv-open]');
        boutons.forEach(el => el.addEventListener('click', ouvrir));
        if (!_visibles.length) return;
        boutons.forEach(el => { el.style.display = ''; });
        _dots = document.querySelectorAll('[data-nv-dot]');
        await charger();
        recalculer();
        majPastille();
        if (opts && opts.autoOuvrir && _seen && _neuves.length) ouvrir();
    }

    return { init, filtrer, NOUVEAUTES };
});
