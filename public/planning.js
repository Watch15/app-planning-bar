// ── Constantes ────────────────────────────────────────────────────────────────

const DAY_NAMES  = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTH_NAMES = ['jan.','fév.','mars','avr.','mai','juin','juil.','août','sep.','oct.','nov.','déc.'];
const DAY_NAMES_LONG   = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const MONTH_NAMES_LONG = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

// Saisie des dispos désactivée pour ce staff → l'onglet « Dispos & congés » n'affiche
// que la sous-vue Congés (cf. /api/dispo-settings staffCanSubmit).
let _disposSubmitDisabled = false;

// ── Utilitaires ───────────────────────────────────────────────────────────────

function textColorFor(hex) {
    if (!hex || hex.length < 7) return '#1a1a2e';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1a1a2e' : '#ffffff';
}

function toDateStr(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const j = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + j;
}

// Lundi de la semaine — délègue au module partagé/testé (public/lib/week.js, R-01).
function getMondayOf(d) { return Week.weekStart(d); }

// ── Heure de bascule de la journée de service ─────────────────────────────────
//
// UNE seule notion de « quand la journée bascule », partagée par le planning et le
// pointage. Avant, il y en avait deux : la semaine du planning basculait à 6h (constante
// en dur) pendant que la journée de pointage basculait à `cutoff_hour` (9h par défaut,
// réglable). Entre les deux, le lundi matin, le responsable pouvait encore pointer le
// service du dimanche alors que le planning était déjà passé à la semaine neuve — le jour
// qu'il pointait n'était plus visible que dans l'Historique.
//
// Valeur de repli = la constante partagée : si le réglage ne se charge pas, on retombe
// exactement sur le comportement d'avant plutôt que sur une troisième convention.
//
// ⚠️ TOUT calcul de semaine de cette page doit passer par `currentMonday` /
// `upcomingRange`. Un seul call site qui appellerait `Week.currentWeekStart(new Date())`
// en direct recréerait le désaccord de calculs corrigé le 2026-08-17.
let _serviceCutoffHour = Week.WEEK_CUTOFF_HOUR;

async function loadServiceCutoff() {
    try {
        const r = await fetch('/api/pointage-settings', { credentials: 'include' });
        if (!r.ok) return _serviceCutoffHour;
        const s = await r.json();
        if (Number.isInteger(s.cutoff_hour) && s.cutoff_hour >= 0 && s.cutoff_hour <= 23) {
            _serviceCutoffHour = s.cutoff_hour;
        }
    } catch { /* repli sur la constante */ }
    return _serviceCutoffHour;
}

function currentMonday()      { return Week.currentWeekStart(new Date(), _serviceCutoffHour); }
function upcomingRange(weeks) { return Week.upcomingWeekRange(new Date(), weeks, _serviceCutoffHour); }

function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

function fmtHour(h) {
    return ShiftHours.fmtHourOfDay(h);
}

function fmtDuration(h) {
    const total = h;
    const hrs   = Math.floor(total);
    const mins  = Math.round((total - hrs) * 60);
    return mins > 0 ? hrs + 'h' + String(mins).padStart(2, '0') : hrs + 'h';
}

// Heures effectives d'un shift (réel si pointage complet, sinon planifié).
// Logique extraite et testée : public/lib/shift-hours.js + tests/shift-hours.test.js
// (module chargé via <script src="/lib/shift-hours.js"> avant celui-ci).
function shiftEffectiveHours(s) { return ShiftHours.shiftEffectiveHours(s); }

// Une date 'YYYY-MM-DD' → Date locale à MIDI. Midi et pas minuit : insensible au
// changement d'heure, idiome déjà partout dans le fichier.
function parseDate(str) { return new Date(str + 'T12:00:00'); }

// Dimanche de la semaine du lundi `monday` ('YYYY-MM-DD' → 'YYYY-MM-DD').
function weekEndStr(monday) { return toDateStr(addDays(parseDate(monday), 6)); }

// « Semaine du 24 août au 30 août ». Un seul endroit : le libellé était assemblé à
// l'identique pour l'en-tête de la semaine en cours, pour chaque bloc à venir et pour la
// navigation des dispos — et la variante de l'historique avait déjà dérivé.
function weekRangeLabel(monday) {
    const mon = parseDate(monday), sun = addDays(mon, 6);
    return 'Semaine du ' + mon.getDate() + ' ' + MONTH_NAMES[mon.getMonth()] +
           ' au ' + sun.getDate() + ' ' + MONTH_NAMES[sun.getMonth()];
}

// Un créneau Joker se reconnaît à l'UN ou l'AUTRE des deux marqueurs : les lignes
// anciennes ne portent que `staff_id === '__joker__'`, les récentes `is_joker`. La
// double condition était recopiée à sept endroits — n'en oublier qu'une moitié fait
// apparaître un Joker comme un shift à soi, sans rien signaler.
function isJoker(s) { return !!s.is_joker || s.staff_id === '__joker__'; }

// LA lecture de `/api/my-shifts`. Centralisée pour que la détection de session expirée
// (HTML au lieu de JSON → redirection login) vaille pour TOUS les appelants : la liste
// des semaines à venir se contentait sinon de rester vide en silence pendant que la
// semaine en cours, elle, redirigeait. Rend `null` si la donnée n'est pas exploitable.
// `opts.light` : ne demander QUE ses propres shifts, sans les collègues. Réservé aux
// appelants qui n'en affichent aucun (le récap mensuel de l'historique, qui couvre
// plusieurs mois d'un coup) — la vue planning, elle, en a besoin.
async function fetchMyShifts(from, to, opts) {
    try {
        const url = '/api/my-shifts?from=' + from + '&to=' + to + ((opts && opts.light) ? '&light=1' : '');
        const res = await fetch(url, { credentials: 'include' });
        const ct  = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
            if (res.status === 401) { window.location.href = '/login.html'; return null; }
            throw new Error('Erreur serveur (' + res.status + ')');
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur inconnue');
        return data;
    } catch (e) {
        return { error: e.message || 'Erreur' };
    }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

async function checkAuth() {
    // Retry une fois pour éviter les faux-positifs réseau au démarrage PWA
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch('/auth/me', { credentials: 'include' });
            if (res.status === 401) { window.location.href = '/login.html'; return null; }
            if (!res.ok) { if (attempt === 0) { await new Promise(r => setTimeout(r, 800)); continue; } break; }
            const data = await res.json();
            // Patron + directeur → index.html, établissement → pointage.html
            if (data.user?.role === 'patron')       { window.location.href = '/';   return null; }
            // R-04 — depuis E-22 le directeur a un profil staff, donc il REÇOIT les rappels
            // de dispos, dont le push pointe vers `/planning.html#dispos` — une page qui le
            // renvoie ici. On conserve l'intention au lieu de la perdre : `#mes-dispos`
            // ouvre sa modale de saisie sur index.html. Corrigé côté redirection (et non à
            // l'émission) pour réparer aussi les notifications déjà envoyées.
            if (data.user?.role === 'directeur') {
                const wantsDispos = window.location.hash === '#dispos';
                window.location.href = wantsDispos ? '/#mes-dispos' : '/';
                return null;
            }
            if (data.user?.role === 'etablissement') { window.location.href = '/pointage.html'; return null; }
            return data.user;
        } catch {
            if (attempt === 0) { await new Promise(r => setTimeout(r, 800)); continue; }
            // Après retry, si réseau vraiment indisponible : rester sur la page sans rediriger
            // (le SW sert la page en cache, on ne veut pas boucler)
            return null;
        }
    }
    window.location.href = '/login.html';
    return null;
}

async function logout() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login.html';
}

// ── Init ──────────────────────────────────────────────────────────────────────

let allStaff = [];
let allEstablishments = [];
let currentUser = null;
let _statsPeriod = 'week';            // 'week' ou 'month'
let _lastWeekData = null;             // { shifts } pour switch instantané
let _lastMonthData = null;            // { shifts } pour le mois

async function init() {
    const user = await checkAuth();
    if (!user) return;

    // Seul le staff et directeur ont accès à cette page
    if (user.role === 'patron') {
        window.location.href = '/'; return;
    }
    if (user.role === 'etablissement') {
        window.location.href = '/pointage.html'; return;
    }

    currentUser = user;
    document.getElementById('greeting-name').textContent = 'Bonjour ' + ((user.name || '').split(' ')[0]) + ' !';
    const av = document.getElementById('staff-avatar');
    if (av) av.textContent = (user.name || user.email || '?').charAt(0).toUpperCase();

    Nouveautes.init(user.role, { autoOuvrir: true });

    initTabs();
    initStatsToggle();
    initCalSync();

    // Charger le staff et les établissements
    try {
        const [staffRes, estabRes] = await Promise.all([
            fetch('/api/staff', { credentials: 'include' }),
            fetch('/api/establishments', { credentials: 'include' }),
        ]);
        if (staffRes.ok) allStaff          = await staffRes.json();
        if (estabRes.ok) allEstablishments = await estabRes.json();
    } catch { allStaff = []; allEstablishments = []; }

    // Charger les dispos quand on clique sur l'onglet (réinitialise sur la sous-vue Dispos).
    // Si la saisie des dispos est désactivée, l'onglet ne montre que les congés.
    document.querySelector('[data-tab="dispos"]').addEventListener('click', () => {
        if (_disposSubmitDisabled) { showDisposSub('conges'); return; }
        showDisposSub('dispos');
        loadDisposTab();
    });

    document.querySelector('[data-tab="historique"]').addEventListener('click', () => {
        loadHistorique();
    });

    // Sous-onglets Dispos | Congés à l'intérieur de l'onglet « Dispos & congés »
    const subDispos = document.getElementById('subtab-dispos');
    const subConges = document.getElementById('subtab-conges');
    if (subDispos) subDispos.addEventListener('click', () => showDisposSub('dispos'));
    if (subConges) subConges.addEventListener('click', () => showDisposSub('conges'));
    initCongesForm();

    // Vérifier les droits dispos + groupes du staff en parallèle
    try {
        const sRes = await fetch('/api/dispo-settings', { credentials: 'include' });
        if (sRes.ok) {
            const s = await sRes.json();
            applyCongeModes(s.conge_modes || 'both');
            if (s.staffCanSubmit === false) {
                // La saisie des dispos est désactivée : on garde l'onglet (les congés y
                // vivent désormais) mais on masque la sous-vue Dispos et son sous-onglet,
                // et on force l'affichage sur Congés.
                const tabDispos = document.getElementById('tab-dispos');
                const tabFull   = tabDispos && tabDispos.querySelector('.tab-full');
                const tabShort  = tabDispos && tabDispos.querySelector('.tab-short');
                if (tabFull)  tabFull.textContent  = 'Mes congés';
                if (tabShort) tabShort.textContent = 'Congés';
                const subDisposBtn = document.getElementById('subtab-dispos');
                if (subDisposBtn) subDisposBtn.style.display = 'none';
                const subCongesBtn = document.getElementById('subtab-conges');
                if (subCongesBtn) subCongesBtn.style.display = 'none'; // un seul contenu → pas de toggle
                _disposSubmitDisabled = true;
                showDisposSub('conges');
            }
        }
    } catch { /* silencieux */ }

    // L'heure de bascule AVANT tout calcul de semaine : c'est elle qui décide si, à 7h
    // du matin un lundi, on est encore sur la semaine qui s'achève ou déjà sur la neuve.
    // Le seul appel de l'init qui doit précéder l'affichage.
    const cutoffH = await loadServiceCutoff();

    // Semaine en cours
    const monday = currentMonday();
    const sunday = addDays(monday, 6);
    const from   = toDateStr(monday);
    const to     = toDateStr(sunday);

    document.getElementById('header-week').textContent = weekRangeLabel(from);

    window._currentPlan = { from, to, user };

    // Lancée MAINTENANT, attendue plus bas : la liste des semaines à venir ne dépend
    // d'aucun des appels qui suivent (responsable-tonight, responsable-week). L'attendre
    // ici la reléguait au 8e aller-retour de l'init — près d'une seconde de latence
    // mobile avant qu'elle s'affiche, et autant avant que `scrollToHashWeek` puisse
    // emmener le staff sur la semaine annoncée par le push.
    const upcoming = loadUpcomingWeeks();

    await loadPlanning(from, to, user);
    startStaffAutoRefresh(from, to, user);

    setTimeout(loadStaffNotifs, 500);
    setInterval(loadStaffNotifs, 90000); // re-check toutes les 90s (shifts debounced 60s)
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        loadStaffNotifs();
        // P-08 : rafraîchir le bloc « 📢 Créneau disponible » au retour au premier
        // plan — le patron peut avoir ouvert un Joker pendant l'absence. Et le patron a
        // pu publier une semaine : la liste des semaines à venir vit dans cette vue,
        // elle doit se remettre à jour comme le reste.
        const cur = window._currentPlan;
        if (cur && cur.from && cur.to && document.getElementById('open-jokers-section')) {
            renderOpenJokers(cur.from, cur.to, 'open-jokers-section');
        }
        loadUpcomingWeeks();
    });

    // Vérifier si le staff est responsable de soirée ce soir → onglet Pointage
    // Avant l'heure de bascule (ex: 9h) on considère encore la date "d'hier" pour
    // que le responsable puisse pointer le lendemain matin.
    try {
        // `cutoffH` vient de `loadServiceCutoff` plus haut — MÊME valeur que celle qui
        // décide la semaine affichée. C'est tout l'objet du branchement : la journée de
        // pointage et la semaine du planning basculent au même instant.
        const now = new Date();
        const refDate = new Date(now);
        if (now.getHours() < cutoffH) refDate.setDate(now.getDate() - 1);
        const todayStr = toDateStr(refDate);
        const respRes  = await fetch('/api/me/responsable-tonight?date=' + todayStr, { credentials: 'include' });
        if (respRes.ok) {
            const resp = await respRes.json();
            if (resp.isResponsable && resp.establishments && resp.establishments.length > 0) {
                const tabBar = document.querySelector('.tabs-bar');
                // Un onglet par établissement (en général 1, mais directeur peut en avoir plusieurs)
                resp.establishments.forEach(estabId => {
                    const link    = document.createElement('a');
                    link.href      = '/pointage.html?estab=' + encodeURIComponent(estabId);
                    link.className = 'btn-pointage-tab';
                    link.textContent = '⏱ Pointage';
                    tabBar.appendChild(link);
                });
            }
        }
    } catch { /* silencieux */ }

    // ── Onglet « Mon équipe » pour les responsables (semaine en cours) ───
    // Re-fetch à chaque entrée (clic + visibilitychange) pour refléter les
    // modifs patron pendant l'absence de l'utilisateur, et recalcule monday/
    // todayStr à chaque rendu (corrige le badge « Aujourd hui » après minuit).
    try {
        const respMondayInit = currentMonday();
        const initFrom = toDateStr(respMondayInit);
        const initTo   = toDateStr(addDays(respMondayInit, 6));
        const rRes     = await fetch('/api/me/responsable-week?from=' + initFrom + '&to=' + initTo, { credentials: 'include' });
        if (rRes.ok) {
            const initData = await rRes.json();
            if (initData.authorized && initData.days) {
                const viewResp = document.createElement('div');
                viewResp.id            = 'view-resp-dashboard';
                viewResp.style.display = 'none';
                document.getElementById('view-planning').after(viewResp);

                const tabBar  = document.querySelector('.tabs-bar');
                const tabResp = document.createElement('button');
                tabResp.className   = 'tab-btn';
                tabResp.dataset.tab = 'resp-dashboard';
                tabResp.innerHTML   = '<span class="tab-full">👥 Mon équipe</span><span class="tab-short">Équipe</span>';
                const disposTab = tabBar.querySelector('[data-tab="dispos"]');
                tabBar.insertBefore(tabResp, disposTab || null);
                initTabs();

                // Mémoriser ensemble la dernière donnée ET son monday pour éviter
                // qu'un rendu de fallback (avant le re-fetch) utilise un monday
                // décalé de la semaine couverte par lastData (cas semaine N→N+1).
                let lastData     = initData;
                let lastMonday   = respMondayInit;
                let lastRendered = false;

                const refreshResp = async () => {
                    const monday = currentMonday();
                    const from   = toDateStr(monday);
                    const to     = toDateStr(addDays(monday, 6));
                    try {
                        const r = await fetch('/api/me/responsable-week?from=' + from + '&to=' + to, { credentials: 'include' });
                        if (!r.ok) return;
                        const data = await r.json();
                        if (!data.authorized) {
                            tabResp.style.display = 'none';
                            viewResp.innerHTML = '';
                            return;
                        }
                        lastData   = data;
                        lastMonday = monday;
                        renderResponsableDashboard(data.days, viewResp, monday);
                        renderRespDispoKpi(viewResp);
                        lastRendered = true;
                    } catch { /* silencieux */ }
                };

                tabResp.addEventListener('click', () => {
                    if (!lastRendered) {
                        renderResponsableDashboard(lastData.days, viewResp, lastMonday);
                        lastRendered = true;
                    }
                    refreshResp();
                });

                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState !== 'visible') return;
                    if (!tabResp.classList.contains('active')) return;
                    refreshResp();
                });
            }
        }
    } catch { /* silencieux */ }

    // Semaines à venir — empilées SOUS la semaine en cours, dans la MÊME vue.
    // Remplace l'onglet « À venir » : voir `loadUpcomingWeeks` pour le pourquoi.
    // Lancée bien plus haut, on ne fait que la rejoindre ici — l'ancre du push a besoin
    // que les blocs existent.
    await upcoming;

    // Le push de publication pointe sur `#semaine-<lundi>` — y amener directement, à
    // l'ouverture ET si le Service Worker re-navigue une PWA déjà ouverte (sw.js).
    scrollToHashWeek();
    window.addEventListener('hashchange', scrollToHashWeek);
}

// ── Jokers ouverts — affichage staff ─────────────────────────────────────────

// Le lot brut des Jokers ouverts (déjà filtré « publié » côté serveur). Séparé du rendu
// parce que la liste continue empile plusieurs semaines : sans cette césure, chaque
// semaine affichée rappellerait la MÊME route pour n'en garder qu'une tranche.
//
// Mémoïsé sur une fenêtre COURTE, parce que la route n'est bornée par aucune date : tous
// les appelants d'un même rendu veulent le même lot, et ils sont trois (semaine en cours,
// semaines à venir, retour au premier plan). Sans ça un chargement de page tapait deux
// fois la même route et un rafraîchissement quatre — chacune coûtant 3 allers-retours
// Mongo côté serveur. 3 s : assez pour couvrir une salve de rendu, trop court pour
// servir du périmé (le prochain rafraîchissement réel est à 30 s au plus tôt).
const JOKERS_TTL_MS = 3000;
let _jokersCache = null;                    // { at, promise }

function fetchOpenJokers() {
    if (_jokersCache && Date.now() - _jokersCache.at < JOKERS_TTL_MS) return _jokersCache.promise;
    const promise = (async () => {
        try {
            const res = await fetch('/api/shifts/joker-ouverts', { credentials: 'include' });
            if (!res.ok) return null;
            return await res.json();
        } catch { return null; }
    })();
    _jokersCache = { at: Date.now(), promise };
    return promise;
}

// Call site historique : une semaine, un conteneur désigné par son id.
async function renderOpenJokers(from, to, containerId) {
    const section = document.getElementById(containerId);
    if (!section) return;
    renderOpenJokersInto(await fetchOpenJokers(), from, to, section);
}

