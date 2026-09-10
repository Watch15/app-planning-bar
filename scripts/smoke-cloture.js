'use strict';
// Smoke ciblé — clôture de service par code OTP.
//
// Parcourt le flux réel sur une instance qui tourne + une base de RECETTE
// (comptes @templyo.test du seed). N'écrit jamais chez un client : login seed
// obligatoire, sinon arrêt immédiat.
//
// Prérequis :
//   1. Base seedée :  npm run dev:seed
//   2. Serveur recette : npm run dev:server   (ou instance déjà déployée)
//
// Lancer :
//   npm run smoke:cloture                 → http://localhost:3000
//   npm run smoke:cloture:dev             → https://dev.templyo.fr
//   node scripts/smoke-cloture.js http://localhost:3000
//
// Mot de passe seed : SEED_PASSWORD ou Templyo2026!

const BASE = (process.argv[2] || process.env.SMOKE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const PWD  = process.env.SEED_PASSWORD || 'Templyo2026!';
const ESTAB = 'Josy_pub';

const { weekStart, toDateStr } = require('../lib/utils');

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

let pass = 0, fail = 0;
const results = [];

async function check(name, fn) {
    try {
        const detail = await fn();
        pass++;
        results.push(['✓', name, detail || '']);
    } catch (e) {
        fail++;
        results.push(['✗', name, e.message]);
    }
}
function eq(a, b, label) {
    if (a !== b) throw new Error(`${label} : attendu ${b}, obtenu ${a}`);
    return `${label}=${a}`;
}
function ok(cond, msg) {
    if (!cond) throw new Error(msg);
}

function todayStr() {
    return toDateStr(new Date());
}

function mondayStr() {
    return toDateStr(weekStart(new Date()));
}

async function main() {
    console.log('\n🔥 Smoke clôture OTP → ' + BASE + '\n');

    // Santé — GET /health (comme scripts/smoke.js), pas /api/health
    let health;
    try {
        health = await fetch(BASE + '/health').then(r => r.json());
    } catch (e) {
        console.error('❌ Instance injoignable : ' + e.message);
        console.error('   Démarre `npm run dev:server` ou passe l\'URL en argument.\n');
        process.exit(1);
    }
    if (health && health.commit) {
        console.log('ℹ️  commit déployé : ' + String(health.commit).slice(0, 8) + '\n');
    }

    // Login seed — garde-fou client
    const logins = [
        ['pat', 'patron@templyo.test'],
        ['ali', 'alice@templyo.test'],
        ['obs', 'observateur@templyo.test'],
        ['bru', 'bruno@templyo.test'],
    ];
    for (const [who, email] of logins) {
        const r = await login(who, email);
        if (r.status !== 200) {
            console.error('❌ Login ' + email + ' échoué (' + r.status + ').');
            console.error('   Ce smoke exige le jeu de recette (@templyo.test).');
            console.error('   Remède : npm run dev:seed  puis  npm run dev:server\n');
            process.exit(1);
        }
    }
    console.log('✓ connexions seed OK (patron, alice, observateur, bruno)\n');

    const meAli = (await req('ali', '/auth/me')).data.user;
    const aliceStaffId = meAli.staff_id;
    ok(aliceStaffId, 'Alice doit avoir un staff_id');

    let shiftId = null;
    let code = null;

    // ── 1. Observateur bloqué ────────────────────────────────────────────────
    await check('observateur : GET code refusé', async () => {
        const r = await req('obs', '/api/etablissements/' + ESTAB + '/code-cloture');
        return eq(r.status, 403, 'status');
    });

    // ── 2. Patron lit / régénère le code ──────────────────────────────────────
    await check('patron : GET code-cloture', async () => {
        const r = await req('pat', '/api/etablissements/' + ESTAB + '/code-cloture');
        eq(r.status, 200, 'status');
        ok(/^\d{4}$/.test(r.data.code), 'code 4 chiffres, obtenu ' + r.data.code);
        ok(r.data.expire_ms > Date.now(), 'expire_ms dans le futur');
        code = r.data.code;
        return 'code=' + code + ' expire_ms=' + r.data.expire_ms;
    });

    // ── 3. Shift Alice aujourd'hui (réutilise le seed si présent, sinon crée) ─
    await check('shift Alice aujourd\'hui prêt à pointer', async () => {
        const list = await req('pat', '/api/shifts/' + ESTAB + '/' + todayStr());
        eq(list.status, 200, 'status liste');
        const open = (list.data || []).find(s =>
            String(s.staff_id) === String(aliceStaffId)
            && !s.heure_validee_code
            && !s.debut_valide_code
            && !s.is_joker
        );
        if (open) {
            shiftId = String(open._id);
            return 'réutilisé seed shift=' + shiftId;
        }
        const r = await req('pat', '/api/shifts', {
            method: 'POST',
            body: {
                establishment_id: ESTAB,
                staff_id: aliceStaffId,
                staff_name: 'Alice',
                date: todayStr(),
                start_time: 10,
                end_time: 14,
                color: '#3498db',
            },
        });
        ok(r.status === 201 || r.status === 200, 'status ' + r.status + ' ' + JSON.stringify(r.data));
        shiftId = String(r.data._id);
        ok(shiftId && shiftId.length >= 10, 'shift _id manquant');
        return 'créé shift=' + shiftId + ' date=' + todayStr();
    });

    // ── 4. Bruno ne peut pas pointer le shift d'Alice ─────────────────────────
    await check('bruno : début shift Alice refusé', async () => {
        if (!shiftId || !code) throw new Error('prérequis manquant');
        const r = await req('bru', '/api/shifts/' + shiftId + '/cloturer-par-code', {
            method: 'POST', body: { code, phase: 'debut' },
        });
        return eq(r.status, 403, 'status');
    });

    await check('alice : fin sans début refusée', async () => {
        if (!shiftId || !code) throw new Error('prérequis manquant');
        const r = await req('ali', '/api/shifts/' + shiftId + '/cloturer-par-code', {
            method: 'POST', body: { code, phase: 'fin' },
        });
        return eq(r.status, 409, 'status');
    });

    // ── 5. Alice pointe le début ─────────────────────────────────────────────
    await check('alice : début par code accepté', async () => {
        if (!shiftId || !code) throw new Error('prérequis manquant');
        const r = await req('ali', '/api/shifts/' + shiftId + '/cloturer-par-code', {
            method: 'POST', body: { code, phase: 'debut' },
        });
        eq(r.status, 200, 'status');
        ok(/^\d{2}:\d{2}$/.test(r.data.debut_valide_code), 'debut_valide_code');
        eq(r.data.debut_valide_code, r.data.debut_valide_finale, 'origine=finale début');
        return 'debut=' + r.data.debut_valide_finale;
    });

    let codeFin = null;
    await check('patron : code pour la fin', async () => {
        const r = await req('pat', '/api/etablissements/' + ESTAB + '/code-cloture');
        eq(r.status, 200, 'status');
        ok(r.data.code !== code, 'code régénéré après début');
        codeFin = r.data.code;
        return 'codeFin=' + codeFin;
    });

    await check('alice : fin par code acceptée', async () => {
        if (!shiftId || !codeFin) throw new Error('prérequis manquant');
        const r = await req('ali', '/api/shifts/' + shiftId + '/cloturer-par-code', {
            method: 'POST', body: { code: codeFin, phase: 'fin' },
        });
        eq(r.status, 200, 'status');
        ok(/^\d{2}:\d{2}$/.test(r.data.heure_validee_code), 'heure_validee_code');
        eq(r.data.heure_validee_code, r.data.heure_validee_finale, 'origine=finale fin');
        ok(typeof r.data.real_end === 'number', 'real_end syncé');
        ok(typeof r.data.real_start === 'number', 'real_start syncé');
        return 'fin=' + r.data.heure_validee_finale + ' real_end=' + r.data.real_end;
    });

    // ── 5b. real_* visibles via clotures-semaine ─────────────────────────────
    await check('Alice : real_end présent après fin (clotures-semaine)', async () => {
        if (!shiftId) throw new Error('prérequis manquant');
        const r = await req('pat',
            '/api/etablissements/' + ESTAB + '/clotures-semaine?week_start=' + mondayStr());
        eq(r.status, 200, 'status');
        const row = (r.data || []).find(s => String(s._id) === shiftId);
        ok(row, 'shift trouvé');
        ok(typeof row.real_end === 'number', 'real_end');
        ok(typeof row.real_start === 'number', 'real_start');
        return 'real=' + row.real_start + '–' + row.real_end;
    });

    // ── 6. Réutilisation du code de début → refus ────────────────────────────
    await check('réutilisation du code début → déjà utilisé / invalide', async () => {
        // Ne pas chevaucher le seed « semaine courante » : le jeudi Bruno est déjà
        // sur Poni 12–20 → un 10–13 à Josy tombe en 409 « Double shift ».
        const create = await req('pat', '/api/shifts', {
            method: 'POST',
            body: {
                establishment_id: ESTAB,
                staff_id: (await req('bru', '/auth/me')).data.user.staff_id,
                staff_name: 'Bruno',
                date: todayStr(),
                start_time: 8,
                end_time: 11,
                color: '#9b59b6',
            },
        });
        ok(create.status === 201 || create.status === 200,
            'création shift Bruno · status=' + create.status + ' ' + JSON.stringify(create.data));
        const sid2 = String(create.data._id);
        const r = await req('bru', '/api/shifts/' + sid2 + '/cloturer-par-code', {
            method: 'POST', body: { code, phase: 'debut' },
        });
        eq(r.status, 400, 'status');
        ok(r.data.resultat && String(r.data.resultat).startsWith('refuse_'),
            'resultat refuse_*, obtenu ' + r.data.resultat);
        await req('pat', '/api/shifts/' + sid2 + '/cloturer-manuel', {
            method: 'POST', body: { phase: 'fin', heure: '23:00', heure_debut: '18:00' },
        });
        return r.data.resultat;
    });

    // ── 7. Nouveau code après usage fin ──────────────────────────────────────
    await check('patron : nouveau code après fin', async () => {
        const r = await req('pat', '/api/etablissements/' + ESTAB + '/code-cloture');
        eq(r.status, 200, 'status');
        ok(r.data.code !== codeFin, 'code régénéré (était ' + codeFin + ', obtenu ' + r.data.code + ')');
        return 'nouveau=' + r.data.code;
    });

    // ── 8. Ajustement patron sans toucher l'origine ──────────────────────────
    let origine = null;
    await check('patron : ajuster-heure conserve l\'origine', async () => {
        if (!shiftId) throw new Error('prérequis manquant');
        const before = await req('pat',
            '/api/etablissements/' + ESTAB + '/clotures-semaine?week_start=' + mondayStr());
        eq(before.status, 200, 'status liste');
        const row = (before.data || []).find(s => String(s._id) === shiftId);
        ok(row, 'shift dans clotures-semaine');
        ok(row.debut_valide_code, 'debut_valide_code exposé');
        origine = row.heure_validee_code;

        const r = await req('pat', '/api/shifts/' + shiftId + '/ajuster-heure', {
            method: 'PATCH',
            body: { heure_validee_finale: '23:45', motif: 'smoke-cloture' },
        });
        eq(r.status, 200, 'status');
        eq(r.data.heure_validee_code, origine, 'origine intacte');
        eq(r.data.heure_validee_finale, '23:45', 'finale');
        return 'origine=' + origine + ' finale=23:45';
    });

    // ── 9. Valider le récap semaine ───────────────────────────────────────────
    await check('patron : valider-recap semaine', async () => {
        const r = await req('pat', '/api/etablissements/' + ESTAB + '/valider-recap', {
            method: 'POST',
            body: { week_start: mondayStr() },
        });
        eq(r.status, 200, 'status');
        ok((r.data.modified || 0) >= 1, 'au moins 1 shift validé');
        return 'modified=' + r.data.modified;
    });

    // ── 10. Ajustement encore possible après validation ──────────────────────
    await check('ajustement OK après validation récap', async () => {
        const r = await req('pat', '/api/shifts/' + shiftId + '/ajuster-heure', {
            method: 'PATCH',
            body: { heure_validee_finale: '22:00', motif: 'smoke correction post-récap' },
        });
        eq(r.status, 200, 'status');
        eq(r.data.heure_validee_finale, '22:00', 'finale');
        return 'corrigé après récap';
    });

    // ── 11. Clôture manuelle forcée (début+fin) ───────────────────────────────
    await check('patron : clôture manuelle forcée début+fin', async () => {
        const create = await req('pat', '/api/shifts', {
            method: 'POST',
            body: {
                establishment_id: ESTAB,
                staff_id: aliceStaffId,
                staff_name: 'Alice',
                date: todayStr(),
                start_time: 14,
                end_time: 16,
                color: '#3498db',
            },
        });
        ok(create.status === 201 || create.status === 200, 'création');
        const sid = String(create.data._id);
        const r = await req('pat', '/api/shifts/' + sid + '/cloturer-manuel', {
            method: 'POST', body: { phase: 'fin', heure: '16:05', heure_debut: '14:00' },
        });
        eq(r.status, 200, 'status');
        eq(r.data.heure_validee_finale, '16:05', 'heure');
        return 'manuel=' + sid;
    });

    // Rapport
    console.log('\n── Résultats ──────────────────────────────────────');
    for (const [mark, name, detail] of results) {
        console.log('  ' + mark + '  ' + name + (detail ? '  ·  ' + detail : ''));
    }
    console.log('\n  ' + pass + ' ✓   ' + fail + ' ✗\n');

    if (fail) {
        console.error('Smoke clôture ÉCHOUÉ. Vérifie que le serveur porte le code OTP et que la base est seedée.\n');
        process.exit(1);
    }
    console.log('Smoke clôture OK.\n');
    console.log('Check-list manuelle (UI) :');
    console.log('  1. patron@ → Pointage → widget code + liste début/fin');
    console.log('  2. alice@  → bannière « Pointer mon arrivée » puis « Clôturer mon service »');
    console.log('  3. Après début et après fin, le code régénère\n');
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
