// A-14 — rattraper un 401 qui survient EN COURS DE SESSION.
//
// Le problème : chaque page ne teste l'authentification qu'AU CHARGEMENT
// (`planning.js`, `script.js`, `pointage.js`, `performance.js` appellent `/auth/me`
// puis redirigent vers `/login.html` si ça échoue). Un 401 qui arrive PENDANT
// l'utilisation n'était rattrapé nulle part : l'appel échouait en silence, l'écran
// restait affiché avec des données périmées, et l'utilisateur croyait travailler.
//
// Devenu quotidien avec R-17 : changer le périmètre d'un utilisateur invalide
// désormais ses sessions IMMÉDIATEMENT. Le patron déplace un directeur d'un bar,
// et l'écran du directeur devient muet sans rien lui dire. Avant R-17 le cas
// existait déjà (expiration à 30 jours), mais il était rare.
//
// La stratégie : envelopper `window.fetch` UNE fois, au lieu de toucher les
// centaines d'appels des 4 bundles front. Aucun call site ne change.
//
// Chargé via <script src="/lib/auth-guard.js"> AVANT le script de la page (il doit
// être en place quand le premier `fetch` part). Le prédicat est exporté à part et
// `require()`-able : c'est lui qui porte toutes les règles, et il est testé sous Node.
//
// ⚠️ Interaction VOULUE avec le contrôle de démarrage des pages. Au chargement, chaque
// page teste `/auth/me` et redirige elle-même vers `/login.html` en cas de 401. Le garde
// s'exécute d'abord (il est à l'intérieur du `fetch`) et pose `?expired=1`, puis la page
// écrase la cible par `/login.html` nu. C'est le bon résultat : au chargement on n'a pas
// été ÉJECTÉ, on n'était simplement pas connecté — le message « ta session a expiré »
// serait faux. Ne pas « corriger » cet écrasement.
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();          // Node / CommonJS (tests)
    } else {
        root.AuthGuard = factory();          // Navigateur → window.AuthGuard
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Routes où un 401 est une RÉPONSE MÉTIER et non une session morte : se tromper
    // de mot de passe rend 401. Rediriger ici effacerait le message d'erreur de
    // `login.js` et ferait clignoter la page à chaque faute de frappe.
    const AUTH_ENTRY_PATHS = [
        '/auth/login',
        '/auth/forgot-password',
        '/auth/set-password',
        '/auth/reset-password',
    ];

    // Pages sur lesquelles on est déjà, par nature, déconnecté. `login.js` appelle
    // `/auth/me` au chargement pour détecter une session existante : ce 401-là est
    // le cas NORMAL. Rediriger vers /login.html depuis /login.html = boucle.
    const PUBLIC_PAGES = ['/login.html', '/set-password.html'];

    const LOGIN_URL = '/login.html?expired=1';

    // Seule règle de décision du module — pure, donc testable sans navigateur.
    // `pathname` vaut `null` pour une requête cross-origin ou une URL illisible :
    // le 401 d'un tiers ne dit rien de NOTRE session.
    function shouldRedirectOn401(status, pathname, currentPath) {
        if (status !== 401)  return false;
        if (pathname == null) return false;
        if (PUBLIC_PAGES.indexOf(currentPath) !== -1) return false;
        if (AUTH_ENTRY_PATHS.indexOf(pathname) !== -1) return false;
        // Le reste du site (HTML, CSS, images) ne rend pas 401 ; on se limite quand
        // même explicitement à l'API pour ne jamais réagir à autre chose.
        return pathname.indexOf('/api/') === 0 || pathname.indexOf('/auth/') === 0;
    }

    // Résout l'URL d'un appel `fetch` (chaîne, URL ou Request) en pathname
    // SAME-ORIGIN, ou `null`. Ne jette jamais : une erreur ici ne doit pas casser
    // un appel réseau par ailleurs valide.
    function samePathname(input, win) {
        try {
            const raw = (input && typeof input === 'object' && 'url' in input) ? input.url : input;
            // Sans ce test, `String(undefined)` donne « undefined », que `new URL` résout
            // gentiment en `/undefined` — un pathname inventé, du même origin, au lieu
            // d'un aveu d'ignorance. Il ne déclencherait rien aujourd'hui (il ne commence
            // ni par /api/ ni par /auth/), mais c'est une réponse fausse.
            if (typeof raw !== 'string' || raw === '') return null;
            const url = new URL(raw, win.location.href);
            return (url.origin === win.location.origin) ? url.pathname : null;
        } catch { return null; }
    }

    // Enveloppe `win.fetch`. Idempotent : deux chargements du script (ou un appel
    // manuel) n'empilent pas deux couches.
    function install(win) {
        const w = win || (typeof window !== 'undefined' ? window : null);
        if (!w || typeof w.fetch !== 'function') return false;
        if (w.__authGuardInstalled) return false;
        w.__authGuardInstalled = true;

        const nativeFetch = w.fetch.bind(w);
        let redirecting = false;   // une seule redirection, même si 10 appels 401 ensemble

        w.fetch = function (input, init) {
            return nativeFetch(input, init).then(function (res) {
                if (!redirecting
                    && shouldRedirectOn401(res.status, samePathname(input, w), w.location.pathname)) {
                    redirecting = true;
                    w.location.href = LOGIN_URL;
                }
                // La réponse est rendue INTACTE : le code appelant continue son chemin
                // habituel (il gérait déjà l'échec) jusqu'à ce que la navigation ait lieu.
                return res;
            });
        };
        return true;
    }

    // Auto-installation dans le navigateur : le seul fait de charger le script suffit,
    // il n'y a rien à appeler depuis les pages. Sous Node (tests), on n'installe rien.
    if (typeof window !== 'undefined' && typeof document !== 'undefined') install(window);

    return { shouldRedirectOn401, samePathname, install, AUTH_ENTRY_PATHS, PUBLIC_PAGES, LOGIN_URL };
});
