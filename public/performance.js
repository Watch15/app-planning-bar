'use strict';

// ── Utilitaires ───────────────────────────────────────────────────────────────

function toDateStr(d) {
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}

// Lundi de la semaine — délègue au module partagé/testé (public/lib/week.js, R-01).
// (Normalise désormais à minuit ; sans effet ici — toutes les sorties passent par toDateStr.)
function getMondayOf(d) { return Week.weekStart(d); }

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtEUR(n) {
    if (n == null || Number.isNaN(n)) return '—';
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' €';
}

function fmtPct(n) {
    if (n == null || Number.isNaN(n)) return '—';
    return n.toFixed(1).replace('.', ',') + ' %';
}

function fmtHours(h) {
    if (h == null) return '—';
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return hh + 'h' + (mm > 0 ? String(mm).padStart(2, '0') : '00');
}

function parseDate(s) { return new Date(s + 'T12:00:00'); }

function dateLabel(s) {
    const d = parseDate(s);
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const months = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    return days[d.getDay()] + ' ' + d.getDate() + ' ' + months[d.getMonth()];
}

// ── État ──────────────────────────────────────────────────────────────────────

let currentUser   = null;
let allEstabs     = [];
let currentEstab  = null;
let targets       = { target_charged: 43, charge_rate: 45 };
let currentData   = [];
let calendarWeekStart = null; // Lundi de la semaine affichée dans le calendrier

// ── Auth ──────────────────────────────────────────────────────────────────────

async function checkAuth() {
    try {
        const res = await fetch('/auth/me', { credentials: 'include' });
        if (!res.ok) { window.location.href = '/login.html'; return null; }
        const data = await res.json();
        if (!['patron', 'directeur', 'observateur'].includes(data.user?.role)) {
            window.location.href = '/'; return null;
        }
        return data.user;
    } catch { window.location.href = '/login.html'; return null; }
}

async function logout() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login.html';
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
    currentUser = await checkAuth();
    if (!currentUser) return;

    // Les objectifs/charge sont désormais PAR établissement (E-14/E-24) : on les
    // charge après avoir déterminé l'établissement courant (loadTargets), pas ici.
    const estabRes = await fetch('/api/establishments', { credentials: 'include' });
    if (!estabRes.ok) { document.getElementById('table-wrap').innerHTML = '<div class="empty-msg">Erreur chargement</div>'; return; }
    allEstabs = await estabRes.json();

    // Filtrer selon les établissements assignés (directeur)
    if (currentUser.role === 'directeur') {
        const assigned = currentUser.assigned_establishments || [];
        allEstabs = allEstabs.filter(e => assigned.includes(e.id));
    }

    if (allEstabs.length === 0) {
        document.getElementById('table-wrap').innerHTML = '<div class="empty-msg">Aucun établissement accessible</div>';
        return;
    }

    // Sélecteur établissement
    const sel = document.getElementById('estab-select');
    allEstabs.forEach(e => {
        const opt = document.createElement('option');
        opt.value = e.id; opt.textContent = e.name;
        sel.appendChild(opt);
    });
    if (allEstabs.length === 1) document.getElementById('estab-filter-group').style.display = 'none';
    currentEstab = allEstabs[0].id;
    sel.value = currentEstab;
    await loadTargets(); // paramètres de l'établissement courant
    // R-10 — `await` indispensable : `targets` est module-level et sert à colorer les
    // pastilles (ok/bad). Sans lui, `loadData()` partait en parallèle et rendait le premier
    // affichage du nouveau bar contre l'objectif du PRÉCÉDENT — des couleurs fausses
    // présentées comme justes, ce qui vide E-24 de son sens.
    sel.addEventListener('change', async () => {
        currentEstab = sel.value;
        await loadTargets();
        loadData();
        loadCalendarWeek();
    });

    // Sélecteur période
    document.getElementById('period-select').addEventListener('change', loadData);

    // Sauvegarde objectifs
    document.getElementById('btn-save-targets').addEventListener('click', saveTargets);

    // Navigation calendrier
    calendarWeekStart = Week.currentWeekStart(new Date());
    const _reloadOnNav = () => {
        const period = document.getElementById('period-select').value;
        if (period === 'week' || period === 'month') return Promise.all([loadCalendarWeek(), loadData()]);
        return loadCalendarWeek();
    };
    document.getElementById('cal-prev').addEventListener('click', () => {
        calendarWeekStart.setDate(calendarWeekStart.getDate() - 7);
        _reloadOnNav();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
        calendarWeekStart.setDate(calendarWeekStart.getDate() + 7);
        _reloadOnNav();
    });
    document.getElementById('cal-today').addEventListener('click', () => {
        calendarWeekStart = Week.currentWeekStart(new Date());
        _reloadOnNav();
    });

    // Modale CA (depuis le calendrier)
    document.getElementById('ca-modal-close').addEventListener('click', closeCAModal);
    document.getElementById('ca-modal').addEventListener('click', e => {
        if (e.target.id === 'ca-modal') closeCAModal();
    });
    document.getElementById('ca-save').addEventListener('click', saveCAFromModal);

    await Promise.all([loadData(), loadCalendarWeek()]);
}

