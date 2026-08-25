'use strict';
// Tests de bout en bout sur une instance QUI TOURNE (dev, main, ou local).
//
// Les tests `npm test` tapent un faux Mongo : ils prouvent la logique, pas le câblage.
// Celui-ci parle HTTP à un vrai serveur, sur une vraie base, et rejoue les parcours —
// anciens ET nouveaux. C'est ce qu'on lance après chaque déploiement.
//
//   node scripts/smoke.js                          → http://localhost:3000
//   SMOKE_URL=https://dev.templyo.fr node scripts/smoke.js
//
// GARDE-FOU : il se connecte avec les comptes de `seed-dev.js` (@templyo.test). Sur une
// base client, ces comptes n'existent pas → il s'arrête à la 1re étape sans rien écrire.
// C'est volontaire : ce script ÉCRIT (dispos, validations), il ne doit jamais viser un client.

// Cible : 1er argument, sinon SMOKE_URL, sinon le local.
// L'argument existe parce que `SMOKE_URL=… npm run smoke` est une syntaxe *sh* : elle
// échoue en PowerShell et en cmd, où se fait le développement de ce projet.
const BASE = (process.argv[2] || process.env.SMOKE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const PWD  = process.env.SEED_PASSWORD || 'Templyo2026!';

// Référence git que l'instance visée est CENSÉE porter (`--expect origin/main`).
// Sans elle, un smoke vert ne dit pas sur quel code il est vert — c'est ainsi que la
// production a tourné deux jours sur un build périmé en passant tous les contrôles.
const expectIdx = process.argv.indexOf('--expect');
const EXPECT_REF = expectIdx > -1 ? process.argv[expectIdx + 1] : (process.env.SMOKE_EXPECT || null);

const { weekStart, toDateStr } = require('../lib/utils');
const nextMon = weekStart(new Date(Date.now() + 7 * 864e5));
// Mercredi de la semaine COURANTE : le seed y place le shift d'Alice avec
// `pointage_resp: true`, ce qui en fait la responsable désignée du soir sur Josy.
const SOIREE = toDateStr(new Date(weekStart(new Date()).getTime() + 2 * 864e5));
const D = n => toDateStr(new Date(nextMon.getTime() + n * 864e5));
const FROM = D(0), TO = D(6);

const jar = {};
async function req(who, path, { method = 'GET', body } = {}) {
    const res = await fetch(BASE + path, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(jar[who] ? { cookie: jar[who] } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    if (set.length) jar[who] = set.map(c => c.split(';')[0]).join('; ');
    let data = null;
    try { data = await res.json(); } catch { /* corps vide */ }
    return { status: res.status, data };
}
const login = (who, email) => req(who, '/auth/login', { method: 'POST', body: { email, password: PWD } });

let pass = 0, fail = 0, skip = 0;
const results = [];

// Motifs de désalignement du jeu de recette, remplis par le préflight (cf. `preflight`).
// Une vérification qui en dépend est SAUTÉE, pas comptée en échec : le code n'y est
// pour rien, et un ✗ ferait chercher le bug au mauvais endroit — c'est exactement ce
// qui est arrivé le 2026-08-10.
const stale = { dispos: null, soiree: null, bruno: null, semaineType: null, aliceRouverte: null };

async function check(section, name, fn, needs) {
    const reason = needs && stale[needs];
    if (reason) { skip++; results.push(['⊘', section, name, 'non testé — ' + reason]); return; }
    try {
        const detail = await fn();
        pass++; results.push(['✓', section, name, detail || '']);
    } catch (e) {
        fail++; results.push(['✗', section, name, e.message]);
    }
}
function eq(actual, expected, label) {
    if (actual !== expected) throw new Error(`${label} : attendu ${expected}, obtenu ${actual}`);
    return `${label}=${actual}`;
}

// Vérifie que les ancres du seed tombent bien sur les dates que CE script calcule.
// Ne teste rien du produit : il décide seulement quelles vérifications ont encore un sens.
async function preflight() {
    // Ancre E-03 : le shift d'Alice « responsable » du mercredi de la semaine courante.
    const shifts = (await req('pat', `/api/shifts/Josy_pub/${SOIREE}`)).data;
    if (!Array.isArray(shifts) || !shifts.some(s => s.pointage_resp)) {
        stale.soiree = `aucun shift « responsable » le ${SOIREE} (seed d'une autre semaine)`;
    }
    // Ancre S-04 : il faut des dispos en attente d'AUTRES staff que la directrice,
    // sinon le périmètre du directeur ne peut rien filtrer et le test ne dit rien.
    const pending = (await req('pat', `/api/dispos/pending?from=${FROM}&to=${TO}`)).data;
    const others = Array.isArray(pending) ? new Set(pending.map(d => d.staff_name)) : new Set();
    others.delete('Diane');
    if (!others.size) {
        stale.dispos = `aucune dispo en attente hors directrice sur ${FROM}→${TO} (seed d'une autre semaine)`;
    }
    if (stale.soiree || stale.dispos) {
        console.log('⚠️  JEU DE RECETTE DÉSALIGNÉ — les données ne sont pas sur la bonne semaine.');
        if (stale.soiree) console.log('    · ' + stale.soiree);
        if (stale.dispos) console.log('    · ' + stale.dispos);
        console.log('    Remède : `npm run dev:seed`, puis relancer ce script.');
        console.log('    Les vérifications concernées seront SAUTÉES (⊘), pas comptées en échec.\n');
    }
}

// Le smoke tourne AVANT tout le reste et peut tout arrêter : si l'instance ne porte pas
// le code attendu, les 29 vérifications qui suivent répondent sur autre chose que ce
// qu'on croit tester. Un ✗ franc vaut mieux que 29 ✓ trompeurs.
//
// Il ARRÊTE seulement quand la comparaison est possible et négative. Pas de `--expect`,
// pas de git sous la main, référence inconnue : on informe et on continue — refuser de
// tourner faute d'outillage rendrait le script inutilisable là où il sert le plus.
function verifyDeployedCommit(health) {
    const deployed = health && health.commit;
    if (!deployed) {
        console.log('ℹ️  L\'instance n\'annonce pas son commit (build antérieur au 2026-08-11).\n');
        return true;
    }
    const shortDep = deployed.slice(0, 8);
    if (!EXPECT_REF) {
        console.log('ℹ️  commit déployé : ' + shortDep + ' (aucune référence attendue — passe `--expect origin/main`)\n');
        return true;
    }
    const expected = git('rev-parse ' + EXPECT_REF);
    if (!expected) {
        console.log('ℹ️  commit déployé : ' + shortDep + ' — référence « ' + EXPECT_REF + ' » introuvable en local, comparaison sautée.\n');
        return true;
    }
    if (expected === deployed) {
        console.log('✓ commit déployé : ' + shortDep + ' = ' + EXPECT_REF + '\n');
        return true;
    }
    console.error('❌ L\'INSTANCE NE PORTE PAS LE CODE ATTENDU — arrêt avant toute vérification.');
    console.error('   déployé : ' + shortDep + subjectOf(deployed));
    console.error('   attendu : ' + expected.slice(0, 8) + subjectOf(expected) + '  (' + EXPECT_REF + ')');
    console.error('   Un smoke vert sur un ancien build ne prouve rien. Vérifie la CI et le déploiement.\n');
    return false;
}

// Un git absent, un clone superficiel ou une référence inconnue ne sont pas des erreurs
// ici : la comparaison est un confort de diagnostic, pas une condition de fonctionnement.
// Un seul point où vivent `cwd` et `stdio` — dupliqués, ils auraient fini par diverger,
// et c'est justement `cwd` qui porte l'hypothèse fragile (tourner depuis un clone complet).
function git(args) {
    try {
        return require('child_process')
            .execSync('git ' + args, { cwd: __dirname + '/..', stdio: ['ignore', 'pipe', 'ignore'] })
            .toString().trim();
    } catch { return null; }
}

// Sujet du commit s'il est connu du dépôt local — sinon rien, ce n'est qu'un confort.
function subjectOf(sha) {
    const s = git('log -1 --format=%s ' + sha);
    return s === null ? '  (inconnu de ce dépôt)' : (s ? '  « ' + s + ' »' : '');
}

async function main() {
    console.log('\n🎯 cible : ' + BASE + '\n');

    const health = await req('anon', '/health');
    if (health.status !== 200) {
        console.error('❌ /health ne répond pas (' + health.status + ') — le serveur tourne ?');
        process.exit(1);
    }
    if (!verifyDeployedCommit(health.data)) process.exit(1);

    // 4 connexions par passage, contre une limite de 10 tentatives / 15 min / IP :
    // au 3e lancement rapproché, on tombe en 429. Diagnostiquer précisément, sinon on
    // croit à une base vide et on va chercher le problème au mauvais endroit (vécu).
    const roles = [['pat', 'patron'], ['dir', 'directeur'], ['obs', 'observateur'], ['bru', 'bruno'], ['ali', 'alice']];
    for (const [who, name] of roles) {
        const r = await login(who, name + '@templyo.test');
        if (r.status === 200) continue;
        if (r.status === 429) {
            console.error('❌ Rate limit atteint (429) — ce n\'est PAS un échec du code.');
            console.error('   10 tentatives / 15 min / IP, et ce script en consomme 4.');
            console.error('   Attends la fin de la fenêtre, ou relance le serveur pour vider le compteur (en mémoire).');
        } else {
            console.error('❌ Connexion ' + name + ' impossible (' + r.status + ').');
            console.error('   Base non alimentée par seed-dev.js, ou instance CLIENT — arrêt sans rien écrire.');
        }
        process.exit(1);
    }

    // ── Préflight : le jeu de recette est-il ALIGNÉ sur les dates d'aujourd'hui ? ──
    //
    // `seed-dev.js` place TOUT relativement au jour où il tourne (`thisMon`, `nextMon`,
    // `lastMon`) et ce script recalcule les mêmes expressions à SA date. Semé une
    // semaine, lancé la suivante, plus rien ne coïncide : le shift « responsable de
    // soirée » d'Alice n'est pas sur le mercredi interrogé, les dispos semées sont hors
    // de la fenêtre. Les vérifications tombaient alors en accusant le CODE — E-03 en 403,
    // S-04 en « pas de filtrage » — pour un problème de DONNÉES. Une heure de recherche
    // au mauvais endroit, le 2026-08-10. On le détecte donc explicitement.
    await preflight();

    // ── Socle : ce qui marchait déjà ─────────────────────────────────────────
    await check('socle', 'session patron', async () =>
        eq((await req('pat', '/auth/me')).data.user.role, 'patron', 'role'));
    await check('socle', 'établissements listés', async () => {
        const r = await req('pat', '/api/establishments');
        if (!Array.isArray(r.data) || r.data.length === 0) throw new Error('aucun établissement');
        return r.data.length + ' bars';
    });
    await check('socle', 'staff listé', async () => {
        const r = await req('pat', '/api/staff');
        if (r.data.length < 5) throw new Error('staff incomplet (' + r.data.length + ')');
        return r.data.length + ' membres';
    });
    await check('socle', 'planning semaine (patron)', async () =>
        eq((await req('pat', '/api/week-full/Josy_pub?from=' + FROM + '&to=' + TO)).status, 200, 'status'));
    await check('socle', 'planning perso (staff)', async () =>
        eq((await req('bru', '/api/my-shifts?from=' + FROM + '&to=' + TO)).status, 200, 'status'));
    await check('socle', 'anonyme rejeté', async () =>
        eq((await req('anon', '/api/staff')).status, 401, 'status'));

    // ── S-04 : périmètre de la file de validation ────────────────────────────
    let nPat = 0, nDir = 0;
    await check('S-04', 'patron voit toute la file', async () => {
        nPat = (await req('pat', `/api/dispos/pending?from=${FROM}&to=${TO}`)).data.length;
        if (nPat === 0) throw new Error('file vide — base non alimentée ?');
        return nPat + ' dispos';
    }, 'dispos');
    await check('S-04', 'directeur limité à son périmètre', async () => {
        nDir = (await req('dir', `/api/dispos/pending?from=${FROM}&to=${TO}`)).data.length;
        if (nDir >= nPat) throw new Error(`pas de filtrage (dir=${nDir}, patron=${nPat})`);
        return nDir + ' < ' + nPat;
    }, 'dispos');
    await check('S-04', 'bascule scope=all rend tout', async () =>
        eq((await req('dir', `/api/dispos/pending?from=${FROM}&to=${TO}&scope=all`)).data.length, nPat, 'dispos'), 'dispos');
    await check('S-04', 'pastille alignée sur la file', async () => {
        const d = (await req('dir', '/api/dispos/count')).data.count;
        const a = (await req('dir', '/api/dispos/count?scope=all')).data.count;
        if (d >= a) throw new Error(`pastille non scopée (${d} vs ${a})`);
        return d + ' / ' + a;
    }, 'dispos');

    // ── S-02 / S-03 : réglages de performance ────────────────────────────────
    await check('S-03', 'directeur lit SON bar', async () =>
        eq((await req('dir', '/api/performance-settings?establishment_id=Josy_pub')).status, 200, 'status'));
    await check('S-03', 'directeur bloqué sur un autre bar', async () =>
        eq((await req('dir', '/api/performance-settings?establishment_id=Poni_restaurant')).status, 403, 'status'));
    await check('S-03', 'staff bloqué', async () =>
        eq((await req('bru', '/api/performance-settings?establishment_id=Josy_pub')).status, 403, 'status'));
    await check('S-02', 'directeur ne peut pas écrire le doc global', async () =>
        eq((await req('dir', '/api/performance-settings', { method: 'PATCH', body: { charge_rate: 99 } })).status, 403, 'status'));
    await check('S-02', 'observateur en lecture seule', async () =>
        eq((await req('obs', '/api/performance-settings', { method: 'PATCH', body: { charge_rate: 99, establishment_id: 'Josy_pub' } })).status, 403, 'status'));
    await check('S-02', 'le 99 n\'a atterri nulle part', async () => {
        const g = (await req('pat', '/api/performance-settings')).data;
        if (g.charge_rate === 99) throw new Error('le taux global a été écrasé !');
        return 'global=' + g.charge_rate;
    });

    // ── §9.1 : exemption de deadline du directeur ────────────────────────────
    //
    // ⚠️ Ces deux vérifications ne valaient QUE si la deadline était réellement franchie
    // à l'heure du lancement — condition que rien ne garantissait. Constaté le
    // 2026-08-13 : un jeudi, avec une deadline de recette au samedi, la 1re passait
    // SANS RIEN PROUVER (le directeur n'était pas exempté, il n'était bloqué par rien)
    // et la 2e tombait en accusant le code. Vacuité d'un côté, faux négatif de l'autre.
    // On impose donc la deadline le temps du bloc, et on la restaure.
    //
    // Un LUNDI 00:00 est franchi quel que soit le jour d'exécution :
    // `computeEffectiveDeadline` ramène toujours la deadline dans la semaine courante,
    // donc c'est soit aujourd'hui à 0h, soit un jour révolu. Même ancre que les tests
    // unitaires (`DEADLINE_FRANCHIE`).
    const setDeadline = v => req('pat', '/api/dispo-settings',
        { method: 'PATCH', body: { custom_deadline: v } });
    const DEADLINE_INITIALE = (await req('pat', '/api/dispo-settings')).data.custom_deadline || null;
    const DEADLINE_FRANCHIE = '2026-01-05T00:00';   // 5 janvier 2026 = un lundi

    await setDeadline(DEADLINE_FRANCHIE);
    await check('§9.1', 'directeur accepté après deadline', async () =>
        eq((await req('dir', '/api/dispos', { method: 'POST', body: {
            dispos: [{ date: D(0), type: 'soir', start_time: 17, end_time: 24 }] } })).status, 201, 'status'));
    await check('§9.1', 'staff refusé après deadline', async () =>
        eq((await req('bru', '/api/dispos', { method: 'POST', body: {
            dispos: [{ date: D(1), type: 'soir', start_time: 18, end_time: 26 }] } })).status, 403, 'status'));
    await setDeadline(DEADLINE_INITIALE);

    // ── B2 : horizon de saisie (2026-08-13) ──────────────────────────────────
    //
    // Ce bloc ÉCRIT les deux horizons dans `settings` et restaure en sortant la valeur
    // trouvée en arrivant : sans ça, le lancement suivant prendrait l'état laissé ici
    // pour la normale et ne prouverait plus rien.
    //
    // Il vaut la peine d'exister contre un VRAI Mongo, et pas seulement en `fake-db` :
    // les deux horizons sont lus depuis un document `settings` réel, l'index composé
    // ajouté par B2 n'existe que là, et la règle A dépend de `computeEffectiveDeadline`
    // évaluée à l'heure du serveur — trois choses qu'un faux Mongo ne peut pas montrer.
    {
        const readSettings = async () => (await req('pat', '/api/dispo-settings')).data;
        const setHorizon   = (x, y) => req('pat', '/api/dispo-settings', {
            method: 'PATCH', body: { horizon_weeks: x, validation_horizon_weeks: y } });
        const initial      = await readSettings();
        const postFor      = date => req('bru', '/api/dispos', { method: 'POST',
            body: { dispos: [{ date, type: 'soir', start_time: 18, end_time: 24 }] } });
        const bruno = ((await req('pat', '/api/staff')).data || []).find(s => /Bruno/i.test(s.name || ''));

        await check('B2', 'horizon 1 : une dispo pour N+2 est refusée', async () => {
            // Le trou §2.1 : AVANT B2 cette requête passait — la route ne regardait
            // aucune date, la limite ne vivait que dans le navigateur.
            await setHorizon(1, 1);
            return eq((await postFor(D(7))).status, 403, 'status');
        });

        await check('B2', 'règle A : deadline franchie → N+1 refusée, N+2 acceptée', async () => {
            // LA règle A, prouvée sur une vraie base et SANS vacuité possible : les deux
            // moitiés sont mesurées dans la même fenêtre, avec la même deadline forcée.
            // Vérifier seulement que N+2 passe ne prouverait rien si la deadline n'était
            // pas franchie — c'est le piège qui vient d'être corrigé sur §9.1.
            await setHorizon(3, 3);
            await setDeadline(DEADLINE_FRANCHIE);
            try {
                const proche = await postFor(D(1));
                const loin   = await postFor(D(7));
                eq(proche.status, 403, 'N+1');
                return eq(loin.status, 201, 'N+2');
            } finally {
                await setDeadline(DEADLINE_INITIALE);
            }
        });

        await check('B2', 'au-delà de l\'horizon, toujours refusé', async () =>
            eq((await postFor(D(28))).status, 403, 'status'));

        await check('B2', 'Y est écrêté sur X à l\'écriture', async () => {
            await setHorizon(2, 9);
            return eq((await readSettings()).validation_horizon_weeks, 2, 'Y');
        });

        await check('B2', 'pastille et file : même plage, même nombre', async () => {
            // L'asymétrie de S-04 sur l'axe du temps. Les deux bornes sortent du même
            // helper : si elles divergent, c'est que quelqu'un a recalculé la plage.
            const c    = (await req('pat', '/api/dispos/count')).data;
            const file = (await req('pat', `/api/dispos/pending?from=${c.from}&to=${c.to}`)).data;
            return eq(file.length, c.count, 'file=pastille') + ' sur ' + c.from + '→' + c.to;
        });

        await check('B2', 'la pastille suit Y', async () => {
            await setHorizon(3, 1);
            const court = (await req('pat', '/api/dispos/count')).data;
            await setHorizon(3, 3);
            const large = (await req('pat', '/api/dispos/count')).data;
            if (!(large.to > court.to))       throw new Error('la fenêtre ne s\'est pas élargie');
            if (large.count < court.count)    throw new Error('élargir la fenêtre a RÉDUIT le compte');
            return court.count + ' (Y=1) → ' + large.count + ' (Y=3)';
        });

        await check('B2', 'réouverture nominative : elle porte sa semaine', async () => {
            if (!bruno) throw new Error('Bruno introuvable dans le jeu de recette');
            const add = await req('pat', '/api/dispo-settings/force-open-staff', {
                method: 'PATCH', body: { staff_id: String(bruno._id), action: 'add' } });
            // Remise en état immédiate : une réouverture oubliée fausserait le §9.1
            // du lancement suivant (le staff ne serait plus refusé après deadline).
            await req('pat', '/api/dispo-settings/force-open-staff', {
                method: 'PATCH', body: { staff_id: String(bruno._id), action: 'remove' } });
            return eq(add.data && add.data.week_start, FROM, 'week_start');
        });

        await check('B2', 'réouverture : une semaine hors horizon est refusée', async () => {
            if (!bruno) throw new Error('Bruno introuvable dans le jeu de recette');
            return eq((await req('pat', '/api/dispo-settings/force-open-staff', { method: 'PATCH',
                body: { staff_id: String(bruno._id), action: 'add', week_start: D(70) } })).status, 400, 'status');
        });

        await setHorizon(initial.horizon_weeks || 1, initial.validation_horizon_weeks || 1);
    }

    // ── F-12 : journal d'audit des dispos ────────────────────────────────────
    //
    // Contre un vrai Mongo, et pas seulement en `fake-db` : l'index TTL n'existe que là,
    // et c'est lui qui EST la politique de conservation annoncée dans la politique de
    // confidentialité. Un journal sans TTL, c'est de la donnée salarié sans base légale.
    {
        const evFrom = D(0), evTo = D(6);
        const events = async () => (await req('pat', `/api/dispos/events?from=${evFrom}&to=${evTo}`)).data;

        // ⚠️ Ce bloc est AUTOPORTANT : il provoque lui-même les changements qu'il observe.
        // Première écriture, il s'appuyait sur la dispo postée par le §9.1 — et tombait
        // au premier lancement, parce que si cette dispo existait DÉJÀ à l'identique le
        // journal n'écrit (à juste titre) rien. Même piège que la deadline du §9.1 :
        // une vérification qui dépend de l'état ambiant ne prouve rien de reproductible.
        // Deux valeurs distinctes A et B : passer de l'une à l'autre change forcément
        // quelque chose, quel que soit l'état de départ.
        const posteDir = (h1, h2) => req('dir', '/api/dispos', { method: 'POST', body: {
            dispos: [{ date: D(0), type: 'soir', start_time: h1, end_time: h2 }] } });

        await check('F-12', 'modifier une dispo laisse une trace', async () => {
            await posteDir(17, 24);                       // état A (quel qu'ait été l'avant)
            const avant = (await events()).length;
            await posteDir(19, 25);                       // état B ≠ A ⇒ vrai changement
            const apres = (await events()).length;
            if (apres <= avant) throw new Error('aucune trace pour une vraie modification');
            return avant + ' → ' + apres;
        });

        await check('F-12', 'chaque événement porte qui · quoi · quand', async () => {
            const ev = await events();
            const e  = ev[ev.length - 1];
            if (!e) throw new Error('journal vide');
            for (const champ of ['staff_id', 'date', 'at', 'by', 'action'])
                if (e[champ] === undefined) throw new Error('champ manquant : ' + champ);
            if (!e.before || !e.after) throw new Error('delta absent');
            return e.action + ' par ' + (e.by.role || '?');
        });

        await check('F-12', 'ré-enregistrer À L\'IDENTIQUE n\'ajoute rien', async () => {
            // La propriété qui garde le journal lisible : sans elle, chaque clic sur
            // « Mettre à jour » ajouterait 7 lignes « rien n'a changé ».
            const avant = (await events()).length;
            await posteDir(19, 25);                       // on est déjà en B
            const apres = (await events()).length;
            return eq(apres, avant, 'événements');
        });

        await check('F-12', 'le staff n\'accède pas au journal', async () =>
            eq((await req('bru', `/api/dispos/events?from=${evFrom}&to=${evTo}`)).status, 403, 'status'));

        await check('F-12', 'la plage est respectée', async () => {
            const r = await req('pat', '/api/dispos/events?from=2020-01-01&to=2020-01-31');
            return eq(Array.isArray(r.data) ? r.data.length : -1, 0, 'événements hors plage');
        });
    }

    // ── E-22s : la semaine-type, ouverte à TOUT le staff (2026-08-24) ────────
    //
    // Ce que ce bloc peut prouver en HTTP, et ce qu'il ne peut pas. La matérialisation
    // est déclenchée par un `setInterval` (et au démarrage), JAMAIS par une route : rien
    // à appeler d'ici pour la provoquer. Le bloc se coupe donc en deux.
    //   · Les GARDES autour du modèle : autoportantes, elles imposent leur propre
    //     deadline comme le §9.1 et restaurent tout en sortant.
    //   · Le RÉSULTAT de l'envoi automatique : il dépend du jeu semé PUIS d'un
    //     redémarrage de l'instance. Sauté (⊘) et non compté en échec si le cron n'a pas
    //     encore eu son tour — un ✗ enverrait chercher un bug de code là où il n'y a
    //     qu'un cron qui n'est pas passé.
    {
        const tpl    = who => req(who, '/api/me/dispo-template');
        const putTpl = (who, days) => req(who, '/api/me/dispo-template', { method: 'PUT', body: { days } });
        const MODELE = { 0: { type: 'soir', start_time: 18, end_time: 26 },
                         4: { type: 'midi', start_time: 11, end_time: 17 } };

        // L'ouverture elle-même. Avant le 2026-08-24 ces routes étaient `requireDirecteur` :
        // Bruno recevait 403. C'est la vérification qui garde la fonctionnalité en vie.
        await check('E-22s', 'un staff ordinaire lit sa semaine-type (403 avant)', async () =>
            eq((await tpl('bru')).status, 200, 'status'));

        await check('E-22s', 'aller-retour : ce qui est enregistré est relu', async () => {
            await putTpl('ali', MODELE);
            const d = (await tpl('ali')).data.days || {};
            if (!d[0] || !d[4]) throw new Error('jours perdus : [' + Object.keys(d).join(',') + ']');
            return eq(d[0].type + ' ' + Number(d[0].start_time), 'soir 18', 'lundi');
        });

        // Le chemin legacy sert les onglets déjà ouverts et les PWA dont le service worker
        // n'a pas repris le nouveau JS. Même handler : on vérifie qu'il le reste.
        await check('E-22s', 'le chemin legacy rend le même modèle', async () => {
            const a = (await req('ali', '/api/me/dispo-template')).data.days;
            const b = (await req('ali', '/api/me/manager-dispo-template')).data.days;
            return eq(JSON.stringify(b), JSON.stringify(a), 'days');
        });

        // La garde du 2026-08-24 : un modèle enregistré APRÈS la deadline ne rattrape pas
        // la semaine déjà figée. Elle vaut d'être vérifiée sur un vrai serveur parce
        // qu'elle dépend de `computeEffectiveDeadline` évaluée à l'heure de L'INSTANCE.
        // Paire discriminante : même deadline, deux staff. Bruno la subit, Alice en est
        // exemptée (rouverte nominativement par le seed). Sans le second, un marqueur posé
        // systématiquement — donc une fonctionnalité morte — passerait au vert.
        // La contre-épreuve repose ENTIÈREMENT sur une fixture : Alice doit être inscrite
        // dans `force_open_staff`, ce que le seed ne fait que depuis le 2026-08-25. Sur une base
        // semée avant, elle n'y est pas — et la vérification tombait en annonçant « marqueur
        // posé alors que la deadline ne s'applique pas à Alice », c'est-à-dire en accusant le
        // code d'un défaut de DONNÉES. Exactement le scénario du 2026-08-10 que `stale` existe
        // pour empêcher. On lit donc la fixture avant de s'appuyer dessus.
        {
            const reglages = (await req('pat', '/api/dispo-settings')).data || {};
            const alice    = ((await req('pat', '/api/staff')).data || []).find(s => /Alice/i.test(s.name || ''));
            const liste    = reglages.force_open_staff || [];
            const inscrite = liste.some(e =>
                (typeof e === 'string' ? e : (e && e.staff_id)) === String(alice && alice._id));
            if (!inscrite) {
                stale.aliceRouverte = 'Alice n\'est pas rouverte nominativement — jeu de recette '
                    + 'antérieur au 2026-08-25 (remède : `npm run dev:seed`)';
                console.log('⚠️  ' + stale.aliceRouverte);
                // Les deux valeurs côte à côte, parce qu'elles distinguent trois causes qui
                // se ressemblent : liste VIDE (fixture absente), liste avec une AUTRE forme
                // ou un AUTRE id (appariement staff/compte cassé), ou `[null]` (le seed a
                // inséré un `ctx.staff.Alice` non résolu). Sans elles on relance à l'aveugle.
                console.log('    force_open_staff = ' + JSON.stringify(liste));
                console.log('    staff._id d\'Alice = ' + String(alice && alice._id) + '\n');
            }
        }

        await setDeadline(DEADLINE_FRANCHIE);
        await check('E-22s', 'enregistré après la deadline : la semaine figée n\'est pas rattrapée', async () => {
            await putTpl('bru', MODELE);
            return eq((await tpl('bru')).data.last_materialized_week, FROM, 'marqueur');
        });
        await check('E-22s', 'le staff rouvert nominativement n\'est PAS neutralisé', async () => {
            // ⚠️ Le marqueur est PERSISTANT : le lire après le PUT ne dit pas QUI l'a posé.
            // L'aller-retour plus haut a déjà fait un PUT d'Alice, sous la deadline du jeu
            // (toujours dépassée) — s'il l'avait posé, cette vérification échouerait sans
            // que le PUT d'ici y soit pour rien. On sépare donc les deux cas.
            const avant = (await tpl('ali')).data.last_materialized_week;
            if (avant === FROM) throw new Error('marqueur DÉJÀ posé avant ce PUT — '
                + 'il vient de l\'aller-retour plus haut : Alice n\'était pas exemptée dès le départ');
            await putTpl('ali', MODELE);
            const m = (await tpl('ali')).data.last_materialized_week;
            if (m === FROM) {
                // Deux causes possibles se ressemblent à l'écran : soit le PUT pose le
                // marqueur à tort (défaut du code), soit l'appariement session ↔
                // `force_open_staff` ne prend pas (l'exemption n'existe pas côté serveur).
                // On demande donc au serveur ce qu'il en pense, sinon le message envoie
                // chercher au mauvais endroit — même piège que les `stale`.
                const vu = (await req('ali', '/api/dispo-settings')).data || {};
                throw new Error('marqueur posé — le serveur annonce deadlineWaived='
                    + vu.deadlineWaived + ' (attendu true)');
            }
            return 'marqueur ' + (m || 'absent');
        }, 'aliceRouverte');
        await setDeadline(DEADLINE_INITIALE);

        // Remise en état, et elle n'est pas cosmétique : le jeu ne sème aucun modèle pour
        // ces deux-là, et la deadline de recette est TOUJOURS dépassée — les laisser ferait
        // matérialiser des dispos d'Alice au prochain tour du cron, et le lancement suivant
        // compterait une file que personne n'a semée.
        await check('E-22s', 'remise en état : modèles de test retirés', async () => {
            await putTpl('ali', {});
            await putTpl('bru', {});
            const a = Object.keys((await tpl('ali')).data.days || {}).length;
            const b = Object.keys((await tpl('bru')).data.days || {}).length;
            return eq(a + b, 0, 'jours restants');
        });

        // L'envoi automatique tel que le jeu le met en scène : Chloé a un modèle sur
        // lundi / mercredi / jeudi / vendredi, une dispo DÉJÀ saisie le mercredi et un
        // congé VALIDÉ le jeudi. Deux des quatre jours doivent arriver, pas les autres.
        const file  = (await req('pat', `/api/dispos/pending?from=${FROM}&to=${TO}`)).data || [];
        const chloe = Object.fromEntries(file
            .filter(d => /Chlo/i.test(d.staff_name || ''))
            .map(d => [d.date, d]));
        if (!chloe[D(0)] && !chloe[D(4)]) {
            stale.semaineType = 'la semaine-type de Chloé n\'a pas été matérialisée '
                + '(cron non passé depuis le seed — redémarrer l\'instance, il tourne au démarrage)';
            console.log('⚠️  ' + stale.semaineType + '\n');
        }

        await check('E-22s', 'les jours du modèle arrivent dans la file', async () => {
            const l = chloe[D(0)], v = chloe[D(4)];
            if (!l || !v) throw new Error('lundi/vendredi absents de la file');
            return eq(l.type + '·' + v.type, 'midi·soir', 'types matérialisés');
        }, 'semaineType');

        // La quasi-régression du 2026-08-24 : sans la jointure `time_off`, un congé validé
        // se faisait recouvrir de dispos automatiques à CHAQUE deadline.
        await check('E-22s', 'le congé validé n\'est PAS recouvert', async () => {
            if (chloe[D(3)]) throw new Error('une dispo a été posée sur le jeudi de congé');
            return 'jeudi laissé libre';
        }, 'semaineType');

        await check('E-22s', 'création seule : la saisie manuelle n\'est pas écrasée', async () => {
            const m = chloe[D(2)];
            if (!m) throw new Error('la dispo semée du mercredi a disparu');
            // Semée en `custom` 14→22 quand le modèle porte `soir` 18→26 : si le modèle avait
            // écrasé, on lirait 18. Deux valeurs distinctes, sinon la vérification est vacante.
            return eq(Number(m.start_time), 14, 'mercredi start_time');
        }, 'semaineType');
    }

    // ── B2-b : un planning NON PUBLIÉ n'est pas lisible par le staff ─────────
    //
    // ⚠️ AUTOPORTANT, et il faut l'être ici plus qu'ailleurs : se contenter de demander
    // une semaine future et de constater « 0 shift » passerait au vert même si la garde
    // n'existait pas, simplement parce que le jeu de recette n'y place rien. Le bloc crée
    // donc son propre shift, vérifie qu'il est invisible, publie, vérifie qu'il apparaît,
    // puis efface et restaure la publication. C'est le piège rencontré deux fois
    // aujourd'hui (§9.1 et F-12), en version « faux positif ».
    {
        const WK   = D(7);              // lundi de N+2 — jamais auto-publiée
        const WKend = D(13);
        const pubOf = async () => (await req('pat', '/api/publish/' + WK)).data;
        const setPub = establishments =>
            req('pat', '/api/publish/' + WK, { method: 'PATCH', body: { establishments } });
        const vuParBruno = async () =>
            ((await req('bru', `/api/my-shifts?from=${WK}&to=${WKend}`)).data.shifts || []).length;

        const pubInitial = (await pubOf()).establishments;
        const bruno = ((await req('pat', '/api/staff')).data || []).find(s => /Bruno/i.test(s.name || ''));
        let shiftId = null;

        await check('B2-b', 'semaine future NON publiée : le staff ne voit rien', async () => {
            if (!bruno) throw new Error('Bruno introuvable dans le jeu de recette');
            await setPub([]);                                  // garantir non publiée
            const created = await req('pat', '/api/shifts', { method: 'POST', body: {
                staff_id: String(bruno._id), staff_name: bruno.name,
                establishment_id: 'Josy_pub', date: D(9), start_time: 18, end_time: 24 } });
            shiftId = created.data && created.data._id;
            if (!shiftId) throw new Error('shift non créé : ' + JSON.stringify(created.data));
            return eq(await vuParBruno(), 0, 'shifts visibles');
        });

        await check('B2-b', 'une fois publiée, le staff la voit', async () => {
            // La moitié qui rend la précédente non vacante : le shift EXISTE, seule la
            // publication change entre les deux mesures.
            await setPub('ALL');
            return eq(await vuParBruno(), 1, 'shifts visibles');
        });

        await check('B2-b', 'la semaine publiée entre dans la navigation du staff', async () => {
            const weeks = (await req('bru', '/api/my-published-weeks?weeks=4')).data;
            if (!Array.isArray(weeks)) throw new Error('réponse inattendue : ' + JSON.stringify(weeks));
            if (!weeks.includes(WK)) throw new Error(WK + ' absent de ' + JSON.stringify(weeks));
            return weeks.length + ' semaine(s) ouvrable(s)';
        });

        await check('B2-b', 'dépubliée, elle sort de la navigation', async () => {
            await setPub([]);
            const weeks = (await req('bru', '/api/my-published-weeks?weeks=4')).data;
            return eq((weeks || []).includes(WK), false, 'encore listée');
        });

        // Remise en état : le shift créé ici n'a rien à faire dans le jeu de recette,
        // et la publication doit retrouver la valeur trouvée en arrivant.
        if (shiftId) await req('pat', '/api/shifts/' + shiftId, { method: 'DELETE' });
        await setPub(pubInitial === undefined ? [] : pubInitial);
    }

    // ── Congés (F-10) ────────────────────────────────────────────────────────
    await check('F-10', 'congés en attente visibles du patron', async () => {
        const r = await req('pat', `/api/conges?from=${FROM}&to=${D(30)}`);
        if (r.status !== 200) throw new Error('status ' + r.status);
        return (Array.isArray(r.data) ? r.data.length : '?') + ' congés';
    });

    // ── S-06 : périmètre sur les routes de lecture ───────────────────────────
    await check('S-06', 'directeur : planning de SON bar', async () =>
        eq((await req('dir', `/api/week-full/Josy_pub?from=${FROM}&to=${TO}`)).status, 200, 'status'));
    await check('S-06', 'directeur : planning d\'un autre bar refusé', async () =>
        eq((await req('dir', `/api/week-full/Poni_restaurant?from=${FROM}&to=${TO}`)).status, 403, 'status'));
    await check('S-06', 'staff : ne lit plus les shifts d\'un bar', async () =>
        eq((await req('bru', `/api/shifts/Josy_pub/${FROM}`)).status, 403, 'status'));
    await check('S-06', 'récap sans bar : directeur scopé, patron global', async () => {
        const [d, p] = await Promise.all([
            req('dir', '/api/recap-mensuel?month=' + FROM.slice(0, 7)),
            req('pat', '/api/recap-mensuel?month=' + FROM.slice(0, 7)),
        ]);
        if (d.status !== 200 || p.status !== 200) throw new Error(`status ${d.status}/${p.status}`);
        const bars = r => new Set((r.data || []).flatMap(x => (x.by_establishment || []).map(e => e.establishment_id)));
        const bd = bars(d), bp = bars(p);
        if (bd.size && [...bd].some(b => b !== 'Josy_pub'))
            throw new Error('le directeur voit ' + [...bd].join(','));
        return 'dir=[' + [...bd].join(',') + '] patron=[' + [...bp].join(',') + ']';
    });

    // ── S-05 : confirmer = affecter à un bar (test NÉGATIF, n'écrit rien) ─────
    await check('S-05', 'directeur : confirmation vers un autre bar refusée', async () => {
        const pending = (await req('dir', `/api/dispos/pending?from=${FROM}&to=${TO}`)).data;
        if (!pending.length) return 'aucune dispo en attente — non testé';
        const res = await req('dir', `/api/dispos/${pending[0]._id}/confirm`, {
            method: 'PATCH', body: { establishment_id: 'Poni_restaurant', create_shift: true },
        });
        return eq(res.status, 403, 'status');
    });

    // ── E-03 : le responsable de soirée doit garder l'accès au pointage ──────
    // Le correctif le plus important du lot : `GET /api/pointage/:date` avait été passé
    // sous un contrôle de périmètre qui refuse un compte `staff` — le responsable n'aurait
    // plus vu aucun shift à pointer. Vérifié ici sur l'instance réelle, pas seulement en test.
    await check('E-03', 'responsable de soirée : accède au pointage de SA soirée', async () =>
        eq((await req('ali', `/api/pointage/${SOIREE}?establishment_id=Josy_pub`)).status, 200, 'status'), 'soiree');
    await check('E-03', 'staff non désigné : pointage refusé', async () =>
        eq((await req('bru', `/api/pointage/${SOIREE}?establishment_id=Josy_pub`)).status, 403, 'status'), 'soiree');
    await check('E-03', "responsable : pas d'accès à un bar où il n'est pas désigné", async () =>
        eq((await req('ali', `/api/pointage/${SOIREE}?establishment_id=Poni_restaurant`)).status, 403, 'status'), 'soiree');

    // ── F-13 : archiver sort de la vie courante SANS toucher au passé ────────
    //
    // Placé après tout ce qui utilise `bru` : archiver Bruno tue sa session (même
    // mécanisme que R-17). Chaque étape est un `check` indépendant, et la remise en
    // état en est un aussi — si une vérification casse, le désarchivage a quand même
    // lieu et la base de recette ne reste pas avec un staff archivé.
    // Les étapes suivantes dépendent de celle-ci. Le fichier a déjà le dispositif pour
    // ça (`stale`/`needs`) : sans lui, un seed sans Bruno produisait quatre ✗ en cascade
    // et on serait allé chercher un bug de F-13 là où il n'y a qu'une base désalignée —
    // exactement ce que le commentaire de `stale` dit vouloir éviter.
    let brunoId = null;
    await check('F-13', 'archiver un staff', async () => {
        const staff = (await req('pat', '/api/staff')).data;
        const b = Array.isArray(staff) && staff.find(s => /Bruno/i.test(s.name || ''));
        if (!b) { stale.bruno = 'Bruno introuvable dans le jeu de recette'; throw new Error(stale.bruno); }
        brunoId = b._id;
        return eq((await req('pat', `/api/staff/${brunoId}/archive`, { method: 'PATCH', body: { archived: true } })).status, 200, 'status');
    });

    // La moitié qu'on oublie facilement : archiver n'est pas supprimer. Si le nom
    // disparaissait de /api/staff, les récaps et plannings passés perdraient leur
    // libellé — c'est exactement ce que l'archivage promet d'éviter.
    await check('F-13', 'l\'archivé reste dans /api/staff, avec son drapeau', async () => {
        const doc = (await req('pat', '/api/staff')).data.find(s => s._id === brunoId);
        if (!doc) throw new Error('l\'archivé a DISPARU de /api/staff — son historique perdrait son nom');
        return eq(doc.archived, true, 'archived');
    }, 'bruno');

    await check('F-13', 'l\'archivé sort de la liste « sans dispo »', async () => {
        const list = (await req('pat', `/api/dispos/sans-dispo?from=${FROM}&to=${TO}`)).data;
        const encore = Array.isArray(list) && list.some(s => String(s._id) === String(brunoId));
        if (encore) throw new Error('encore relancé alors qu\'il est archivé');
        return 'absent de la relance';
    }, 'bruno');

    await check('F-13', 'on ne peut plus le planifier', async () => {
        const r = await req('pat', '/api/shifts', { method: 'POST', body: {
            staff_id: brunoId, staff_name: 'Bruno', establishment_id: 'Josy_pub',
            date: D(3), start_time: 18, end_time: 23,
        } });
        // Si le garde-fou a sauté, ne pas laisser le créneau derrière soi.
        if (r.status === 201 && r.data && r.data._id) await req('pat', `/api/shifts/${r.data._id}`, { method: 'DELETE' });
        return eq(r.status, 409, 'status');
    }, 'bruno');

    await check('F-13', 'réactiver rend tout (remise en état)', async () => {
        const r = await req('pat', `/api/staff/${brunoId}/archive`, { method: 'PATCH', body: { archived: false } });
        const doc = (await req('pat', '/api/staff')).data.find(s => s._id === brunoId);
        if (doc && doc.archived) throw new Error('drapeau toujours posé après réactivation');
        return eq(r.status, 200, 'status');
    }, 'bruno');

    // ── R-06 + R-17 : réaffectation du directeur — EN DERNIER, et ce n'est pas ──
    //    un détail de mise en page.
    //
    // Depuis R-17, `PATCH /api/users/:id/establishments` SUPPRIME les sessions de
    // l'utilisateur touché. Ce bloc réaffecte le directeur : il tue donc la session
    // `dir` que ce script a ouverte au démarrage. Tant qu'il tournait au milieu, tout
    // ce qui suivait et utilisait `dir` partait en 401 — trois vérifications S-06 en
    // échec le 2026-08-10, pour un correctif qui marchait parfaitement.
    //
    // Le remettre en fin de script coûte zéro reconnexion — ce qui compte, car le
    // limiteur autorise 10 tentatives / 15 min / IP et ce script en consomme déjà 5 :
    // une 6e interdirait deux lancements rapprochés.
    await check('R-06', 'réaffecter le directeur propage sur staff.venues', async () => {
        const users = (await req('pat', '/api/users')).data;
        const dir = users.find(u => u.role === 'directeur');
        if (!dir) throw new Error('compte directeur introuvable');
        const venues = async () => ((await req('pat', '/api/staff')).data.find(s => /Diane/.test(s.name)) || {}).venues;
        const before = await venues();
        await req('pat', `/api/users/${dir._id}/establishments`, { method: 'PATCH', body: { assigned_establishments: ['Poni_restaurant'] } });
        const after = await venues();
        await req('pat', `/api/users/${dir._id}/establishments`, { method: 'PATCH', body: { assigned_establishments: before } });
        if (JSON.stringify(after) !== JSON.stringify(['Poni_restaurant']))
            throw new Error('venues non resynchronisées : ' + JSON.stringify(after));
        return JSON.stringify(before) + ' → Poni → remis';
    });

    // Le dégât collatéral ci-dessus EST le comportement attendu de R-17 : on le vérifie
    // au lieu de le subir. Rien ne suit qui utilise `dir`, donc pas de reconnexion.
    await check('R-17', 'changer le périmètre coupe la session du directeur', async () =>
        eq((await req('dir', '/auth/me')).status, 401, 'status'));

    // ── Restitution ──────────────────────────────────────────────────────────
    let section = '';
    for (const [mark, sec, name, detail] of results) {
        if (sec !== section) { console.log('  ' + sec); section = sec; }
        console.log('    ' + mark + ' ' + name.padEnd(46) + (detail ? '· ' + detail : ''));
    }
    console.log('\n  ' + pass + ' OK · ' + fail + ' échec(s)'
        + (skip ? ' · ' + skip + ' sauté(s) — jeu de recette désaligné, cf. `npm run dev:seed`' : '') + '\n');
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('❌ ' + e.message); process.exit(1); });