// Rendu d'un lot DÉJÀ récupéré, borné à la plage [from, to].
function renderOpenJokersInto(jokers, from, to, section) {
    if (!section || !Array.isArray(jokers)) return;
    try {
        // Filtrer à la plage de dates de la semaine visible
        const weekJokers = jokers
            .filter(j => j.date >= from && j.date <= to)
            .sort((a, b) => a.date === b.date ? a.start_time - b.start_time : a.date.localeCompare(b.date));
        if (weekJokers.length === 0) { section.innerHTML = ''; return; }

        const itemsHtml = weekJokers.map(j => {
            const d         = new Date(j.date + 'T12:00:00');
            const dayLabel  = DAY_NAMES[d.getDay()] + ' ' + d.getDate() + ' ' + MONTH_NAMES[d.getMonth()];
            const startFmt  = fmtHour(j.start_time);
            const endFmt    = fmtHour(j.end_time);
            const applied   = !!j.has_applied;
            const estabName = j.establishment_name || j.establishment_id || '';
            const safeEstab = estabName.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            return '<div class="open-joker-item">' +
                '<div class="open-joker-date">' + dayLabel +
                    '<small>' + startFmt + ' à ' + endFmt +
                        (safeEstab ? ' · <span class="open-joker-estab">' + safeEstab + '</span>' : '') +
                    '</small>' +
                '</div>' +
                '<button class="btn-je-suis-dispo' + (applied ? ' applied' : '') + '" data-id="' + j._id + '"' + (applied ? ' disabled' : '') + '>' +
                    (applied ? '✅ Envoyée' : 'Je suis dispo') +
                '</button>' +
            '</div>';
        }).join('');

        section.innerHTML =
            '<div class="open-joker-card">' +
                '<div class="open-joker-header">📢 Créneaux disponibles · ' + weekJokers.length + '</div>' +
                itemsHtml +
            '</div>';

        section.querySelectorAll('.btn-je-suis-dispo:not([disabled])').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                btn.disabled = true;
                try {
                    const r = await fetch('/api/shifts/' + id + '/joker-candidature', {
                        method: 'POST', credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                    });
                    const data = await r.json();
                    if (!r.ok) throw new Error(data.error);
                    btn.textContent = '✅ Disponibilité envoyée';
                    btn.classList.add('applied');
                    showMsg('✅ Ta disponibilité a été envoyée !', 'success');
                } catch (e) {
                    btn.disabled = false;
                    showMsg(e.message || 'Erreur', 'error');
                }
            });
        });
    } catch { /* silencieux */ }
}

// ── Chargement ────────────────────────────────────────────────────────────────

async function loadPlanning(from, to, user) {
    const list = document.getElementById('days-list');

    const data = await fetchMyShifts(from, to);
    if (!data) return;                               // session expirée → redirection en cours

    if (data.error) {
        // Cas spécifique : compte non lié à un profil staff
        if (data.error.includes('profil staff')) {
            list.innerHTML =
                '<div class="empty-week">' +
                    '<div class="empty-week-icon">⚠️</div>' +
                    '<div class="empty-week-text">Compte non configuré</div>' +
                    '<div class="empty-week-sub">Ton compte n est pas encore lié à un profil staff.<br>Contacte ton responsable.</div>' +
                '</div>';
            return;
        }
        list.innerHTML = '<div class="state-msg error">' + data.error + '</div>';
        return;
    }

    const myShifts = (data.shifts || []).filter(s => !isJoker(s));
    const jokers   = (data.shifts || []).filter(isJoker);
    await loadMyPendingSwaps();
    _lastWeekData = { shifts: myShifts };
    if (_statsPeriod === 'week') {
        renderStats(myShifts);
    } else {
        // L'utilisateur a basculé sur Mois — on l'a déjà rendu, rien à faire ici
        loadMonthRecap();
    }
    renderDays(from, myShifts, data.colleagues, jokers);
    renderOpenJokers(from, to, 'open-jokers-section');
}

// ── Semaines à venir — empilées sous la semaine en cours ─────────────────────
//
// Remplace l'onglet « À venir » (supprimé le 2026-08-17). Deux raisons, dans l'ordre :
//
// 1. ROBUSTESSE. L'onglet tenait sa propre liste de semaines, calculée autrement que la
//    vue principale — c'est ce désaccord qui rendait le planning invisible le lundi de
//    00h à 06h. Deux listes à garder d'accord, c'est un bug qui revient ; une seule, non.
//    Ici le seul « maintenant » est le POINT DE DÉPART (`Week.upcomingWeekStart`, cutoff).
//    Le regroupement passe par `Week.weekStart` sur une date calendaire, insensible au
//    cutoff par construction.
//
// 2. UNE SEULE REQUÊTE. On ne demande plus « quelles semaines puis-je ouvrir ? »
//    (`/api/my-published-weeks`) : `/api/my-shifts` filtre déjà la publication SHIFT PAR
//    SHIFT (`isDatePublished` côté serveur). Une semaine non publiée ne rend donc rien et
//    ne produit aucun bloc — la porte reste tenue par le serveur, pas par le navigateur.

// Horizon chargé d'un coup. 8 = ce que l'ancien onglet interrogeait déjà. Au-delà on ne
// chargerait que du vide, le serveur ne rendant que du publié.
const UPCOMING_WEEKS = 8;

// ── Pastille « nouveau » ──────────────────────────────────────────────────────
// Un ENSEMBLE de lundis déjà vus, et non un simple « vu jusqu'à » : le patron publie
// couramment N+1 APRÈS N+2, et une borne haute cesserait alors de pastiller la semaine
// la plus proche — exactement celle qui compte.
const SEEN_WEEKS_KEY = 'templyo_seen_weeks';

function loadSeenWeeks() {
    try { return new Set(JSON.parse(localStorage.getItem(SEEN_WEEKS_KEY) || '[]')); }
    catch { return new Set(); }
}

function markWeekSeen(seen, monday) {
    if (seen.has(monday)) return;
    seen.add(monday);
    try {
        // Borné : sans ça on accumulerait indéfiniment des lundis révolus.
        localStorage.setItem(SEEN_WEEKS_KEY, JSON.stringify([...seen].sort().slice(-24)));
    } catch { /* mode privé / quota : la pastille se réaffichera, sans gravité */ }
}

// Les observateurs du rendu PRÉCÉDENT. `loadUpcomingWeeks` vide son conteneur à chaque
// passage (retour au premier plan, rafraîchissement) : sans cette liste, chaque passage
// abandonnerait jusqu'à 8 observateurs sur des blocs détachés, qui n'intersectent plus
// jamais et ne se déconnectent donc jamais d'eux-mêmes.
let _weekObservers = [];

function disconnectWeekObservers() {
    for (const io of _weekObservers) io.disconnect();
    _weekObservers = [];
}

// La pastille ne se consomme qu'une fois le bloc RÉELLEMENT arrivé sous les yeux. La
// marquer au rendu la ferait disparaître sans avoir jamais été lue — les semaines à
// venir sont plus bas dans le défilement, souvent hors écran au chargement.
function observeWeekSeen(seen, block, monday) {
    if (typeof IntersectionObserver !== 'function') { markWeekSeen(seen, monday); return; }
    const io = new IntersectionObserver(entries => {
        if (!entries.some(e => e.isIntersecting)) return;
        markWeekSeen(seen, monday);
        io.disconnect();
    }, { threshold: 0.35 });
    io.observe(block);
    _weekObservers.push(io);
}

// ── Chargement des semaines à venir ───────────────────────────────────────────
// Garde anti-recouvrement : trois déclencheurs peuvent tomber en même temps (init,
// retour au premier plan, tick d'auto-refresh) et chacun vide puis reconstruit le
// conteneur. Sans elle, deux passages concurrents se marchent dessus.
let _upcomingInFlight = null;

function loadUpcomingWeeks() {
    if (_upcomingInFlight) return _upcomingInFlight;
    _upcomingInFlight = _loadUpcomingWeeks().finally(() => { _upcomingInFlight = null; });
    return _upcomingInFlight;
}

async function _loadUpcomingWeeks() {
    const wrap = document.getElementById('upcoming-weeks');
    if (!wrap) return;

    // `Week.upcomingWeekRange` : LA source unique de cet horizon, partagée avec le
    // serveur et couverte par tests/week.test.js. La recalculer à la main ici, c'était
    // reproduire le désaccord de calculs qui a causé le bug qu'on vient de fermer —
    // et court-circuiter au passage l'écrêtage de `clampHorizonWeeks`.
    const { from, to } = upcomingRange(UPCOMING_WEEKS);

    const [data, openJokers] = await Promise.all([fetchMyShifts(from, to), fetchOpenJokers()]);
    // Silencieux en cas d'échec : la semaine en cours, elle, reste lisible — mieux vaut
    // une liste absente qu'un message d'erreur sous un planning qui s'affiche bien.
    if (!data || data.error) return;

    // Regroupement par lundi — `Week.weekStart` sur une date calendaire, surtout PAS
    // `currentWeekStart` qui répondrait « quelle semaine est-on maintenant ».
    // Les Jokers sont rangés dans la même passe : les re-filtrer par semaine ensuite
    // rebalayait le tableau entier une fois par bloc.
    const byWeek = new Map();
    const bucket = wk => {
        if (!byWeek.has(wk)) byWeek.set(wk, { mine: [], jokers: [] });
        return byWeek.get(wk);
    };
    for (const s of (data.shifts || [])) {
        const wk = toDateStr(Week.weekStart(new Date(s.date + 'T12:00:00')));
        bucket(wk)[isJoker(s) ? 'jokers' : 'mine'].push(s);
    }
    // Une semaine où je n'ai QUE des Jokers de collègues n'est pas mon planning.
    for (const [wk, b] of byWeek) if (!b.mine.length) byWeek.delete(wk);

    disconnectWeekObservers();
    wrap.innerHTML = '';

    if (byWeek.size === 0) {
        wrap.innerHTML = '<div class="state-msg">Le planning des semaines suivantes n’est pas encore publié.</div>';
        return;
    }

    const seen = loadSeenWeeks();
    for (const monday of [...byWeek.keys()].sort()) {
        const { mine, jokers } = byWeek.get(monday);
        renderUpcomingWeek(wrap, monday, mine, jokers, data.colleagues || {},
                           openJokers, !seen.has(monday));
        if (!seen.has(monday)) {
            observeWeekSeen(seen, document.getElementById('semaine-' + monday), monday);
        }
    }
}

function renderUpcomingWeek(wrap, monday, weekShifts, weekJokers, colleagues, openJokers, isNew) {
    const end = weekEndStr(monday);

    // ⚠️ Chaque semaine rend dans SON PROPRE conteneur. Contrat de `renderDaysInto` :
    // elle est PROPRIÉTAIRE de la liste qu'on lui passe et l'écrase (les deux branches
    // le font). C'est un contrat sain — ne pas le « corriger » pour tout empiler dans
    // une liste unique, chaque semaine a de toute façon besoin de son séparateur, de
    // ses stats, de son emplacement Joker et de son ancre.
    const block = document.createElement('section');
    block.className = 'upcoming-week';
    block.id        = 'semaine-' + monday;          // cible de l'ancre du push

    const sep = document.createElement('div');
    sep.className = 'week-sep';
    sep.innerHTML =
        '<span class="week-sep-label">' + weekRangeLabel(monday) + '</span>' +
        (isNew ? '<span class="week-sep-new">Nouveau</span>' : '');

    const stats = document.createElement('div');
    stats.className = 'week-stats';
    const jokerSection = document.createElement('div');
    const list = document.createElement('div');
    list.className = 'days-list';

    block.append(sep, stats, jokerSection, list);
    wrap.appendChild(block);

    renderStatsInto(weekShifts, stats);
    renderDaysInto(monday, weekShifts, colleagues, list, weekJokers);
    renderOpenJokersInto(openJokers, monday, end, jokerSection);
}

// Le push de publication pointe sur `#semaine-<lundi>` : amener le staff DIRECTEMENT sur
// la semaine annoncée plutôt que de le déposer en haut du planning en le laissant deviner
// qu'il faut faire défiler.
//
// Rebranché sur `hashchange` en plus de l'init : le Service Worker peut désormais
// re-naviguer une PWA DÉJÀ OUVERTE vers l'ancre (cf. sw.js), ce qui ne relance pas la page
// et ne passerait donc jamais par l'init.
function scrollToHashWeek() {
    const id = (window.location.hash || '').slice(1);
    if (!/^semaine-\d{4}-\d{2}-\d{2}$/.test(id)) return;
    const el = document.getElementById(id);
    // La semaine annoncée peut être celle EN COURS (le patron republie souvent la semaine
    // entamée) : elle n'a pas de bloc à elle, elle EST le haut de la page.
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else if (id.slice(8) === toDateStr(currentMonday())) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ── Stats semaine ─────────────────────────────────────────────────────────────

function renderStats(shifts) {
    const el = document.getElementById('week-stats');
    if (el) renderStatsInto(shifts, el);
}

function renderStatsInto(shifts, el) {
    const nbShifts = shifts.length;
    // Utiliser les heures réelles si disponibles, sinon planifiées
    const totalH = shifts.reduce((a, s) => {
        const { start, end } = shiftEffectiveHours(s);
        return a + (end - start);
    }, 0);
    const nbJours = new Set(shifts.map(s => s.date)).size;

    el.style.display = '';
    el.innerHTML =
        statCard(nbJours,             'Jours',  '') +
        statCard(nbShifts,            'Shifts', '') +
        statCard(fmtDuration(totalH), 'Heures', '');

    // Répartition par établissement (si > 1)
    const prev = el.nextElementSibling;
    if (prev && prev.classList && prev.classList.contains('estab-hours-bar')) prev.remove();

    const byEstab = {};
    shifts.forEach(s => {
        const { start, end } = shiftEffectiveHours(s);
        if (!byEstab[s.establishment_id]) byEstab[s.establishment_id] = { total: 0 };
        byEstab[s.establishment_id].total += (end - start);
    });
    const estabIds = Object.keys(byEstab);
    if (estabIds.length > 1) {
        const bar = document.createElement('div');
        bar.className = 'estab-hours-bar';
        estabIds.forEach(id => {
            const { total } = byEstab[id];
            bar.innerHTML +=
                '<div class="estab-hours-chip">' +
                    '<span>' + formatEstablishment(id) + '</span>' +
                    '<span style="font-weight:700;color:var(--text-primary);margin-left:4px">' + fmtDuration(total) + '</span>' +
                '</div>';
        });
        el.after(bar);
    }
}

function statCard(value, label, extra) {
    return '<div class="stat-card"><div>' +
        '<div class="stat-value">' + value + '</div>' +
        '<div class="stat-label">' + label + '</div>' +
        (extra || '') +
    '</div></div>';
}

// ── Toggle Semaine / Mois ─────────────────────────────────────────────────────

function initStatsToggle() {
    const wrap = document.getElementById('stats-toggle');
    if (!wrap) return;
    wrap.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const period = btn.dataset.period;
            if (period === _statsPeriod) return;
            _statsPeriod = period;
            wrap.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.period === period));
            applyStatsPeriod();
        });
    });
}

function applyStatsPeriod() {
    const sub = document.getElementById('greeting-sub');
    if (_statsPeriod === 'week') {
        if (sub) sub.textContent = 'Voici ton planning de la semaine';
        if (_lastWeekData) renderStats(_lastWeekData.shifts);
        return;
    }
    const now = new Date();
    if (sub) sub.textContent = 'Récap de ' + MONTH_NAMES_LONG[now.getMonth()] + ' ' + now.getFullYear();
    if (_lastMonthData) {
        renderMonthStats(_lastMonthData.shifts);
    } else {
        loadMonthRecap();
    }
}

// ── Récap mensuel ─────────────────────────────────────────────────────────────

async function loadMonthRecap() {
    const el = document.getElementById('week-stats');
    if (!el) return;
    el.innerHTML = '<div class="state-msg" style="grid-column:1/-1">Chargement…</div>';

    // MÊME calcul de bornes que l'historique mensuel (`histRange`, une fenêtre d'un
    // mois). L'égalité des deux totaux pour le mois courant est promise à l'écran ; elle
    // ne tenait jusqu'ici qu'à la coïncidence de deux calculs recopiés.
    const { from: monthFrom, to: monthTo } = histRange(1);

    try {
        const res = await fetch('/api/my-shifts?from=' + monthFrom + '&to=' + monthTo, { credentials: 'include' });

        const ct = res.headers.get('content-type') || '';
        if (!ct.includes('application/json')) throw new Error('Erreur serveur (' + res.status + ')');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur inconnue');

        const myShifts = (data.shifts || []).filter(s => !s.is_joker && s.staff_id !== '__joker__');

        _lastMonthData = { shifts: myShifts };
        if (_statsPeriod === 'month') renderMonthStats(myShifts);
    } catch (e) {
        el.innerHTML = '<div class="state-msg error" style="grid-column:1/-1">' + e.message + '</div>';
    }
}

function renderMonthStats(shifts) {
    const el = document.getElementById('week-stats');
    if (!el) return;

    const nbShifts = shifts.length;
    const totalH = shifts.reduce((a, s) => {
        const { start, end } = shiftEffectiveHours(s);
        return a + (end - start);
    }, 0);
    const nbJours = new Set(shifts.map(s => s.date)).size;

    el.style.display = '';
    el.innerHTML =
        statCard(nbJours,             'Jours',  '') +
        statCard(nbShifts,            'Shifts', '') +
        statCard(fmtDuration(totalH), 'Heures', '');

    // Répartition par établissement
    const next = el.nextElementSibling;
    if (next && next.classList && next.classList.contains('estab-hours-bar')) next.remove();

    const byEstab = {};
    shifts.forEach(s => {
        const { start, end } = shiftEffectiveHours(s);
        if (!byEstab[s.establishment_id]) byEstab[s.establishment_id] = { total: 0 };
        byEstab[s.establishment_id].total += (end - start);
    });
    const estabIds = Object.keys(byEstab);
    if (estabIds.length > 1) {
        const bar = document.createElement('div');
        bar.className = 'estab-hours-bar';
        estabIds.forEach(id => {
            const { total } = byEstab[id];
            bar.innerHTML +=
                '<div class="estab-hours-chip">' +
                    '<span>' + formatEstablishment(id) + '</span>' +
                    '<span style="font-weight:700;color:var(--text-primary);margin-left:4px">' + fmtDuration(total) + '</span>' +
                '</div>';
        });
        el.after(bar);
    }
}

// ── Rendu des jours ───────────────────────────────────────────────────────────

function renderDays(from, shifts, colleagues, jokers) {
    const list = document.getElementById('days-list');
    renderDaysInto(from, shifts, colleagues, list, jokers || []);
}

