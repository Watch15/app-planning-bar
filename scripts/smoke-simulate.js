'use strict';
// Smoke ciblé — onglet Simulation Performance (prévisions CA / masse).
//
// Parcourt le flux réel sur une instance qui tourne + base de RECETTE
// (@templyo.test). N'écrit JAMAIS de CA réel (`daily_revenue` inchangé).
//
// Prérequis : npm run dev:seed  +  serveur recette
//
//   npm run smoke:simulate              → http://localhost:3000
//   npm run smoke:simulate:dev          → https://dev.templyo.fr
//   node scripts/smoke-simulate.js http://localhost:3000

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

function mondayOf(offsetWeeks) {
    const mon = weekStart(new Date());
    mon.setDate(mon.getDate() + offsetWeeks * 7);
    return mon;
}
function rangeFromMonday(mon) {
    const from = toDateStr(mon);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from, to: toDateStr(sun) };
}

async function main() {
    console.log('\n📊 Smoke simulation / prévisions → ' + BASE + '\n');

    let health;
    try {
        health = await fetch(BASE + '/health').then(r => r.json());
    } catch (e) {
        console.error('❌ Instance injoignable : ' + e.message);
        process.exit(1);
    }
    if (health && health.commit) {
        console.log('ℹ️  commit déployé : ' + String(health.commit).slice(0, 8) + '\n');
    }

    for (const [who, email] of [
        ['pat', 'patron@templyo.test'],
        ['ali', 'alice@templyo.test'],
        ['bru', 'bruno@templyo.test'],
    ]) {
        const r = await login(who, email);
        if (r.status !== 200) {
            console.error('❌ Login ' + email + ' échoué (' + r.status + ').');
            console.error('   Remède : npm run dev:seed puis serveur recette.\n');
            process.exit(1);
        }
    }
    console.log('✓ connexions seed OK (patron, alice, bruno)\n');

    const last = rangeFromMonday(mondayOf(-1));
    const curr = rangeFromMonday(mondayOf(0));
    const lastTue = (() => {
        const d = mondayOf(-1);
        d.setDate(d.getDate() + 1);
        return toDateStr(d);
    })();
    const currMon = curr.from;

    await check('staff : simulate refusé', async () => {
        const r = await req('ali', '/api/performance/simulate', {
            method: 'POST',
            body: {
                establishment_id: ESTAB,
                from: curr.from, to: curr.to,
                joker_mode: 'manual_hourly', joker_hourly: 14,
            },
        });
        return eq(r.status, 403, 'status');
    });

    await check('semaine passée : masse réelle > 0 (hybride seed)', async () => {
        const r = await req('pat', '/api/performance/simulate', {
            method: 'POST',
            body: {
                establishment_id: ESTAB,
                from: last.from, to: last.to,
                joker_mode: 'manual_hourly',
                joker_hourly: 14,
            },
        });
        eq(r.status, 200, 'status');
        ok(r.data.totals, 'totals');
        ok(r.data.totals.wage_real_gross > 0, 'wage_real_gross attendu > 0, obtenu ' + r.data.totals.wage_real_gross);
        const day = (r.data.days || []).find(d => d.date === lastTue);
        ok(day, 'mardi seedé présent');
        eq(day.revenue_source, 'real', 'revenue_source');
        return 'wage_real=' + r.data.totals.wage_real_gross + ' CA=' + r.data.totals.revenue;
    });

    let revenueBefore = null;
    await check('snapshot CA avant hypo', async () => {
        const r = await req('pat', '/api/revenue/' + ESTAB + '/' + currMon);
        revenueBefore = (r.status === 200 && r.data && r.data.revenue != null) ? r.data.revenue : null;
        return revenueBefore == null ? 'pas de CA lundi courant' : 'CA=' + revenueBefore;
    });

    await check('semaine courante : hypo + moyenne jokers', async () => {
        const hypo = 9999;
        const r = await req('pat', '/api/performance/simulate', {
            method: 'POST',
            body: {
                establishment_id: ESTAB,
                from: curr.from, to: curr.to,
                hypo_revenue_by_date: { [currMon]: hypo },
                joker_mode: 'mean',
                source_establishment_ids: [ESTAB],
                group_ids: ['Bar'],
            },
        });
        eq(r.status, 200, 'status ' + JSON.stringify(r.data && r.data.error));
        ok(r.data.joker_rate_used != null, 'joker_rate_used');
        ok(r.data.joker_rate_sample_size >= 1, 'sample_size');
        const day = (r.data.days || []).find(d => d.date === currMon);
        if (revenueBefore == null && day) {
            eq(day.revenue_source, 'hypo', 'revenue_source');
            eq(day.revenue, hypo, 'revenue hypo');
        }
        return 'taux_joker=' + r.data.joker_rate_used + ' n=' + r.data.joker_rate_sample_size
            + ' total_chargé=' + r.data.totals.wage_bill_charged;
    });

    await check('hypo n\'écrit pas daily_revenue', async () => {
        const r = await req('pat', '/api/revenue/' + ESTAB + '/' + currMon);
        const after = (r.status === 200 && r.data && r.data.revenue != null) ? r.data.revenue : null;
        if (revenueBefore == null) {
            ok(after == null || after !== 9999, 'CA 9999 ne doit pas être persisté');
        } else {
            eq(after, revenueBefore, 'CA réel inchangé');
        }
        return after == null ? 'toujours vide' : 'CA=' + after;
    });

    await check('médiane pool Josy', async () => {
        const r = await req('pat', '/api/performance/simulate', {
            method: 'POST',
            body: {
                establishment_id: ESTAB,
                from: curr.from, to: curr.to,
                joker_mode: 'median',
                source_establishment_ids: [ESTAB],
            },
        });
        eq(r.status, 200, 'status');
        ok(typeof r.data.joker_rate_used === 'number', 'rate');
        return 'médiane=' + r.data.joker_rate_used + ' n=' + r.data.joker_rate_sample_size;
    });

    await check('manuel horaire + détail source', async () => {
        const r = await req('pat', '/api/performance/simulate', {
            method: 'POST',
            body: {
                establishment_id: ESTAB,
                from: curr.from, to: curr.to,
                joker_mode: 'manual_hourly',
                joker_hourly: 14.5,
            },
        });
        eq(r.status, 200, 'status');
        eq(r.data.joker_rate_used, 14.5, 'joker_rate');
        ok((r.data.days || []).length > 0, 'au moins un jour');
        const hasSim = (r.data.days || []).some(d =>
            (d.staff_detail || []).some(l => l.source === 'simulated'));
        const hasReal = (r.data.days || []).some(d =>
            (d.staff_detail || []).some(l => l.source === 'real'));
        return 'jours=' + r.data.days.length
            + (hasReal ? ' +réel' : '')
            + (hasSim ? ' +estimé' : '');
    });

    console.log('\n── Résultats ──────────────────────────────────────');
    for (const [mark, name, detail] of results) {
        console.log('  ' + mark + '  ' + name + (detail ? '  ·  ' + detail : ''));
    }
    console.log('\n  ' + pass + ' ✓   ' + fail + ' ✗\n');

    if (fail) {
        console.error('Smoke simulation ÉCHOUÉ.\n');
        process.exit(1);
    }
    console.log('Smoke simulation OK.\n');
    console.log('Check-list manuelle (UI) :');
    console.log('  1. patron@ → Performance → onglet Simulation');
    console.log('  2. Naviguer la semaine, saisir un CA hypo, choisir moyenne/médiane');
    console.log('  3. Vérifier « dont réalisé / dont estimé » dans les KPI\n');
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
