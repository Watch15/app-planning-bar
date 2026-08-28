// Nouveautés — journal des évolutions affiché dans l'app.
//
// Trois choses à ne pas laisser régresser, et elles échouent toutes EN SILENCE :
//
//  1. le repère de lecture est par COMPTE. S'il redevenait global (un `settings`, un
//     champ partagé), la première personne à ouvrir la fenêtre éteindrait la pastille
//     de toute l'équipe — et personne ne s'en plaindrait, puisque personne ne saurait
//     qu'il y avait quelque chose à lire ;
//  2. la liste est tenue à la main, à côté de docs/note-client-mise-a-jour.md. Un rôle
//     mal orthographié (`patrons`, `manager`) ne lève aucune erreur : l'annonce
//     n'atteint juste jamais personne ;
//  3. `filtrer()` décide QUI VOIT QUOI. C'est la fonction qui se trompe sans bruit —
//     une entrée invisible ne provoque aucun rapport de bug, seulement un silence.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeDb } = require('./helpers/fake-db');
const { startApp, stopApp, req, app } = require('./helpers/harness');
const { NOUVEAUTES, filtrer, grouperParSemaine, limiterSemaines } = require('../public/lib/nouveautes');

const PATRON = { _id: '0123456789abcdef01230001', role: 'patron',        name: 'Paul' };
const DIR    = { _id: '0123456789abcdef01230002', role: 'directeur',     name: 'Diane' };
const OBS    = { _id: '0123456789abcdef01230003', role: 'observateur',   name: 'Oscar' };
const STAFF  = { _id: '0123456789abcdef01230004', role: 'staff',         name: 'Bob', staff_id: '0123456789abcdef0123cccc' };
const ETAB   = { _id: '0123456789abcdef01230005', role: 'etablissement', name: 'Poste bar1' };

const ROLES_VALIDES = ['patron', 'directeur', 'observateur', 'staff', 'etablissement'];

before(startApp);
after(stopApp);

beforeEach(() => {
    app.locals.setTestDb(makeDb({
        users: [PATRON, DIR, OBS, STAFF, ETAB].map(u => ({ ...u })),
        settings: [],
    }));
});

const lire    = user => req('/api/nouveautes/vues', user);
const marquer = user => req('/api/nouveautes/vues', user, { method: 'POST' });

// ── Le repère de lecture ─────────────────────────────────────────────────────

test('un compte qui n\'a jamais ouvert la fenêtre n\'a pas de repère', async () => {
    const r = await lire(PATRON);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).seen_at, null);
});

test('ouvrir la fenêtre pose un repère daté, relu tel quel', async () => {
    const avant = new Date().toISOString();
    assert.equal((await marquer(PATRON)).status, 200);

    const { seen_at } = await (await lire(PATRON)).json();
    assert.ok(seen_at, 'un repère doit exister après la lecture');
    // Stocké en Date BSON, sérialisé en ISO par res.json() : c'est ce que le client parse.
    assert.ok(seen_at >= avant, 'le repère doit être postérieur à l\'ouverture');
});

test('le repère est PAR COMPTE : lire chez l\'un ne marque rien chez l\'autre', async () => {
    await marquer(PATRON);
    assert.equal((await (await lire(STAFF)).json()).seen_at, null);
    assert.ok((await (await lire(PATRON)).json()).seen_at);
});

// Le journal n'est pas réservé à la vue patron : c'est `requireAuth`, pas
// `requirePatron`. Un staff qui n'y aurait pas accès ne verrait jamais ce qui change
// sur SON écran — là où il y a justement le plus d'entrées.
for (const user of [DIR, OBS, STAFF, ETAB]) {
    test('rôle ' + user.role + ' : accès au journal', async () => {
        assert.equal((await lire(user)).status, 200);
        assert.equal((await marquer(user)).status, 200);
    });
}

test('sans session, les deux routes refusent', async () => {
    assert.equal((await lire(null)).status, 401);
    assert.equal((await marquer(null)).status, 401);
});

// ── Les règles de ciblage ────────────────────────────────────────────────────

const LISTE = [
    { id: 'a', date: '2026-08-20', roles: ['patron'],          titre: 'A', quoi: 'a', ou: 'a' },
    { id: 'b', date: '2026-08-24', roles: ['staff'],           titre: 'B', quoi: 'b', ou: 'b' },
    { id: 'c', date: '2026-08-24', roles: ['patron', 'staff'], titre: 'C', quoi: 'c', ou: 'c' },
    { id: 'd', date: '2026-09-30', roles: ['patron'],          titre: 'D', quoi: 'd', ou: 'd' },
];
const LE_28 = new Date(2026, 7, 28, 15, 0, 0);   // 28 août 2026, heure LOCALE

const ids = r => r.map(n => n.id);