function renderDaysInto(from, shifts, colleagues, list, jokers) {
    jokers = jokers || [];
    const today  = toDateStr(new Date());
    const [fy, fm, fd] = from.split('-').map(Number);
    const monday = new Date(fy, fm - 1, fd, 0, 0, 0, 0);

    if (shifts.length === 0) {
        list.innerHTML =
            '<div class="empty-week">' +
                '<div class="empty-week-icon">📅</div>' +
                '<div class="empty-week-text">Aucun shift cette semaine</div>' +
                '<div class="empty-week-sub">Reviens plus tard ou contacte ton responsable</div>' +
            '</div>';
        return;
    }

    list.innerHTML = '';

    // Séparer jours avec shifts et jours repos
    const restDays = [];

    for (let i = 0; i < 7; i++) {
        const date      = toDateStr(addDays(monday, i));
        const d         = addDays(monday, i);
        const dayShifts = shifts.filter(s => s.date === date);
        const isToday   = date === today;

        if (dayShifts.length === 0) {
            // Accumuler les jours de repos
            restDays.push({ d, isToday });

            // Flush si c'est le dernier jour ou si le prochain a un shift
            const nextDate = toDateStr(addDays(monday, i + 1));
            const nextHasShift = i < 6 && shifts.some(s => s.date === nextDate);
            const isLast = i === 6;

            if ((nextHasShift || isLast) && restDays.length > 0) {
                // Afficher les jours repos accumulés
                if (restDays.length === 1 && restDays[0].isToday) {
                    // Aujourd'hui sans shift — carte pleine avec "Aujourd'hui"
                    const rc = document.createElement('div');
                    rc.className = 'day-card today';
                    rc.innerHTML =
                        '<div class="day-header">' +
                            '<div class="day-date-block">' +
                                '<div class="day-weekday" style="color:#534AB7">' + DAY_NAMES[restDays[0].d.getDay()] + '</div>' +
                                '<div class="day-num" style="color:#534AB7">' + restDays[0].d.getDate() + '</div>' +
                            '</div>' +
                            '<div class="day-divider"></div>' +
                            '<div class="day-header-info">' +
                                '<span class="today-chip">Aujourd hui</span>' +
                                '<div class="day-duration" style="margin-top:2px">Repos</div>' +
                            '</div>' +
                        '</div>';
                    list.appendChild(rc);
                } else {
                    const grid = document.createElement('div');
                    grid.className = 'rest-grid';
                    restDays.forEach(r => {
                        const rc = document.createElement('div');
                        rc.className = 'rest-card' + (r.isToday ? ' today' : '');
                        if (r.isToday) rc.style.cssText = 'background:white;border:2px solid #534AB7;border-radius:10px;opacity:1;padding:10px 8px;text-align:center';
                        rc.innerHTML =
                            '<div class="rest-weekday" style="' + (r.isToday ? 'color:#534AB7' : '') + '">' + DAY_NAMES[r.d.getDay()] + '</div>' +
                            '<div class="rest-num"    style="' + (r.isToday ? 'color:#534AB7' : '') + '">' + r.d.getDate() + '</div>';
                        grid.appendChild(rc);
                    });
                    list.appendChild(grid);
                }
                restDays.length = 0;
            }
            continue;
        }

        // Jour avec shift(s)
        const firstShift = dayShifts[0];
        const sm = allStaff ? allStaff.find(s => String(s._id) === firstShift.staff_id) : null;
        const staffColor = sm ? sm.color : (firstShift.color || '#534AB7');

        // Heures réelles si disponibles ET jour passé
        const isPast      = date < today;
        const hasReal     = firstShift.real_start != null && firstShift.real_end != null;
        const showReal    = isPast && hasReal;
        const dispStart   = showReal ? firstShift.real_start : firstShift.start_time;
        const dispEnd     = showReal ? firstShift.real_end   : firstShift.end_time;
        const durLabel    = showReal
            ? fmtDuration(firstShift.real_end - firstShift.real_start) + ' réel'
            : fmtDuration(firstShift.end_time - firstShift.start_time) + ' de service';
        const realBadge   = showReal
            ? ' <span class="badge badge--success">réel</span>'
            : (isPast && !hasReal ? ' <span class="badge badge--warning">non pointé</span>' : '');

        const card = document.createElement('div');
        card.className = 'day-card has-shift' + (isToday ? ' today' : '');
        if (!isToday) card.style.borderLeftColor = staffColor;

        // La journée entière voyage SUR la carte, pour le mini planning
        // (cf. `openDaySheet`) : la carte a déjà toute la donnée sous la main, la
        // redemander à l'ouverture ferait attendre pour ce qui vient d'être affiché.
        // Portée par l'élément et non par un index global : le détail vit et meurt avec
        // la carte, sans clé à tenir des deux côtés ni entrées orphelines laissées
        // derrière par les rendus successifs.
        //
        // ⚠️ Les Jokers se filtrent sur la date ET l'établissement, comme le fait le
        // rendu de la carte quelques lignes plus bas. Ce second filtre porte : la
        // requête Jokers du serveur croise TOUS mes établissements avec TOUTES mes
        // dates (`/api/my-shifts`) sans refermer le produit sur les couples réellement
        // travaillés — contrairement à celle des collègues. Sur la seule date, la
        // soirée d'une autre maison entrait dans la feuille : un bloc en trop, et
        // surtout un axe étiré jusqu'à son ouverture, qui écrasait mes propres barres.
        const dayEstabs = new Set(dayShifts.map(s => s.establishment_id));
        const dayDetail = {
            date,
            mine:       dayShifts,
            colleagues: colleagues[date] || [],
            jokers:     jokers.filter(j => j.date === date && dayEstabs.has(j.establishment_id)),
        };

        // La feuille n'a rien à montrer si AUCUN créneau du jour ne porte d'horaire :
        // `openDaySheet` sortirait sans rien dire. On ne pose alors ni le détail ni
        // l'affordance — un tap mort sous un curseur « cliquable » est pire que pas de
        // tap du tout. C'est la MÊME décision qui arme les deux, elles ne peuvent pas
        // se désaccorder.
        // Mes shifts par `shiftEffectiveHours`, les autres par leurs heures planifiées :
        // exactement ce que la feuille utilisera pour poser ses barres.
        const aDesHoraires =
            dayDetail.mine.some(s => {
                const { start, end } = shiftEffectiveHours(s);
                return start != null && end != null;
            }) ||
            [...dayDetail.colleagues, ...dayDetail.jokers]
                .some(s => s.start_time != null && s.end_time != null);
        if (aDesHoraires) {
            card._dayDetail = dayDetail;
            card.classList.add('day-card--tappable');
        }

        // F-05 — la carte affiche l'ÉTAT de l'échange, la feuille du jour porte
        // l'ACTION. Taper la carte ouvre déjà le mini planning (`day-card--tappable`,
        // écoute déléguée sur `document`) : un second geste sur l'en-tête se serait
        // battu avec lui pour le même clic. Le badge dit qu'il se passe quelque chose,
        // le détail dit quoi et permet d'agir — c'est le même partage que partout
        // ailleurs sur cet écran.
        //
        // Comparaison en `String()` des deux côtés : `_id` arrive du serveur en
        // chaîne, mais la demande, elle, est relue d'une collection distincte — se
        // fier au type de l'un pour l'autre est exactement le genre d'accord tacite
        // qui casse en silence le jour où une route change sa sérialisation.
        const pendingSwap = (window._myPendingSwaps || []).find(sw =>
            sw.status === 'pending' &&
            (String(sw.from_shift_id) === String(firstShift._id) ||
             String(sw.to_shift_id)   === String(firstShift._id)));
        const isSwapMine  = !!pendingSwap && String(pendingSwap.from_staff_id) === String(firstShift.staff_id);
        const canSwap     = !isPast && !pendingSwap && firstShift.staff_id !== '__joker__';
        const swapBadge   = pendingSwap ? ' <span class="badge badge--warning">en attente</span>' : '';
        dayDetail.swap = { shift: firstShift, pending: pendingSwap || null, isSwapMine, canSwap };

        // En-tête
        const header = document.createElement('div');
        header.className = 'day-header';
        header.innerHTML =
            '<div class="day-date-block">' +
                '<div class="day-weekday">' + DAY_NAMES[d.getDay()] + '</div>' +
                '<div class="day-num">' + d.getDate() + '</div>' +
            '</div>' +
            '<div class="day-divider"></div>' +
            '<div class="day-header-info">' +
                '<div class="day-establishment">' + formatEstablishment(firstShift.establishment_id) + '</div>' +
                '<div class="day-duration">' + durLabel + swapBadge + '</div>' +
            '</div>' +
            (isToday ? '<span class="today-chip">Aujourd hui</span>' : '') +
            '<span class="shift-hours-badge">' + fmtHour(dispStart) + ' → ' + fmtHour(dispEnd) + realBadge + '</span>';
        card.appendChild(header);

        // Collègues du 1er shift + shifts supplémentaires
        dayShifts.forEach((shift, idx) => {
            const dayColleagues = (colleagues[date] || []).filter(c => c.establishment_id === shift.establishment_id);
            const dayJokers     = jokers.filter(j => j.date === date && j.establishment_id === shift.establishment_id);
            const allColleagues = [...dayColleagues, ...dayJokers];

            // Si même établissement que le shift principal (idx=0), ne pas ré-afficher les collègues
            const sameEstabAsFirst = idx > 0 && shift.establishment_id === firstShift.establishment_id;

            const colleaguesHtml = (!sameEstabAsFirst && allColleagues.length > 0)
                ? '<div class="colleagues-row"><span class="colleagues-lbl">Collègues</span>' +
                    allColleagues.map(c => {
                        const sm2      = allStaff.find(s => String(s._id) === c.staff_id);
                        const nc       = sm2 && sm2.name_color ? sm2.name_color : '';
                        const dotColor = c.is_joker ? '#95a5a6' : (c.color || '#888');
                        const ns       = nc ? ' style="color:' + nc + '"' : '';
                        const needsBg  = nc && textColorFor(nc) === '#1a1a2e';
                        const pillBg   = needsBg ? ' style="background:' + dotColor + 'BF;cursor:pointer"' : ' style="cursor:pointer"';
                        const _cn      = c.is_joker ? 'Joker' : _shortColleagueName(c);
                        const fullName = c.is_joker ? 'Joker (créneau ouvert)' : (c.staff_name || _cn);
                        const dataAttr = ' data-pill-name="' + _esc(fullName) +
                                         '" data-pill-start="' + (c.start_time != null ? c.start_time : '') +
                                         '" data-pill-end="' + (c.end_time != null ? c.end_time : '') +
                                         '" data-pill-color="' + dotColor + '"';
                        return '<span class="colleague-pill"' + pillBg + dataAttr + '><span class="colleague-dot" style="background:' + dotColor + '"></span><span' + ns + '>' + _cn + '</span></span>';
                    }).join('') + '</div>'
                : '';

            if (idx === 0) {
                // Collègues du shift principal sous le header
                if (colleaguesHtml) {
                    const block = document.createElement('div');
                    block.className = 'shift-block';
                    block.innerHTML = colleaguesHtml;
                    card.appendChild(block);
                }
            } else {
                // Shift supplémentaire — ligne visuelle dédiée
                const sHasReal    = shift.real_start != null && shift.real_end != null;
                const sShowReal   = isPast && sHasReal;
                const sDispStart  = sShowReal ? shift.real_start : shift.start_time;
                const sDispEnd    = sShowReal ? shift.real_end   : shift.end_time;
                const sDurLabel   = sShowReal
                    ? fmtDuration(shift.real_end - shift.real_start) + ' réel'
                    : fmtDuration(shift.end_time - shift.start_time) + ' de service';
                const sRealBadge  = sShowReal
                    ? ' <span class="badge badge--success">réel</span>'
                    : (isPast && !sHasReal ? ' <span class="badge badge--warning">non pointé</span>' : '');
                const sColor      = shift.color || '#888';

                const row = document.createElement('div');
                row.className = 'extra-shift-row';
                row.innerHTML =
                    '<div class="extra-shift-header">' +
                        '<div class="extra-shift-bar" style="background:' + sColor + '"></div>' +
                        '<div class="extra-shift-info">' +
                            '<div class="extra-shift-name">' + formatEstablishment(shift.establishment_id) + '</div>' +
                            '<div class="extra-shift-duration">' + sDurLabel + '</div>' +
                        '</div>' +
                        '<span class="extra-shift-badge">' + fmtHour(sDispStart) + ' → ' + fmtHour(sDispEnd) + sRealBadge + '</span>' +
                    '</div>' +
                    (colleaguesHtml ? '<div class="extra-shift-colleagues">' + colleaguesHtml + '</div>' : '');
                card.appendChild(row);
            }
        });

        list.appendChild(card);
    }
}

// ── Mini planning de la journée ───────────────────────────────────────────────
//
// Taper un jour travaillé ouvre la soirée en barres, comme le tableau de bord du
// patron : qui est là, de quand à quand, qui ouvre et qui ferme. La carte du jour
// donnait la liste des prénoms présents, mais pas la FORME de la soirée — impossible
// d'y voir qui recouvre son propre créneau ni jusqu'à quelle heure l'équipe tient.
//
// Aucune requête : tout vient de la réponse `/api/my-shifts` déjà utilisée pour rendre
// la carte (mes shifts, mes collègues du jour, les Jokers), posée sur la carte par
// `renderDaysInto`. Les collègues n'ont que leurs heures PLANIFIÉES (c'est tout ce que
// le serveur projette) ; mes propres heures suivent la règle habituelle du réel dès que
// le pointage est complet.

// Taper un jour ouvre la journée ; taper une pastille collègue garde son mini-toast.
// Les deux écoutes vivent sur `document` : sans ce garde-fou, la pastille ouvrirait la
// feuille par-dessus son propre toast.
document.addEventListener('click', (ev) => {
    if (!ev.target.closest) return;
    if (ev.target.closest('[data-pill-name]')) return;
    const card = ev.target.closest('.day-card--tappable');
    if (!card || !card._dayDetail) return;
    openDaySheet(card._dayDetail);
});

// Le nom court d'un collègue : surnom s'il existe, sinon prénom. LA règle, appelée par
// les pastilles de la carte du jour comme par les lignes du mini planning — deux
// vocabulaires pour la même personne d'une vue à l'autre obligeraient à la reconnaître
// deux fois.
function _shortColleagueName(c) {
    const sm = (allStaff || []).find(s => String(s._id) === String(c.staff_id));
    if (sm && sm.nickname) return sm.nickname;
    return (c.staff_name || '').trim().split(/\s+/)[0] || 'Collègue';
}

function openDaySheet(detail) {
    // Une ligne par personne et par établissement, les créneaux coupés (18h-22h puis
    // 23h-3h) fusionnés sur la MÊME ligne : deux lignes pour une personne se lisent
    // comme deux personnes.
    const groups = new Map();   // establishment_id → Map(clé → ligne)
    const addSlot = (estabId, key, base, st, en) => {
        if (st == null || en == null) return;
        if (!groups.has(estabId)) groups.set(estabId, new Map());
        const g = groups.get(estabId);
        if (!g.has(key)) g.set(key, Object.assign({ slots: [], key }, base));
        const row = g.get(key);
        // Un créneau déjà posé n'est pas une coupure : les Jokers arrivent par DEUX
        // chemins (collègues du jour et créneaux ouverts), et le même créneau dessinait
        // alors deux barres superposées.
        if (row.slots.some(s => s.st === st && s.en === en)) return;
        row.slots.push({ st, en });
    };

    detail.mine.forEach(s => {
        const { start, end } = shiftEffectiveHours(s);
        const sm = (allStaff || []).find(x => String(x._id) === String(s.staff_id));
        addSlot(s.establishment_id, '__moi__',
            { name: 'Moi', color: (sm && sm.color) || s.color || '#534AB7', isMe: true }, start, end);
    });
    // Les Jokers arrivent par DEUX chemins (la liste des collègues du jour et celle des
    // créneaux ouverts) — d'où UNE seule fonction pour les deux passes : la clé, le nom
    // et la couleur du Joker s'écrivent au même endroit, et c'est cette clé partagée qui
    // fait que le même créneau ne pose pas deux barres superposées.
    const addPerson = (p, estJoker) => {
        const jk = estJoker || isJoker(p);
        addSlot(p.establishment_id,
            jk ? 'joker-' + (p._id || p.start_time) : 'staff-' + p.staff_id,
            { name:  jk ? 'Joker' : _shortColleagueName(p),
              color: jk ? '#95a5a6' : (p.color || '#888'), isJoker: jk },
            p.start_time, p.end_time);
    };
    detail.colleagues.forEach(c => addPerson(c, false));
    detail.jokers.forEach(j    => addPerson(j, true));

    // Bornes de l'axe : l'amplitude réelle de la soirée, arrondie à l'heure. Pas de
    // marge décorative — sur un téléphone, chaque heure vide mange la lisibilité des
    // barres. Même construction que le Gantt patron (`renderWeekGantt`).
    let minH = Infinity, maxH = -Infinity;
    groups.forEach(g => g.forEach(r => r.slots.forEach(s => {
        minH = Math.min(minH, s.st);
        maxH = Math.max(maxH, s.en);
    })));
    if (!isFinite(minH) || !isFinite(maxH)) return;
    const OPEN_H  = Math.floor(minH);
    const CLOSE_H = Math.ceil(maxH);
    const RANGE   = (CLOSE_H - OPEN_H) || 1;
    const pctLeft  = h      => ((h - OPEN_H) / RANGE * 100).toFixed(2) + '%';
    const pctWidth = (s, e) => (Math.max(e - s, 0) / RANGE * 100).toFixed(2) + '%';

    const d        = parseDate(detail.date);
    const dayLabel = DAY_NAMES_LONG[d.getDay()] + ' ' + d.getDate() + ' ' + MONTH_NAMES_LONG[d.getMonth()];

    // Mon service d'abord : c'est la ligne pour laquelle on ouvre la feuille. Une seule
    // passe pour les horaires ET le cumul — deux parcours appelaient deux fois
    // `shiftEffectiveHours` sur chaque shift, par deux chemins différents du module.
    let mesHeures = 0;
    const monResume = detail.mine.map(s => {
        const { start, end } = shiftEffectiveHours(s);
        mesHeures += (start != null && end != null) ? end - start : 0;
        return fmtHour(start) + ' → ' + fmtHour(end);
    }).join(', ');

    // L'établissement où JE travaille en tête : les autres ne sont là que par débordement
    // d'une double vacation.
    const mesEstabs = new Set(detail.mine.map(s => s.establishment_id));
    const estabIds  = [...groups.keys()].sort((a, b) =>
        (mesEstabs.has(b) ? 1 : 0) - (mesEstabs.has(a) ? 1 : 0));
    const multiEstab = estabIds.length > 1;

    // Une graduation toutes les 2 h. Sur une amplitude impaire, la dernière heure n'est
    // pas graduée : collée à la précédente, elle rendait les deux illisibles — et
    // l'amplitude exacte est écrite en toutes lettres au pied de la feuille.
    //
    // Chaîne et non fonction : les bornes sont celles de TOUTE la soirée, établissements
    // confondus. Un axe recalculé par établissement laisserait croire qu'il en dépend,
    // alors que c'est justement l'invariant qui rend deux blocs comparables du regard.
    let ticks = '';
    for (let h = OPEN_H; h <= CLOSE_H; h += 2) {
        ticks += '<span class="dayx-tick" style="left:' + pctLeft(h) + '">' + fmtHour(h) + '</span>';
    }
    const axisHtml = '<div class="dayx-axis"><span></span><div class="dayx-axis-track">' + ticks + '</div></div>';

    // Un ensemble et non un compteur : les lignes sont rangées PAR ÉTABLISSEMENT, donc
    // quelqu'un qui enchaîne les deux maisons le même jour (moi le premier) a une ligne
    // dans chaque groupe. Compter les lignes annonçait « 5 personnes » pour quatre.
    const personnes = new Set();
    let body = '';
    estabIds.forEach(estabId => {
        const rows = [...groups.get(estabId).values()].sort((a, b) => {
            if (a.isMe !== b.isMe) return a.isMe ? -1 : 1;          // moi en tête
            return Math.min(...a.slots.map(s => s.st)) - Math.min(...b.slots.map(s => s.st));
        });
        if (multiEstab) body += '<div class="dayx-estab">' + _esc(formatEstablishment(estabId)) + '</div>';
        body += axisHtml + '<div class="dayx-rows">';
        rows.forEach(r => {
            if (!r.isJoker) personnes.add(r.key);
            r.slots.sort((a, b) => a.st - b.st);
            const creneaux = r.slots.map(s => fmtHour(s.st) + ' → ' + fmtHour(s.en));
            const bars = r.slots.map((s, i) =>
                '<span class="dayx-bar' + (r.isJoker ? ' dayx-bar--joker' : '') + '" style="left:' + pctLeft(s.st) +
                    ';width:' + pctWidth(s.st, s.en) + ';background:' + _esc(r.color) +
                    ';color:' + textColorFor(r.color) + '">' +
                    creneaux[i] +
                '</span>').join('');
            // `pill-hours` porte les créneaux TELS QUE DESSINÉS. Le toast ne sait afficher
            // qu'une plage continue : sur une coupure, il aurait annoncé « 18h → 03h » à
            // dix pixels de deux barres séparées — la seule vue qui montre les coupures
            // aurait été la seule à les nier au tap.
            body +=
                '<div class="dayx-row' + (r.isMe ? ' dayx-row--me' : '') + '"' +
                    ' data-pill-name="' + _esc(r.isMe ? 'Moi' : r.name) + '"' +
                    ' data-pill-hours="' + _esc(creneaux.join(', ')) + '"' +
                    ' data-pill-color="' + _esc(r.color) + '">' +
                    '<span class="dayx-name">' + _esc(r.name) + '</span>' +
                    '<div class="dayx-track">' + bars + '</div>' +
                '</div>';
        });
        body += '</div>';
    });

    // F-05 — le pied de la feuille porte l'action sur MON service de ce jour-là.
    // Trois états, jamais deux à la fois : je peux proposer, j'ai une demande en
    // cours que je peux annuler, ou c'est un collègue qui a proposé sur ce shift et
    // je n'ai qu'à attendre le patron.
    const sw = detail.swap || null;
    const swapHtml =
        (sw && sw.canSwap)                 ? '<div class="dayx-act"><button type="button" class="dayx-swap">Proposer un échange</button></div>' :
        (sw && sw.pending && sw.isSwapMine) ? '<div class="dayx-act"><button type="button" class="dayx-swap dayx-swap--cancel">Annuler ma demande</button></div>' :
        (sw && sw.pending)                  ? '<div class="dayx-act"><div class="dayx-swap-wait">Échange proposé — en attente du patron</div></div>' : '';

    const { sheet, close } = openBottomSheet('day-sheet',
        '<div class="dayx-panel" style="--dayx-tick:' + (2 / RANGE * 100).toFixed(2) + '%">' +
            '<div class="dayx-grip"></div>' +
            '<div class="dayx-head">' +
                '<div style="min-width:0">' +
                    '<div class="dayx-title">' + dayLabel + '</div>' +
                    (monResume ? '<div class="dayx-sub">Mon service ' + monResume + ' · ' + fmtDuration(mesHeures) + '</div>' : '') +
                '</div>' +
                '<button type="button" class="dayx-close" aria-label="Fermer">&times;</button>' +
            '</div>' +
            '<div class="dayx-body">' + body + '</div>' +
            '<div class="dayx-foot">' +
                personnes.size + ' personne' + (personnes.size > 1 ? 's' : '') + ' sur la journée' +
                ' · amplitude ' + fmtHour(minH) + ' → ' + fmtHour(maxH) +
            '</div>' +
            swapHtml +
        '</div>');

    sheet.querySelector('.dayx-close').addEventListener('click', close);

    // La feuille se referme AVANT d'ouvrir la modale : elle est en `z-index` 9998 et
    // la laisser derrière ferait cliquer dans le vide sur son fond noir.
    const btnSwap = sheet.querySelector('.dayx-swap');
    if (btnSwap) btnSwap.addEventListener('click', () => {
        close();
        if (sw.canSwap) openSwapModal(sw.shift);
        else            cancelMySwap(sw.pending._id);
    });
}


