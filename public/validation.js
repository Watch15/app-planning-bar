'use strict';

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toDateStr(d) {
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}

function addDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

function fmtWeekLabel(weekStartStr) {
    const mon = new Date(weekStartStr + 'T12:00:00');
    const sun = addDays(mon, 6);
    const months = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    return mon.getDate() + '–' + sun.getDate() + ' ' + months[sun.getMonth()] + ' ' + sun.getFullYear();
}

let currentUser = null;
let weekStartStr = null;
let canEdit = false;

async function checkAuth() {
    const res = await fetch('/auth/me', { credentials: 'include' });
    if (!res.ok) { window.location.href = '/login.html'; return null; }
    const data = await res.json();
    if (window.ClientFeatures) {
        ClientFeatures.fromAuthPayload(data);
        ClientFeatures.applyDom();
    }
    if (!ClientFeatures.enabled('weekly_staff_validation')) {
        document.querySelector('.wrap').innerHTML =
            '<div class="empty">Validation hebdomadaire non activée sur cette instance.</div>';
        return null;
    }
    const user = data.user;
    if (!user) { window.location.href = '/login.html'; return null; }
    const home = (user.role === 'staff') ? '/planning.html' : '/';
    const backBtn = document.getElementById('btn-back');
    const brandLink = document.getElementById('back-link');
    if (backBtn) backBtn.href = home;
    if (brandLink) brandLink.href = home;
    return user;
}

function defaultWeekStart() {
    const mondayThis = Week.weekStart(new Date());
    return toDateStr(addDays(mondayThis, -7));
}

