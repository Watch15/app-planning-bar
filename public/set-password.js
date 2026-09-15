    const params = new URLSearchParams(window.location.search);
    const token  = params.get('token');
    const mode   = params.get('mode'); // 'reset' ou null (invitation)
    const isReset = mode === 'reset';
    let linkConsumed = false;
    let loginHintPreferred = null;

    // Adapter le titre selon le mode
    if (isReset) {
        document.querySelector('#page-title').textContent    = 'Nouveau mot de passe';
        document.querySelector('#page-subtitle').textContent = 'Choisis un nouveau mot de passe pour ton compte.';
        document.getElementById('btn-submit').textContent    = 'Mettre à jour';
        document.getElementById('logo-sub').textContent      = 'Réinitialisation du mot de passe';
    }

    document.getElementById('copyright-year').textContent = new Date().getFullYear();

    if (!token) {
        showUsedLink('Lien invalide ou expiré. Connecte-toi avec ton numéro ou ton email et ton mot de passe.');
    } else {
        document.getElementById('rgpd-staff-notice').style.display = '';
        // Pré-vérifier le lien : beaucoup de gens rouvent le SMS comme bouton de connexion.
        previewLink(token, isReset ? 'reset' : '');
    }

    document.getElementById('btn-submit').addEventListener('click', async () => {
        if (linkConsumed || !token) { goToLogin(loginHintPreferred); return; }
        const password = document.getElementById('password').value;
        const confirm  = document.getElementById('confirm').value;

        if (password.length < 8) { showMsg('8 caractères minimum.', 'error'); return; }
        if (password !== confirm) { showMsg('Les mots de passe ne correspondent pas.', 'error'); return; }

        const btn = document.getElementById('btn-submit');
        btn.disabled    = true;
        btn.textContent = 'Mise à jour…';

        const route  = isReset ? '/auth/reset-password' : '/auth/set-password';
        const method = isReset ? 'PATCH' : 'POST';

        try {
            const res  = await fetch(route, {
                method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body:    JSON.stringify({ token, password }),
            });
            const data = await res.json();

            if (!res.ok) {
                if (data.code === 'already_activated' || data.code === 'link_used_or_invalid' || res.status === 409 || res.status === 404) {
                    showUsedLink(data.error || 'Ce lien a déjà été utilisé. Connecte-toi avec ton mot de passe.', data.login_hint);
                    return;
                }
                showMsg(data.error || 'Erreur.', 'error');
                btn.disabled    = false;
                btn.textContent = isReset ? 'Mettre à jour' : 'Activer mon compte';
                return;
            }

            // Connexion automatique : évite le piège « je rouvre le SMS pour me connecter ».
            if (data.user && data.user.role) {
                showMsg(isReset ? 'Mot de passe mis à jour ! Redirection…' : 'Compte activé ! Redirection…', 'success');
                setTimeout(() => redirectByRole(data.user.role), 800);
                return;
            }
            showMsg('Compte prêt. Redirection vers la connexion…', 'success');
            setTimeout(() => goToLogin(), 1500);
        } catch {
            showMsg('Impossible de contacter le serveur.', 'error');
            btn.disabled    = false;
            btn.textContent = isReset ? 'Mettre à jour' : 'Activer mon compte';
        }
    });

    async function previewLink(tok, linkMode) {
        try {
            const q = '/auth/password-link?token=' + encodeURIComponent(tok)
                + (linkMode ? '&mode=' + encodeURIComponent(linkMode) : '');
            const res = await fetch(q, { credentials: 'include' });
            if (!res.ok) return;
            const data = await res.json();
            if (data.status === 'ok') return;
            if (data.status === 'already_activated') {
                showUsedLink('Compte déjà activé. Connecte-toi avec ton mot de passe.', data.login_hint);
                return;
            }
            if (data.status === 'expired') {
                showUsedLink('Ce lien a expiré. Demande un nouveau lien ou connecte-toi si ton compte est déjà actif.', data.login_hint);
                return;
            }
            showUsedLink('Ce lien a déjà été utilisé ou n\'est plus valide. Connecte-toi avec ton mot de passe.', data.login_hint);
        } catch {
            // Silencieux : le submit restera le filet de sécurité.
        }
    }

    function showUsedLink(text, loginHint) {
        linkConsumed = true;
        loginHintPreferred = loginHint || null;
        showMsg(text, 'error');
        document.querySelectorAll('.field').forEach(f => f.style.display = 'none');
        const notice = document.getElementById('rgpd-staff-notice');
        if (notice) notice.style.display = 'none';
        const btn = document.getElementById('btn-submit');
        btn.disabled = false;
        btn.textContent = '← Se connecter';
    }

    function goToLogin(loginHint) {
        if (loginHint === 'phone') window.location.href = '/login.html?mode=phone';
        else if (loginHint === 'email') window.location.href = '/login.html?mode=email';
        else window.location.href = '/login.html';
    }

    function redirectByRole(role) {
        if (role === 'patron' || role === 'directeur' || role === 'observateur') window.location.href = '/';
        else if (role === 'etablissement') window.location.href = '/pointage.html';
        else window.location.href = '/planning.html';
    }

    function showMsg(text, type) {
        const el = document.getElementById('msg');
        el.textContent = text;
        el.className   = 'msg ' + type + ' visible';
    }

    function toggleEye(inputId, btn) {
        const input = document.getElementById(inputId);
        const show  = input.type === 'password';
        input.type  = show ? 'text' : 'password';
        btn.style.opacity = show ? '1' : '0.45';
    }
