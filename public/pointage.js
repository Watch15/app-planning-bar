// ── Utilitaires ───────────────────────────────────────────────────────────────

// Rôles « vue patron » : accès complet au pointage (consultation + correction des
// heures réelles), comme le patron. Source unique pour éviter la dérive entre les
// différents points de contrôle de ce fichier.
const MANAGER_ROLES = ['patron', 'directeur', 'observateur'];

function toDateStr(d) {
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}

function fmtH(h) {
    return ShiftHours.fmtClock(h);
}

// Arrondit une heure (float) au quart d'heure le plus proche
function roundQuarter(h) {
    if (h == null) return null;
    return Math.round(h * 4) / 4;
}

// Recale la valeur d'un <input type="time"> sur le quart d'heure le plus proche
function snapInputToQuarter(input) {
    const v = parseTimeInput(input.value);
    if (v == null) return;
    input.value = fmtH(roundQuarter(v));
}

// Nom court affiché : nickname si défini, sinon prénom (1er mot du nom complet)
function staffDisplayName(staff, fallbackFullName) {
    if (staff && staff.nickname) return staff.nickname;
    const n = ((staff && staff.name) || fallbackFullName || '').trim();
    return n.split(/\s+/)[0] || n || '—';
}

// Normalise une chaîne pour recherche : minuscules + suppression des accents
function normalizeStr(str) {
    if (!str) return '';
    return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Recherche par début de mot : « s » ne matche que les mots COMMENÇANT par « s »
// (« Sophie », « Marie Sanchez »), jamais ceux qui contiennent un s (« Lisa »).
function matchesWordPrefix(text, query) {
    const q = normalizeStr(query).trim();
    if (!q) return true;
    return normalizeStr(text).split(/[^a-z0-9]+/).some(w => w.startsWith(q));
}

function parseTimeInput(val, referenceStart) {
    if (!val) return null;
    const [h, m] = val.split(':').map(Number);
    let result = h + m / 60;
    // Si une heure de référence est fournie et que le résultat est inférieur,
    // on est passé minuit → ajouter 24
    if (referenceStart != null && result < referenceStart) result += 24;
    return result;
}

function ecartLabel(planned, real) {
    if (real == null || planned == null) return null;
    const diff = real - planned;
    if (Math.abs(diff) < 0.01) return { text: '= planifié', cls: 'zero' };
    const mins = Math.round(Math.abs(diff) * 60);
    const h    = Math.floor(mins / 60);
    const m    = mins % 60;
    const str  = (h ? h + 'h' : '') + (m ? String(m).padStart(2,'0') + 'min' : '');
    return diff > 0
        ? { text: '+' + str, cls: 'pos' }
        : { text: '−' + str, cls: 'neg' };
}

let toastTimer;
function showToast(msg, isError = false) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast visible' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.className = 'toast', 2500);
}

async function logout() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login.html';
}

// ── Auth ──────────────────────────────────────────────────────────────────────

let currentUser  = null;
let allStaff     = [];  // TOUT le staff, archivés compris — pour LIRE un shift déjà posé
let activeStaff  = [];  // F-14 — l'équipe d'aujourd'hui : pour CHOISIR dans l'autocomplete
let cutoffHour     = 9; // fin de fenêtre de saisie (ex: 9h)
let cutoffOpenHour = 0; // début de fenêtre de saisie (ex: 22h, 0 = minuit)
let currentEstabId = null; // établissement actif (pointage)

// Calcule la date "active" selon l'heure de bascule
function getActiveDate() {
    const now = new Date();
    if (now.getHours() < cutoffHour) {
        // Avant l'heure de bascule → on est encore "hier"
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        return toDateStr(yesterday);
    }
    return toDateStr(now);
}

let today; // sera défini après chargement du cutoff
let manualDate = false; // patron/directeur : date choisie manuellement (rattrapage)

// Met à jour la bannière de soirée (cutoff ou rattrapage manuel)
function refreshSessionBanner() {
    const old = document.querySelector('.session-banner');
    if (old) old.remove();

    const todayReal = toDateStr(new Date());
    if (today === todayReal && !manualDate) return;

    const d = new Date(today + 'T12:00:00');
    const dateStr = d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    const dateStrCap = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

    const banner = document.createElement('div');
    banner.className = 'session-banner';

    if (manualDate) {
        banner.style.background    = '#E8F1FF';
        banner.style.borderColor   = '#3B82F6';
        banner.style.color         = '#1E3A8A';
        const verb = today < todayReal ? 'Rattrapage' : (today > todayReal ? 'Anticipation' : 'Sélection manuelle');
        banner.innerHTML =
            '<span class="session-banner-icon">📅</span>' +
            '<span>' + verb + ' : soirée du <b>' + dateStrCap + '</b>.</span>';
    } else {
        const cutoffLabel = String(cutoffHour).padStart(2,'0') + 'h';
        banner.innerHTML =
            '<span class="session-banner-icon">🌙</span>' +
            '<span>Soirée du <b>' + dateStrCap + '</b> — les saisies avant ' + cutoffLabel +
            ' restent rattachées à la veille.</span>';
    }
    const container = document.querySelector('.container');
    container.insertBefore(banner, container.firstChild);
}

// Change la date active (utilisé en init et par le sélecteur date patron/directeur)
function setActiveDate(newDateStr, isManual) {
    today      = newDateStr;
    manualDate = !!isManual;

    const d = new Date(today + 'T12:00:00');
    const dateStr = d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    document.getElementById('header-date').textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);

    refreshSessionBanner();

    const dateInput = document.getElementById('date-select');
    if (dateInput && dateInput.value !== newDateStr) dateInput.value = newDateStr;
    const btnReset = document.getElementById('btn-reset-date');
    if (btnReset) btnReset.style.display = isManual ? '' : 'none';
}