test('filtrer : chacun ne voit que ce qui le vise', () => {
    assert.deepEqual(ids(filtrer(LISTE, 'patron', null, LE_28).visibles), ['c', 'a']);
    // À date égale, l'ordre se départage par identifiant : deux entrées du même jour
    // doivent s'afficher dans un ordre stable d'un chargement à l'autre.
    assert.deepEqual(ids(filtrer(LISTE, 'staff',  null, LE_28).visibles), ['b', 'c']);
    // Aucun rôle inconnu ne doit hériter d'un fourre-tout.
    assert.deepEqual(ids(filtrer(LISTE, 'etablissement', null, LE_28).visibles), []);
});

test('filtrer : une entrée datée dans le futur reste masquée', () => {
    // `d` est daté du 30 septembre : on doit pouvoir préparer une annonce sans qu'elle fuite.
    assert.ok(!ids(filtrer(LISTE, 'patron', null, LE_28).visibles).includes('d'));
    const apres = new Date(2026, 8, 30, 9, 0, 0);
    assert.ok(ids(filtrer(LISTE, 'patron', null, apres).visibles).includes('d'));
});

test('filtrer : sans repère, tout est neuf', () => {
    assert.deepEqual(ids(filtrer(LISTE, 'patron', null, LE_28).neuves), ['c', 'a']);
});

test('filtrer : le repère coupe sur le JOUR, et le jour même compte comme lu', () => {
    const seen = new Date(2026, 7, 24, 18, 0, 0).toISOString();
    const r = filtrer(LISTE, 'patron', seen, LE_28);
    // `c` est daté du 24, lu le 24 au soir → plus neuf. `a` (20) non plus.
    assert.deepEqual(ids(r.neuves), []);
    assert.deepEqual(ids(r.visibles), ['c', 'a'], 'lu ≠ masqué : on doit pouvoir relire');
});

// LE test que le découpage `seen.slice(0, 10)` échouait. Ce repère est le 24 août à
// 00h30 heure de Paris, donc le 23 à 22h30 en UTC : trancher la chaîne ISO ramenait au
// 23, et `c` (daté du 24) restait donc marqué « Nouveau » alors qu'on venait de le
// lire. Concrètement, entre minuit et 2 h chaque nuit d'été, la pastille ne
// s'éteignait plus. L'anti-patron nommé par architecture.md §3.1.
test('filtrer : un repère posé après minuit reste sur SON jour local', () => {
    const minuitPasse = new Date(2026, 7, 24, 0, 30, 0).toISOString();
    assert.deepEqual(ids(filtrer(LISTE, 'patron', minuitPasse, LE_28).neuves), [],
        'ce qui a été lu le 24 à 00h30 ne doit pas repasser pour neuf');
});

test('filtrer : « aujourd\'hui » se lit en heure locale, pas en UTC', () => {
    // 28 août 00h30 à Paris = 27 août 22h30 UTC. Une entrée datée du 28 doit être
    // visible dès minuit, sinon son bouton n'apparaît même pas pendant deux heures.
    const liste = [{ id: 'x', date: '2026-08-28', roles: ['patron'], titre: 'X', quoi: 'x', ou: 'x' }];
    const justeApresMinuit = new Date(2026, 7, 28, 0, 30, 0);
    assert.deepEqual(ids(filtrer(liste, 'patron', null, justeApresMinuit).visibles), ['x']);
});

// ── Le regroupement d'affichage ──────────────────────────────────────────────
// Les mises à jour partent chez le client semaine par semaine : c'est la maille à
// laquelle il les reçoit. Deux dates voisines d'une même livraison ne doivent pas lui
// apparaître comme deux livraisons distinctes.

test('grouperParSemaine : deux jours de la même semaine tiennent sous un seul titre', () => {
    // Lundi 24 et vendredi 28 août 2026 → même semaine, un seul groupe.
    const liste = [
        { id: 'ven', date: '2026-08-28', roles: ['patron'], titre: 'V', quoi: 'v', ou: 'v' },
        { id: 'lun', date: '2026-08-24', roles: ['patron'], titre: 'L', quoi: 'l', ou: 'l' },
    ];
    const g = grouperParSemaine(liste);
    assert.equal(g.length, 1);
    assert.deepEqual(g[0][0], '2026-08-24', 'le titre porte le LUNDI de la semaine');
    assert.deepEqual(ids(g[0][1]), ['ven', 'lun']);
});

test('grouperParSemaine : le dimanche appartient à la semaine qui s\'achève', () => {
    // Dimanche 23 août : lundi-dimanche, donc semaine du 17 — pas celle du 24. C'est la
    // convention de tout le reste de l'app (Week.weekStart), et six entrées livrées en
    // portent la date.
    const liste = [
        { id: 'lun24', date: '2026-08-24', roles: ['patron'], titre: 'A', quoi: 'a', ou: 'a' },
        { id: 'dim23', date: '2026-08-23', roles: ['patron'], titre: 'B', quoi: 'b', ou: 'b' },
    ];
    assert.deepEqual(grouperParSemaine(liste).map(([lundi]) => lundi),
        ['2026-08-24', '2026-08-17']);
});

