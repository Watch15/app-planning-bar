// Enregistrement du Service Worker (PWA) + prise en compte AUTOMATIQUE des mises à
// jour. Externalisé des pages HTML pour permettre, à terme, une CSP sans
// `unsafe-inline` sur script-src.
//
// Sans ce fichier, une nouvelle version se contentait de s'installer en arrière-plan
// (le SW fait `skipWaiting()` + `clients.claim()`), mais la page ouverte continuait
// d'afficher les assets en cache tant que l'utilisateur ne fermait pas complètement
// la PWA. Sur mobile, l'app est le plus souvent REPRISE depuis l'arrière-plan (pas de
// nouvelle navigation) → le navigateur ne revérifiait jamais `/sw.js` → mise à jour
// jamais appliquée. On corrige deux choses :
//   1. on force `registration.update()` au démarrage ET à chaque retour au premier
//      plan (`visibilitychange`) → le navigateur revérifie `/sw.js` même si la PWA est
//      restée ouverte des jours ;
//   2. quand le nouveau SW prend le contrôle (`controllerchange`), on recharge la page
//      une seule fois → les assets fraîchement préchargés sont servis immédiatement.
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Y avait-il déjà un SW aux commandes au chargement ? Si non (tout premier
        // lancement), le `clients.claim()` initial déclenche aussi `controllerchange` :
        // il ne faut PAS recharger dans ce cas, la page est déjà la dernière version.
        const hadController = !!navigator.serviceWorker.controller;
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!hadController || refreshing) return;
            refreshing = true;
            window.location.reload();
        });

        navigator.serviceWorker.register('/sw.js').then(reg => {
            const check = () => reg.update().catch(() => {}); // silencieux hors ligne
            check();
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') check();
            });
        }).catch(() => {});
    });
}
