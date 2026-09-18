# Guide de démonstration Templyo — prospects

> Document à utiliser **pendant un rendez-vous** (visio ou sur place) et à laisser
> au prospect s’il veut rejouer le parcours seul.  
> Instance prévue : base `templyo_demo` · `npm run demo:seed` · page
> [`/demo-guide.html`](../public/demo-guide.html).

**État :** pack commercial complet (Planning + Pointage + Performance + Échanges).  
**Hors démo générique :** customs Castaniu, agenda iCal (expérimental).

---

## 0. Avant le RDV (équipe Templyo)

| Étape | Commande / action |
|---|---|
| 1. Flags locaux | Vérifier `.env.demo` : `FEATURE_TIME_TRACKING=true`, `FEATURE_OTP_CLOSURE=true`, `FEATURE_PERFORMANCE=true`, `FEATURE_SHIFT_SWAPS=true`, `OUTBOUND_ENABLED=false`, `CRON_ENABLED=false` |
| 2. Reseed | `npm run demo:seed` — **le matin du RDV** (le jeu est relatif à *aujourd’hui*) |
| 3. Serveur local | `npm run demo:server` → http://localhost:3100 |
| 4. Railway | Poser les `FEATURE_*` sur l’environnement **Demo** (bloc ci-dessous) |
| 5. Mot de passe | Sur l’instance publique : **changer** `SEED_PASSWORD` puis reseeder (ne pas laisser `Demo2026!`) |

Sans les flags, Pointage / Performance / Échanges répondent **404** : la démo a l’air cassée.
Ce n’est plus un conseil de prudence depuis `c356224` : les modules optionnels sont
**fail-closed**, une variable absente = un module éteint. Relevé du 2026-09-16 :
l’environnement Demo n’en porte **aucun** (cf. `feature-flags.md`, « Où le flag est posé »).

### Préparer l’instance publique (demo.templyo.fr)

`Dev` et `Demo` partagent **un seul service Railway** ; c’est `--environment` qui les
distingue, `--service Dev` est le nom du service dans les deux cas. Poser les variables
redéploie le service Demo, et lui seul.

```bash
railway variables --environment Demo --service Dev \
  --set FEATURE_TIME_TRACKING=true \
  --set FEATURE_OTP_CLOSURE=true \
  --set FEATURE_PERFORMANCE=true \
  --set FEATURE_SHIFT_SWAPS=true \
  --set FEATURE_CALENDAR_SYNC=false \
  --set TZ=Europe/Paris
```

Puis le jeu de données, **depuis le poste** — Railway ne sème rien :

```bash
# 1. dans .env.demo : SEED_PASSWORD=<mot de passe du RDV>, pas Demo2026!
npm run demo:seed                                  # écrit dans templyo_demo sur Atlas
node scripts/smoke-prod.js https://demo.templyo.fr # lecture seule : code en ligne + accès fermé
```

> ⚠️ Le `SEED_PASSWORD` qui compte est celui de **`.env.demo` au moment du seed** : c’est
> lui qui est haché dans la base que lit l’instance publique. La variable homonyme sur
> Railway ne sert qu’à documenter — la poser ne change aucun mot de passe.

**Démo pour un prospect nommé.** L’environnement `Demo` est partagé : deux prospects qui
cliquent la même semaine se marchent dessus. Pour une instance dédiée, dupliquer plutôt
que bricoler — puis réécrire les quatre variables qui ne doivent **pas** être héritées :

```bash
railway environment new "Demo <Client>" --duplicate Demo
railway variables --environment "Demo <Client>" --service Dev \
  --set MONGO_DB=templyo_demo_<client> \
  --set APP_URL=https://<client>-demo.templyo.fr \
  --set SESSION_SECRET=<clé propre à l’instance> \
  --set SEED_PASSWORD=<mot de passe du RDV>
```