// ── Calendrier semaine ────────────────────────────────────────────────────────

async function loadCalendarWeek(opts) {
    if (!calendarWeekStart || !currentEstab) return;
    const silent = !!(opts && opts.silent);
    const grid = document.getElementById('calendar-grid');
    if (silent && grid) grid.classList.add('is-updating');

    const monday = new Date(calendarWeekStart);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const from = toDateStr(monday);
    const to   = toDateStr(sunday);

    const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
    const label  = (monday.getMonth() === sunday.getMonth())
        ? (monday.getDate() + ' → ' + sunday.getDate() + ' ' + months[sunday.getMonth()] + ' ' + sunday.getFullYear())
        : (monday.getDate() + ' ' + months[monday.getMonth()] + ' → ' + sunday.getDate() + ' ' + months[sunday.getMonth()] + ' ' + sunday.getFullYear());
    document.getElementById('cal-label').textContent = label;

    try {
        const params = new URLSearchParams({ establishment_id: currentEstab, from, to });
        const res = await fetch('/api/performance?' + params.toString(), { credentials: 'include' });
        const data = res.ok ? await res.json() : [];
        renderCalendarGrid(data);
    } catch {
        if (!silent) renderCalendarGrid([]);
    } finally {
        if (silent && grid) grid.classList.remove('is-updating');
    }
}

function renderCalendarGrid(data) {
    const grid = document.getElementById('calendar-grid');
    const byDate = {};
    data.forEach(d => { byDate[d.date] = d; });

    const DAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    const today = toDateStr(new Date());
    grid.innerHTML = '';

    for (let i = 0; i < 7; i++) {
        const d = new Date(calendarWeekStart);
        d.setDate(d.getDate() + i);
        const dateStr = toDateStr(d);
        const isToday = dateStr === today;
        const perf    = byDate[dateStr];

        const card = document.createElement('div');
        card.className = 'day-card' + (isToday ? ' today' : '');
        card.dataset.date = dateStr;

        let inner =
            '<div class="day-header">' +
                '<span class="day-name">' + DAY_SHORT[i] + '</span>' +
                '<span class="day-num">' + d.getDate() + '</span>' +
            '</div>';

        if (perf) {
            const hasShifts = perf.wage_bill_gross > 0;
            const dayHours  = perf.staff_detail.reduce((a, s) => a + (s.hours_worked || 0), 0);
            const hoursLine = dayHours > 0 ? '<div style="font-size:10px;font-weight:600;color:currentColor;opacity:0.7;margin-top:2px">' + fmtHours(dayHours) + ' travaillées</div>' : '';
            if (hasShifts) {
                // E-23 : seul le coefficient CHARGÉ est affiché (couleur ok/bad + valeur,
                // comparée à l'objectif chargé). Le brut a été retiré de l'affichage.
                card.classList.add(perf.coeff_charged < targets.target_charged ? 'ok' : 'bad');
                inner += '<div class="day-ca">' + fmtEUR(perf.revenue) + '</div>';
                inner += hoursLine;
                inner += '<div class="day-coeff">' + fmtPct(perf.coeff_charged) + '</div>';
            } else {
                card.classList.add('no-shifts');
                inner += '<div class="day-ca">' + fmtEUR(perf.revenue) + '</div>';
                inner += hoursLine;
                inner += '<div class="day-coeff" style="color:#b45309">Aucun shift pointé</div>';
            }
        } else {
            card.classList.add('empty');
            inner += '<div class="day-empty">Pas de CA</div>';
            inner += '<span class="add-ca-hint">+ Saisir</span>';
        }
        card.innerHTML = inner;
        card.addEventListener('click', () => openCAModal(dateStr, perf ? perf.revenue : null));
        grid.appendChild(card);
    }
}