async function checkAuth() {
    try {
        const res  = await fetch('/auth/me', { credentials: 'include' });
        if (!res.ok) { window.location.href = '/login.html'; return null; }
        const data = await res.json();
        if (!['etablissement', 'patron', 'directeur', 'staff', 'observateur'].includes(data.user?.role)) {
            window.location.href = '/login.html'; return null;
        }
        return data.user;
    } catch { window.location.href = '/login.html'; return null; }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
    currentUser = await checkAuth();
    if (!currentUser) return;

    // ── Bouton retour immédiatement après auth (avant tout fetch) ────────────
    const btnBack = document.getElementById('btn-back');
    if (MANAGER_ROLES.includes(currentUser.role)) {
        btnBack.href        = '/';
        btnBack.textContent = '← Dashboard';
        btnBack.style.display = '';
    } else if (currentUser.role === 'staff') {
        btnBack.href        = '/planning.html';
        btnBack.textContent = '← Planning';
        btnBack.style.display = '';
    }

    // Charger l'heure de bascule
    try {
        const r = await fetch('/api/pointage-settings', { credentials: 'include' });
        if (r.ok) {
            const s = await r.json();
            cutoffHour     = s.cutoff_hour      ?? 9;
            cutoffOpenHour = s.cutoff_open_hour ?? 0;
        }
    } catch { /* défauts */ }
    setActiveDate(getActiveDate(), false);

    // Charger staff pour l'autocomplete (en parallèle avec les établissements)
    const [staffRes, estabRes] = await Promise.all([
        fetch('/api/staff',          { credentials: 'include' }).catch(() => null),
        fetch('/api/establishments', { credentials: 'include' }).catch(() => null),
    ]);
    if (staffRes && staffRes.ok) allStaff = await staffRes.json();
    // F-14 — l'autocomplete du pointage crée de VRAIS shifts (`POST /api/shifts/extra`,
    // qui résout même par nom) : taper les 3 premières lettres d'une personne partie lui
    // recréait des heures. Le nom reste lisible sur les shifts déjà posés via `allStaff`.
    activeStaff = allStaff.filter(s => !s.archived);

    // ── Établissement actif selon le rôle ───────────────────────────────────
    const estabParam = new URLSearchParams(location.search).get('estab');

    if (currentUser.role === 'etablissement') {
        currentEstabId = currentUser.establishment_id;
    } else if (currentUser.role === 'staff') {
        // Staff responsable de soirée — ?estab= obligatoire
        if (!estabParam) { window.location.href = '/planning.html'; return; }
        currentEstabId = estabParam;
    } else {
        // Directeur ou patron — ?estab optionnel
        if (estabParam) currentEstabId = estabParam;
    }

    // ── Résolution nom d'établissement + sélecteur multi-établissements ─────
    if (estabRes && estabRes.ok) {
        const allEstabs = await estabRes.json();

        let myEstabs = allEstabs;
        if (currentUser.role === 'directeur') {
            const assigned = currentUser.assigned_establishments || [];
            myEstabs = allEstabs.filter(e => assigned.includes(e.id || String(e._id)));
        } else if (currentUser.role === 'staff' || currentUser.role === 'etablissement') {
            myEstabs = allEstabs.filter(e => (e.id || String(e._id)) === currentEstabId);
        }

        if (myEstabs.length === 0 && !['patron', 'observateur'].includes(currentUser.role)) {
            // Directeur sans établissement assigné → retour dashboard
            window.location.href = '/'; return;
        }

        // Établissement courant dans le header
        const active = myEstabs.find(e => (e.id || String(e._id)) === currentEstabId) || myEstabs[0];
        if (active) {
            if (!currentEstabId) currentEstabId = active.id || String(active._id);
            document.getElementById('header-title').textContent = 'Pointage — ' + active.name;
        }

        // Sélecteur multi-établissements (directeur/patron sans ?estab fixé)
        if (myEstabs.length > 1 && !estabParam) {
            const sel = document.getElementById('estab-select');
            const bar = document.getElementById('estab-select-bar');
            myEstabs.forEach(e => {
                const opt       = document.createElement('option');
                opt.value       = e.id || String(e._id);
                opt.textContent = e.name;
                if (opt.value === currentEstabId) opt.selected = true;
                sel.appendChild(opt);
            });
            bar.classList.add('visible');
            sel.addEventListener('change', () => {
                const chosen = myEstabs.find(e => (e.id || String(e._id)) === sel.value);
                currentEstabId  = sel.value;
                document.getElementById('header-title').textContent = 'Pointage — ' + (chosen ? chosen.name : sel.value);
                loadShifts();
                loadRevenue();
                initCloturePanel();
                loadPointageBadge();
                if (_pvWeekStart) loadPointageVerifQueue();
            });
        }
    }

    // ── Sélecteur de date pour les rôles « vue patron » (saisie d'une soirée passée) ──
    if (MANAGER_ROLES.includes(currentUser.role)) {
        const bar       = document.getElementById('date-select-bar');
        const dateInput = document.getElementById('date-select');
        const btnReset  = document.getElementById('btn-reset-date');
        dateInput.value = today;
        dateInput.max   = toDateStr(new Date()); // pas de futur par défaut
        bar.classList.add('visible');

        dateInput.addEventListener('change', () => {
            if (!dateInput.value) return;
            const auto = getActiveDate();
            setActiveDate(dateInput.value, dateInput.value !== auto);
            loadShifts();
            loadRevenue();
            if (canUseClotureUi()) {
                _cloturesDay = new Date(today + 'T12:00:00');
                renderCloturesList();
            }
        });
        btnReset.addEventListener('click', () => {
            setActiveDate(getActiveDate(), false);
            loadShifts();
            loadRevenue();
            if (canUseClotureUi()) {
                _cloturesDay = new Date(today + 'T12:00:00');
                renderCloturesList();
            }
        });
    }

    await loadShifts();
    initExtraForm();
    initRevenueForm();
    await loadRevenue();
    initCloturePanel();
    initPointageVerifPanel();
}

// ── CA de la soirée ───────────────────────────────────────────────────────────