`MONGO_DB` d’abord : héritée telle quelle, la copie sème et efface la base de démo
commune. Le domaine se déclare ensuite côté Railway + DNS ; sans lui, l’instance répond
sur son URL `*.up.railway.app`, ce qui suffit pour un RDV en visio.

---

## 1. Comptes de la démo

Mot de passe commun (sauf invitation en attente) : valeur de `SEED_PASSWORD`  
(défaut local : `Demo2026!`).

| Rôle | E-mail | Ce qu’on montre |
|---|---|---|
| **Patron** | `patron@demo.templyo.fr` | Tout le cycle : planning, dispos, pointage, performance, échanges |
| **Directrice** | `directeur@demo.templyo.fr` | Périmètre **Le Zinc seulement** + ses propres dispos |
| **Observateur** | `comptable@demo.templyo.fr` | Admin / pointage / perf — **sans** Dispos ni Échanges |
| **Staff** | ex. `adrien@demo.templyo.fr` | PWA équipe : planning, dispos, congés, Jokers, échanges, clôture OTP |

> L’adresse d’un compte staff est le **prénom seul** (`adrien@`, `ines@`, `nathan@`…),
> jamais `prénom.nom@` : c’est ce que pose le seed, et une adresse dictée de travers
> devant un prospect coûte deux minutes.

Groupe fictif : **8 établissements** — 4 bars (Le Zinc, Le Comptoir, Le Perchoir,
La Guinguette) et 4 restaurants (La Rotonde, La Criée, Chez Mado, Bistrot des Halles,
ce dernier ne servant que le midi), **~78 personnes**.

La démonstration se joue sur **Le Zinc** et **La Rotonde** : ce sont eux qui portent les
congés, l’échange en attente, le Joker ouvert, l’extra au forfait, l’archivée et
l’invitation. Les six autres existent pour que le groupe ait la **taille** de celui d’en
face — sélecteur d’affaires, récap consolidé, masse salariale de groupe. Devant un
prospect mono-site, rien n’oblige à les ouvrir.

---

## 2. Parcours recommandé (ordre de vente)

Chaque étape = un écran à laisser **2–3 minutes** au prospect. Ne pas tout enchaîner.

### A. Le cycle cœur (10 min) — compte **patron**

1. **Planning · semaine en cours**  
   Semaine **publiée** : l’équipe la voit. Basculer Zinc ↔ Rotonde : la grille suit les horaires (soirée bar vs midi–soir resto). Devant un groupe, faire défiler la barre d’établissements — les 8 affaires sont dans la même fenêtre, sans changer de compte ni de fichier.

2. **Filtrer par groupe** (Bar / Salle / Cuisine)  
   Les polyvalents sans groupe restent visibles partout.

3. **Semaine suivante = brouillon**  
   Ouvrir la **file de dispos** → valider 2–3 créneaux → **publier**.  
   C’est *le* moment de la démo : dispos → planning → publication.

4. **KPI « Dispos envoyées »**  
   Pas à 100 % : montrer la **relance**. C’est le gain de temps concret.

### B. Les rôles (5 min)

5. **Directrice** (`directeur@…`)  
   Un seul établissement sur huit, un seul récap. Ses dispos passent par la même validation que le staff. C’est la réponse à « mes responsables vont-ils voir les autres adresses ? ».

6. **Observateur** (`comptable@…`)  
   Voit Planning / Performance / Pointage, **pas** les files Dispos / Échanges.

### C. Terrain & pilotage (10 min) — revenir en **patron**

7. **Pointage**  
   Code OTP + **clôture du jour** (« Début manuel », « Ajuster » avec motif, journal). Comparer planifié / réel sur une soirée passée. Supprimer un extra « erreur » si besoin.

8. **Performance → Réel**  
   CA, masse chargée, coefficient coloré contre l’objectif (par établissement ou toutes les affaires).  
   **Chez un multi-site, c’est l’écran qui vend** : sept affaires tiennent leur objectif, **Le Perchoir** décroche et ressort en rouge. Le jeu est fait pour ça — on repère l’adresse qui glisse sans ouvrir huit tableaux.