// ── Modale CA ─────────────────────────────────────────────────────────────────

function openCAModal(dateStr, existingRevenue) {
    document.getElementById('ca-date').value = dateStr;
    const input = document.getElementById('ca-input');
    const hint  = document.getElementById('ca-hint');
    const fb    = document.getElementById('ca-feedback');
    fb.className = 'modal-fb'; fb.textContent = '';
    if (existingRevenue != null) {
        input.value = existingRevenue;
        hint.textContent = '✏️ Un CA existe déjà pour ce jour, vous pouvez le corriger.';
    } else {
        input.value = '';
        hint.textContent = '';
    }
    document.getElementById('ca-modal').classList.add('visible');
    setTimeout(() => input.focus(), 50);
}

function closeCAModal() {
    document.getElementById('ca-modal').classList.remove('visible');
}

async function saveCAFromModal() {
    const date = document.getElementById('ca-date').value;
    const v    = parseFloat(document.getElementById('ca-input').value);
    const fb   = document.getElementById('ca-feedback');
    const btn  = document.getElementById('ca-save');
    if (Number.isNaN(v) || v < 0) { fb.className = 'modal-fb error'; fb.textContent = 'Montant invalide'; return; }
    btn.disabled = true; const old = btn.textContent; btn.textContent = 'Enregistrement…';
    try {
        const res = await fetch('/api/revenue', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, establishment_id: currentEstab, revenue: v }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        fb.className = 'modal-fb ok'; fb.textContent = '✅ CA enregistré';
        // Rafraîchir calendrier + tableau
        await Promise.all([loadCalendarWeek(), loadData()]);
        setTimeout(closeCAModal, 600);
    } catch (e) {
        fb.className = 'modal-fb error'; fb.textContent = e.message || 'Erreur';
    } finally {
        btn.disabled = false; btn.textContent = old;
    }
}

// ── Chargement données ──────────────────────────────────────────────────────────

function _periodRange() {
    const period = document.getElementById('period-select').value;
    const ref = calendarWeekStart ? new Date(calendarWeekStart) : new Date();
    if (period === 'week') {
        const monday = getMondayOf(ref);
        const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
        return { from: toDateStr(monday), to: toDateStr(sunday) };
    }
    if (period === 'month') {
        const first = new Date(ref.getFullYear(), ref.getMonth(), 1);
        const last  = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
        return { from: toDateStr(first), to: toDateStr(last) };
    }
    return { from: null, to: null };
}