// ── Formatage nom établissement ───────────────────────────────────────────────

function formatEstablishment(id) {
    const estab = allEstablishments.find(e => e.id === id || String(e._id) === String(id));
    return estab ? estab.name : id;
}

// ── Tableau de bord du responsable ────────────────────────────────────────────

// Système de noms cohérent avec le tableau de bord patron (script.js:47) :
// nickname si défini, sinon prénom, avec désambiguïsation par initiale du nom
// quand plusieurs staff partagent le même prénom (« Sébastien G. » vs « Sébastien M. »).
function buildTeamDisplayNames(allShifts) {
    const isJoker = s => s.is_joker || s.staff_id === '__joker__';
    const uniq = new Map();
    allShifts.forEach(s => {
        if (isJoker(s) || !s.staff_id) return;
        if (!uniq.has(String(s.staff_id))) {
            uniq.set(String(s.staff_id), { id: String(s.staff_id), name: s.staff_name || '', nickname: s.nickname || null });
        }
    });

    const map = new Map();
    const withoutNickname = [];
    for (const s of uniq.values()) {
        if (s.nickname) map.set(s.id, s.nickname);
        else            withoutNickname.push(s);
    }

    const byFirstName = new Map();
    for (const s of withoutNickname) {
        const parts = s.name.trim().split(/\s+/);
        const fn    = parts[0] || s.name;
        if (!byFirstName.has(fn)) byFirstName.set(fn, []);
        byFirstName.get(fn).push({ id: s.id, lastName: parts.slice(1).join(' ') });
    }

    for (const [fn, group] of byFirstName) {
        if (group.length === 1 || group.every(g => !g.lastName)) {
            for (const g of group) map.set(g.id, fn);
        } else {
            const lastNames = group.map(g => g.lastName.toUpperCase());
            let len = 1;
            while (len <= Math.max(...lastNames.map(n => n.length))) {
                const prefixes = lastNames.map(n => n.slice(0, len));
                if (new Set(prefixes).size === group.length) break;
                len++;
            }
            for (let i = 0; i < group.length; i++) {
                const prefix = group[i].lastName.slice(0, len);
                map.set(group[i].id,
                    prefix ? fn + ' ' + prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase() + '.' : fn
                );
            }
        }
    }
    return map;
}

// Barre de progression réutilisable (KPI dispos).
function _kpiBarHtml(sent, total, big) {
    const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
    const color = total === 0 ? '#cbd5e1' : (pct >= 100 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444');
    const h = big ? 10 : 7;
    return '<div style="display:flex;align-items:center;gap:8px">' +
        '<div style="flex:1;height:' + h + 'px;background:#eef0f4;border-radius:6px;overflow:hidden">' +
            '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:6px"></div>' +
        '</div>' +
        '<span style="font-size:' + (big ? '13' : '12') + 'px;font-weight:700;color:#1a1a2e;white-space:nowrap">' + sent + '/' + total + '</span>' +
    '</div>';
}

let _respKpiData  = null;
let _respKpiOpen  = false;
// B2 — les lundis de l'horizon de saisie, et celui qu'on regarde.
let _respKpiWeeks = null;
let _respKpiIndex = 0;

function _respKpiInnerHtml() {
    const data = _respKpiData;
    if (!data) return '';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const o   = data.overall || { sent: 0, total: 0 };
    const pct = o.total > 0 ? Math.round((o.sent / o.total) * 100) : 0;
    const missing = data.missing || [];
    // Libellé de la semaine regardée. « semaine prochaine » était écrit en dur : sur un
    // horizon élargi, il aurait menti dès le premier clic sur la flèche.
    const weeks = _respKpiWeeks || [];
    const from  = weeks[_respKpiIndex];
    // Deux états seulement : la semaine en cours de collecte porte son nom usuel, les
    // suivantes portent leurs dates. Inutile de construire les Dates dans le premier cas.
    let weekLbl = 'semaine prochaine';
    if (from && _respKpiIndex > 0) {
        const mon = new Date(from + 'T12:00:00');
        const sun = addDays(mon, 6);
        weekLbl = mon.getDate() + ' ' + MONTH_NAMES[mon.getMonth()] + ' → ' + sun.getDate() + ' ' + MONTH_NAMES[sun.getMonth()];
    }
    // Navigation seulement s'il y a plus d'une semaine saisissable.
    let html = '';
    if (weeks.length > 1) {
        const arrow = (id, glyph, off) =>
            '<button type="button" id="' + id + '"' + (off ? ' disabled' : '') +
            ' style="padding:2px 10px;border-radius:7px;border:1px solid #e8eaed;background:#fff;color:inherit;font-size:13px;cursor:' +
            (off ? 'default;opacity:.3' : 'pointer') + '">' + glyph + '</button>';
        html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">' +
            arrow('resp-kpi-prev', '&#8592;', _respKpiIndex === 0) +
            '<span style="font-size:11px;color:#888">semaine ' + (_respKpiIndex + 1) + ' sur ' + weeks.length + '</span>' +
            arrow('resp-kpi-next', '&#8594;', _respKpiIndex >= weeks.length - 1) +
        '</div>';
    }
    html += '<div id="resp-kpi-toggle" style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;cursor:pointer" title="Voir qui n\'a pas envoyé">' +
        '<span style="font-size:13px;font-weight:700;color:#1a1a2e">🗓️ Dispos envoyées — ' + weekLbl + '</span>' +
        '<span style="font-size:12px;color:#888;white-space:nowrap">' + pct + '% ' + (_respKpiOpen ? '▾' : '▸') + '</span>' +
    '</div>' + _kpiBarHtml(o.sent, o.total, true);
    const bars = (data.by_establishment || []).filter(b => b.total > 0 || b.sent > 0);
    if (bars.length) {
        html += '<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">';
        bars.forEach(b => {
            html += '<div style="display:flex;align-items:center;gap:10px">' +
                '<span style="flex:0 0 96px;font-size:12px;color:#888;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(b.establishment_name) + '">' + esc(b.establishment_name) + '</span>' +
                '<div style="flex:1">' + _kpiBarHtml(b.sent, b.total, false) + '</div>' +
            '</div>';
        });
        html += '</div>';
    }
    if (_respKpiOpen) {
        html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e8eaed">' +
            '<div style="font-size:12px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px">Pas encore envoyé (' + missing.length + ')</div>';
        if (!missing.length) {
            html += '<div style="font-size:13px;color:#10b981;font-weight:600">✅ Tout le monde a envoyé ses dispos</div>';
        } else {
            html += '<div style="display:flex;flex-direction:column;gap:6px">';
            missing.forEach(m => {
                const estabs = (m.establishments || []).length ? ' <span style="color:#aaa">· ' + esc(m.establishments.join(', ')) + '</span>' : '';
                html += '<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#1a1a2e">' +
                    '<span style="width:8px;height:8px;border-radius:50%;background:' + esc(m.color || '#888') + ';flex-shrink:0;display:inline-block"></span>' +
                    '<span style="font-weight:600">' + esc(m.name) + '</span>' + estabs +
                '</div>';
            });
            html += '</div>';
        }
        html += '</div>';
    }
    return html;
}

// KPI complétion des dispos, en tête du tableau de bord responsable. Le serveur scope
// déjà aux établissements du responsable. Cliquable pour dérouler la liste des staff
// qui n'ont pas encore envoyé.
//
// B2 — il était FIGÉ sur la semaine prochaine. Depuis que le patron règle un horizon de
// saisie, le staff peut envoyer ses dispos plusieurs semaines à l'avance : un responsable
// bloqué sur N+1 ne pouvait pas voir qui manquait au-delà, alors que c'est justement là
// qu'il reste du temps pour relancer.
//
// Borné sur l'horizon de SAISIE (X) et non sur celui de validation (Y) : au-delà de X,
// personne n'a le droit d'envoyer quoi que ce soit, et le KPI afficherait 0/N pour des
// semaines que nul ne pouvait remplir — un rouge qui n'accuse personne.
async function renderRespDispoKpi(container) {
    if (!container) return;
    try {
        if (!_respKpiWeeks) {
            const sRes = await fetch('/api/dispo-settings', { credentials: 'include' });
            const s    = sRes.ok ? await sRes.json() : {};
            _respKpiWeeks = Week.disposHorizonMondays(new Date(), s.horizon_weeks || 1);
        }
        if (_respKpiIndex >= _respKpiWeeks.length) _respKpiIndex = 0;

        let block = container.querySelector('#resp-kpi-block');
        if (!block) {
            block = document.createElement('div');
            block.id = 'resp-kpi-block';
            block.style.cssText = 'margin:14px 12px 4px;background:#fff;border:1px solid #e8eaed;border-radius:14px;padding:14px 16px';
            container.insertBefore(block, container.firstChild);
        }

        const paint = () => {
            block.innerHTML = _respKpiInnerHtml();
            const t = block.querySelector('#resp-kpi-toggle');
            if (t) t.addEventListener('click', () => { _respKpiOpen = !_respKpiOpen; paint(); });
            // Les flèches vivent HORS de la ligne repliable : à l'intérieur, un clic sur
            // « semaine suivante » aurait aussi ouvert ou fermé la liste des manquants.
            const p = block.querySelector('#resp-kpi-prev');
            const n = block.querySelector('#resp-kpi-next');
            if (p) p.addEventListener('click', () => { _respKpiIndex--; load(); });
            if (n) n.addEventListener('click', () => { _respKpiIndex++; load(); });
        };

        const load = async () => {
            _respKpiIndex = Math.min(Math.max(_respKpiIndex, 0), _respKpiWeeks.length - 1);
            const from = _respKpiWeeks[_respKpiIndex];
            const to   = toDateStr(addDays(new Date(from + 'T12:00:00'), 6));
            const res  = await fetch('/api/dispos/kpi?from=' + from + '&to=' + to, { credentials: 'include' });
            if (!res.ok) return;
            const data = await res.json();
            if (!data.authorized) return;
            _respKpiData = data;
            paint();
        };

        await load();
    } catch { /* silencieux */ }
}

function renderResponsableDashboard(days, container, monday) {
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const isJoker = s => s.is_joker || s.staff_id === '__joker__';
    container.innerHTML = '';

    // Map staff_id → nom court désambigué, à partir de tous les shifts de la semaine
    const allShifts = Object.values(days).flat();
    const nameMap   = buildTeamDisplayNames(allShifts);
    const shortName = (id, fallback) => nameMap.get(String(id)) || (fallback || '').trim().split(/\s+/)[0] || fallback || '';

    const todayStr = toDateStr(new Date());
    const myStaffId = (window._currentPlan && window._currentPlan.user && window._currentPlan.user.staff_id) || null;

    const weekDates = Array.from({ length: 7 }, (_, i) => ({
        date: toDateStr(addDays(monday, i)),
        d:    addDays(monday, i),
    })).filter(({ date }) => (days[date] || []).length > 0);

    if (weekDates.length === 0) {
        container.innerHTML = '<div style="padding:32px;text-align:center;color:#aaa;font-size:13px">Aucune soirée cette semaine</div>';
        return;
    }

    const intro = document.createElement('div');
    intro.style.cssText = 'padding:16px 20px 8px;font-size:13px;color:#888;line-height:1.4';
    intro.innerHTML = 'Équipe présente sur tes soirées de travail cette semaine. Tape un coéquipier pour l’appeler.';
    container.appendChild(intro);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding:0 12px 24px;display:flex;flex-direction:column;gap:12px';

    weekDates.forEach(({ date, d }) => {
        const dayShifts = days[date].slice().sort((a, b) => {
            if (a.establishment_id !== b.establishment_id)
                return String(a.establishment_id).localeCompare(String(b.establishment_id));
            return a.start_time - b.start_time;
        });
        const isToday = date === todayStr;
        const isPast  = date < todayStr;

        // Séparer équipe vs jokers ouverts (les Jokers fermés sont des placeholders
        // patron au cas où, pas des créneaux à pourvoir — on les masque côté staff)
        const team   = dayShifts.filter(s => !isJoker(s));
        const jokers = dayShifts.filter(s => isJoker(s) && s.joker_open === true);

        const byEstab = new Map();
        team.forEach(s => {
            if (!byEstab.has(s.establishment_id)) byEstab.set(s.establishment_id, []);
            byEstab.get(s.establishment_id).push(s);
        });
        const multiEstab = byEstab.size > 1;
        const headerEstab = (!multiEstab && team.length > 0) ? team[0].establishment_id : (jokers[0] && jokers[0].establishment_id);

        // Pill style pour le nom d'établissement (renforce l'identifiant visuel
        // sans inventer de couleur par estab — convention absente du reste de l'app)
        const estabPill = id => '<span style="display:inline-flex;align-items:center;font-size:11px;font-weight:600;color:#534AB7;background:rgba(108,99,255,0.08);padding:3px 9px;border-radius:8px;border:1px solid rgba(108,99,255,0.18);white-space:nowrap;max-width:160px;overflow:hidden;text-overflow:ellipsis">' + esc(formatEstablishment(id)) + '</span>';

        const card = document.createElement('div');
        card.style.cssText =
            'background:#fff;border-radius:12px;padding:14px 14px 12px;' +
            'box-shadow:0 1px 3px rgba(0,0,0,0.06),0 1px 2px rgba(0,0,0,0.04);' +
            (isToday ? 'border-left:3px solid var(--accent,#6C63FF);' : 'border-left:3px solid transparent;') +
            (isPast  ? 'opacity:0.62;' : '');

        const dayLabel = DAY_NAMES[d.getDay()] + ' ' + d.getDate() + ' ' + MONTH_NAMES[d.getMonth()];
        let html =
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap">' +
                '<div style="font-weight:700;font-size:15px;color:' + (isToday ? 'var(--accent,#6C63FF)' : '#1a1a2e') + ';letter-spacing:-0.2px">' + dayLabel + '</div>' +
                (isToday
                    ? '<span style="font-size:10px;font-weight:700;color:#fff;background:var(--accent,#6C63FF);padding:3px 8px;border-radius:8px;letter-spacing:0.3px">Aujourd hui</span>'
                    : (headerEstab && !multiEstab ? estabPill(headerEstab) : '')) +
            '</div>';

        byEstab.forEach((shiftList, estabId) => {
            if (multiEstab) {
                html += '<div style="margin:10px 0 6px">' + estabPill(estabId) + '</div>';
            }
            // Fusionner les shifts du même staff dans le même bar et la même soirée
            // (ex. coupure 18-22h + 23-3h) → un seul row avec horaires joints
            const byStaff = new Map();
            shiftList.forEach(s => {
                const key = String(s.staff_id);
                if (!byStaff.has(key)) {
                    byStaff.set(key, {
                        staff_id:   s.staff_id,
                        staff_name: s.staff_name,
                        color:      s.color,
                        phone:      s.phone,
                        is_resp:    !!s.pointage_resp,
                        slots:      [],
                    });
                }
                const entry = byStaff.get(key);
                const slotHasReal = s.real_start != null && s.real_end != null;
                entry.slots.push({
                    st: slotHasReal ? s.real_start : s.start_time,
                    en: slotHasReal ? s.real_end   : s.end_time,
                });
                if (s.pointage_resp) entry.is_resp = true;
            });
            // Tri par premier créneau
            const merged = [...byStaff.values()].map(e => {
                e.slots.sort((a, b) => a.st - b.st);
                return e;
            }).sort((a, b) => a.slots[0].st - b.slots[0].st);

            html += '<div style="display:flex;flex-direction:column;gap:5px">';
            merged.forEach(m => {
                const isMe   = myStaffId && String(m.staff_id) === String(myStaffId);
                const phone  = m.phone || '';
                const canCall = !isMe && phone;
                const display = shortName(m.staff_id, m.staff_name);
                const rowAttrs = canCall
                    ? ' data-phone="' + esc(phone) + '" data-name="' + esc(display) + '" role="button" tabindex="0"'
                    : '';
                const cursor   = canCall ? 'cursor:pointer;' : '';
                const bg       = isMe ? 'rgba(108,99,255,0.07)' : '#f4f5f8';
                const hours    = m.slots.map(s => fmtHour(s.st) + ' → ' + fmtHour(s.en)).join(', ');
                html +=
                    '<div class="resp-team-row"' + rowAttrs + ' style="' + cursor +
                        'display:flex;align-items:center;gap:10px;padding:10px;background:' + bg + ';border-radius:8px;min-height:44px">' +
                        '<span style="width:10px;height:10px;border-radius:50%;background:' + (m.color || '#888') + ';flex-shrink:0"></span>' +
                        '<span style="flex:1;font-weight:600;font-size:13px;color:#1a1a2e;display:flex;align-items:center;gap:6px;min-width:0">' +
                            '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(display) + '</span>' +
                            (m.is_resp ? '<span title="Responsable de la soirée" style="font-size:12px;flex-shrink:0">👑</span>' : '') +
                        '</span>' +
                        '<span style="font-size:13px;font-weight:600;color:#1a1a2e;font-variant-numeric:tabular-nums;white-space:nowrap">' + hours + '</span>' +
                        (canCall ? '<span style="font-size:11px;color:#8892a4;flex-shrink:0;margin-left:2px">▾</span>' : '') +
                    '</div>';
            });
            html += '</div>';
        });

        if (jokers.length > 0) {
            html += '<div style="margin-top:12px;padding-top:10px;border-top:1px dashed #e8eaed">' +
                '<div style="font-size:10px;font-weight:700;color:#8892a4;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">' +
                    '📢 Créneau' + (jokers.length > 1 ? 'x' : '') + ' à pourvoir' +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:5px">';
            jokers.forEach(s => {
                const estabName = multiEstab ? ' · ' + esc(formatEstablishment(s.establishment_id)) : '';
                html +=
                    '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:rgba(108,99,255,0.05);border:1px dashed rgba(108,99,255,0.35);border-radius:8px">' +
                        '<span style="width:10px;height:10px;border-radius:50%;background:rgba(108,99,255,0.55);flex-shrink:0"></span>' +
                        '<span style="flex:1;font-weight:600;font-size:13px;color:#534AB7">Joker' + estabName + '</span>' +
                        '<span style="font-size:13px;font-weight:600;color:#534AB7;font-variant-numeric:tabular-nums;white-space:nowrap">' + fmtHour(s.start_time) + ' → ' + fmtHour(s.end_time) + '</span>' +
                    '</div>';
            });
            html += '</div></div>';
        }

        card.innerHTML = html;
        wrap.appendChild(card);
    });

    // Tap-to-contact : ouvre une modale d'actions (Appeler / SMS) sur les rows avec phone
    wrap.addEventListener('click', (ev) => {
        const row = ev.target.closest && ev.target.closest('.resp-team-row[data-phone]');
        if (!row) return;
        openContactSheet(row.dataset.name, row.dataset.phone);
    });

    container.appendChild(wrap);
}

// La coquille des feuilles qui montent du bas (contact d'un coéquipier, mini planning
// d'une journée) : l'overlay, le fondu du fond, la translation du panneau, la fermeture
// au tap à côté, et le remplacement d'une feuille déjà ouverte. C'est le GESTE qui est
// partagé ; le contenu et l'habillage restent à l'appelant.
//
// Les deux copies avaient déjà divergé sur le z-index, la largeur et l'ombre — et la
// prochaine correction de feuille (fermeture au clavier, blocage du défilement de fond)
// aurait été faite d'un côté seulement.
//
// Rend { sheet, panel, close } : l'appelant branche ses propres boutons sur `close`.
// Le panneau est le premier enfant du HTML fourni, et c'est lui qui porte la
// transition d'entrée (`transform: translateY(100%)` au repos, cf. CSS).
function openBottomSheet(id, panelHtml) {
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const sheet = document.createElement('div');
    sheet.id        = id;
    sheet.className = 'bottom-sheet';
    sheet.innerHTML = panelHtml;

    const panel = sheet.firstElementChild;
    const close = () => {
        sheet.style.background = 'rgba(0,0,0,0)';
        panel.style.transform  = 'translateY(100%)';
        setTimeout(() => sheet.remove(), 220);
    };
    sheet.addEventListener('click', ev => { if (ev.target === sheet) close(); });

    document.body.appendChild(sheet);
    requestAnimationFrame(() => {
        sheet.style.background = 'rgba(0,0,0,0.45)';
        panel.style.transform  = 'translateY(0)';
    });
    return { sheet, panel, close };
}

function openContactSheet(name, phone) {
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const { sheet, close } = openBottomSheet('resp-contact-sheet',
        '<div class="resp-contact-panel" style="background:#fff;width:100%;max-width:520px;border-radius:20px 20px 0 0;padding:16px 18px 20px;box-shadow:0 -4px 24px rgba(0,0,0,0.13);transform:translateY(100%);transition:transform 0.22s cubic-bezier(0.32,0.72,0,1)">' +
            '<div style="width:36px;height:4px;background:#d0d0d0;border-radius:2px;margin:0 auto 14px"></div>' +
            '<div style="font-weight:700;font-size:15px;color:#1a1a2e;text-align:center;margin-bottom:2px">' + esc(name) + '</div>' +
            '<div style="font-size:13px;color:#8892a4;text-align:center;margin-bottom:16px;font-variant-numeric:tabular-nums">' + esc(phone) + '</div>' +
            '<div style="display:flex;flex-direction:column;gap:8px">' +
                '<a href="tel:' + esc(phone) + '" class="resp-contact-act" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;background:var(--accent,#6C63FF);color:#fff;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;min-height:48px">📞 Appeler</a>' +
                '<a href="sms:' + esc(phone) + '" class="resp-contact-act" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;background:#f4f5f8;color:#1a1a2e;border-radius:12px;text-decoration:none;font-weight:600;font-size:14px;min-height:48px">💬 Envoyer un SMS</a>' +
                '<button type="button" class="resp-contact-cancel" style="padding:12px;background:transparent;color:#8892a4;border:none;border-radius:12px;font-weight:600;font-size:13px;min-height:44px;cursor:pointer">Annuler</button>' +
            '</div>' +
        '</div>');

    sheet.querySelector('.resp-contact-cancel').addEventListener('click', close);
    sheet.querySelectorAll('.resp-contact-act').forEach(el => el.addEventListener('click', () => setTimeout(close, 100)));
}

// ── Navigation onglets ───────────────────────────────────────────────────────

function showTab(tab) {
    // Cacher toutes les vues connues
    // `view-next-week` a disparu : les semaines à venir sont empilées dans `view-planning`.
    const views = ['view-planning', 'view-dispos', 'view-historique', 'view-resp-dashboard'];
    views.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    // Afficher la bonne vue
    const target = document.getElementById('view-' + tab);
    if (target) target.style.display = '';
    // Mettre à jour les onglets
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });
}