test('grouperParSemaine : l\'ordre des semaines suit celui des entrées', () => {
    const v = filtrer(NOUVEAUTES, 'patron', null, new Date(2026, 7, 28, 12)).visibles;
    const semaines = grouperParSemaine(v).map(([lundi]) => lundi);
    assert.deepEqual(semaines, [...semaines].sort().reverse(),
        'la semaine la plus récente doit arriver en tête');
});

// ── La troncature à deux semaines ────────────────────────────────────────────
// Elle peut faire disparaître du contenu de l'écran : c'est donc elle qu'il faut
// empêcher de mentir. La pastille annonce un nombre ; si une partie se cachait derrière
// un bouton, le repère de lecture serait posé sur des entrées que personne n'a vues.

const semaine = (lundi, ...ids) => [lundi, ids.map(id => ({ id }))];
const QUATRE = [
    semaine('2026-08-24', 'a'), semaine('2026-08-17', 'b'),
    semaine('2026-08-10', 'c'), semaine('2026-08-03', 'd'),
];

test('limiterSemaines : deux semaines par défaut, le reste est annoncé', () => {
    const r = limiterSemaines(QUATRE, new Set(), false);
    assert.deepEqual(r.montrees.map(([l]) => l), ['2026-08-24', '2026-08-17']);
    assert.equal(r.restantes, 2);
});

test('limiterSemaines : on ne tronque jamais au-dessus d\'une entrée non lue', () => {
    // `c` est en 3e semaine et n'est pas lu : le replier rendrait la pastille menteuse.
    const r = limiterSemaines(QUATRE, new Set(['c']), false);
    assert.equal(r.montrees.length, 4);
    assert.equal(r.restantes, 0);
});

test('limiterSemaines : du non-lu dans les deux premières semaines ne déplie rien', () => {
    const r = limiterSemaines(QUATRE, new Set(['a', 'b']), false);
    assert.equal(r.montrees.length, 2);
    assert.equal(r.restantes, 2);
});

test('limiterSemaines : deux semaines ou moins, rien à déplier', () => {
    const r = limiterSemaines(QUATRE.slice(0, 2), new Set(), false);
    assert.equal(r.montrees.length, 2);
    assert.equal(r.restantes, 0);
});

test('limiterSemaines : le dépliage montre tout', () => {
    assert.equal(limiterSemaines(QUATRE, new Set(), true).restantes, 0);
});

// ── La liste livrée ──────────────────────────────────────────────────────────

test('chaque identifiant est unique — c\'est lui qui survit à une reformulation', () => {
    const ids = NOUVEAUTES.map(n => n.id);
    assert.deepEqual([...new Set(ids)].sort(), [...ids].sort());
});

test('aucune entrée ne cible un rôle inexistant', () => {
    for (const n of NOUVEAUTES) {
        assert.ok(Array.isArray(n.roles) && n.roles.length, n.id + ' : aucun destinataire');
        for (const r of n.roles) {
            assert.ok(ROLES_VALIDES.includes(r), n.id + ' : rôle inconnu « ' + r + ' »');
        }
    }
});

test('chaque entrée porte une date au format jour et les trois champs de lecture', () => {
    for (const n of NOUVEAUTES) {
        assert.match(n.date, /^\d{4}-\d{2}-\d{2}$/, n.id + ' : date mal formée');
        assert.ok(!Number.isNaN(Date.parse(n.date + 'T12:00:00')), n.id + ' : date inexistante');
        for (const champ of ['titre', 'quoi', 'ou']) {
            assert.ok(n[champ] && n[champ].trim().length > 0, n.id + ' : champ « ' + champ + ' » vide');
        }
    }
});

// Erreur commise trois fois en écrivant la liste : une entrée visant `staff` dont le
// champ `ou` renvoie vers un écran réservé au patron. Le staff n'a pas ces écrans — on
// lui promet donc un chemin introuvable, exactement le travers que le ciblage par rôle
// existe pour éviter. Trois libellés suffisent à couvrir les trois cas rencontrés ;
// quand un même changement se voit à deux endroits, la réponse est DEUX entrées.
test('aucune entrée destinée au staff ne le renvoie vers un écran du patron', () => {
    const ECRANS_PATRON = ['Paramètres dispos', 'Gestion du staff', 'Récap mensuel'];
    for (const n of NOUVEAUTES.filter(e => e.roles.includes('staff'))) {
        for (const ecran of ECRANS_PATRON) {
            assert.ok(!n.ou.includes(ecran),
                n.id + ' : renvoie le staff vers « ' + ecran +' », qu\'il ne peut pas ouvrir');
        }
    }
});

test('chaque rôle destinataire a bien quelque chose à lire', () => {
    // Un rôle visé par zéro entrée ne verrait aucun bouton : c'est voulu pour
    // `etablissement`, ça ne doit pas arriver par accident aux quatre autres.
    const demain = new Date(Date.now() + 86400000);
    for (const role of ['patron', 'directeur', 'observateur', 'staff']) {
        assert.ok(filtrer(NOUVEAUTES, role, null, demain).visibles.length > 0,
            'aucune entrée ne vise ' + role);
    }
});