async function loadData(opts) {
    const silent = !!(opts && opts.silent);
    const wrap = document.getElementById('table-wrap');
    const kpis = document.getElementById('kpis');

    // Mode initial / changement de période : on blank (squelette « Chargement… »).
    // Mode silencieux (après save paramètres) : on dim juste l'opacité — la donnée
    // précédente reste lisible et la ligne expandée est restaurée après refresh.
    let expandedDate = null;
    if (silent) {
        wrap.classList.add('is-updating');
        kpis.classList.add('is-updating');
        const openRow = wrap.querySelector('.perf-row.expanded');
        if (openRow) {
            const idx = openRow.dataset.idx;
            if (idx != null && currentData[idx]) expandedDate = currentData[idx].date;
        }
    } else {
        wrap.innerHTML = '<div class="loading-msg">Chargement…</div>';
        kpis.innerHTML = '';
    }

    const { from, to } = _periodRange();
    const params = new URLSearchParams({ establishment_id: currentEstab });
    if (from) params.set('from', from);
    if (to)   params.set('to', to);

    try {
        const res = await fetch('/api/performance?' + params.toString(), { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        currentData = data;
        renderKpis(data);
        renderTable(data);
        if (silent && expandedDate) {
            const newIdx = data.findIndex(r => r.date === expandedDate);
            if (newIdx >= 0) {
                const row    = wrap.querySelector('.perf-row[data-idx="' + newIdx + '"]');
                const detail = wrap.querySelector('.perf-detail[data-detail-for="' + newIdx + '"]');
                if (row && detail) {
                    row.classList.add('expanded');
                    detail.style.display = '';
                    renderDetail(
                        detail.querySelector('td'),
                        data[newIdx].staff_detail,
                        data[newIdx].wage_bill_charged,
                        data[newIdx].wage_bill_gross
                    );
                }
            }
        }
    } catch (e) {
        if (silent) {
            // Ne pas effacer la donnée existante en cas d'erreur silencieuse — un toast suffit.
            console.error('[loadData silent]', e);
        } else {
            wrap.innerHTML = '<div class="empty-msg" style="color:var(--danger)">' + escapeHtml(e.message || 'Erreur') + '</div>';
        }
    } finally {
        if (silent) {
            wrap.classList.remove('is-updating');
            kpis.classList.remove('is-updating');
        }
    }
}

function renderKpis(data) {
    const wrap = document.getElementById('kpis');
    if (data.length === 0) { wrap.innerHTML = ''; return; }

    const totalRevenue = data.reduce((a, r) => a + (r.revenue || 0), 0);
    const totalWageCh  = data.reduce((a, r) => a + (r.wage_bill_charged || 0), 0);
    const totalHours   = data.reduce((a, r) => a + r.staff_detail.reduce((b, s) => b + (s.hours_worked || 0), 0), 0);
    const coeffC = totalRevenue > 0 ? (totalWageCh / totalRevenue) * 100 : 0;

    // E-23 : seule la masse salariale CHARGÉE est affichée (le brut a été retiré).
    wrap.innerHTML =
        '<div class="kpi-card"><div class="kpi-label">CA total</div><div class="kpi-value num">' + fmtEUR(totalRevenue) + '</div><div class="kpi-sub">' + data.length + ' soirée' + (data.length > 1 ? 's' : '') + '</div></div>' +
        '<div class="kpi-card"><div class="kpi-label">Heures travaillées</div><div class="kpi-value num">' + fmtHours(totalHours) + '</div><div class="kpi-sub">heures réelles</div></div>' +
        '<div class="kpi-card"><div class="kpi-label">Masse sal. chargée</div><div class="kpi-value num">' + fmtEUR(totalWageCh) + '</div><div class="kpi-sub">Coeff. ' + fmtPct(coeffC) + '</div></div>';
}

function renderTable(data) {
    const wrap = document.getElementById('table-wrap');
    if (data.length === 0) {
        wrap.innerHTML = '<div class="empty-msg">Aucune soirée avec CA saisi sur cette période</div>';
        return;
    }

    // E-23 avait retiré le brut de toute la page. Réintroduit ICI SEULEMENT, à la demande :
    // la masse salariale avant charges, à côté de la chargée. Les KPI, le calendrier et les
    // objectifs restent sur le chargé — c'est lui qui reflète le coût réel.
    // `wage_bill_gross` n'a jamais cessé d'être renvoyé par l'API : rien à changer serveur.
    let totalRevenue = 0, totalWageCh = 0, totalWageBrut = 0, totalHoursTable = 0;
    const rows = data.map((r, idx) => {
        totalRevenue += r.revenue || 0;
        totalWageCh  += r.wage_bill_charged || 0;
        totalWageBrut += r.wage_bill_gross || 0;
        const rowHours = r.staff_detail.reduce((a, s) => a + (s.hours_worked || 0), 0);
        totalHoursTable += rowHours;
        const okC = r.coeff_charged < targets.target_charged;
        return (
            '<tr class="perf-row" data-idx="' + idx + '">' +
                '<td class="date-cell"><span class="expand-icon">▸</span>' + dateLabel(r.date) + '</td>' +
                '<td class="num">' + fmtEUR(r.revenue) + '</td>' +
                '<td class="num">' + (rowHours > 0 ? fmtHours(rowHours) : '—') + '</td>' +
                '<td class="num">' + fmtEUR(r.wage_bill_gross) + '</td>' +
                '<td class="num">' + fmtEUR(r.wage_bill_charged) + '</td>' +
                '<td><span class="coeff-pill ' + (okC ? 'ok' : 'bad') + '">' + fmtPct(r.coeff_charged) + '</span></td>' +
            '</tr>' +
            '<tr class="perf-detail" data-detail-for="' + idx + '" style="display:none"><td colspan="6"></td></tr>'
        );
    }).join('');

    const totalCoeffC = totalRevenue > 0 ? (totalWageCh / totalRevenue) * 100 : 0;
    const okTC = totalCoeffC < targets.target_charged;

    // A-10 — le multiplicateur est DÉDUIT des deux montants affichés, jamais recalculé
    // depuis `targets.charge_rate`. Le serveur applique un taux unique par établissement
    // (`wage_bill_charged = wage_bill_gross * chargeMult`, server.js) : le rapport des
    // totaux EST ce taux. Le recalculer ici depuis `targets` — qui arrive par un autre
    // appel, et que R-10 a déjà vu venir du mauvais bar — produisait une phrase
    // arithmétiquement FAUSSE à l'écran (« 3 200 € × 1,45 = 4 800 € »), du genre que le
    // patron vérifie de tête. Déduite, elle est vraie par construction quelle que soit
    // la provenance de `targets`.
    // Formaté UNE fois : les deux seuls affichages en ont besoin ensemble, dans le même
    // ordre. Séparés, c'étaient deux appels appariés sur deux sites — quatre endroits où
    // le « × » et le « % » devaient rester d'accord, soit précisément la désynchronisation
    // que A-10 vient de corriger. `fmtPct` est le formateur de pourcentage du fichier,
    // déjà employé dans cette phrase pour le coefficient : deux règles décimales dans une
    // même légende se liraient comme un bug d'affichage.
    const multTxt = totalWageBrut > 0
        ? (totalWageCh / totalWageBrut).toFixed(2).replace('.', ',')
            + ' (charges ' + fmtPct((totalWageCh / totalWageBrut - 1) * 100) + ')'
        : null;
    // Exemple CHIFFRÉ sur les totaux affichés : plus parlant qu'une formule abstraite.
    const legend = totalRevenue > 0 && multTxt
        ? 'Sur la période : ' + fmtEUR(totalWageBrut) + ' brut × ' + multTxt
            + ' = ' + fmtEUR(totalWageCh) + ' chargé'
            + ', soit ' + fmtEUR(totalWageCh) + ' ÷ ' + fmtEUR(totalRevenue) + ' de CA = '
            + fmtPct(totalCoeffC) + ' de coefficient.'
        : '';

    wrap.innerHTML =
        '<table class="perf">' +
            '<thead><tr>' +
                '<th>Date</th>' +
                '<th class="num">CA</th>' +
                '<th class="num">Heures</th>' +
                '<th class="num" title="Somme des salaires versés : heures réelles × taux (ou forfait), avant charges patronales.">Masse sal. brute</th>' +
                '<th class="num" title="' + (multTxt
                    ? 'Masse salariale brute × ' + multTxt + ' — le coût réel pour le bar.'
                    : 'Masse salariale brute plus les charges patronales — le coût réel pour le bar.') + '">Masse sal. chargée</th>' +
                '<th title="Masse salariale chargée ÷ CA × 100. Vert sous la cible de ' + fmtPct(targets.target_charged) + '.">Coeff. chargé</th>' +
            '</tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
            '<tfoot><tr>' +
                '<td>Total période</td>' +
                '<td class="num">' + fmtEUR(totalRevenue) + '</td>' +
                '<td class="num">' + (totalHoursTable > 0 ? fmtHours(totalHoursTable) : '—') + '</td>' +
                '<td class="num">' + fmtEUR(totalWageBrut) + '</td>' +
                '<td class="num">' + fmtEUR(totalWageCh) + '</td>' +
                '<td><span class="coeff-pill ' + (okTC ? 'ok' : 'bad') + '">' + fmtPct(totalCoeffC) + '</span></td>' +
            '</tr></tfoot>' +
        '</table>' +
        (legend ? '<div class="calc-legend">' + legend + '</div>' : '');

    // Lignes cliquables → toggle détail
    wrap.querySelectorAll('.perf-row').forEach(row => {
        row.addEventListener('click', () => {
            const idx = row.dataset.idx;
            const detail = wrap.querySelector('tr.perf-detail[data-detail-for="' + idx + '"]');
            if (!detail) return;
            const wasOpen = detail.style.display !== 'none';
            // Fermer les autres
            wrap.querySelectorAll('.perf-detail').forEach(t => t.style.display = 'none');
            wrap.querySelectorAll('.perf-row').forEach(r => r.classList.remove('expanded'));
            if (!wasOpen) {
                detail.style.display = '';
                row.classList.add('expanded');
                renderDetail(
                    detail.querySelector('td'),
                    currentData[idx].staff_detail,
                    currentData[idx].wage_bill_charged,
                    currentData[idx].wage_bill_gross
                );
            }
        });
    });
}

function renderDetail(td, staff, totalWageCharged, totalWageGross) {
    if (!staff || staff.length === 0) {
        td.innerHTML = '<div class="detail-wrap" style="color:var(--text-muted)">Aucun shift pointé ce soir-là</div>';
        return;
    }
    const totalHoursDetail = staff.reduce((a, s) => a + (s.hours_worked || 0), 0);
    const rows = staff.map(s => {
        // Mode forfait : 'Forfait XX €' (par shift) ; mode horaire : 'XX,XX €/h'
        let rateLabel = '';
        if (s.is_fixed && s.fixed_rate != null) {
            rateLabel = 'Forfait ' + s.fixed_rate.toFixed(2).replace('.', ',') + ' €';
        } else if (s.hourly_rate != null) {
            rateLabel = s.hourly_rate.toFixed(2).replace('.', ',') + ' €/h';
        }
        const hasWage     = s.is_fixed ? s.fixed_rate != null : s.hourly_rate != null;
        const wageChLabel = hasWage ? fmtEUR(s.wage_charged) : '';
        const wageBrLabel = hasWage ? fmtEUR(s.wage_gross) : '';
        return (
            '<tr>' +
                '<td>' + escapeHtml(s.staff_name) + '</td>' +
                '<td class="num">' + fmtHours(s.hours_worked) + '</td>' +
                '<td class="num">' + rateLabel + '</td>' +
                '<td class="num">' + wageBrLabel + '</td>' +
                '<td class="num">' + wageChLabel + '</td>' +
            '</tr>'
        );
    }).join('');

    // Brut ET chargé : le brut est ce qu'on verse, le chargé ce que ça coûte.
    td.innerHTML =
        '<div class="detail-wrap">' +
            '<table class="detail-table">' +
                '<thead><tr><th>Staff</th><th class="num">Heures</th><th class="num">Taux</th>' +
                    '<th class="num">Salaire brut</th><th class="num">Salaire chargé</th></tr></thead>' +
                '<tbody>' + rows +
                    '<tr class="total-row"><td>Total</td><td class="num">' + fmtHours(totalHoursDetail) + '</td><td></td>' +
                        '<td class="num">' + fmtEUR(totalWageGross) + '</td>' +
                        '<td class="num">' + fmtEUR(totalWageCharged) + '</td></tr>' +
                '</tbody>' +
            '</table>' +
        '</div>';
}

// ── Objectifs ─────────────────────────────────────────────────────────────────

// Paramètres (objectifs + taux de charges) de l'établissement COURANT (E-14/E-24).
// Rechargé à chaque changement d'établissement ; le serveur applique le fallback
// global si l'établissement n'a pas encore de réglage propre.
async function loadTargets() {
    try {
        const res = await fetch('/api/performance-settings?establishment_id=' + encodeURIComponent(currentEstab), { credentials: 'include' });
        if (res.ok) targets = await res.json();
    } catch { /* on garde les valeurs courantes */ }
    document.getElementById('target-charged').value = targets.target_charged;
    document.getElementById('charge-rate').value    = targets.charge_rate ?? 45;
    const scope = document.getElementById('targets-scope');
    if (scope) {
        const est = allEstabs.find(e => e.id === currentEstab);
        scope.textContent = est ? ' — ' + est.name : '';
    }
}

async function saveTargets() {
    const btn = document.getElementById('btn-save-targets');
    const fb  = document.getElementById('targets-feedback');
    const tc  = parseFloat(document.getElementById('target-charged').value);
    const cr  = parseFloat(document.getElementById('charge-rate').value);
    if (Number.isNaN(tc) || Number.isNaN(cr)) {
        fb.style.color = 'var(--danger)'; fb.textContent = 'Valeurs invalides';
        return;
    }
    btn.disabled = true;
    try {
        const res = await fetch('/api/performance-settings', {
            method: 'PATCH', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_charged: tc, charge_rate: cr, establishment_id: currentEstab }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        targets = { ...targets, target_charged: tc, charge_rate: cr };
        fb.style.color = 'var(--success-text)';
        fb.textContent = '✅ Paramètres enregistrés';
        setTimeout(() => { fb.textContent = ''; }, 2500);
        // Refetch complet : charge_rate impacte wage_bill_charged et staff_detail.wage_charged
        // côté serveur — un simple re-render des données existantes garderait les anciennes valeurs.
        // Mode silent : dim opacité au lieu de blank, restaure la ligne détail ouverte si besoin.
        loadData({ silent: true });
        loadCalendarWeek({ silent: true });
    } catch (e) {
        fb.style.color = 'var(--danger)'; fb.textContent = e.message || 'Erreur';
    } finally {
        btn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', init);