function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn._tabBound) return;
        btn._tabBound = true;
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            showTab(btn.dataset.tab);
        });
    });
}

// ⚠️ Fonctionnalité agenda iCal DÉSACTIVÉE (D-83) — pas encore assez fiable pour la prod.
// Doit rester aligné avec le flag serveur CALENDAR_ENABLED (server.js). Pour réactiver :
// passer ce flag à true ET réactiver côté serveur.
const CALENDAR_ENABLED = false;

// Carte « Ajouter à mon agenda » : récupère l'URL d'abonnement iCal et propose
// les raccourcis Apple (webcal) / Google + copie manuelle pour Outlook/autres.
function initCalSync() {
    const card   = document.getElementById('cal-sync-card');
    const toggle = document.getElementById('cal-sync-toggle');
    const body   = document.getElementById('cal-sync-body');
    if (!card || !toggle || !body) return;
    // Fonctionnalité désactivée → on masque la carte entièrement (D-83).
    if (!CALENDAR_ENABLED) { card.style.display = 'none'; return; }
    // C-01 : sans profil staff lié (ex. directeur), aucun flux agenda perso possible
    // (l'API /api/calendar-url renverrait 400) → on masque la carte au lieu d'afficher une erreur.
    if (!currentUser || !currentUser.staff_id) { card.style.display = 'none'; return; }
    if (toggle._bound) return;
    toggle._bound = true;
    let loaded = false;

    toggle.addEventListener('click', async () => {
        const isOpen = body.style.display !== 'none';
        if (isOpen) { body.style.display = 'none'; toggle.textContent = 'Configurer'; return; }
        body.style.display = '';
        toggle.textContent = 'Masquer';
        if (loaded) return;

        body.innerHTML = '<div class="cal-sync-help">Chargement…</div>';
        try {
            const r = await fetch('/api/calendar-url', { credentials: 'include' });
            if (!r.ok) throw new Error('indisponible');
            const { url, webcal } = await r.json();
            const googleUrl = 'https://calendar.google.com/calendar/r?cid=' + encodeURIComponent(url);

            body.innerHTML =
                '<div class="cal-sync-actions">' +
                    '<a class="cal-sync-btn cal-sync-btn--primary" href="' + webcal + '">🍎 Apple / iPhone</a>' +
                    '<a class="cal-sync-btn" href="' + googleUrl + '" target="_blank" rel="noopener">📆 Google Agenda</a>' +
                '</div>' +
                '<div class="cal-sync-url-row">' +
                    '<input class="cal-sync-url" id="cal-sync-url-input" readonly value="' + url + '">' +
                    '<button type="button" class="cal-sync-btn" id="cal-sync-copy" style="flex:0 0 auto;min-width:0">Copier</button>' +
                '</div>' +
                '<div class="cal-sync-help">' +
                    '<b>Une seule fois :</b> sur iPhone/Mac, touche « Apple » et confirme l\'abonnement. ' +
                    'Sur Android/PC, ouvre « Google Agenda », ou copie l\'URL et colle-la dans ton appli ' +
                    '(Outlook : « Ajouter un agenda » → « S\'abonner à partir du web »). ' +
                    'Ton agenda se mettra ensuite à jour <b>automatiquement</b>.' +
                '</div>';

            const copyBtn = document.getElementById('cal-sync-copy');
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(url);
                } catch {
                    const i = document.getElementById('cal-sync-url-input');
                    i.select(); document.execCommand('copy');
                }
                copyBtn.textContent = 'Copié ✓';
                setTimeout(() => { copyBtn.textContent = 'Copier'; }, 1500);
            });
            loaded = true;
        } catch {
            body.innerHTML = '<div class="cal-sync-help">Impossible de générer le lien pour le moment. Réessaie plus tard.</div>';
        }
    });
}

// ── Historique — heures par mois ──────────────────────────────────────────────
//
// Vue de CUMUL, sans le détail jour par jour. Ce qu'on vient chercher dans
// l'historique, c'est « combien d'heures ce mois-ci » — pas le rappel d'une soirée
// précise, que le planning de la semaine donne déjà. La navigation semaine par
// semaine ne pouvait pas répondre à cette question : elle demandait cinq
// allers-retours et une addition mentale pour reconstituer un mois.
//
// Le mois courant est compté ENTIER (1er → dernier jour), comme le bascule « Mois »
// du planning : deux totaux différents pour le même mois d'un écran à l'autre, c'est
// le genre d'écart qu'on vient vérifier ici justement.

const HIST_MONTHS_STEP = 6;    // fenêtre initiale, et pas du bouton « voir plus »
const HIST_MONTHS_MAX  = 24;   // au-delà, la donnée n'est plus consultée que par le patron

let _histMonths = HIST_MONTHS_STEP;

// Les bornes de la fenêtre : du 1er du mois le plus ancien au dernier jour du mois
// courant. `new Date(y, m - k, 1)` gère seul le passage d'année.
function histRange(months) {
    const now   = new Date();
    const first = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: toDateStr(first), to: toDateStr(last) };
}

async function loadHistorique() {
    const navEl = document.getElementById('hist-nav');
    const wrap  = document.getElementById('hist-content');
    if (!navEl || !wrap) return;

    const months = _histMonths;
    navEl.innerHTML =
        '<div class="histm-head-title">Mes heures par mois</div>' +
        '<div class="histm-head-sub">Les ' + months + ' derniers mois</div>';

    // Pas de mémo : chaque ouverture de l'onglet redemande la fenêtre. C'est une requête
    // légère (mes seuls shifts, sans collègue ni Joker) et un geste explicite — alors
    // qu'un mémo figerait pour la session le mois marqué « en cours », celui-là même
    // qu'un pointage validé fait bouger.
    wrap.innerHTML = '<div class="hist-loading">Chargement…</div>';

    const { from, to } = histRange(months);
    // `light=1` : cette vue n'affiche aucun collègue. Sans ce drapeau, six mois de
    // dates ramenaient plusieurs centaines de lignes de collègues pour une somme.
    const data = await fetchMyShifts(from, to, { light: true });
    if (!data || data.error) {
        wrap.innerHTML = '<div class="hist-loading">Erreur de chargement.</div>';
        return;
    }

    renderHistoriqueMois(wrap, (data.shifts || []).filter(s => !isJoker(s)));
}

function renderHistoriqueMois(wrap, shifts) {
    const mois = ShiftHours.monthlyTotals(shifts);

    if (mois.length === 0) {
        wrap.innerHTML = '<div class="hist-empty">Aucun shift sur cette période.</div>';
        appendHistMoreBtn(wrap);
        return;
    }

    const moisCourant = toDateStr(new Date()).slice(0, 7);
    const totalH      = mois.reduce((a, m) => a + m.totalH, 0);

    let html = '<div class="histm-list">';
    mois.forEach(m => {
        const [y, mo]  = m.month.split('-').map(Number);
        const nom      = MONTH_NAMES_LONG[mo - 1];
        const label    = nom.charAt(0).toUpperCase() + nom.slice(1) + ' ' + y;
        const estabIds = Object.keys(m.byEstab);
        html +=
            '<div class="histm-row' + (m.month === moisCourant ? ' histm-row--current' : '') + '">' +
                '<div class="histm-main">' +
                    '<div class="histm-month">' + label +
                        (m.month === moisCourant ? '<span class="histm-chip">en cours</span>' : '') +
                    '</div>' +
                    '<div class="histm-meta">' + m.nbDays + ' jour' + (m.nbDays > 1 ? 's' : '') +
                        ' · ' + m.nbShifts + ' shift' + (m.nbShifts > 1 ? 's' : '') + '</div>' +
                '</div>' +
                '<div class="histm-hours">' + fmtDuration(m.totalH) + '</div>' +
            '</div>' +
            (estabIds.length > 1
                ? '<div class="histm-estabs">' + estabIds.map(id =>
                      '<span class="estab-hours-chip"><span>' + formatEstablishment(id) + '</span>' +
                      '<span style="font-weight:700;color:var(--text-primary);margin-left:4px">' +
                      fmtDuration(m.byEstab[id]) + '</span></span>').join('') + '</div>'
                : '');
    });
    html += '</div>' +
        '<div class="histm-total">' +
            '<span>Total sur la période</span>' +
            '<span class="histm-total-value">' + fmtDuration(totalH) + '</span>' +
        '</div>';

    wrap.innerHTML = html;
    appendHistMoreBtn(wrap);
}

// « Voir plus » plutôt qu'une fenêtre fixe : six mois couvrent la question courante,
// et remonter plus loin reste possible sans imposer la requête longue à tout le monde.
function appendHistMoreBtn(wrap) {
    if (_histMonths >= HIST_MONTHS_MAX) return;
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'histm-more';
    btn.textContent = 'Voir ' + HIST_MONTHS_STEP + ' mois de plus';
    btn.addEventListener('click', () => {
        _histMonths = Math.min(_histMonths + HIST_MONTHS_STEP, HIST_MONTHS_MAX);
        loadHistorique();
    });
    wrap.appendChild(btn);
}


// ── Disponibilités ────────────────────────────────────────────────────────────

const DISPO_TYPES = {
    soir:   { label: 'Soir',         sub: '16h → 02h',       start: 16,   end: 26 },
    midi:   { label: 'Midi',         sub: '10h → 17h',       start: 10,   end: 17 },
    long:   { label: 'Long',         sub: '10h → 02h',       start: 10,   end: 26 },
    custom: { label: 'Personnalisé', sub: 'horaires libres', start: null, end: null },
    off:    { label: 'Indispo',      sub: null,              start: null, end: null },
};

let dispoSettings  = null;
let dispoSelections = {}; // { "2025-06-23": { type, start_time, end_time, note } }

// B2 — horizon de saisie. `dispoMondays` porte les lundis autorisés (N+1 … N+X, calculés
// par la MÊME fonction que le serveur) et `dispoWeekIndex` celui qu'on affiche.
// Le formulaire reste MONO-SEMAINE à l'écran, par navigation : empiler six semaines
// ferait défiler 42 cartes pour en corriger une seule.
let dispoMondays   = [];
let dispoWeekIndex = 0;