async function loadRevenue() {
    if (!currentEstabId) return;
    const input = document.getElementById('revenue-input');
    const fb    = document.getElementById('revenue-feedback');
    if (!input) return;
    try {
        const res  = await fetch('/api/revenue/' + encodeURIComponent(currentEstabId) + '/' + today, { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.revenue != null) {
            input.value = data.revenue;
            if (fb) { fb.className = 'revenue-feedback ok'; fb.textContent = '✅ CA déjà enregistré'; }
        } else {
            input.value = '';
            if (fb) { fb.className = 'revenue-feedback'; fb.textContent = ''; }
        }
    } catch { /* silencieux */ }
}

function initRevenueForm() {
    const btn   = document.getElementById('btn-save-revenue');
    const input = document.getElementById('revenue-input');
    const fb    = document.getElementById('revenue-feedback');
    if (!btn || !input) return;
    btn.addEventListener('click', async () => {
        const v = parseFloat(input.value);
        if (Number.isNaN(v) || v < 0) {
            fb.className = 'revenue-feedback error'; fb.textContent = 'Montant invalide';
            return;
        }
        btn.disabled = true;
        const oldLabel = btn.textContent;
        btn.textContent = 'Enregistrement…';
        try {
            const body = { date: today, revenue: v };
            if (currentUser.role !== 'etablissement') body.establishment_id = currentEstabId;
            const res = await fetch('/api/revenue', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            fb.className = 'revenue-feedback ok'; fb.textContent = '✅ CA enregistré';
        } catch (e) {
            fb.className = 'revenue-feedback error'; fb.textContent = e.message || 'Erreur';
        } finally {
            btn.disabled = false;
            btn.textContent = oldLabel;
        }
    });
}

// ── Chargement des shifts ─────────────────────────────────────────────────────

async function loadShifts() {
    const list = document.getElementById('shifts-list');
    list.innerHTML = '<div class="empty-msg">Chargement…</div>';
    try {
        const url = '/api/pointage/' + today +
            (currentUser.role !== 'etablissement' ? '?establishment_id=' + currentEstabId : '');
        const res    = await fetch(url, { credentials: 'include' });
        const shifts = await res.json();
        if (!res.ok) throw new Error(shifts.error);

        // Filtrer les Jokers
        const visible = shifts.filter(s => !s.is_joker && s.staff_id !== '__joker__');

        if (visible.length === 0) {
            list.innerHTML = '<div class="empty-msg">Aucun shift planifié aujourd\'hui</div>';
            return;
        }

        list.innerHTML = '';
        visible.forEach(s => list.appendChild(buildShiftCard(s)));

        window._visibleShifts = visible;
        renderTotalFooter(visible);

    } catch (e) {
        list.innerHTML = '<div class="empty-msg" style="color:var(--danger)">' + e.message + '</div>';
    }
}

// PT-03 : total heures réelles/planifiées du soir
function renderTotalFooter(shifts) {
    const prev = document.getElementById('total-footer');
    if (prev) prev.remove();
    if (!shifts || shifts.length === 0) return;

    let plannedTotal = 0, realTotal = 0, realCount = 0;
    shifts.forEach(s => {
        if (s.end_time != null && s.start_time != null) plannedTotal += (s.end_time - s.start_time);
        if (s.real_start != null && s.real_end != null) {
            realTotal += (s.real_end - s.real_start);
            realCount++;
        }
    });

    const fmt = h => {
        const hh = Math.floor(h);
        const mm = Math.round((h - hh) * 60);
        return hh + 'h' + (mm > 0 ? String(mm).padStart(2,'0') : '');
    };

    const footer = document.createElement('div');
    footer.id = 'total-footer';
    footer.className = 'total-footer';
    footer.innerHTML =
        '<div>' +
            '<div class="total-footer-label">Total de la soirée</div>' +
            '<div class="total-footer-sub">' + realCount + ' / ' + shifts.length + ' shift' + (shifts.length > 1 ? 's' : '') + ' pointé' + (realCount > 1 ? 's' : '') + '</div>' +
        '</div>' +
        '<div style="text-align:right">' +
            '<div class="total-footer-value">' + fmt(realTotal) + '</div>' +
            '<div class="total-footer-sub">Planifié ' + fmt(plannedTotal) + '</div>' +
        '</div>';

    const list = document.getElementById('shifts-list');
    list.parentNode.insertBefore(footer, list.nextSibling);
}

// ── Construction d'une carte shift ───────────────────────────────────────────

function buildShiftCard(shift) {
    // Les rôles « vue patron » peuvent toujours corriger les heures réelles
    const canEdit = currentUser && MANAGER_ROLES.includes(currentUser.role);

    const card = document.createElement('div');
    const isValidated = shift.real_start != null && shift.real_end != null;
    card.className = 'shift-card' + (shift.extra ? ' extra-card' : (isValidated ? ' validated-card' : ''));
    card.dataset.id = String(shift._id);

    // Heures réelles préremplies : valeur saisie si elle existe, sinon les
    // heures planifiées (arrondies au quart d'heure) servent de base par défaut.
    // Les services hors planning n'ont pas d'heures planifiées → champs vides.
    const realStartVal = shift.real_start != null
        ? fmtH(shift.real_start)
        : (shift.extra || shift.start_time == null ? '' : fmtH(roundQuarter(shift.start_time)));
    const realEndVal   = shift.real_end   != null
        ? fmtH(shift.real_end)
        : (shift.extra || shift.end_time == null ? '' : fmtH(roundQuarter(shift.end_time)));
    // Établissement : si les heures sont déjà saisies, la carte sera verrouillée au chargement
    const lockedOnLoad = !canEdit && isValidated;
    const plannedLabel = fmtH(shift.start_time) + ' → ' + fmtH(shift.end_time);

    const ecartDuree = (() => {
        if (shift.real_start == null || shift.real_end == null) return null;
        const realDur    = shift.real_end   - shift.real_start;
        const plannedDur = shift.end_time   - shift.start_time;
        if (realDur <= 0) return null;
        return ecartLabel(plannedDur, realDur);
    })();

    const _shiftSm          = allStaff.find(s => String(s._id) === String(shift.staff_id));
    const _shiftDisplayName = staffDisplayName(_shiftSm, shift.staff_name);

    card.innerHTML =
        '<div class="shift-header">' +
            '<div class="shift-dot" style="background:' + (shift.color || '#888') + '"></div>' +
            '<div class="shift-name">' + _shiftDisplayName + '</div>' +
            (shift.extra
                ? '<span class="extra-badge">Hors planning</span>'
                : '<span class="shift-planned">' + plannedLabel + '</span>') +
            (isValidated ? '<span class="validated-badge">✓ Validé</span>' : '') +
        '</div>' +
        '<div class="shift-body">' +
            '<div class="time-group">' +
                '<div class="time-label">Début réel</div>' +
                '<input type="time" step="900" class="time-input real-start' + (realStartVal ? ' filled' : '') + '" value="' + realStartVal + '">' +
            '</div>' +
            '<div class="time-group">' +
                '<div class="time-label">Fin réelle</div>' +
                '<input type="time" step="900" class="time-input real-end' + (realEndVal ? ' filled' : '') + '" value="' + realEndVal + '">' +
            '</div>' +
            (ecartDuree ? '<span class="ecart-badge ' + ecartDuree.cls + '">' + ecartDuree.text + '</span>' : '<span class="ecart-badge" style="display:none">—</span>') +
            '<button class="btn-save' + (lockedOnLoad ? ' saved' : '') + '"' + (lockedOnLoad ? ' disabled' : '') + '>' + (lockedOnLoad ? '✓ Enregistré' : (canEdit && isValidated ? 'Mettre à jour' : 'Enregistrer')) + '</button>' +
            (isValidated ? '' : '<button class="btn-delete" type="button">Supprimer</button>') +
        '</div>';

    // Mise à jour de l'écart en temps réel
    const startInput = card.querySelector('.real-start');
    const endInput   = card.querySelector('.real-end');
    const ecartEl    = card.querySelector('.ecart-badge');
    const btnSave    = card.querySelector('.btn-save');

    // Établissement : si déjà validé au chargement, verrouiller immédiatement
    if (lockedOnLoad) {
        startInput.disabled = true;
        endInput.disabled   = true;
    }

    // Patron/directeur : toujours éditable, pas de blocage service en cours
    if (!canEdit && !shift.extra) {
        const now      = new Date();
        const nowHour  = now.getHours();
        const nowFloat = nowHour + now.getMinutes() / 60;

        // Fenêtre de saisie soirée : de cutoffOpenHour (soir) jusqu'à cutoffHour (matin).
        // La fenêtre peut chevaucher minuit (ex : 22h → 09h).
        // cutoffOpenHour = 0 → fenêtre commence à minuit (comportement historique).
        const inClosingWindow = (cutoffOpenHour > 0 && nowHour >= cutoffOpenHour) || nowHour < cutoffHour;

        let serviceFinished = true;

        if (!inClosingWindow) {
            const shiftDate    = shift.date;
            const todayStr     = toDateStr(now);
            const yesterday    = new Date(now);
            yesterday.setDate(now.getDate() - 1);
            const yesterdayStr = toDateStr(yesterday);

            if (shiftDate === todayStr) {
                if (shift.end_time > 24) {
                    serviceFinished = false; // passe minuit, encore en cours dans la soirée
                } else {
                    serviceFinished = nowFloat >= shift.end_time;
                }
            } else if (shiftDate === yesterdayStr && shift.end_time > 24) {
                // Shift d'hier passant minuit — terminé (on n'est plus dans la fenêtre)
                serviceFinished = true;
            }
        }
        // inClosingWindow === true → serviceFinished = true → saisie ouverte

        if (!serviceFinished) {
            startInput.disabled = true;
            endInput.disabled   = true;
            btnSave.disabled    = true;
            const endH = Math.floor(shift.end_time % 24);
            const endM = Math.round((shift.end_time % 1) * 60);
            const endLabel = String(endH).padStart(2,'0') + 'h' + (endM > 0 ? String(endM).padStart(2,'0') : '00');
            const msg = document.createElement('div');
            msg.style.cssText = 'width:100%;font-size:12px;color:var(--warning-text);background:var(--warning-bg);border:1px solid var(--warning);border-radius:6px;padding:6px 10px;margin-top:4px';
            msg.textContent = 'Service en cours jusqu\'à ' + endLabel;
            card.querySelector('.shift-body').appendChild(msg);
        }
    }

    function updateEcart() {
        const rs = parseTimeInput(startInput.value);
        const re = parseTimeInput(endInput.value, rs);
        startInput.classList.toggle('filled', !!startInput.value);
        endInput.classList.toggle('filled',   !!endInput.value);
        if (rs != null && re != null && re > rs) {
            const realDur    = re - rs;
            const plannedDur = shift.end_time - shift.start_time;
            const e = ecartLabel(plannedDur, realDur);
            if (e) { ecartEl.textContent = e.text; ecartEl.className = 'ecart-badge ' + e.cls; ecartEl.style.display = ''; }
        } else {
            ecartEl.style.display = 'none';
        }
    }

    startInput.addEventListener('input', updateEcart);
    endInput.addEventListener('input',   updateEcart);
    // Recaler sur le quart d'heure dès que la valeur est confirmée
    startInput.addEventListener('change', () => { snapInputToQuarter(startInput); updateEcart(); });
    endInput.addEventListener('change',   () => { snapInputToQuarter(endInput);   updateEcart(); });
    // Refléter l'écart des heures préremplies (= planifié par défaut)
    updateEcart();

    btnSave.addEventListener('click', async () => {
        const rs = roundQuarter(parseTimeInput(startInput.value));
        const re = roundQuarter(parseTimeInput(endInput.value, rs));
        if (rs == null && re == null) { showToast('Saisis au moins une heure', true); return; }
        btnSave.disabled = true;
        try {
            const res = await fetch('/api/shifts/' + shift._id + '/pointage', {
                credentials: 'include', method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ real_start: rs, real_end: re }),
            });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error);

            // Passer la carte en état validé
            card.classList.remove('extra-card');
            card.classList.add('validated-card');
            const hdr = card.querySelector('.shift-header');
            if (hdr && !hdr.querySelector('.validated-badge')) {
                const vBadge = document.createElement('span');
                vBadge.className = 'validated-badge';
                vBadge.textContent = '✓ Validé';
                hdr.appendChild(vBadge);
            }

            shift.real_start = rs;
            shift.real_end   = re;

            if (canEdit) {
                // Patron/directeur : feedback visuel puis on reste éditable
                btnSave.textContent = '✓ Mis à jour';
                btnSave.className   = 'btn-save saved';
                setTimeout(() => {
                    btnSave.textContent = 'Mettre à jour';
                    btnSave.className   = 'btn-save';
                    btnSave.disabled    = false;
                }, 1500);
            } else {
                // Établissement/staff : saisie unique verrouillée
                btnSave.textContent = '✓ Enregistré';
                btnSave.className   = 'btn-save saved';
                startInput.disabled = true;
                endInput.disabled   = true;
            }
            if (window._visibleShifts) renderTotalFooter(window._visibleShifts);
            showToast(shift.staff_name + ' — heures enregistrées');
        } catch (e) {
            showToast(e.message, true);
            btnSave.disabled = false;
        }
    });

    // Suppression d'un shift non pointé (2 clics : Supprimer → Confirmer)
    const btnDelete = card.querySelector('.btn-delete');
    if (btnDelete) {
        let confirmTimer = null;
        const resetBtn = () => {
            btnDelete.classList.remove('confirming');
            btnDelete.textContent = 'Supprimer';
            confirmTimer = null;
        };
        btnDelete.addEventListener('click', async () => {
            if (!btnDelete.classList.contains('confirming')) {
                btnDelete.classList.add('confirming');
                btnDelete.textContent = 'Confirmer ?';
                clearTimeout(confirmTimer);
                confirmTimer = setTimeout(resetBtn, 4000);
                return;
            }
            clearTimeout(confirmTimer);
            btnDelete.disabled = true;
            try {
                const res = await fetch('/api/shifts/' + shift._id + '/pointage', {
                    credentials: 'include', method: 'DELETE',
                });
                const d = await res.json();
                if (!res.ok) throw new Error(d.error);
                card.remove();
                if (window._visibleShifts) {
                    window._visibleShifts = window._visibleShifts.filter(s => String(s._id) !== String(shift._id));
                    renderTotalFooter(window._visibleShifts);
                    if (window._visibleShifts.length === 0) {
                        document.getElementById('shifts-list').innerHTML =
                            '<div class="empty-msg">Aucun shift planifié aujourd\'hui</div>';
                    }
                }
                showToast(shift.staff_name + ' — shift supprimé');
            } catch (e) {
                showToast(e.message, true);
                btnDelete.disabled = false;
                resetBtn();
            }
        });
    }

    return card;
}

