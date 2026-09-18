'use strict';
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Rattrape l'ancien pointage (real_start / real_end) dans la clôture.      ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// Jusqu'au 2026-09-18, la tablette, la saisie directe et la modale « heures réelles »
// du planning n'écrivaient que `real_start` / `real_end`. La clôture du jour, le récap
// et la file « à valider » ne lisent que `heure_validee_finale` : ces shifts restaient
// « Non commencés » pour toujours. Le serveur fait maintenant le miroir à l'écriture
// (`clotureFieldsFromRealHours`) ; ce script l'applique une fois à l'existant.
//
// Ne touche que les shifts qui ont des heures réelles ET pas de fin retenue. Un shift
// déjà clôturé (OTP ou manuel) n'est jamais réécrit.
//
//   node scripts/backfill-cloture-from-real.js            → simulation (n'écrit RIEN)
//   node scripts/backfill-cloture-from-real.js --apply    → applique
//
// `--valider-avant=YYYY-MM-DD` marque en plus « Récap validé » (`patron_valide`) les
// shifts rattrapés dont la date est STRICTEMENT antérieure : l'ancien système n'avait
// pas d'étape de validation, ces soirées étaient validées de fait — sans ça, elles
// tomberaient d'un bloc dans la file « à valider » du patron. Les shifts à partir de
// cette date restent à valider normalement.
//
// ⚠️ `openDb()` affiche la base ciblée : LIRE cette ligne avant --apply.

const { openDb } = require('./_db');
const { clotureFieldsFromRealHours } = require('../lib/utils');

const APPLY = process.argv.includes('--apply');
const VALIDER_AVANT = (process.argv.find(a => a.startsWith('--valider-avant=')) || '').split('=')[1] || null;
if (VALIDER_AVANT && !/^\d{4}-\d{2}-\d{2}$/.test(VALIDER_AVANT)) {
    console.error('❌ --valider-avant attend une date YYYY-MM-DD');
    process.exit(1);
}

async function main() {
    const { client, db } = await openDb();
    try {
        const shifts = await db.collection('shifts').find({
            type: { $ne: 'week_note' },
            real_start: { $ne: null },
            real_end: { $ne: null },
            $or: [
                { heure_validee_finale: { $exists: false } },
                { heure_validee_finale: null },
                { heure_validee_finale: '' },
            ],
        }).sort({ date: 1 }).toArray();

        const nbValides = VALIDER_AVANT ? shifts.filter(s => s.date < VALIDER_AVANT).length : 0;
        console.log('\n' + (APPLY ? '⚙️  MODE APPLICATION' : '🔍 SIMULATION — aucune écriture')
            + '   ·   ' + shifts.length + ' shift(s) pointé(s) sans clôture'
            + (VALIDER_AVANT ? '   ·   ' + nbValides + ' marqué(s) « Récap validé » (avant ' + VALIDER_AVANT + ')' : '')
            + '\n');
        if (!shifts.length) { console.log('  Rien à rattraper.\n'); return; }

        let done = 0;
        const now = localDateParts();
        for (const s of shifts) {
            const { set } = clotureFieldsFromRealHours(s, { real_start: s.real_start, real_end: s.real_end });
            const valider = !!VALIDER_AVANT && s.date < VALIDER_AVANT && !s.patron_valide;
            if (valider) { set.patron_valide = true; set.patron_valide_le = now; }
            console.log('  ' + s.date + '  ' + String(s.staff_name || s.staff_id || '?').padEnd(24)
                + set.debut_valide_finale + ' → ' + set.heure_validee_finale
                + (valider ? '  ✓ validé' : '')
                + (s.debut_valide_code ? '  (début déjà pointé, conservé)' : ''));
            if (!APPLY) continue;
            await db.collection('shifts').updateOne({ _id: s._id }, { $set: set });
            const log = {
                etablissement_id: s.establishment_id,
                shift_id:         String(s._id),
                staff_id:         'system',
                acteur_role:      null,
                source:           'manuelle',
                code_saisi:       'BACKFILL',
                heure_saisie:     now,
                debut_retenue:    set.debut_valide_finale,
                fin_retenue:      set.heure_validee_finale,
                real_start:       s.real_start,
                real_end:         s.real_end,
                resultat:         'accepte',
            };
            await db.collection('time_validations').insertOne({ ...log, action: 'saisie_directe', phase: 'fin' });
            if (valider) {
                await db.collection('time_validations').insertOne({
                    ...log, action: 'valider_recap', source: 'valider_recap', code_saisi: 'RECAP', phase: 'recap',
                });
            }
            done++;
        }
        console.log('\n' + (APPLY ? '  ✅ ' + done + ' shift(s) rattrapé(s).' : '  Relancer avec --apply pour écrire.') + '\n');
    } finally {
        await client.close();
    }
}

function localDateParts(d = new Date()) {
    return {
        year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
        hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds(),
    };
}

main().catch(e => { console.error(e); process.exit(1); });