// Le lundi de la semaine actuellement affichée, en Date locale.
function currentDispoMonday() {
    const iso = dispoMondays[dispoWeekIndex] || dispoMondays[0];
    if (!iso) return getMondayOf(addDays(new Date(), 7));   // avant tout chargement
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

// La semaine affichée est-elle celle que la deadline verrouille ? (règle A : la deadline
// ne garde QUE la semaine en cours de collecte, l'index 0 de l'horizon.)
function currentDispoWeekLocked() {
    return dispoWeekIndex === 0 && dispoSettings && dispoSettings.collectionWeekOpen === false;
}

async function loadDisposTab() {
    // Charger les paramètres
    const sRes = await fetch('/api/dispo-settings', { credentials: 'include' });
    dispoSettings = await sRes.json();

    dispoMondays = Week.disposHorizonMondays(new Date(), dispoSettings.horizon_weeks || 1);
    if (dispoWeekIndex >= dispoMondays.length) dispoWeekIndex = 0;

    const statusEl = document.getElementById('dispos-status');
    const formEl   = document.getElementById('dispos-form');
    const btnSubmit = document.getElementById('btn-submit-dispos');

    // La deadline de la semaine AFFICHÉE — une seule notion pour tout ce qui suit. Sauf
    // la branche « saisie fermée » juste en dessous, atteignable quel que soit l'index et
    // qui nomme donc sa source (`deadlineLabel()`, le cycle courant), tout le reste du
    // corps est gardé par `dispoWeekIndex === 0`, où les deux coïncident par construction.
    const fmtDateSemaine = deadlineLabelForWeek(dispoWeekIndex);

    // Saisie fermée : la semaine-type n'a plus rien à proposer non plus — le serveur ne
    // la matérialise pas pour un établissement fermé ou un staff sans droit d'envoi
    // (`templateEligible`). Une carte visible promettrait un envoi qui n'aura pas lieu.
    const tplCard = document.getElementById('dispo-tpl-card');
    if (tplCard) tplCard.style.display = 'none';

    // ⚠️ Fermée PAR LE PATRON, et non par la deadline. Ne pas remettre `canSubmit` ici :
    // il vaut `staffCanSubmit && open && (collectionWeekOpen || horizon > 1)`, donc avec
    // l'horizon par défaut (1 semaine) il passe à faux dès la deadline franchie. On
    // masquait alors la semaine-type pendant tout le week-end — exactement la fenêtre où
    // l'on se dit « la prochaine fois, que ça parte tout seul ». La semaine figée est
    // traitée plus bas par `currentDispoWeekLocked()`, qui dit lequel des deux motifs joue.
    const saisieFermee = dispoSettings.staffCanSubmit === false || dispoSettings.open === false;

    if (saisieFermee) {
        statusEl.textContent   = dispoSettings.deadlinePassed
            ? 'Deadline dépassée le ' + deadlineLabel() + '.'
            : 'Saisie fermée par le responsable.';
        statusEl.style.color   = '#e74c3c';
        formEl.innerHTML       = '<div style="padding:20px 0;text-align:center;color:#ccc;font-size:14px">La saisie des disponibilités n\'est pas disponible pour le moment.</div>';
        btnSubmit.disabled     = true;
        btnSubmit.style.background = '#ccc';
        return;
    }

    // Deadline dépassée mais saisie quand même acceptée (force_open, réouverture
    // nominative, ou rôle directeur) : ne pas l'afficher comme si elle courait encore.
    const late = dispoSettings.deadlinePassed && dispoSettings.deadlineWaived;
    // B2 règle A — sur un horizon élargi, la deadline ne concerne QUE la semaine
    // prochaine. L'annoncer sans le dire ferait croire que toute la saisie ferme.
    const multiWeek = dispoMondays.length > 1;
    // Sur une semaine AUTRE que celle en cours de collecte, l'état du cycle courant
    // (dépassé, réouvert, forcé) ne dit rien : cette semaine-là a son propre rendez-vous,
    // sept jours plus loin par index, et il est nécessairement à venir. Afficher ici
    // « Deadline dépassée le … », ou la date du cycle courant, revenait à annoncer la
    // deadline d'une autre semaine que celle qu'on est en train de remplir.
    if (dispoWeekIndex > 0) {
        statusEl.textContent = 'Deadline : ' + fmtDateSemaine + ' (pour cette semaine)';
        statusEl.style.color = '#aaa';
    } else {
        statusEl.textContent = late  ? 'Deadline dépassée le ' + fmtDateSemaine + ' — saisie encore ouverte pour toi.'
            : dispoSettings.force_open ? '🔓 Saisie ouverte en urgence par le responsable'
            // Depuis que la deadline ne provoque plus le retour anticipé ci-dessus, ce cas
            // arrive jusqu'ici : sans cette branche l'en-tête annonçait « Deadline : … » au
            // futur, juste au-dessus de l'encadré rouge « cette semaine est figée ».
            : dispoSettings.deadlinePassed ? 'Deadline dépassée le ' + fmtDateSemaine + '.'
            : multiWeek ? 'Deadline : ' + fmtDateSemaine + ' (pour la semaine prochaine seulement)'
            : 'Deadline : ' + fmtDateSemaine;
        statusEl.style.color = (late || dispoSettings.force_open) ? '#27ae60'
            : dispoSettings.deadlinePassed ? '#e74c3c' : '#aaa';
    }

    // Le titre annonçait « semaine prochaine » quelle que soit la semaine affichée.
    const titleEl = document.getElementById('dispos-title');
    if (titleEl) {
        titleEl.textContent = dispoWeekIndex === 0
            ? 'Mes dispos — semaine prochaine'
            : 'Mes dispos — ' + weekRangeLabel(dispoMondays[dispoWeekIndex]).toLowerCase();
    }

    // Semaine affichée, dans l'horizon autorisé
    const nextMonday = currentDispoMonday();

    // Charger les dispos existantes
    const from = toDateStr(nextMonday);
    const to   = toDateStr(addDays(nextMonday, 6));
    // Lancée ICI mais attendue plus bas : elle ne dépend de rien de ce qui suit, et
    // l'enchaîner coûtait un aller-retour de plus à la première ouverture de l'onglet.
    const tplLoaded = loadDispoTemplate();
    const dRes = await fetch('/api/dispos/mine?from=' + from + '&to=' + to, { credentials: 'include' });
    const existingDispos = dRes.ok ? await dRes.json() : [];

    // Pré-remplir les sélections
    dispoSelections = {};
    existingDispos.forEach(d => {
        dispoSelections[d.date] = { type: d.type, start_time: d.start_time, end_time: d.end_time, note: d.note || '' };
    });

    // Vérifier si des dispos ont déjà été soumises (pending ou confirmed)
    const alreadySubmitted = existingDispos.some(d => d.status === 'pending' || d.status === 'confirmed');

    // Jours de repos à masquer
    const restDays = dispoSettings.rest_days || [];

    // Jours couverts par un congé posé (non refusé) → bloqués pour les dispos
    const congeDates = new Set();
    try {
        const cRes = await fetch('/api/conges/mine', { credentials: 'include' });
        if (cRes.ok) {
            const myConges = await cRes.json();
            for (let i = 0; i < 7; i++) {
                const ds = toDateStr(addDays(nextMonday, i));
                if (myConges.some(c => c.status !== 'rejected' && c.start_date <= ds && ds <= c.end_date)) {
                    congeDates.add(ds);
                    delete dispoSelections[ds]; // pas de dispo soumise pour un jour de congé
                }
            }
        }
    } catch { /* silencieux */ }

    await tplLoaded;

    // Pré-remplissage d'une semaine encore vide, par ordre de PRÉCISION de l'intention :
    // la semaine-type d'abord — c'est un choix explicite, et surtout c'est elle qui
    // partira vraiment à la deadline — la semaine précédente ensuite, qui n'est qu'une
    // habitude déduite. Montrer la seconde alors que la première est armée afficherait
    // autre chose que ce qui sera envoyé.
    if (!alreadySubmitted && existingDispos.length === 0) {
        if (dispoTemplateDays().length) {
            // MÊME fonction que le serveur (`materializeTemplateWeek`), donc mêmes
            // exclusions et même convention lundi=0 : ce qui s'affiche ici est exactement
            // ce qui partira à la deadline. La règle était recopiée à la main dans les
            // deux fronts, et la copie du patron avait déjà divergé — cf. le commentaire
            // en tête de `public/lib/dispo-template.js`.
            DispoTemplate.buildTemplateDispos({ days: dispoTemplate }, toDateStr(nextMonday), congeDates, restDays)
                .forEach(d => {
                    dispoSelections[d.date] = { type: d.type, start_time: d.start_time, end_time: d.end_time, note: '' };
                });
        } else {
            const pRes = await fetch('/api/dispos/previous?week_start=' + from, { credentials: 'include' });
            if (pRes.ok) {
                const prevDispos = await pRes.json();
                prevDispos.forEach(p => {
                    const [py, pm, pd] = p.date.split('-').map(Number);
                    const curDate    = addDays(new Date(py, pm - 1, pd), 7);
                    const curDateStr = toDateStr(curDate);
                    // Ne pas reposer une dispo de la semaine passée sur un jour devenu
                    // repos OU congé : sinon submitDispos l'enverrait et le serveur
                    // rejetterait tout le lot (409 « jour de congé »).
                    if (!restDays.includes(curDate.getDay()) && !congeDates.has(curDateStr)) {
                        dispoSelections[curDateStr] = { type: p.type, start_time: p.start_time, end_time: p.end_time, note: p.note || '' };
                    }
                });
            }
        }
    }

    // Rendue AVANT le retour anticipé « semaine figée » : avec l'horizon par défaut (1
    // semaine), la seule semaine affichée est justement verrouillée entre la deadline et
    // le lundi suivant. C'est le moment où l'on se dit « la prochaine fois, que ça parte
    // tout seul » — la carte doit y être.
    renderDispoTplCard();

    // Générer les cartes (jours de repos en lecture seule)
    formEl.innerHTML = '';

    // B2 — navigation entre les semaines de l'horizon. Absente si l'horizon vaut 1 :
    // des flèches désactivées des deux côtés n'apprendraient rien à personne.
    if (multiWeek) {
        const sunday = addDays(nextMonday, 6);
        const nav = document.createElement('div');
        nav.className = 'dispo-week-nav';
        nav.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px';
        const label = 'Semaine du ' + nextMonday.getDate() + ' ' + MONTH_NAMES[nextMonday.getMonth()] +
                      ' au ' + sunday.getDate() + ' ' + MONTH_NAMES[sunday.getMonth()];
        nav.innerHTML =
            '<button type="button" id="dispo-week-prev" class="dispo-week-arrow" ' +
                (dispoWeekIndex === 0 ? 'disabled ' : '') +
                'style="padding:6px 12px;border-radius:8px;border:1.5px solid var(--border,#ddd);background:transparent;color:inherit;font-size:15px;cursor:pointer' +
                (dispoWeekIndex === 0 ? ';opacity:.3;cursor:default' : '') + '">‹</button>' +
            '<div style="text-align:center;line-height:1.3">' +
                '<div style="font-size:13px;font-weight:700">' + label + '</div>' +
                '<div style="font-size:11px;color:var(--text-muted,#999)">Semaine ' + (dispoWeekIndex + 1) + ' sur ' + dispoMondays.length +
                    ' · deadline ' + deadlineShortLabelForWeek(dispoWeekIndex) + '</div>' +
            '</div>' +
            '<button type="button" id="dispo-week-next" class="dispo-week-arrow" ' +
                (dispoWeekIndex >= dispoMondays.length - 1 ? 'disabled ' : '') +
                'style="padding:6px 12px;border-radius:8px;border:1.5px solid var(--border,#ddd);background:transparent;color:inherit;font-size:15px;cursor:pointer' +
                (dispoWeekIndex >= dispoMondays.length - 1 ? ';opacity:.3;cursor:default' : '') + '">›</button>';
        formEl.appendChild(nav);
        const go = delta => {
            dispoWeekIndex = Math.min(Math.max(dispoWeekIndex + delta, 0), dispoMondays.length - 1);
            loadDisposTab();
        };
        nav.querySelector('#dispo-week-prev').addEventListener('click', () => go(-1));
        nav.querySelector('#dispo-week-next').addEventListener('click', () => go(1));
    }

    // Semaine figée par la deadline : on ne montre PAS de cartes modifiables — le
    // serveur refuserait l'envoi, et un formulaire qui accepte des clics pour rien est
    // pire qu'un formulaire absent. Les autres semaines restent accessibles.
    if (currentDispoWeekLocked()) {
        const locked = document.createElement('div');
        locked.style.cssText = 'background:#fdf3f3;border:1px solid #f5c6c6;border-radius:10px;padding:14px 16px;font-size:13px;color:#b03a3a;line-height:1.5';
        locked.textContent = 'Cette semaine est figée depuis la deadline du ' + fmtDateSemaine +
            ' — le planning est en cours de préparation.' +
            (dispoMondays.length > 1 ? ' Les semaines suivantes restent ouvertes à la saisie.' : '');
        formEl.appendChild(locked);
        btnSubmit.disabled = true;
        btnSubmit.style.background = '#ccc';
        return;
    }
    btnSubmit.disabled = false;
    btnSubmit.style.background = '';

    for (let i = 0; i < 7; i++) {
        const d    = addDays(nextMonday, i);
        const date = toDateStr(d);
        if (congeDates.has(date)) {
            formEl.appendChild(createCongeDayCard(d));
        } else if (restDays.includes(d.getDay())) {
            formEl.appendChild(createRestDayCard(d));
        } else {
            formEl.appendChild(createDispoCard(date, d));
        }
    }

    // Déjà soumises mais deadline encore ouverte (ce code ne tourne que si canSubmit) :
    // la saisie reste MODIFIABLE jusqu'à la deadline. On informe simplement le staff.
    if (alreadySubmitted) {
        const notice = document.createElement('div');
        notice.style.cssText = 'background:#eef2ff;border:1px solid #c5beff;border-radius:10px;padding:12px 16px;font-size:13px;color:#3730a3;margin-bottom:4px;line-height:1.5;';
        // La deadline de LA semaine affichée : sur la semaine 2, annoncer celle de la
        // semaine 1 donnait une date déjà passée sous un formulaire encore modifiable.
        notice.textContent = '✏️ Tes disponibilités ont été envoyées. Tu peux encore les modifier jusqu’au ' + fmtDateSemaine + '.';
        formEl.insertBefore(notice, formEl.firstChild);
        btnSubmit.textContent = 'Mettre à jour mes dispos';
    }

    // Bloc note globale semaine
    const weekStart = toDateStr(nextMonday);
    const noteBlock = document.createElement('div');
    noteBlock.className = 'week-note-block';
    noteBlock.innerHTML =
        '<div class="week-note-label">Note pour la semaine</div>' +
        '<textarea id="weekNoteInput" class="week-note-textarea" maxlength="200" placeholder="Ex : Dispo mardi au besoin…"></textarea>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:6px">' +
            '<span id="weekNoteCount" style="font-size:11px;color:var(--text-muted)">0 / 200</span>' +
            '<button id="saveWeekNote" class="week-note-save">Enregistrer la note</button>' +
        '</div>';
    formEl.appendChild(noteBlock);

    // Charger la note existante
    const nRes = await fetch('/api/dispos/week-note?week_start=' + weekStart, { credentials: 'include' });
    if (nRes.ok) {
        const nData = await nRes.json();
        const ta = document.getElementById('weekNoteInput');
        ta.value = nData.week_note || '';
        document.getElementById('weekNoteCount').textContent = ta.value.length + ' / 200';
    }

    document.getElementById('weekNoteInput').addEventListener('input', e => {
        document.getElementById('weekNoteCount').textContent = e.target.value.length + ' / 200';
    });

    document.getElementById('saveWeekNote').addEventListener('click', async () => {
        const note = document.getElementById('weekNoteInput').value;
        const btn  = document.getElementById('saveWeekNote');
        btn.disabled    = true;
        btn.textContent = 'Enregistrement…';
        try {
            const r = await fetch('/api/dispos/week-note', {
                method: 'POST', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ week_start: weekStart, week_note: note }),
            });
            if (!r.ok) throw new Error((await r.json()).error);
            btn.textContent = '✓ Enregistré';
            setTimeout(() => { btn.disabled = false; btn.textContent = 'Enregistrer la note'; }, 2000);
        } catch (err) {
            btn.disabled    = false;
            btn.textContent = 'Enregistrer la note';
            alert(err.message || 'Erreur');
        }
    });

    btnSubmit.replaceWith(btnSubmit.cloneNode(true));
    document.getElementById('btn-submit-dispos').addEventListener('click', submitDispos);
}

function createDispoCard(date, d) {
    const sel  = dispoSelections[date] || { type: null };
    const card = document.createElement('div');
    card.className = 'dispo-card';

    const fmt = h => String(Math.floor(h % 24)).padStart(2, '0') + 'h';

    // Même table que la carte semaine-type (`DISPO_TYPES`) : deux vocabulaires pour les
    // mêmes cinq boutons obligeaient le staff à traduire d'un écran à l'autre.
    // La couleur vit dans la CSS (`.selected-<type>`), pas ici.
    const BTN_CONFIG = DISPO_TYPES;

    const isSelected = sel.type !== null;

    card.innerHTML =
        '<div class="dispo-day-header">' +
            '<div class="dispo-day-name">' + DAY_NAMES[d.getDay()] + ' ' + d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + '</div>' +
            (isSelected && sel.type !== 'off'
                ? '<div class="dispo-day-selected">' +
                    (sel.type === 'custom' && sel.start_time
                        ? fmt(sel.start_time) + ' → ' + fmt(sel.end_time)
                        : BTN_CONFIG[sel.type].sub) +
                  '</div>'
                : '') +
        '</div>' +
        '<div class="dispo-body">' +
            '<div class="dispo-type-row">' +
                ['soir', 'midi', 'long', 'custom', 'off'].map(type => {
                    const cfg    = BTN_CONFIG[type];
                    const active = sel.type === type ? ' selected-' + type : '';
                    return '<button class="dispo-type-btn' + active + '" data-date="' + date + '" data-type="' + type + '">' +
                        '<span class="dispo-btn-label">' + cfg.label + '</span>' +
                        (cfg.sub ? '<span class="dispo-btn-sub">' + cfg.sub + '</span>' : '') +
                    '</button>';
                }).join('') +
            '</div>' +
            '<div class="dispo-custom-row' + (sel.type === 'custom' ? ' visible' : '') + '" id="custom-' + date + '">' +
                '<input class="dispo-time-input" id="start-' + date + '" type="text" inputmode="numeric" placeholder="10" value="' + (sel.start_time ? fmt(sel.start_time) : '') + '">' +
                '<span style="color:#aaa;flex-shrink:0">→</span>' +
                '<input class="dispo-time-input" id="end-' + date + '" type="text" inputmode="numeric" placeholder="18" value="' + (sel.end_time ? fmt(sel.end_time) : '') + '">' +
            '</div>' +
            '<textarea class="dispo-note-input" id="note-' + date + '" placeholder="Note optionnelle..." rows="1">' + _esc(sel.note || '') + '</textarea>' +
        '</div>';

    // Listeners boutons type
    card.querySelectorAll('.dispo-type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.type;
            const date = btn.dataset.date;

            card.querySelectorAll('.dispo-type-btn').forEach(b => { b.className = 'dispo-type-btn'; });
            btn.classList.add('selected-' + type);

            const customRow = document.getElementById('custom-' + date);
            customRow.classList.toggle('visible', type === 'custom');

            if (type === 'off') {
                dispoSelections[date] = { type: 'off', start_time: null, end_time: null, note: '' };
            } else if (type === 'custom') {
                dispoSelections[date] = { type: 'custom', start_time: null, end_time: null, note: '' };
            } else {
                dispoSelections[date] = {
                    type,
                    start_time: DISPO_TYPES[type].start,
                    end_time:   DISPO_TYPES[type].end,
                    note: '',
                };
            }

            // Mettre à jour le résumé dans le header de la carte
            const headerSel = card.querySelector('.dispo-day-selected');
            const cfg = BTN_CONFIG[type];
            if (type !== 'off' && cfg.sub) {
                if (headerSel) {
                    headerSel.textContent = cfg.sub;
                } else {
                    const dn = card.querySelector('.dispo-day-name');
                    const sp = document.createElement('div');
                    sp.className = 'dispo-day-selected';
                    sp.textContent = cfg.sub;
                    dn.after(sp);
                }
            } else if (headerSel) {
                headerSel.remove();
            }
        });
    });

    return card;
}

function createRestDayCard(d) {
    const card = document.createElement('div');
    card.className = 'dispo-card dispo-card-rest';
    card.innerHTML =
        '<div class="dispo-day-header">' +
            '<div class="dispo-day-name">' + DAY_NAMES[d.getDay()] + ' ' + d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + '</div>' +
            '<span class="dispo-rest-badge">Repos</span>' +
        '</div>';
    return card;
}

// Jour couvert par un congé posé : carte en lecture seule, pas de saisie de dispo.
function createCongeDayCard(d) {
    const card = document.createElement('div');
    card.className = 'dispo-card dispo-card-rest';
    card.innerHTML =
        '<div class="dispo-day-header">' +
            '<div class="dispo-day-name">' + DAY_NAMES[d.getDay()] + ' ' + d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + '</div>' +
            '<span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:8px;background:#d1fae5;color:#065f46">🌴 Congé</span>' +
        '</div>';
    return card;
}

// « 16h30 », « 16:30 », « 16 » → 16.5. UNE seule règle de lecture, partagée par l'envoi
// des dispos et par l'enregistrement de la semaine-type : deux parseurs finiraient par
// diverger, et un modèle qui n'interprète pas les horaires comme l'envoi enverrait autre
// chose que ce que le staff avait sous les yeux.
function parseDispoTime(v) {
    if (!v) return null;
    v = v.trim().toLowerCase();
    const sep = v.includes('h') ? 'h' : (v.includes(':') ? ':' : null);
    if (!sep) return parseInt(v, 10) || 0;
    const [hs, ms] = v.split(sep);
    return (parseInt(hs, 10) || 0) + (parseInt(ms, 10) || 0) / 60;
}