// ── Formulaire service extra ──────────────────────────────────────────────────

function initExtraForm() {
    const searchInput = document.getElementById('extra-staff-search');
    const suggestions = document.getElementById('staff-suggestions');
    const hiddenId    = document.getElementById('extra-staff-id');
    const freeName    = document.getElementById('extra-staff-name-free');

    // Autocomplete staff
    function renderSuggestions(val) {
        hiddenId.value = '';
        freeName.style.display = 'none';

        suggestions.innerHTML = '';

        if (activeStaff.length === 0) {
            // Aucun staff chargé — proposer saisie libre directement
            freeName.style.display = '';
            suggestions.style.display = 'none';
            return;
        }

        // Sans saisie : afficher en priorité le staff de l'établissement courant
        let pool = activeStaff;
        if (!val && currentEstabId) {
            const estabStaff = activeStaff.filter(s => s.venues && s.venues.includes(currentEstabId));
            if (estabStaff.length > 0) pool = estabStaff;
        }

        const matches = val
            ? activeStaff.filter(s => matchesWordPrefix(s.name, val)).slice(0, 8)
            : pool.slice(0, 8);

        if (matches.length === 0) {
            // Aucun staff trouvé — proposer le nom libre
            freeName.style.display = '';
            freeName.value = searchInput.value;
            suggestions.style.display = 'none';
            return;
        }

        matches.forEach(s => {
            const item = document.createElement('div');
            item.className = 'staff-suggestion-item';
            const shortName = staffDisplayName(s);
            const showFull  = shortName !== s.name;
            item.innerHTML =
                '<span style="width:10px;height:10px;border-radius:50%;background:' + s.color + ';flex-shrink:0;display:inline-block"></span>' +
                '<span>' + shortName + '</span>' +
                (showFull ? '<span style="color:var(--text-muted);font-size:11px;margin-left:auto">' + s.name + '</span>' : '');
            item.addEventListener('click', () => {
                searchInput.value  = shortName;
                hiddenId.value     = String(s._id);
                freeName.style.display = 'none';
                suggestions.style.display = 'none';
            });
            suggestions.appendChild(item);
        });

        // Option nom libre (seulement si l'utilisateur a tapé quelque chose)
        if (val) {
            const libre = document.createElement('div');
            libre.className = 'staff-suggestion-item';
            libre.style.color = 'var(--text-muted)';
            libre.innerHTML = '<span style="font-size:12px">✏️ Saisir "' + searchInput.value + '" comme nom libre</span>';
            libre.addEventListener('click', () => {
                hiddenId.value = '';
                freeName.style.display = '';
                freeName.value = searchInput.value;
                suggestions.style.display = 'none';
            });
            suggestions.appendChild(libre);
        }

        suggestions.style.display = 'block';
    }

    searchInput.addEventListener('focus', () => {
        renderSuggestions(normalizeStr(searchInput.value).trim());
    });

    searchInput.addEventListener('input', () => {
        renderSuggestions(normalizeStr(searchInput.value).trim());
    });

    // Fermer suggestions au clic extérieur
    document.addEventListener('click', e => {
        if (!e.target.closest('#extra-staff-search') && !e.target.closest('#staff-suggestions'))
            suggestions.style.display = 'none';
    });

    // Recaler les heures du service hors planning sur le quart d'heure
    const extraStart = document.getElementById('extra-real-start');
    const extraEnd   = document.getElementById('extra-real-end');
    extraStart.addEventListener('change', () => snapInputToQuarter(extraStart));
    extraEnd.addEventListener('change',   () => snapInputToQuarter(extraEnd));

    // Bouton enregistrer extra
    document.getElementById('btn-add-extra').addEventListener('click', async () => {
        const staffId   = document.getElementById('extra-staff-id').value || null;
        const staffName = freeName.style.display !== 'none'
            ? freeName.value.trim()
            : searchInput.value.trim();
        const realStart = roundQuarter(parseTimeInput(document.getElementById('extra-real-start').value));
        const realEnd   = roundQuarter(parseTimeInput(document.getElementById('extra-real-end').value, realStart));

        if (!staffName)       { showToast('Nom du staff requis', true);          return; }
        // Avertir si le nom a été tapé sans être sélectionné dans la liste
        // F-14 — `activeStaff` et pas `allStaff`, sinon le message envoie dans le mur :
        // taper le nom d'une personne archivée déclencherait « sélectionne-le dans la liste
        // déroulante » alors qu'elle n'y figure plus. La personne partie retombe donc en
        // saisie libre, et c'est le serveur qui tranche avec le vrai motif (409 « archivée »)
        // au lieu d'une consigne impossible à suivre.
        if (!staffId && freeName.style.display === 'none' && activeStaff.some(s => normalizeStr(s.name) === normalizeStr(staffName))) {
            showToast('Sélectionne "' + staffName + '" dans la liste déroulante', true);
            renderSuggestions(normalizeStr(staffName));
            return;
        }
        if (realStart == null) { showToast('Heure de début requise', true);       return; }
        if (realEnd   == null) { showToast('Heure de fin requise', true);         return; }
        if (realEnd <= realStart) { showToast('Fin doit être après le début', true); return; }

        const btn = document.getElementById('btn-add-extra');
        btn.disabled = true;
        try {
            const res = await fetch('/api/shifts/extra', {
                credentials: 'include', method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    staff_id:        staffId,
                    staff_name:      staffName,
                    date:            today,
                    real_start:      realStart,
                    real_end:        realEnd,
                    establishment_id: currentUser.role !== 'etablissement' ? currentEstabId : undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            if (canUseClotureUi()) {
                renderCloturesList();
            } else {
                // Ajouter la carte du nouveau shift (vue tablette)
                const list = document.getElementById('shifts-list');
                if (list) list.appendChild(buildShiftCard(data));
                if (window._visibleShifts) {
                    window._visibleShifts.push(data);
                    renderTotalFooter(window._visibleShifts);
                }
            }

            // Reset form
            searchInput.value = '';
            freeName.value    = '';
            freeName.style.display = 'none';
            document.getElementById('extra-real-start').value = '';
            document.getElementById('extra-real-end').value   = '';
            document.getElementById('extra-staff-id').value   = '';
            showToast(staffName + ' — service ajouté');
        } catch (e) {
            showToast(e.message, true);
        } finally {
            btn.disabled = false;
        }
    });
}

// ── Clôture OTP + récap semaine (fusionnée dans Pointage) ─────────────────────

const CLOTURE_ROLES = ['patron', 'directeur'];
let _codeCloturePoll = null;
let _codeClotureExpireMs = null;
let _codeClotureTick = null;
let _cloturesDay = null;
let _clotureBound = false;

function canUseClotureUi() {
    // Patron/directeur : toujours. Staff : seulement s'il est sur pointage.html
    // en tant que responsable de soirée (?estab= déjà vérifié à l'init).
    return !!(currentUser && (
        CLOTURE_ROLES.includes(currentUser.role)
        || (currentUser.role === 'staff' && currentEstabId)
    ));
}

function isClotureManager() {
    return !!(currentUser && CLOTURE_ROLES.includes(currentUser.role));
}

function setLegacyPointageVisible(visible) {
    const block = document.getElementById('legacy-pointage-block');
    const list = document.getElementById('shifts-list');
    if (block) block.style.display = visible ? '' : 'none';
    // Filet si HTML périmé sans #legacy-pointage-block
    if (!block && list) list.style.display = visible ? '' : 'none';
    const footer = document.getElementById('total-footer');
    if (!visible && footer) footer.remove();
}

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function addDaysLocal(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
}

function formatDateFr(d) {
    return d.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    });
}

