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
// L'unique exception est le REMPLISSAGE INITIAL ci-dessous, qui remonte trois semaines
// de livraisons : personne n'avait encore de repère de lecture, donc rien ne pouvait
// être compté comme lu à tort. Cette porte se referme au premier déploiement.
//
// L'AFFICHAGE, lui, regroupe par SEMAINE (cf. `grouperParSemaine`) : c'est la maille à
// laquelle les mises à jour partent chez le client. La donnée reste au jour.
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
            id: 'du-neuf', date: '2026-08-28',
            roles: ['patron', 'directeur', 'observateur', 'staff'],
            titre: 'Cette fenêtre',
            quoi: 'Ce qui change dans l\'application est désormais écrit ici, semaine par '
                + 'semaine, et chacun ne voit que ce qui le concerne. Une pastille apparaît '
                + 'quand il y a du neuf ; tout reste consultable ensuite, même une fois lu.',
            ou: 'Le bouton « Du neuf » — dans votre menu de profil, ou dans le bandeau du haut'
        },
        {
            id: 'verrou-semaine-publiee', date: '2026-08-27',
            roles: ['patron', 'directeur'],
            titre: 'Une semaine publiée ne se modifie plus par accident',
            quoi: 'Sur téléphone et tablette, un planning déjà envoyé à l\'équipe est '
                + 'verrouillé : un doigt qui glisse ne déplace plus un créneau, n\'en supprime '
                + 'plus un, et ne vide plus la journée de quelqu\'un. Pour corriger, on passe '
                + 'd\'abord en mode éditeur — un geste volontaire, pas un réflexe. Rien n\'est '
                + 'interdit, tout est simplement rendu délibéré.',
            ou: 'Ouvrir une journée d\'une semaine publiée → le cadenas en haut'
        },
        {
            id: 'entete-jour-mobile', date: '2026-08-27',
            roles: ['patron', 'directeur'],
            titre: 'L\'en-tête d\'une journée ne rogne plus ses boutons sur téléphone',
            quoi: 'Les libellés trop longs poussaient le cadenas et la croix de fermeture hors '
                + 'de l\'écran, sans rien indiquer : les commandes disparaissaient purement et '
                + 'simplement. Les deux libellés les plus larges ont été raccourcis, tout tient.',
            ou: 'Ouvrir une journée depuis le planning, sur téléphone'
        },
        {
            id: 'semaine-type-staff', date: '2026-08-25',
            roles: ['staff'],
            titre: 'Enregistrez vos horaires habituels une fois pour toutes',
            quoi: 'Vous pouvez garder une semaine comme modèle. Si vous n\'avez rien envoyé au '
                + 'moment de la deadline, c\'est ce modèle qui part à votre place — pas de '
                + 'semaine vide parce qu\'on a oublié. Ce sont des disponibilités comme les '
                + 'autres : votre patron les valide normalement, et vous pouvez toujours les '
                + 'modifier avant la deadline.',
            ou: 'Dispos & congés → carte « Ma semaine type »'
        },
        {
            id: 'semaine-type-patron', date: '2026-08-25',
            roles: ['patron', 'directeur'],
            titre: 'La semaine-type ne concerne plus seulement les directeurs',
            quoi: 'Chaque membre de l\'équipe peut désormais enregistrer ses horaires habituels '
                + 'comme modèle. À la deadline, ceux qui n\'ont rien envoyé voient leur modèle '
                + 'partir à leur place : vous recevez donc plus de disponibilités à valider, et '
                + 'moins de semaines vides à relancer. Rien ne contourne vos décisions — un '
                + 'modèle n\'est jamais envoyé si vous avez fermé la saisie ou retiré à '
                + 'quelqu\'un le droit d\'envoyer des dispos.',
            ou: 'Disponibilités → onglet « En attente »'
        },
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
            roles: ['patron', 'directeur'],
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
            id: 'conge-retire-dispos-staff', date: '2026-08-23',
            roles: ['staff'],
            titre: 'Un congé accordé efface vos disponibilités de la période',
            quoi: 'Vous n\'avez plus à repasser sur vos disponibilités après un congé validé : '
                + 'celles qui tombent pendant la période sont retirées toutes seules. Vos '
                + 'créneaux déjà planifiés, eux, restent affichés — c\'est à votre responsable '
                + 'de décider qui vous remplace.',
            ou: 'Dispos & congés'
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
            ou: '« Paramètres dispos » → « Ignorer deadline (urgence) »'
        },
        {
            id: 'fiches-personnel-mobile', date: '2026-08-14',
            roles: ['patron', 'directeur'],
            titre: 'Fiches du personnel lisibles sur téléphone',
            quoi: 'Les fenêtres d\'ajout et de modification d\'un membre de l\'équipe débordaient '
                + 'de l\'écran en mode portrait sur certains téléphones. Corrigé.',
            ou: 'Staff → « Gestion du staff » → ajouter ou modifier une fiche'
        },
        {
            id: 'semaine-bascule-9h', date: '2026-08-23',
            roles: ['patron', 'directeur'],
            titre: 'La semaine de l\'équipe bascule à l\'heure du pointage',
            quoi: 'L\'heure de fin de la fenêtre de pointage (9 h par défaut) décide désormais '
                + 'aussi du moment où le planning de vos employés passe à la semaine suivante — '
                + 'auparavant 6 h. Un responsable qui pointe le service du dimanche à 7 h du '
                + 'matin retrouve enfin la journée qu\'il est en train de pointer. Ce réglage '
                + 'est commun à tous vos établissements ; votre propre planning n\'est pas '
                + 'concerné, il reste calé sur la semaine calendaire.',
            ou: '« Paramètres dispos » → « Fenêtre de saisie pointage »'
        },
        {
            id: 'semaine-bascule-9h-staff', date: '2026-08-23',
            roles: ['staff'],
            titre: 'Le lundi matin, votre semaine qui s\'achève reste en haut',
            quoi: 'Jusqu\'à 9 h le lundi, la semaine qui se termine reste affichée en premier ; '
                + 'la semaine neuve est juste en dessous, à portée de défilement. Rien n\'est '
                + 'caché, seul l\'ordre change, et seulement pendant ces trois heures — celles '
                + 'où l\'on sort de service et où on regarde son téléphone.',
            ou: 'Onglet « Mon planning »'
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
        {
            id: 'planning-brouillon-invisible', date: '2026-08-13',
            roles: ['patron', 'directeur'],
            titre: 'Un planning non publié reste invisible pour l\'équipe',
            quoi: 'Une semaine en cours de construction n\'était pas censée être lisible par '
                + 'les employés, et ne l\'était effectivement pas à l\'écran — mais trois '
                + 'chemins la laissaient encore passer. Ils sont fermés. Vous pouvez monter une '
                + 'semaine à l\'avance sans que personne ne voie le brouillon, et une semaine '
                + 'publiée loin dans le futur est enfin réellement consultable par l\'équipe.',
            ou: 'Planning → bouton « Publier »'
        },
        {
            id: 'journal-dispos', date: '2026-08-13',
            roles: ['patron', 'directeur', 'observateur'],
            titre: 'Un journal garde la trace de chaque disponibilité',
            quoi: 'Qui a saisi quoi, quand, et ce que valait la version d\'avant : tout '
                + 'mouvement de disponibilité est consigné, y compris les suppressions '
                + 'automatiques. Le jour où quelqu\'un dit « j\'avais mis dispo », la réponse '
                + 'est écrite. Lecture seule, aucun bouton — c\'est ce qui lui donne sa valeur '
                + 'de preuve. Conservé trois ans.',
            ou: 'Disponibilités → onglet « Historique »'
        },
        {
            id: 'reouverture-nominative', date: '2026-08-13',
            roles: ['patron', 'directeur'],
            titre: 'Rouvrir la saisie pour une seule personne, sur une seule semaine',
            quoi: 'Un retardataire n\'oblige plus à rouvrir la deadline pour tout le monde. La '
                + 'réouverture vaut pour la personne ET la semaine choisies : elle ne déborde '
                + 'pas sur les semaines suivantes, et enregistrer une autre semaine ne la '
                + 'consomme plus par erreur. Une pastille « Rouvert » signale l\'état.',
            ou: 'Disponibilités → onglet « Sans dispo » → « Rouvrir »'
        },
        {
            id: 'archiver-staff', date: '2026-08-12',
            roles: ['patron', 'directeur'],
            titre: 'Archiver quelqu\'un qui part, sans effacer ses heures',
            quoi: 'Un départ ne se règle plus en supprimant le profil — donc en perdant tout '
                + 'son historique. La personne sort de la vie courante : plus proposée à la '
                + 'planification, plus dans les copies de semaine, plus de notifications sur '
                + 'son téléphone. Mais son passé reste intact dans les récapitulatifs, et '
                + 'l\'archivage se défait si elle revient. Ses créneaux déjà placés ne sont pas '
                + 'effacés : ils repassent en Joker, à réattribuer.',
            ou: 'Staff → « Gestion du staff » → bouton « Archiver »'
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

    // Regroupe pour l'AFFICHAGE par semaine, pas par jour. Les mises à jour partent chez
    // le client semaine par semaine : « Semaine du 24 août » est la maille à laquelle il
    // les reçoit, alors qu'un jour précis ne lui dit rien — deux dates voisines lui
    // paraîtraient deux livraisons distinctes alors qu'il n'en a vu qu'une.
    // La donnée, elle, reste au JOUR : c'est la granularité du repère de lecture, et
    // l'arrondir à la semaine ferait passer pour lue une entrée publiée le jeudi par qui
    // a ouvert la fenêtre le lundi.
    // `liste` doit arriver triée (c'est le cas de `visibles`) : une Map garde l'ordre
    // d'insertion, donc les semaines sortent dans le même sens que les entrées.
    function grouperParSemaine(liste) {
        const groupes = new Map();
        for (const n of liste) {
            const lundi = toDateStr(Week.weekStart(new Date(n.date + 'T12:00:00')));
            if (!groupes.has(lundi)) groupes.set(lundi, []);
            groupes.get(lundi).push(n);
        }
        return [...groupes];
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

    function semaineFr(lundi) {
        return 'Semaine du ' + new Date(lundi + 'T12:00:00')
            .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
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

        const corps = _visibles.length
            ? grouperParSemaine(_visibles).map(([lundi, items]) =>
                '<div class="nv-groupe">'
                + '<div class="nv-date">' + esc(semaineFr(lundi)) + '</div>'
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

    return { init, filtrer, grouperParSemaine, NOUVEAUTES };
});