// Horaires retenus pour un jour. Pour `custom`, ils ne vivent QUE dans les champs du DOM
// tant que rien n'est envoyé (cf. `createDispoCard`, qui pose start/end à null au clic) —
// d'où la lecture des inputs. Sans carte à l'écran (semaine figée par la deadline), les
// valeurs déjà enregistrées font foi. Retourne null si la saisie est illisible.
function readDispoTimes(date, sel) {
    const startEl = document.getElementById('start-' + date);
    const endEl   = document.getElementById('end-'   + date);
    if (sel.type !== 'custom' || !startEl || !endEl) return { start: sel.start_time, end: sel.end_time };
    const start = parseDispoTime(startEl.value);
    let   end   = parseDispoTime(endEl.value);
    if (start == null || end == null) return null;
    if (end <= start) end += 24;   // fin après minuit (16h → 02h = 26)
    return { start, end };
}

async function submitDispos() {
    const btn    = document.getElementById('btn-submit-dispos');
    btn.disabled = true;
    btn.textContent = 'Envoi…';

    const dispos = [];
    // B2 — la semaine AFFICHÉE, pas « la semaine prochaine ». Chaque envoi porte sur une
    // semaine : l'upsert serveur est keyé par (staff_id, date), donc valider une semaine
    // ne touche jamais aux autres.
    const nextMonday = currentDispoMonday();

    for (let i = 0; i < 7; i++) {
        const date = toDateStr(addDays(nextMonday, i));
        const sel  = dispoSelections[date];
        if (!sel || sel.type === null) continue; // jour non renseigné → ignoré (off = indispo, on l'enregistre)

        const times = readDispoTimes(date, sel);
        if (!times) {
            showMsg('Horaires invalides pour le ' + date, 'error');
            btn.disabled    = false;
            btn.textContent = 'Envoyer mes dispos';
            return;
        }

        const note = document.getElementById('note-' + date)?.value || '';
        dispos.push({ date, type: sel.type, start_time: times.start, end_time: times.end, note });
    }

    if (dispos.length === 0) {
        showMsg('Sélectionne au moins un jour.', 'error');
        btn.disabled    = false;
        btn.textContent = 'Envoyer mes dispos';
        return;
    }

    try {
        const res  = await fetch('/api/dispos', {
            credentials: 'include',
            method:      'POST',
            headers:     { 'Content-Type': 'application/json' },
            body:        JSON.stringify({ dispos }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        showMsg(data.message, 'success');
        btn.textContent = 'Dispos envoyées ✓';
        // Reste modifiable jusqu'à la deadline → on réactive le bouton pour
        // permettre d'autres ajustements sans recharger la page.
        setTimeout(() => { btn.disabled = false; btn.textContent = 'Mettre à jour mes dispos'; }, 1800);
    } catch (e) {
        showMsg(e.message, 'error');
        btn.disabled    = false;
        btn.textContent = 'Envoyer mes dispos';
    }
}

// ── Semaine-type ──────────────────────────────────────────────────────────────
//
// « Ce qui part à ma place si je n'ai rien envoyé quand la deadline tombe. » Même
// mécanisme que celui des directeurs depuis le 2026-08-24, mêmes règles côté serveur :
// matérialisation au SEUL déclenchement de la deadline, en CRÉATION SEULE (une saisie
// réelle de la semaine gagne toujours), jours de congé et de repos sautés.
//
// Pas de second éditeur 7 jours ici : le staff a déjà sa semaine sous les yeux, « fais-en
// mon modèle » est un bouton. Une grille supplémentaire aurait dupliqué toute la
// mécanique de saisie pour la même information.
let dispoTemplate = null;   // { 0..6: { type, start_time, end_time } } — 0 = lundi
// Lundi de la dernière semaine pour laquelle le rendez-vous de la deadline a DÉJÀ eu lieu
// (matérialisée, ou neutralisée parce que le modèle a été enregistré trop tard). Sans lui,
// la carte promettrait un envoi « à la prochaine deadline » alors qu'il vise la suivante.
let dispoTemplateDone = null;

// Les jours du modèle, triés, en index lundi = 0.
const dispoTemplateDays = () =>
    Object.keys(dispoTemplate || {}).filter(k => dispoTemplate[k]).map(Number).sort((a, b) => a - b);

// Chargé une seule fois : `loadDisposTab` est rappelé à CHAQUE flèche de navigation
// entre les semaines de l'horizon, et le modèle ne change que d'ici (`putDispoTemplate`
// tient la copie locale à jour).
async function loadDispoTemplate() {
    if (dispoTemplate !== null) return;
    try {
        const res  = await fetch('/api/me/dispo-template', { credentials: 'include' });
        const data = res.ok ? await res.json() : {};
        dispoTemplate     = data.days || {};
        dispoTemplateDone = data.last_materialized_week || null;
    } catch { dispoTemplate = {}; dispoTemplateDone = null; }
}

// Une seule mise en forme de la deadline pour toute la page : l'en-tête et la carte
// semaine-type parlent de la MÊME échéance, deux formats donneraient l'impression
// qu'il y en a deux.
function deadlineLabel() { return deadlineLabelForWeek(0); }

// La deadline de la semaine d'index `i` de l'horizon (0 = semaine en cours de collecte).
// La règle — le rendez-vous est hebdomadaire, le serveur n'envoie que celui du cycle
// courant — vit dans `public/lib/week.js`, avec les autres règles de dates de l'horizon
// et ses tests (tests/week.test.js). Ici, seule la lecture du réglage.
function deadlineForWeek(i) {
    return Week.disposDeadlineForWeek(dispoSettings && dispoSettings.deadline, i);
}

function deadlineLabelForWeek(i) {
    const d = deadlineForWeek(i);
    return d ? d.toLocaleDateString('fr-FR',
        { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
}

// Format court pour la barre de navigation, où la place manque : « ven. 12 sept. 13h ».
function deadlineShortLabelForWeek(i) {
    const d = deadlineForWeek(i);
    if (!d) return '';
    const jour = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    const min  = d.getMinutes();
    return jour + ' ' + d.getHours() + 'h' + (min ? String(min).padStart(2, '0') : '');
}

function setTplFeedback(msg, type) {
    const fb = document.getElementById('dispo-tpl-feedback');
    if (!fb) return;
    // Effacement : sortir tout de suite. Sans ça, chaque rendu de carte — donc chaque
    // flèche de navigation entre semaines — armait un timer de 3 s pour ne rien faire.
    if (!msg) { fb.textContent = ''; return; }
    fb.style.color = type === 'error' ? '#c0392b' : '#1a7a4a';
    fb.textContent = msg;
    if (type !== 'error') setTimeout(() => { if (fb.textContent === msg) fb.textContent = ''; }, 3000);
}

// Le jour du modèle tel qu'il partira : nom du jour ET horaires. N'afficher que le nom
// laissait le staff deviner ce qui allait être envoyé en son nom — c'est exactement ce
// qu'une semaine-type doit rendre vérifiable d'un coup d'œil.
// DAY_NAMES_LONG est indexé sur getDay() (0 = dimanche) ; le modèle sur lundi = 0.
function templateDayLine(i) {
    const cell = (dispoTemplate || {})[i] || {};
    const cfg  = DISPO_TYPES[cell.type] || DISPO_TYPES.custom;
    const h = (cell.start_time == null || cell.end_time == null)
        ? '—' : fmtHour(cell.start_time) + ' → ' + fmtHour(cell.end_time);
    return '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:3px 0">'
         +     '<span>' + DAY_NAMES_LONG[(i + 1) % 7] + '</span>'
         +     '<span style="display:inline-flex;align-items:baseline;gap:8px">'
         +         '<span style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;'
         +             'padding:1px 6px;border-radius:5px;background:var(--light-border,#e6e6ef);color:var(--text-primary)">'
         +             cfg.label + '</span>'
         +         '<span style="font-weight:600;font-variant-numeric:tabular-nums">' + h + '</span>'
         +     '</span>'
         + '</div>';
}

// La matérialisation ne vise QUE la semaine en cours de collecte (index 0 de l'horizon),
// jamais celle qui est affichée si le staff a navigué plus loin dans son horizon.
function templateTargetLabel() {
    const iso = dispoMondays[0];
    return iso ? fmtCongeDate(iso) : 'prochaine';
}

// Pas de paramètre « semaine » : la carte agit toujours sur la semaine AFFICHÉE, et la
// lire au moment du clic (comme `submitDispos`) évite qu'un lundi capturé au rendu ne
// reste collé au bouton après une navigation.
function renderDispoTplCard() {
    const card = document.getElementById('dispo-tpl-card');
    if (!card) return;
    card.style.display = '';
    const statusEl = document.getElementById('dispo-tpl-status');
    const saveBtn  = document.getElementById('dispo-tpl-save');
    const clearBtn = document.getElementById('dispo-tpl-clear');
    setTplFeedback('');

    // Semaine figée : aucune carte de jour n'est rendue au-dessus. Proposer « enregistrer
    // cette semaine » y ferait persister, sans que rien ne soit visible, le
    // pré-remplissage automatique venu de la semaine précédente — un modèle que le staff
    // n'aurait jamais vu ni choisi. La carte reste affichée (elle informe, et le retrait
    // reste possible), l'enregistrement attend la semaine suivante.
    const figee = currentDispoWeekLocked();
    const days  = dispoTemplateDays();
    if (days.length) {
        // Le rendez-vous de la semaine en cours de collecte a-t-il déjà eu lieu ? Si oui,
        // annoncer « pour la semaine du 31 » serait faux : ce modèle vise la suivante.
        const servie = dispoTemplateDone && dispoTemplateDone === dispoMondays[0];
        statusEl.innerHTML =
            (servie
                ? '<div>La deadline de la semaine du <b>' + templateTargetLabel() + '</b> est déjà passée : '
                  + 'ce modèle prendra effet à la <b>deadline suivante</b>. Voilà ce qui partira alors '
                  + 'à ta place, sur les jours que tu auras laissés vides :</div>'
                : '<div>Si tu n\'as rien envoyé quand la deadline tombe (<b>' + deadlineLabel() + '</b>), '
                  + 'voilà ce qui partira tout seul à ta place, pour la <b>semaine du ' + templateTargetLabel() + '</b> :</div>')
          + '<div style="margin:8px 0;padding:8px 10px;border-radius:8px;background:var(--light-bg,#f7f7fa)">'
          + days.map(templateDayLine).join('')
          + '</div>'
          + '<div style="font-size:12px;color:var(--text-muted,#888);line-height:1.45">'
          + 'Tes congés et tes jours de repos sont sautés. Et si tu envoies tes dispos toi-même, '
          + 'ce sont les tiennes qui comptent : le modèle ne les remplace jamais.</div>';
        clearBtn.style.display = '';
        saveBtn.textContent    = 'Remplacer par cette semaine';
    } else {
        statusEl.innerHTML =
            '<div>Aucun modèle enregistré : si tu n\'envoies rien avant la deadline, '
          + '<b>rien ne partira</b> à ta place.</div>'
          + '<div style="font-size:12px;color:var(--text-muted,#888);line-height:1.45;margin-top:6px">'
          + (figee
              ? 'Dès que la prochaine semaine s\'ouvrira, remplis-la puis enregistre-la ici : '
                + 'ces horaires seront renvoyés automatiquement à chaque deadline où tu n\'as rien saisi.'
              : 'Remplis ta semaine ci-dessus puis enregistre-la ici : ces horaires seront renvoyés '
                + 'automatiquement à chaque deadline où tu n\'as rien saisi.')
          + '</div>';
        clearBtn.style.display = 'none';
        saveBtn.textContent    = 'Enregistrer cette semaine comme modèle';
    }
    saveBtn.style.display = figee ? 'none' : '';
    saveBtn.onclick  = () => saveDispoTemplate();
    clearBtn.onclick = () => putDispoTemplate({}, 'Modèle retiré — plus rien ne partira automatiquement.');
}

function saveDispoTemplate() {
    const weekMonday = currentDispoMonday();
    const days = {};
    for (let i = 0; i < 7; i++) {
        const date = toDateStr(addDays(weekMonday, i));
        const sel  = dispoSelections[date];
        // `off` (indisponible) n'a pas d'horaires : rien à envoyer ce jour-là, ce qui est
        // exactement l'effet d'un jour ABSENT du modèle. Le serveur l'ignore aussi.
        if (!sel || !sel.type || sel.type === 'off') continue;
        const times = readDispoTimes(date, sel);
        if (!times || times.start == null || times.end == null)
            return setTplFeedback('Horaires incomplets sur un jour « Personnalisé » — complète-les d\'abord.', 'error');
        days[i] = { type: sel.type, start_time: times.start, end_time: times.end };
    }
    if (!Object.keys(days).length)
        return setTplFeedback('Renseigne au moins un jour avant d\'en faire ton modèle.', 'error');
    putDispoTemplate(days, 'Modèle enregistré.');
}

async function putDispoTemplate(days, okMsg) {
    const saveBtn  = document.getElementById('dispo-tpl-save');
    const clearBtn = document.getElementById('dispo-tpl-clear');
    saveBtn.disabled = true; clearBtn.disabled = true;
    try {
        const res  = await fetch('/api/me/dispo-template', {
            method: 'PUT', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ days }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Erreur');
        dispoTemplate = null;             // force la relecture ci-dessous
        await loadDispoTemplate();        // le serveur a pu poser `last_materialized_week`
        renderDispoTplCard();
        setTplFeedback('✅ ' + okMsg);
    } catch (e) {
        setTplFeedback(e.message || 'Erreur', 'error');
    } finally {
        saveBtn.disabled = false; clearBtn.disabled = false;
    }
}

// ── Congés / vacances ────────────────────────────────────────────────────────

// Bascule entre les sous-vues « Dispos » et « Congés » de l'onglet Dispos & congés.
function showDisposSub(sub) {
    const isConges = sub === 'conges';
    const dispPane = document.getElementById('dispos-sub-dispos');
    const congPane = document.getElementById('dispos-sub-conges');
    if (dispPane) dispPane.style.display = isConges ? 'none' : '';
    if (congPane) congPane.style.display = isConges ? '' : 'none';
    // Le bouton fixe « Envoyer mes dispos » n'a de sens que sur la sous-vue Dispos
    const submitBtn = document.getElementById('btn-submit-dispos');
    if (submitBtn) submitBtn.style.display = isConges ? 'none' : '';
    const sd = document.getElementById('subtab-dispos');
    const sc = document.getElementById('subtab-conges');
    if (sd) sd.classList.toggle('dispos-subtab--active', !isConges);
    if (sc) sc.classList.toggle('dispos-subtab--active', isConges);
    if (isConges) loadCongesTab();
}

function fmtCongeDate(iso) {
    const [, m, d] = iso.split('-').map(Number);
    return d + ' ' + MONTH_NAMES[m - 1];
}

function setCongeStatus(text, type) {
    const el = document.getElementById('conge-status');
    if (!el) return;
    el.textContent = text || '';
    el.style.color = type === 'error' ? '#c0392b' : (type === 'success' ? '#1a7a4a' : '#666');
}

// Restreint les modes de congé proposés selon le réglage patron (both|request|info).
function applyCongeModes(modes) {
    const reqInput  = document.querySelector('input[name="conge-mode"][value="request"]');
    const infoInput = document.querySelector('input[name="conge-mode"][value="info"]');
    if (!reqInput || !infoInput) return;
    const reqLabel  = reqInput.closest('label');
    const infoLabel = infoInput.closest('label');
    const showReq  = modes !== 'info';   // 'both' ou 'request'
    const showInfo = modes !== 'request'; // 'both' ou 'info'
    if (reqLabel)  reqLabel.style.display  = showReq  ? '' : 'none';
    if (infoLabel) infoLabel.style.display = showInfo ? '' : 'none';
    // Sélectionne le mode autorisé (le premier visible)
    if (!showReq)       infoInput.checked = true;
    else if (!showInfo) reqInput.checked  = true;
}

function initCongesForm() {
    const btn = document.getElementById('btn-submit-conge');
    if (!btn || btn._bound) return;
    btn._bound = true;
    const todayStr = toDateStr(new Date());
    const startEl = document.getElementById('conge-start');
    const endEl   = document.getElementById('conge-end');
    if (startEl) startEl.min = todayStr;
    if (endEl)   endEl.min   = todayStr;
    if (startEl) startEl.addEventListener('change', () => {
        if (endEl && (!endEl.value || endEl.value < startEl.value)) endEl.value = startEl.value;
        if (endEl) endEl.min = startEl.value || todayStr;
    });
    btn.addEventListener('click', submitConge);
}

async function submitConge() {
    const btn    = document.getElementById('btn-submit-conge');
    const start  = document.getElementById('conge-start').value;
    const end    = document.getElementById('conge-end').value;
    const reason = document.getElementById('conge-reason').value || '';
    const mode   = (document.querySelector('input[name="conge-mode"]:checked') || {}).value || 'request';
    if (!start || !end) { setCongeStatus('Choisis une date de début et de fin.', 'error'); return; }
    if (end < start)    { setCongeStatus('La date de fin doit être après la date de début.', 'error'); return; }
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = 'Envoi…';
    try {
        const res = await fetch('/api/conges', {
            credentials: 'include', method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ start_date: start, end_date: end, mode, reason }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setCongeStatus(data.message, 'success');
        document.getElementById('conge-reason').value = '';
        loadCongesTab();
    } catch (e) {
        setCongeStatus(e.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = prev;
    }
}

async function loadCongesTab() {
    const list = document.getElementById('conge-list');
    if (!list) return;
    list.innerHTML = '<div style="color:#aaa;font-size:13px">Chargement…</div>';
    try {
        const res = await fetch('/api/conges/mine', { credentials: 'include' });
        if (!res.ok) throw new Error();
        renderCongesList(await res.json());
    } catch {
        list.innerHTML = '<div style="color:#c0392b;font-size:13px">Erreur de chargement.</div>';
    }
}

const _CONGE_STATUS = {
    pending:  { label: 'En attente', cls: 'badge--warning' },
    approved: { label: 'Validé',     cls: 'badge--success' },
    rejected: { label: 'Refusé',     cls: 'badge--danger'  },
};

function renderCongesList(conges) {
    const list = document.getElementById('conge-list');
    if (!list) return;
    if (!conges.length) {
        list.innerHTML = '<div style="color:#999;font-size:13px">Aucun congé à venir.</div>';
        return;
    }
    list.innerHTML = '';
    conges.forEach(c => {
        const st = _CONGE_STATUS[c.status] || _CONGE_STATUS.pending;
        const card = document.createElement('div');
        card.style.cssText = 'border:1px solid #e8eaed;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px';
        const range = fmtCongeDate(c.start_date) + (c.start_date === c.end_date ? '' : ' → ' + fmtCongeDate(c.end_date));
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px';
        head.innerHTML = '<span style="font-weight:600;color:#1a1a2e">🌴 ' + range + '</span>' +
            '<span class="badge ' + st.cls + '">' + st.label + '</span>';
        card.appendChild(head);
        const meta = document.createElement('div');
        meta.style.cssText = 'font-size:12px;color:#888';
        meta.textContent = (c.mode === 'info' ? 'Informatif' : 'Demande') + (c.reason ? ' · ' + c.reason : '');
        card.appendChild(meta);
        if (c.status !== 'rejected') {
            const cancel = document.createElement('button');
            cancel.textContent = 'Annuler';
            cancel.style.cssText = 'align-self:flex-start;background:none;border:none;color:#c0392b;font-size:12px;font-weight:600;cursor:pointer;padding:0;text-decoration:underline';
            cancel.addEventListener('click', () => cancelConge(c._id));
            card.appendChild(cancel);
        }
        list.appendChild(card);
    });
}

async function cancelConge(id) {
    try {
        const res  = await fetch('/api/conges/' + id, { credentials: 'include', method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setCongeStatus(data.message, 'success');
        loadCongesTab();
    } catch (e) {
        setCongeStatus(e.message, 'error');
    }
}

// ── Notifications in-app (toasts) ────────────────────────────────────────────

const _NOTIF_CFG = {
    'planning-publie': { color: '#6C63FF', icon: '📅' },
    'shift-modifie':   { color: '#f59e0b', icon: '✏️' },
    'rappel-dispo':    { color: '#ef4444', icon: '⏰' },
    'dispo-traitee':   { color: '#10b981', icon: '✅' },
};

let _notifQueue    = [];
let _activeToasts  = 0;
const _MAX_TOASTS  = 3;
const _shownNotifs = new Set(); // évite les doublons entre appels successifs

async function loadStaffNotifs() {
    try {
        const res = await fetch('/api/notifications/mine', { credentials: 'include' });
        if (!res.ok) return;
        const { notifications } = await res.json();
        if (!notifications || !notifications.length) return;
        const newOnes = notifications.filter(n => !_shownNotifs.has(String(n._id)));
        if (!newOnes.length) return;
        newOnes.forEach(n => { _shownNotifs.add(String(n._id)); _notifQueue.push(n); });
        fetch('/api/notifications/mine/read', { method: 'PATCH', credentials: 'include' });
        _drainNotifQueue();
    } catch { /* silencieux */ }
}

function _drainNotifQueue() {
    while (_activeToasts < _MAX_TOASTS && _notifQueue.length > 0) {
        _showNotifToast(_notifQueue.shift());
    }
}

function _showNotifToast(notif) {
    const container = document.getElementById('notif-toast-container');
    if (!container) return;

    const cfg   = _NOTIF_CFG[notif.type] || { color: '#6C63FF', icon: '🔔' };
    const toast = document.createElement('div');
    toast.className = 'notif-toast';
    toast.style.borderLeftColor = cfg.color;
    toast.innerHTML =
        '<div class="notif-toast-icon">' + cfg.icon + '</div>' +
        '<div class="notif-toast-content">' +
            '<div class="notif-toast-title">' + _esc(notif.title) + '</div>' +
            '<div class="notif-toast-body">'  + _esc(notif.body)  + '</div>' +
        '</div>' +
        '<span class="notif-toast-close" role="button" aria-label="Fermer">✕</span>';

    _activeToasts++;
    container.appendChild(toast);

    toast.addEventListener('click', e => {
        if (e.target.classList.contains('notif-toast-close')) return;
        const url = notif.url || '';
        if (url.includes('#conges')) {
            const t = document.querySelector('[data-tab="dispos"]');
            if (t) t.click();
            showDisposSub('conges');
        } else if (url.includes('#dispos')) {
            const t = document.querySelector('[data-tab="dispos"]');
            if (t) t.click();
        } else {
            const t = document.querySelector('[data-tab="planning"]');
            if (t) t.click();
        }
        _dismissToast(toast);
    });

    toast.querySelector('.notif-toast-close').addEventListener('click', e => {
        e.stopPropagation();
        _dismissToast(toast);
    });

    const timer = setTimeout(() => _dismissToast(toast), 5000);
    toast._notifTimer = timer;
}

function _dismissToast(toast) {
    clearTimeout(toast._notifTimer);
    toast.classList.add('hiding');
    toast.addEventListener('animationend', () => {
        toast.remove();
        _activeToasts = Math.max(0, _activeToasts - 1);
        _drainNotifQueue();
    }, { once: true });
}

function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// P-01 : taper une pastille collègue révèle nom complet + horaires en mini-toast
// (sur mobile, le `title` HTML est inopérant ; sur desktop il reste utilisable
// au hover et le tap fonctionne aussi).
//
// Sélecteur sur le SEUL `data-pill-name` : les lignes du mini planning de la journée
// (`openDaySheet`) portent les mêmes attributs et méritent le même toast — un nom y est
// tronqué de la même façon, pour la même raison.
document.addEventListener('click', (ev) => {
    const pill = ev.target.closest && ev.target.closest('[data-pill-name]');
    if (!pill) return;
    const name  = pill.dataset.pillName  || '';
    const st    = parseFloat(pill.dataset.pillStart);
    const en    = parseFloat(pill.dataset.pillEnd);
    const color = pill.dataset.pillColor || '#888';
    // `pill-hours` l'emporte quand il est là : une personne en coupure a DEUX créneaux,
    // qu'un début et une fin ne peuvent pas dire sans les recoller en un seul.
    const hours = pill.dataset.pillHours
        || ((!Number.isNaN(st) && !Number.isNaN(en)) ? (fmtHour(st) + ' → ' + fmtHour(en)) : '');
    _showColleagueToast(name, hours, color);
});

let _colleagueToastTimer = null;
function _showColleagueToast(name, hours, color) {
    const existing = document.getElementById('colleague-toast');
    if (existing) existing.remove();
    if (_colleagueToastTimer) { clearTimeout(_colleagueToastTimer); _colleagueToastTimer = null; }

    // Une feuille ouverte occupe tout le bas de l'écran : le toast s'y poserait sur son
    // pied — et sur sa dernière ligne quand elle est courte — alors qu'il vient justement
    // d'être déclenché depuis l'une de ses lignes. Dans ce cas, et dans ce cas seul, il
    // s'ancre en haut. `dehors` porte aussi le SENS de l'animation : le toast entre et
    // ressort toujours par le bord dont il est le plus proche.
    const surFeuille = !!document.querySelector('.bottom-sheet');
    const ancrage    = surFeuille
        ? 'top:calc(16px + env(safe-area-inset-top));'
        : 'bottom:calc(20px + env(safe-area-inset-bottom));';
    const dehors = surFeuille ? 'translate(-50%,-20px)' : 'translate(-50%,20px)';

    const toast = document.createElement('div');
    toast.id = 'colleague-toast';
    toast.style.cssText =
        'position:fixed;left:50%;' + ancrage +
        'transform:' + dehors + ';' +
        'background:#1a1a2e;color:#fff;padding:10px 14px;border-radius:12px;' +
        'font-size:13px;font-weight:600;display:flex;align-items:center;gap:10px;' +
        'box-shadow:0 6px 20px rgba(0,0,0,0.25);max-width:calc(100% - 32px);' +
        'z-index:9999;opacity:0;transition:opacity 0.18s ease,transform 0.22s cubic-bezier(0.32,0.72,0,1);' +
        'pointer-events:none';
    toast.innerHTML =
        '<span style="width:10px;height:10px;border-radius:50%;background:' + _esc(color) + ';flex-shrink:0"></span>' +
        '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(name) + '</span>' +
        (hours ? '<span style="font-weight:500;opacity:0.75;font-variant-numeric:tabular-nums;white-space:nowrap">' + hours + '</span>' : '');
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity   = '1';
        toast.style.transform = 'translate(-50%,0)';
    });
    _colleagueToastTimer = setTimeout(() => {
        toast.style.opacity   = '0';
        toast.style.transform = dehors;
        setTimeout(() => toast.remove(), 220);
    }, 2400);
}

function showMsg(text, type) {
    const existing = document.getElementById('dispo-msg');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'dispo-msg';
    el.style.cssText = 'margin:0 20px 12px;padding:10px 14px;border-radius:8px;font-size:13px;' +
        (type === 'error'
            ? 'background:#fff5f5;border:1px solid #f5c6c6;color:#c0392b;'
            : 'background:#f0faf5;border:1px solid #a8dfc7;color:#1a7a4a;');
    el.textContent = text;
    document.getElementById('dispos-form').before(el);
}


// ── Web Push — abonnement ─────────────────────────────────────────────────────

let _pushSubscription = null;

// Convertit une clé VAPID base64url en Uint8Array pour le navigateur
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function initPushButton() {
    const btn = document.getElementById('btn-notif');
    if (!btn) return;

    // Masquer le bouton si Push non supporté
    if (!('PushManager' in window) || !('serviceWorker' in navigator)) {
        btn.style.display = 'none';
        return;
    }

    // Vérifier la permission actuelle
    if (Notification.permission === 'denied') {
        btn.classList.add('denied');
        btn.title = 'Notifications bloquées dans les réglages du navigateur';
        return;
    }

    // Vérifier si déjà abonné
    try {
        const reg = await navigator.serviceWorker.ready;
        _pushSubscription = await reg.pushManager.getSubscription();
        if (_pushSubscription) {
            btn.classList.add('active');
            btn.title = 'Notifications activées — cliquer pour désactiver';
            const lbl = document.getElementById('btn-notif-label');
            if (lbl) lbl.textContent = 'Activé';
        }
    } catch { /* silencieux */ }
}

async function togglePushSubscription() {
    const btn = document.getElementById('btn-notif');
    if (!btn || btn.classList.contains('denied')) return;

    if (_pushSubscription) {
        // ── Désabonnement ──
        try {
            await _pushSubscription.unsubscribe();
            await fetch('/api/push/subscribe', {
                method:      'DELETE',
                credentials: 'include',
                headers:     { 'Content-Type': 'application/json' },
                body:        JSON.stringify({ endpoint: _pushSubscription.endpoint }),
            });
            _pushSubscription = null;
            btn.classList.remove('active');
            btn.title = 'Activer les notifications';
            const lbl = document.getElementById('btn-notif-label');
            if (lbl) lbl.textContent = 'Notifs';
        } catch (e) {
            console.error('Erreur désabonnement push:', e);
        }
        return;
    }

    // ── Abonnement ──
    try {
        // Récupérer la clé publique VAPID
        const keyRes = await fetch('/api/push/vapid-public-key', { credentials: 'include' });
        if (!keyRes.ok) {
            const err = await keyRes.json().catch(() => ({}));
            _showNotifToast({ type: 'rappel-dispo', title: 'Push non configuré', body: err.error || 'Clé VAPID manquante côté serveur', url: '/planning.html' });
            return;
        }
        const { publicKey } = await keyRes.json();

        // Demander la permission
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
            if (perm === 'denied') {
                btn.classList.add('denied');
                btn.title = 'Notifications bloquées dans les réglages du navigateur';
                _showNotifToast({ type: 'rappel-dispo', title: 'Notifications bloquées', body: 'Autorise les notifications dans les réglages de ton navigateur', url: '/planning.html' });
            }
            return;
        }

        const reg = await navigator.serviceWorker.ready;
        _pushSubscription = await reg.pushManager.subscribe({
            userVisibleOnly:      true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        // Envoyer la subscription au serveur
        const subRes = await fetch('/api/push/subscribe', {
            method:      'POST',
            credentials: 'include',
            headers:     { 'Content-Type': 'application/json' },
            body:        JSON.stringify({ subscription: _pushSubscription.toJSON() }),
        });
        if (subRes.ok) {
            btn.classList.add('active');
            btn.title = 'Notifications activées — cliquer pour désactiver';
            const lbl = document.getElementById('btn-notif-label');
            if (lbl) lbl.textContent = 'Activé';
            _showNotifToast({ type: 'planning-publie', title: 'Notifications activées ✅', body: 'Tu recevras les alertes planning sur cet appareil', url: '/planning.html' });
        } else {
            const err = await subRes.json().catch(() => ({}));
            _showNotifToast({ type: 'rappel-dispo', title: 'Erreur d\'enregistrement', body: err.error || 'Impossible d\'enregistrer la subscription', url: '/planning.html' });
        }
    } catch (e) {
        console.error('Erreur abonnement push:', e);
        _showNotifToast({ type: 'rappel-dispo', title: 'Erreur push', body: e.message || 'Impossible d\'activer les notifications', url: '/planning.html' });
    }
}



// ── Auto-refresh polling (staff) ─────────────────────────────────────────────

let _staffLastTs = 0;
let _staffPollTimer = null;

async function startStaffAutoRefresh(from, to, user) {
    // Capturer le timestamp initial
    try {
        const res = await fetch('/api/last-updated', { credentials: 'include' });
        if (res.ok) { const d = await res.json(); _staffLastTs = d.ts || 0; }
    } catch { /* silencieux */ }

    _staffPollTimer = setInterval(async () => {
        try {
            const res = await fetch('/api/last-updated', { credentials: 'include' });
            if (!res.ok) return;
            const { ts } = await res.json();
            if (ts && ts !== _staffLastTs) {
                _staffLastTs = ts;
                // Recharger silencieusement le planning affiché, semaines à venir
                // comprises : elles sont dans la même vue, donc déjà sous les yeux.
                // En parallèle — les deux sont indépendants — et le lot de Jokers
                // ouverts qu'ils partagent ne part qu'une fois (cf. `fetchOpenJokers`).
                await Promise.all([loadPlanning(from, to, user), loadUpcomingWeeks()]);
            }
        } catch { /* silencieux */ }
    }, 30000);
}

// ── Échanges de shifts (F-05) ────────────────────────────────────────────────

window._myPendingSwaps = [];

function showSwapToast(msg, isError) {
    const el = document.getElementById('swap-toast');
    if (!el) return;
    el.textContent = msg;
    el.style.background = isError ? '#c0392b' : '#1a1a2e';
    el.style.display = 'block';
    clearTimeout(window._swapToastT);
    window._swapToastT = setTimeout(() => { el.style.display = 'none'; }, 3200);
}

async function loadMyPendingSwaps() {
    try {
        const res = await fetch('/api/shift-swaps/mine', { credentials: 'include' });
        if (!res.ok) { window._myPendingSwaps = []; return; }
        window._myPendingSwaps = await res.json();
    } catch { window._myPendingSwaps = []; }
}

let _swapSource = null;
let _swapTarget = null;

async function openSwapModal(shift) {
    _swapSource = shift;
    _swapTarget = null;
    const modal = document.getElementById('swap-modal');
    modal.style.display = 'flex';

    const src = document.getElementById('swap-source');
    src.innerHTML =
        '<div style="font-size:10px;color:#534AB7;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin-bottom:4px">Votre shift</div>' +
        '<div style="font-weight:700;font-size:14px;color:#1a1a2e">' + _fmtSwapDate(shift.date) + ' · ' + fmtHour(shift.start_time) + ' → ' + fmtHour(shift.end_time) + '</div>' +
        '<div style="font-size:12px;color:#555;margin-top:2px">' + formatEstablishment(shift.establishment_id) + '</div>';

    document.getElementById('swap-note').value = '';
    const btn = document.getElementById('swap-submit');
    btn.disabled = true; btn.style.opacity = '0.5';

    // Charger les shifts échangeables (4 semaines glissantes depuis aujourd'hui)
    const targets = document.getElementById('swap-targets');
    targets.innerHTML = '<div style="padding:24px;text-align:center;color:#aaa;font-size:13px">Chargement…</div>';
    try {
        const today = new Date();
        const from = toDateStr(today);
        const to   = toDateStr(addDays(today, 28));
        const res  = await fetch('/api/shifts-for-swap?from=' + from + '&to=' + to, { credentials: 'include' });
        const list = await res.json();
        if (!res.ok) throw new Error(list.error || 'Erreur');
        // Exclure le shift source
        const eligible = list.filter(s => s._id !== shift._id);
        if (eligible.length === 0) {
            targets.innerHTML = '<div style="padding:24px;text-align:center;color:#aaa;font-size:13px">Aucun shift collègue échangeable dans les 4 prochaines semaines</div>';
            return;
        }
        targets.innerHTML = '';
        eligible.forEach(t => {
            const item = document.createElement('div');
            item.style.cssText = 'border:1.5px solid #e8eaed;border-radius:10px;padding:10px 12px;cursor:pointer;transition:all 0.15s;background:white';
            const _tSm   = allStaff.find(s => String(s._id) === t.staff_id);
            const _tName = _tSm ? (_tSm.nickname || (t.staff_name || '').split(' ')[0]) : (t.staff_name ? t.staff_name.split(' ')[0] : '—');
            item.innerHTML =
                '<div style="display:flex;align-items:center;gap:8px">' +
                    '<span style="width:10px;height:10px;border-radius:50%;background:' + (t.color || '#888') + ';flex-shrink:0"></span>' +
                    '<div style="flex:1;min-width:0">' +
                        '<div style="font-weight:700;font-size:13px;color:#1a1a2e">' + _tName + '</div>' +
                        '<div style="font-size:12px;color:#555">' + _fmtSwapDate(t.date) + ' · ' + fmtHour(t.start_time) + ' → ' + fmtHour(t.end_time) + '</div>' +
                        '<div style="font-size:11px;color:#888">' + formatEstablishment(t.establishment_id) + '</div>' +
                    '</div>' +
                '</div>';
            item.addEventListener('click', () => {
                _swapTarget = t;
                [...targets.children].forEach(c => { c.style.borderColor = '#e8eaed'; c.style.background = 'white'; });
                item.style.borderColor = '#534AB7';
                item.style.background  = '#eef2ff';
                const b = document.getElementById('swap-submit');
                b.disabled = false; b.style.opacity = '1';
            });
            targets.appendChild(item);
        });
    } catch (e) {
        targets.innerHTML = '<div style="padding:16px;text-align:center;color:#e74c3c;font-size:13px">' + (e.message || 'Erreur') + '</div>';
    }
}

function closeSwapModal() {
    const modal = document.getElementById('swap-modal');
    if (modal) modal.style.display = 'none';
    _swapSource = null;
    _swapTarget = null;
}

async function submitSwap() {
    if (!_swapSource || !_swapTarget) return;
    const btn = document.getElementById('swap-submit');
    btn.disabled = true; btn.textContent = 'Envoi…';
    try {
        const note = document.getElementById('swap-note').value.trim();
        const res = await fetch('/api/shift-swaps', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from_shift_id: _swapSource._id, to_shift_id: _swapTarget._id, note }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        showSwapToast('Demande envoyée au patron');
        closeSwapModal();
        await loadMyPendingSwaps();
        const p = window._currentPlan;
        if (p) await loadPlanning(p.from, p.to, p.user);
    } catch (e) {
        showSwapToast(e.message || 'Erreur', true);
        btn.disabled = false;
    } finally {
        btn.textContent = 'Envoyer la demande';
    }
}

async function cancelMySwap(swapId) {
    if (!confirm('Annuler votre demande d\'échange ?')) return;
    try {
        const res = await fetch('/api/shift-swaps/' + swapId, { method: 'DELETE', credentials: 'include' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erreur');
        showSwapToast('Demande annulée');
        await loadMyPendingSwaps();
        const p = window._currentPlan;
        if (p) await loadPlanning(p.from, p.to, p.user);
    } catch (e) {
        showSwapToast(e.message || 'Erreur', true);
    }
}

function _fmtSwapDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return DAY_NAMES[date.getDay()] + ' ' + d + ' ' + MONTH_NAMES[m - 1];
}

document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('swap-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeSwapModal);
    const submit = document.getElementById('swap-submit');
    if (submit) submit.addEventListener('click', submitSwap);
    const overlay = document.getElementById('swap-modal');
    if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeSwapModal(); });
});

// ── Démarrage ─────────────────────────────────────────────────────────────────

init().then(() => initPushButton());