function stopCodeClotureTimers() {
    if (_codeCloturePoll) { clearInterval(_codeCloturePoll); _codeCloturePoll = null; }
    if (_codeClotureTick) { clearInterval(_codeClotureTick); _codeClotureTick = null; }
}

function updateCodeClotureCountdown() {
    const el = document.getElementById('cc-countdown');
    if (!el || !_codeClotureExpireMs) { if (el) el.textContent = '—'; return; }
    const left = Math.max(0, _codeClotureExpireMs - Date.now());
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    el.textContent = left <= 0 ? 'Expiré — actualise' : ('expire dans ' + m + ' min ' + String(s).padStart(2, '0') + ' s');
    if (left <= 0) refreshCodeCloture(true);
}

async function refreshCodeCloture(force) {
    if (!canUseClotureUi() || !currentEstabId) return;
    try {
        const q = today ? ('?date=' + encodeURIComponent(today)) : '';
        const res = await fetch('/api/etablissements/' + encodeURIComponent(currentEstabId) + '/code-cloture' + q, {
            credentials: 'include',
        });
        if (!res.ok) {
            if (force) showToast('Impossible de charger le code', true);
            return;
        }
        const data = await res.json();
        const codeEl = document.getElementById('cc-code');
        if (codeEl) codeEl.textContent = data.code || '····';
        _codeClotureExpireMs = data.expire_ms || null;
        updateCodeClotureCountdown();
        if (!_codeClotureTick) _codeClotureTick = setInterval(updateCodeClotureCountdown, 1000);
        if (!_codeCloturePoll) _codeCloturePoll = setInterval(() => refreshCodeCloture(false), 20000);
    } catch {
        if (force) showToast('Impossible de charger le code', true);
    }
}

async function renderCloturesList() {
    const list = document.getElementById('clotures-list');
    const label = document.getElementById('clotures-day-label');
    if (!list || !_cloturesDay || !currentEstabId) return;
    const dayStr = toDateStr(_cloturesDay);
    const monday = toDateStr(Week.weekStart(_cloturesDay));
    if (label) {
        const raw = formatDateFr(_cloturesDay);
        label.textContent = raw.charAt(0).toUpperCase() + raw.slice(1);
    }

    list.innerHTML = '<div class="cloture-loading">Chargement…</div>';
    try {
        const res = await fetch(
            '/api/etablissements/' + encodeURIComponent(currentEstabId) + '/clotures-semaine?week_start=' + monday,
            { credentials: 'include' }
        );
        const shifts = await res.json();
        if (!res.ok) throw new Error(shifts.error || 'Erreur');
        const dayShifts = (shifts || []).filter(s => s.date === dayStr);
        if (!dayShifts.length) {
            list.innerHTML = '<div class="cloture-empty">Aucun shift ce jour</div>';
            return;
        }
        list.innerHTML = '';
        dayShifts
            .slice()
            .sort((a, b) => String(a.staff_name || '').localeCompare(String(b.staff_name || ''), 'fr'))
            .forEach(s => {
                const row = document.createElement('div');
                const hasDebut = !!s.debut_valide_code;
                const closed = !!s.heure_validee_finale;
                const inService = hasDebut && !closed;
                row.className = 'cloture-row' + (closed ? ' closed' : '');
                let statusBadge;
                if (closed) {
                    statusBadge = '<span class="cloture-badge ' + (s.cloture_source === 'manuelle' ? 'manuelle' : 'code') + '">Clôturé</span>';
                } else if (inService) {
                    statusBadge = '<span class="cloture-badge code">En service</span>';
                } else {
                    statusBadge = '<span class="cloture-badge wait">Non commencé</span>';
                }
                const validBadge = s.patron_valide
                    ? '<span class="cloture-badge ok">Récap validé</span>'
                    : '';
                const fmtPlan = h => (h != null && window.ShiftHours ? ShiftHours.fmtHourOfDay(h) : (h != null ? fmtH(h) : '—'));
                const fmtReal = (a, b) => (a != null && b != null && window.ShiftHours)
                    ? (ShiftHours.fmtHourOfDay(a) + '–' + ShiftHours.fmtHourOfDay(b))
                    : '—';
                row.innerHTML =
                    '<div class="cloture-row-main">' +
                        '<div class="cloture-row-name">' + escapeHtml(s.staff_name || '—') +
                        (s.is_joker ? ' <span class="joker">(Joker)</span>' : '') + '</div>' +
                        '<div class="cloture-row-meta">' +
                        'Planifié ' + fmtPlan(s.start_time) + '–' + fmtPlan(s.end_time) +
                        ' · ' + statusBadge + ' ' + validBadge + '</div>' +
                        '<div class="cloture-row-hours">' +
                            '<span>Début origine : <strong>' + escapeHtml(s.debut_valide_code || '—') + '</strong></span>' +
                            '<span>Début retenu : <strong>' + escapeHtml(s.debut_valide_finale || '—') + '</strong></span>' +
                        '</div>' +
                        '<div class="cloture-row-hours">' +
                            '<span>Fin origine : <strong>' + escapeHtml(s.heure_validee_code || '—') + '</strong></span>' +
                            '<span>Fin retenue : <strong>' + escapeHtml(s.heure_validee_finale || '—') + '</strong></span>' +
                        '</div>' +
                        '<div class="cloture-row-hours">' +
                            '<span>Heures réelles : <strong>' + escapeHtml(fmtReal(s.real_start, s.real_end)) + '</strong></span>' +
                        '</div>' +
                        (s.motif_modification ? '<div class="cloture-row-motif">' + escapeHtml(s.motif_modification) + '</div>' : '') +
                    '</div>' +
                    '<div class="cloture-row-actions"></div>';
                const actions = row.querySelector('.cloture-row-actions');
                if (!hasDebut && !closed) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.textContent = 'Début manuel';
                    btn.addEventListener('click', () => clotureManuelle(s, 'debut'));
                    actions.appendChild(btn);
                } else if (hasDebut && !closed) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.textContent = 'Fin manuelle';
                    btn.addEventListener('click', () => clotureManuelle(s, 'fin'));
                    actions.appendChild(btn);
                } else if (closed) {
                    const canAdjust = isClotureManager()
                        || (currentUser.role === 'staff' && !s.patron_valide);
                    if (canAdjust) {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'btn-adjust';
                        btn.textContent = 'Ajuster';
                        btn.addEventListener('click', () => ajusterHeureCloture(s));
                        actions.appendChild(btn);
                    }
                    if (isClotureManager()) {
                        const btnLog = document.createElement('button');
                        btnLog.type = 'button';
                        btnLog.textContent = 'Historique';
                        btnLog.title = 'Logs de validation (litige)';
                        btnLog.addEventListener('click', () => showShiftValidationLogs(s));
                        actions.appendChild(btnLog);
                    }
                }
                list.appendChild(row);
            });
    } catch (e) {
        list.innerHTML = '<div class="cloture-error">' + escapeHtml(e.message || 'Erreur') + '</div>';
    }
}