async function loadWeek() {
    const list = document.getElementById('staff-list');
    list.innerHTML = '<div class="empty">Chargement…</div>';
    document.getElementById('week-label').textContent = fmtWeekLabel(weekStartStr);
    try {
        const res = await fetch('/api/validation/week?week_start=' + encodeURIComponent(weekStartStr), {
            credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        canEdit = !!data.can_edit;
        const win = data.window || {};
        document.getElementById('week-sub').textContent =
            'Semaine travaillée · fenêtre signature '
            + (win.window_start || '—') + ' → ' + (win.window_end || '—')
            + (win.in_window ? ' (ouverte)' : '');
        renderStaff(data.staff || []);
    } catch (e) {
        list.innerHTML = '<div class="empty" style="color:var(--danger)">' + escapeHtml(e.message) + '</div>';
    }
}

function renderStaff(rows) {
    const list = document.getElementById('staff-list');
    if (!rows.length) {
        list.innerHTML = '<div class="empty">Aucun shift staff sur cette semaine (périmètre accessible).</div>';
        return;
    }
    list.innerHTML = '';
    rows.forEach(row => {
        const card = document.createElement('div');
        card.className = 'card ' + (row.signed ? 'signed' : 'pending');
        const estabs = (row.establishment_ids || []).map(e => String(e).replace(/_/g, ' ')).join(', ');
        let actions = '';
        if (canEdit && !row.signed) {
            actions = '<div class="actions">'
                + '<input type="text" inputmode="numeric" maxlength="4" pattern="\\d{4}" '
                + 'placeholder="Code" data-code-for="' + escapeHtml(row.staff_id) + '" autocomplete="off">'
                + '<button type="button" class="btn-primary" data-sign="' + escapeHtml(row.staff_id) + '">Signer</button>'
                + '</div><div class="err" data-err-for="' + escapeHtml(row.staff_id) + '" hidden></div>';
        } else if (canEdit && row.signed) {
            actions = '<div class="actions">'
                + '<button type="button" class="btn-ghost" data-reopen="' + escapeHtml(row.staff_id) + '">Réouvrir</button>'
                + '</div>';
        }
        const detailLines = (row.shifts || []).map(s =>
            '<div>' + escapeHtml(s.date) + ' · ' + escapeHtml(String(s.establishment_id).replace(/_/g, ' '))
            + ' · ' + (s.hours != null ? Number(s.hours).toFixed(2) + ' h' : '—') + '</div>'
        ).join('');
        card.innerHTML =
            '<div class="card-head">'
            + '<div><div class="name">' + escapeHtml(row.staff_name) + '</div>'
            + '<div class="meta">' + escapeHtml(estabs) + ' · ' + (row.shifts_count || 0) + ' shifts · '
            + (row.hours != null ? Number(row.hours).toFixed(1) + ' h' : '') + '</div></div>'
            + '<div class="status ' + (row.signed ? 'ok' : 'wait') + '">'
            + (row.signed ? 'Signé' : 'En attente') + '</div></div>'
            + actions
            + '<details class="detail"><summary>Détail par affaire</summary>' + detailLines + '</details>';
        list.appendChild(card);
    });

    list.querySelectorAll('[data-sign]').forEach(btn => {
        btn.addEventListener('click', () => signStaff(btn.dataset.sign));
    });
    list.querySelectorAll('[data-reopen]').forEach(btn => {
        btn.addEventListener('click', () => reopenStaff(btn.dataset.reopen));
    });
}

async function signStaff(staffId) {
    const input = document.querySelector('input[data-code-for="' + staffId + '"]');
    const err = document.querySelector('[data-err-for="' + staffId + '"]');
    const code = input ? String(input.value || '').trim() : '';
    if (err) { err.hidden = true; err.textContent = ''; }
    try {
        const res = await fetch('/api/validation/sign', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staff_id: staffId, week_start: weekStartStr, code }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        await loadWeek();
    } catch (e) {
        if (err) { err.hidden = false; err.textContent = e.message || 'Erreur'; }
    }
}

async function reopenStaff(staffId) {
    if (!confirm('Réouvrir la signature de cet employé ? Un nouveau code sera généré (visible côté staff).')) return;
    try {
        const res = await fetch('/api/validation/reopen', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staff_id: staffId, week_start: weekStartStr }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        await loadWeek();
    } catch (e) {
        alert(e.message || 'Erreur');
    }
}

async function loadHistory() {
    const wrap = document.getElementById('hist-list');
    const q = document.getElementById('hist-q').value.trim();
    wrap.innerHTML = '<div class="empty">Chargement…</div>';
    try {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        params.set('week_start', weekStartStr);
        const res = await fetch('/api/validation/history?' + params.toString(), { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        const items = data.items || [];
        if (!items.length) {
            wrap.innerHTML = '<div class="empty">Aucun événement pour cette semaine.</div>';
            return;
        }
        wrap.innerHTML = items.map(it =>
            '<div class="hist-row">'
            + '<div><strong>' + escapeHtml(it.staff_name || it.staff_id || '—') + '</strong>'
            + '<div class="meta">' + escapeHtml(it.action || '') + ' · ' + escapeHtml(it.resultat || '')
            + (it.acteur_role ? ' · ' + escapeHtml(it.acteur_role) : '') + '</div></div>'
            + '<div class="meta">' + escapeHtml(it.week_start || '') + '</div>'
            + '</div>'
        ).join('');
    } catch (e) {
        wrap.innerHTML = '<div class="empty" style="color:var(--danger)">' + escapeHtml(e.message) + '</div>';
    }
}

function switchPanel(panelId) {
    document.getElementById('panel-list').hidden = panelId !== 'panel-list';
    document.getElementById('panel-hist').hidden = panelId !== 'panel-hist';
    document.querySelectorAll('.tab').forEach(t => {
        t.classList.toggle('active', t.dataset.panel === panelId);
    });
    if (panelId === 'panel-hist') loadHistory();
}

async function init() {
    currentUser = await checkAuth();
    if (!currentUser) return;
    weekStartStr = defaultWeekStart();

    document.getElementById('week-prev').addEventListener('click', () => {
        weekStartStr = toDateStr(addDays(new Date(weekStartStr + 'T12:00:00'), -7));
        loadWeek();
    });
    document.getElementById('week-next').addEventListener('click', () => {
        weekStartStr = toDateStr(addDays(new Date(weekStartStr + 'T12:00:00'), 7));
        loadWeek();
    });
    document.getElementById('week-current').addEventListener('click', () => {
        weekStartStr = defaultWeekStart();
        loadWeek();
    });
    document.getElementById('tab-list').addEventListener('click', () => switchPanel('panel-list'));
    document.getElementById('tab-hist').addEventListener('click', () => switchPanel('panel-hist'));
    document.getElementById('hist-refresh').addEventListener('click', loadHistory);
    document.getElementById('hist-q').addEventListener('keydown', e => {
        if (e.key === 'Enter') loadHistory();
    });

    await loadWeek();
}

init();