9. **Performance → Simulation**  
   Jour ou semaine, **sans écrire** le CA officiel. Valoriser les Jokers par groupe.

10. **Récap mensuel**  
    Heures, écarts, ventilation par établissement, export Excel.

### D. Options & vie d’équipe (5 min)

11. **Joker ouvert** (samedi Zinc, groupe Bar) — candidatures, en retenir une.  
12. **Échanges** — une demande est déjà en attente ; montrer l’approbation patron.  
13. **Congés** — demande en attente, refus, staff grisé au planning.  
14. **Gestion du staff** — taux, groupes, archivée (Yasmine) : le turnover sans perdre l’historique.  
15. **Invitation en attente** — Théo Lambert n’a pas encore de mot de passe.

---

## 3. Mode d’emploi rapide (pour le prospect)

### Se connecter
Ouvrir l’URL de démo → e-mail + mot de passe fournis → **Connexion**.

### Construire une semaine
1. Choisir l’établissement (onglets en haut).  
2. Glisser le personnel sur la timeline, ou **copier** une semaine type.  
3. Poser des **Jokers** pour les postes à pourvoir.  
4. Quand la grille est bonne : **Publier** — sinon l’équipe ne voit rien (sauf créneaux proposés si vous utilisez ce flux).

### Collecter les disponibilités
1. Ouvrir la saisie des dispos (réglages / horizon).  
2. L’équipe répond depuis son téléphone.  
3. Vous validez dans la file, puis vous placez les gens sur le planning.

### Pointer les heures réelles
- **Code** : le responsable dicte le code 4 chiffres ; chacun pointe début puis fin.  
- **Saisie directe** (tablette de l’établissement) : cartes d’heures, sans panneau de clôture.  
Les heures réelles alimentent le **récap** et la **Performance**.

### Piloter la masse salariale
Menu **Performance** : saisir le CA du soir, lire le coefficient, simuler une semaine à venir.

### Échanges entre collègues
Un salarié propose un échange sur une semaine **publiée** ; vous (patron) validez ou refusez.

---

## 4. Ce que le pack démo active

| Module | Flag | Visible dans la démo |
|---|---|---|
| Planning, dispos, congés, Jokers, exports | *(socle)* | toujours |
| Pointage (tablette, clôture manuelle, journal) | `FEATURE_TIME_TRACKING` | oui |
| Code OTP journalier début / fin de service | `FEATURE_OTP_CLOSURE` (requiert le Pointage) | oui |
| Performance + Simulation + taux staff | `FEATURE_PERFORMANCE` | oui |
| Échanges de shifts | `FEATURE_SHIFT_SWAPS` | oui |
| Agenda iCal | `FEATURE_CALENDAR_SYNC` | non (expérimental) |
| Créneaux N+1 / validation hebdo Castaniu | profil `castaniu` | non |

---

## 5. Checklist « après le RDV »

- [ ] Reseed si le prospect a « cassé » le jeu (`npm run demo:seed`)  
- [ ] Noter les modules qui l’ont accroché (Pointage ? Simulation ? Échanges ?)  
- [ ] Rappeler la formule tarifaire : socle / + Pointage / + Performance / pack  
- [ ] Ne **pas** laisser un `SEED_PASSWORD` public connu en ligne

---

## 6. Liens utiles

| Document | Rôle |
|---|---|
| Ce guide | Parcours + mode d’emploi prospect |
| `/demo-guide.html` | Même contenu, lisible dans le navigateur pendant le RDV |
| `docs/feature-flags.md` | Matrice commerciale des flags |
| `docs/dossier-projet.md` § Démonstration | Variables Railway, pièges outbound |
| `scripts/seed-demo.js` | Jeu de données (relatif à aujourd’hui) |