async function clotureManuelle(shift, phase) {
    const isDebut = phase === 'debut';
    const forceBoth = !isDebut && !shift.debut_valide_code;
    const plannedDebut = shift.start_time != null
        ? (window.ShiftHours ? ShiftHours.fmtHourOfDay(shift.start_time) : fmtH(shift.start_time))
        : '';
    const plannedFin = shift.end_time != null
        ? (window.ShiftHours ? ShiftHours.fmtHourOfDay(shift.end_time) : fmtH(shift.end_time))
        : '';

    openHeureModal({
        title: isDebut ? 'Début manuel — ' + (shift.staff_name || '') : 'Fin manuelle — ' + (shift.staff_name || ''),
        hint: forceBoth
            ? 'Début non pointé : saisis début et fin (préremplis aux heures planifiées).'
            : (isDebut
                ? 'Laisse vide pour utiliser le début planifié (' + (plannedDebut || '—') + ').'
                : 'Laisse vide pour utiliser la fin planifiée (' + (plannedFin || '—') + ').'),
        showDebut: isDebut || forceBoth,
        showFin: !isDebut || forceBoth,
        showMotif: false,
        debutValue: isDebut
            ? (shift.debut_valide_finale || plannedDebut || '')
            : (plannedDebut || ''),
        finValue: plannedFin || '',
        onSubmit: async ({ debut, fin }) => {
            const body = { phase: isDebut ? 'debut' : 'fin' };
            if (forceBoth) {
                if (!debut) { showToast('Heure de début requise', true); return false; }
                body.heure_debut = debut;
                if (fin) body.heure = fin;
            } else if (isDebut) {
                if (debut) body.heure = debut;
            } else if (fin) {
                body.heure = fin;
            }
            const res = await fetch('/api/shifts/' + shift._id + '/cloturer-manuel', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erreur');
            showToast(isDebut ? 'Début manuel enregistré' : 'Fin manuelle enregistrée');
            renderCloturesList();
            refreshCodeCloture(true);
            refreshVerifAfterMutation();
            return true;
        },
    });
}

async function ajusterHeureCloture(shift) {
    openHeureModal({
        title: 'Ajuster — ' + (shift.staff_name || ''),
        hint: 'Les heures d\'origine (code) restent inchangées. Seules les heures retenues sont modifiées.',
        showDebut: true,
        showFin: true,
        showMotif: true,
        debutValue: shift.debut_valide_finale || '',
        finValue: shift.heure_validee_finale || '',
        motifValue: shift.motif_modification || '',
        onSubmit: async ({ debut, fin, motif }) => {
            if (!debut && !fin) {
                showToast('Indique au moins une heure', true);
                return false;
            }
            const body = { motif: motif || undefined };
            if (debut) body.debut_valide_finale = debut;
            if (fin) body.heure_validee_finale = fin;
            const res = await fetch('/api/shifts/' + shift._id + '/ajuster-heure', {
                method: 'PATCH', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Erreur');
            showToast('Heures ajustées (origines conservées)');
            renderCloturesList();
            refreshVerifAfterMutation();
            return true;
        },
    });
}

let _heureModalSubmit = null;

function closeHeureModal() {
    document.getElementById('heure-modal')?.classList.remove('open');
    _heureModalSubmit = null;
}

function openHeureModal(opts) {
    const modal = document.getElementById('heure-modal');
    if (!modal) return;
    const title = document.getElementById('heure-modal-title');
    const hint = document.getElementById('heure-modal-hint');
    const gDebut = document.getElementById('heure-group-debut');
    const gFin = document.getElementById('heure-group-fin');
    const inDebut = document.getElementById('heure-modal-debut');
    const inFin = document.getElementById('heure-modal-fin');
    const motif = document.getElementById('heure-modal-motif');
    const btn = document.getElementById('heure-modal-submit');

    if (title) title.textContent = opts.title || 'Saisie';
    if (hint) hint.textContent = opts.hint || '';
    if (gDebut) gDebut.style.display = opts.showDebut ? '' : 'none';
    if (gFin) gFin.style.display = opts.showFin ? '' : 'none';
    if (motif) {
        motif.style.display = opts.showMotif ? '' : 'none';
        motif.value = opts.motifValue || '';
    }
    if (inDebut) {
        inDebut.value = normalizeTimeInputValue(opts.debutValue);
        snapInputToQuarter(inDebut);
    }
    if (inFin) {
        inFin.value = normalizeTimeInputValue(opts.finValue);
        snapInputToQuarter(inFin);
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Enregistrer'; }
    _heureModalSubmit = opts.onSubmit || null;
    modal.classList.add('open');
    const focusEl = opts.showDebut ? inDebut : inFin;
    setTimeout(() => focusEl?.focus(), 50);
}

/** Accepte "HH:MM" ou "HHhMM" → valeur pour <input type="time">. */
function normalizeTimeInputValue(v) {
    if (!v) return '';
    const s = String(v).trim().replace('h', ':');
    const m = s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return '';
    return String(m[1]).padStart(2, '0') + ':' + m[2];
}

async function submitHeureModal() {
    if (!_heureModalSubmit) return;
    const gDebut = document.getElementById('heure-group-debut');
    const gFin = document.getElementById('heure-group-fin');
    const inDebut = document.getElementById('heure-modal-debut');
    const inFin = document.getElementById('heure-modal-fin');
    const motif = document.getElementById('heure-modal-motif');
    const btn = document.getElementById('heure-modal-submit');
    if (inDebut) snapInputToQuarter(inDebut);
    if (inFin) snapInputToQuarter(inFin);
    if (btn) btn.disabled = true;
    try {
        const debutVisible = gDebut && gDebut.style.display !== 'none';
        const finVisible = gFin && gFin.style.display !== 'none';
        const ok = await _heureModalSubmit({
            debut: debutVisible ? (inDebut?.value || '').trim() : '',
            fin: finVisible ? (inFin?.value || '').trim() : '',
            motif: (motif && motif.style.display !== 'none') ? motif.value.trim() : '',
        });
        if (ok !== false) closeHeureModal();
    } catch (e) {
        showToast(e.message, true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function validateCloturesWeek() {
    if (!isClotureManager() || !currentEstabId || !_cloturesDay) return;
    const monday = toDateStr(Week.weekStart(_cloturesDay));
    if (!confirm('Valider le récap de la semaine du ' + monday + ' pour cet établissement ?\nLes shifts déjà clôturés seront marqués validés.')) return;
    try {
        const res = await fetch('/api/etablissements/' + encodeURIComponent(currentEstabId) + '/valider-recap', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ week_start: monday }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        showToast((data.modified || 0) + ' shift(s) validé(s)');
        renderCloturesList();
    } catch (e) { showToast(e.message, true); }
}

function fmtHeureSaisie(hs) {
    if (!hs || hs.year == null) return '—';
    const pad = n => String(n).padStart(2, '0');
    return pad(hs.day) + '/' + pad(hs.month) + '/' + hs.year + ' ' + pad(hs.hour) + ':' + pad(hs.minute);
}

function resultatLabel(r) {
    const map = {
        accepte: 'Accepté',
        sync_real: 'Sync heures réelles',
        refuse_code_invalide: 'Code invalide',
        refuse_code_deja_utilise: 'Code déjà utilisé',
        refuse_code_expire: 'Code expiré',
    };
    return map[r] || (r || '—');
}

async function showShiftValidationLogs(shift) {
    const modal = document.getElementById('litige-modal');
    const title = document.getElementById('litige-modal-title');
    const body = document.getElementById('litige-modal-body');
    if (!modal || !body) return;
    if (title) title.textContent = 'Historique — ' + (shift.staff_name || 'Shift');
    body.innerHTML = '<div class="cloture-loading">Chargement…</div>';
    modal.classList.add('open');
    try {
        const res = await fetch('/api/shifts/' + shift._id + '/time-validations', { credentials: 'include' });
        const docs = await res.json();
        if (!res.ok) throw new Error(docs.error || 'Erreur');
        if (!docs.length) {
            body.innerHTML = '<div class="cloture-empty">Aucun événement enregistré</div>';
            return;
        }
        body.innerHTML = docs.map(v =>
            '<div class="litige-row">' +
                '<div class="litige-row-top">' +
                    '<strong>' + escapeHtml(resultatLabel(v.resultat)) + '</strong>' +
                    '<span>' + escapeHtml(fmtHeureSaisie(v.heure_saisie)) + '</span>' +
                '</div>' +
                '<div class="litige-row-meta">' +
                    escapeHtml([v.action, v.phase, v.source, v.acteur_role].filter(Boolean).join(' · ')) +
                    (v.code_saisi ? ' · code ' + escapeHtml(v.code_saisi) : '') +
                '</div>' +
                (v.debut_retenue || v.fin_retenue
                    ? '<div class="litige-row-meta">Retenues ' + escapeHtml(v.debut_retenue || '—') + ' → ' + escapeHtml(v.fin_retenue || '—') + '</div>'
                    : '') +
                (v.real_start != null
                    ? '<div class="litige-row-meta">real ' + escapeHtml(String(v.real_start)) + '–' + escapeHtml(String(v.real_end)) + '</div>'
                    : '') +
                (v.motif ? '<div class="litige-row-motif">' + escapeHtml(v.motif) + '</div>' : '') +
            '</div>'
        ).join('');
    } catch (e) {
        body.innerHTML = '<div class="cloture-error">' + escapeHtml(e.message || 'Erreur') + '</div>';
    }
}

function initCloturePanel() {
    const panel = document.getElementById('cloture-panel');
    if (!panel) return;
    const gate = canUseClotureUi();
    if (!gate || !currentEstabId) {
        panel.classList.remove('visible');
        stopCodeClotureTimers();
        setLegacyPointageVisible(true);
        return;
    }
    panel.classList.add('visible');
    setLegacyPointageVisible(false);
    // Valider le récap + nav jours = patron/directeur uniquement
    const btnValidate = document.getElementById('clotures-validate-week');
    if (btnValidate) btnValidate.style.display = isClotureManager() ? '' : 'none';
    const prev = document.getElementById('clotures-prev-day');
    const next = document.getElementById('clotures-next-day');
    if (prev) prev.style.display = isClotureManager() ? '' : 'none';
    if (next) next.style.display = isClotureManager() ? '' : 'none';
    // Responsable : verrouillé sur la soirée active (`today`)
    _cloturesDay = today ? new Date(today + 'T12:00:00') : new Date();
    if (!_clotureBound) {
        _clotureBound = true;
        document.getElementById('cc-refresh')?.addEventListener('click', () => refreshCodeCloture(true));
        document.getElementById('clotures-prev-day')?.addEventListener('click', () => {
            if (!isClotureManager()) return;
            _cloturesDay = addDaysLocal(_cloturesDay, -1);
            renderCloturesList();
        });
        document.getElementById('clotures-next-day')?.addEventListener('click', () => {
            if (!isClotureManager()) return;
            _cloturesDay = addDaysLocal(_cloturesDay, 1);
            renderCloturesList();
        });
        document.getElementById('clotures-validate-week')?.addEventListener('click', validateCloturesWeek);
        document.getElementById('litige-modal-close')?.addEventListener('click', () => {
            document.getElementById('litige-modal')?.classList.remove('open');
        });
        document.getElementById('litige-modal')?.addEventListener('click', e => {
            if (e.target.id === 'litige-modal') e.currentTarget.classList.remove('open');
        });
        document.getElementById('heure-modal-close')?.addEventListener('click', closeHeureModal);
        document.getElementById('heure-modal-cancel')?.addEventListener('click', closeHeureModal);
        document.getElementById('heure-modal-submit')?.addEventListener('click', submitHeureModal);
        document.getElementById('heure-modal')?.addEventListener('click', e => {
            if (e.target.id === 'heure-modal') closeHeureModal();
        });
        document.getElementById('heure-modal-debut')?.addEventListener('change', e => snapInputToQuarter(e.target));
        document.getElementById('heure-modal-fin')?.addEventListener('change', e => snapInputToQuarter(e.target));
    }
    refreshCodeCloture(true);
    renderCloturesList();
}

// ── Vérification Pointage (patron / directeur / observateur) ─────────────────

function refreshVerifAfterMutation() {
    if (!canUseVerifPanel()) return;
    loadPointageBadge();
    if (_pvWeekStart) loadPointageVerifQueue();
}

function canUseVerifPanel() {
    return !!(currentUser && MANAGER_ROLES.includes(currentUser.role));
}

let _pvWeekStart = null;
let _pvJournalWeek = null;
let _pvBound = false;

async function loadPointageBadge() {
    if (!canUseVerifPanel()) return;
    try {
        const res = await fetch('/api/pointage/verif/count', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        const count = data.total || 0;
        const label = count > 99 ? '99+' : String(count);
        const badge = document.getElementById('pointage-badge');
        if (badge) {
            badge.textContent = label;
            badge.style.display = count > 0 ? 'inline-flex' : 'none';
        }
        const inline = document.getElementById('pv-badge-inline');
        if (inline) {
            if (count > 0) {
                inline.style.display = '';
                inline.textContent = count + ' à traiter';
            } else {
                inline.style.display = 'none';
            }
        }
        if (!_pvWeekStart && data.week_start) {
            _pvWeekStart = data.week_start;
            _pvJournalWeek = data.week_start;
        }
    } catch { /* silencieux */ }
}

function _pvFmtH(h) {
    if (h == null || h === '') return '—';
    return window.ShiftHours ? ShiftHours.fmtHourOfDay(h) : String(h);
}

function _pvFmtParts(p) {
    if (!p || p.year == null) return '—';
    const pad = n => String(n).padStart(2, '0');
    return pad(p.day) + '/' + pad(p.month) + '/' + p.year + ' ' + pad(p.hour) + ':' + pad(p.minute);
}

function _pvSourceBadge(label) {
    if (!label) return '';
    const cls = label === 'Code OTP' ? 'otp' : (label === 'Saisie manuelle' ? 'manuel' : 'autre');
    return '<span class="pv-source-badge ' + cls + '">' + escapeHtml(label) + '</span>';
}

function _pvAddDays(dateStr, n) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return toDateStr(d);
}

function _pvWeekLabel(monday) {
    const sun = _pvAddDays(monday, 6);
    const fmt = s => {
        const parts = s.split('-');
        return parts[2] + '/' + parts[1];
    };
    return 'Semaine du ' + fmt(monday) + ' → ' + fmt(sun);
}

function switchPointageVerifTab(tab) {
    const queue = document.getElementById('pv-tab-queue');
    const journal = document.getElementById('pv-tab-journal');
    const btnQ = document.getElementById('pv-tab-btn-queue');
    const btnJ = document.getElementById('pv-tab-btn-journal');
    if (tab === 'journal') {
        if (queue) queue.style.display = 'none';
        if (journal) journal.style.display = '';
        btnQ?.classList.remove('active');
        btnJ?.classList.add('active');
        loadPointageVerifJournal();
    } else {
        if (queue) queue.style.display = '';
        if (journal) journal.style.display = 'none';
        btnJ?.classList.remove('active');
        btnQ?.classList.add('active');
        loadPointageVerifQueue();
    }
}

function scrollToVerifPanel() {
    const panel = document.getElementById('pointage-verif-panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function loadPointageVerifQueue() {
    const list = document.getElementById('pv-queue-list');
    const label = document.getElementById('pv-week-label');
    if (!list || !_pvWeekStart) return;
    if (label) label.textContent = _pvWeekLabel(_pvWeekStart);
    list.innerHTML = '<div class="empty-msg" style="padding:20px">Chargement…</div>';
    try {
        const res = await fetch('/api/pointage/verif/pending?week_start=' + encodeURIComponent(_pvWeekStart), { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        const items = data.items || [];
        const nonClot = items.filter(i => i.statut === 'non_cloture');
        const aVal = items.filter(i => i.statut === 'a_valider');
        if (!items.length) {
            list.innerHTML = '<div class="empty-msg" style="padding:20px">Rien à vérifier pour cette semaine.</div>';
            return;
        }
        let html = '';
        const section = (title, rows) => {
            if (!rows.length) return;
            html += '<div class="extra-title" style="margin:12px 0 8px">' + escapeHtml(title) + ' (' + rows.length + ')</div>';
            rows.forEach(s => {
                html += '<div class="cloture-row' + (s.statut === 'a_valider' ? ' closed' : '') + '" data-pv-id="' + escapeHtml(String(s._id)) + '">';
                html += '<div class="cloture-row-main">';
                html += '<div class="cloture-row-name">' + escapeHtml(s.staff_name || '—') + '</div>';
                html += '<div class="cloture-row-meta">' + escapeHtml(s.establishment_name || '') + ' · ' + escapeHtml(s.date || '') + '</div>';
                html += '<div class="cloture-row-hours">Planifié ' + escapeHtml(_pvFmtH(s.start_time)) + '–' + escapeHtml(_pvFmtH(s.end_time)) + '</div>';
                html += '<div class="cloture-row-hours">Début : <strong>' + escapeHtml(s.debut_valide_finale || '—') + '</strong>' + _pvSourceBadge(s.debut_source_label) + '</div>';
                html += '<div class="cloture-row-hours">Fin : <strong>' + escapeHtml(s.heure_validee_finale || '—') + '</strong>' + _pvSourceBadge(s.cloture_source_label) + '</div>';
                html += '</div><div class="cloture-row-actions"></div></div>';
            });
        };
        section('Non clôturés (soirée active)', nonClot);
        section('Clôturés à valider', aVal);
        list.innerHTML = html;
        list.querySelectorAll('[data-pv-id]').forEach(row => {
            const id = row.getAttribute('data-pv-id');
            const item = items.find(x => String(x._id) === id);
            if (!item) return;
            const actions = row.querySelector('.cloture-row-actions');
            const btn = document.createElement('button');
            btn.type = 'button';
            if (item.statut === 'non_cloture') {
                btn.textContent = item.debut_valide_code ? 'Fin manuelle' : 'Clôturer';
                btn.addEventListener('click', () => clotureManuelle(item, 'fin'));
            } else {
                btn.textContent = 'Ajuster';
                btn.className = 'btn-adjust';
                btn.addEventListener('click', () => ajusterHeureCloture(item));
            }
            actions.appendChild(btn);
        });
    } catch (e) {
        list.innerHTML = '<div class="cloture-error">' + escapeHtml(e.message) + '</div>';
    }
}

async function loadPointageVerifJournal() {
    const list = document.getElementById('pv-journal-list');
    const label = document.getElementById('pv-journal-label');
    if (!list || !_pvJournalWeek) return;
    if (label) label.textContent = _pvWeekLabel(_pvJournalWeek);
    const from = _pvJournalWeek;
    const to = _pvAddDays(_pvJournalWeek, 6);
    list.innerHTML = '<div class="empty-msg" style="padding:20px">Chargement…</div>';
    try {
        const res = await fetch('/api/pointage/verif/journal?from=' + encodeURIComponent(from) + '&to=' + encodeURIComponent(to), { credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        if (!data.length) {
            list.innerHTML = '<div class="empty-msg" style="padding:20px">Aucun mouvement sur cette semaine.</div>';
            return;
        }
        list.innerHTML = data.map(v => {
            const acteur = v.acteur_name || v.acteur_id || '—';
            const role = v.acteur_role ? ' (' + v.acteur_role + ')' : '';
            return '<div class="cloture-row">'
                + '<div class="cloture-row-main">'
                + '<div class="cloture-row-name">' + escapeHtml(v.staff_name || '—') + '</div>'
                + '<div class="cloture-row-meta">' + escapeHtml(_pvFmtParts(v.heure_saisie)) + '</div>'
                + '<div class="cloture-row-hours">' + escapeHtml(v.establishment_name || '')
                + (v.shift_date ? ' · ' + escapeHtml(v.shift_date) : '') + '</div>'
                + '<div class="cloture-row-hours">Par <strong>' + escapeHtml(acteur) + '</strong>' + escapeHtml(role)
                + _pvSourceBadge(v.source_label) + '</div>'
                + '<div class="cloture-row-meta">' + escapeHtml([v.action, v.phase, v.resultat].filter(Boolean).join(' · '))
                + (v.debut_retenue || v.fin_retenue ? ' · ' + escapeHtml((v.debut_retenue || '—') + '–' + (v.fin_retenue || '—')) : '')
                + '</div>'
                + (v.motif ? '<div class="cloture-row-motif">' + escapeHtml(v.motif) + '</div>' : '')
                + '</div></div>';
        }).join('');
    } catch (e) {
        list.innerHTML = '<div class="cloture-error">' + escapeHtml(e.message) + '</div>';
    }
}

async function validatePointageRecapFromPanel() {
    if (!_pvWeekStart || !currentEstabId) {
        showToast('Sélectionne un établissement', true);
        return;
    }
    if (!confirm('Valider le récap de la semaine du ' + _pvWeekStart + ' pour cet établissement ?')) return;
    try {
        const res = await fetch('/api/etablissements/' + encodeURIComponent(currentEstabId) + '/valider-recap', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ week_start: _pvWeekStart }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        showToast(data.modified ? ('Récap validé (' + data.modified + ')') : 'Rien à valider');
        loadPointageBadge();
        loadPointageVerifQueue();
        renderCloturesList();
    } catch (e) {
        showToast(e.message, true);
    }
}

function initPointageVerifPanel() {
    const panel = document.getElementById('pointage-verif-panel');
    const btnHdr = document.getElementById('btn-verif-pointage');
    if (!canUseVerifPanel()) {
        if (panel) panel.style.display = 'none';
        if (btnHdr) btnHdr.style.display = 'none';
        return;
    }
    if (panel) panel.style.display = '';
    if (btnHdr) btnHdr.style.display = '';
    if (!_pvBound) {
        _pvBound = true;
        btnHdr?.addEventListener('click', () => {
            switchPointageVerifTab('queue');
            scrollToVerifPanel();
        });
        document.getElementById('pv-tab-btn-queue')?.addEventListener('click', () => switchPointageVerifTab('queue'));
        document.getElementById('pv-tab-btn-journal')?.addEventListener('click', () => switchPointageVerifTab('journal'));
        document.getElementById('pv-week-prev')?.addEventListener('click', () => {
            _pvWeekStart = _pvAddDays(_pvWeekStart, -7);
            loadPointageVerifQueue();
        });
        document.getElementById('pv-week-next')?.addEventListener('click', () => {
            _pvWeekStart = _pvAddDays(_pvWeekStart, 7);
            loadPointageVerifQueue();
        });
        document.getElementById('pv-journal-prev')?.addEventListener('click', () => {
            _pvJournalWeek = _pvAddDays(_pvJournalWeek, -7);
            loadPointageVerifJournal();
        });
        document.getElementById('pv-journal-next')?.addEventListener('click', () => {
            _pvJournalWeek = _pvAddDays(_pvJournalWeek, 7);
            loadPointageVerifJournal();
        });
        document.getElementById('pv-validate-recap')?.addEventListener('click', validatePointageRecapFromPanel);
    }
    loadPointageBadge().then(() => {
        if (!_pvWeekStart) {
            const d = today || toDateStr(new Date());
            const mon = window.Week ? Week.toDateStr(Week.weekStart(new Date(d + 'T12:00:00'))) : d;
            _pvWeekStart = mon;
            _pvJournalWeek = mon;
        }
        loadPointageVerifQueue();
    });
}

init();
