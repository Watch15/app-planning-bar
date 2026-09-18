# CaraFamily — note interne (après le call)

> Document **interne** Templyo. Ne pas envoyer au prospect.
> Compagnon du PDF client `Templyo-CaraFamily-Demo-Tarifs.pdf`.

## Contexte

- Prospect : groupe **CaraFamily**, **8 établissements**
- Présents : Zahia (RH) + la patronne (décisionnaire)
- Ils partent de zéro — aucun outil en place

## Besoin exprimé

1. Priorité n°1 : outil RH complet (esprit Skello / Combo)
2. Centralisation des documents collaborateurs
3. Liste auto des documents à l’embauche
4. Signature électronique intégrée

## Où se situe Templyo

- Couvre **planning, disponibilités, pointage, masse salariale**
- **Pas** la brique documentaire / RH
- Signature électronique : absente du produit
- Sentiment live : la patronne a paru réservée — le besoin n°1 n’est pas couvert

## Signaux

| Positif | Négatif |
|---|---|
| Acceptent de tester la démo | Besoin n°1 non couvert |
| 8 établissements = gros compte si ça matche | La décisionnaire elle-même est réservée |
| Profil structuré (API à terme, scaling) | — |

## Position Templyo

- Module documentaire / signature : **hors gamme cible actuelle** (option possible plus tard)
- CaraFamily = signal de positionnement : cibler des établissements qui ont **déjà** un outil (même Excel) à fiabiliser sur planning/pointage — pas des groupes qui cherchent une suite RH complète dès le départ

## Décision

- [x] Envoyer quand même le document (démo + tarifs) pour rester dans le radar
- [x] **Pas** de relance commerciale poussée derrière
- [x] **Pas** de mention API dans le document client (trop tôt)
- [x] CTA fin de document : retour **par téléphone** une fois le test effectué (`07 85 75 87 55`)

## Envoi client

| Élément | Valeur |
|---|---|
| PDF | `commercial/carafamily/Templyo-CaraFamily-Demo-Tarifs.pdf` |
| URL démo | https://demo.templyo.fr |
| Guide navigateur | https://demo.templyo.fr/demo-guide.html |
| Mot de passe | transmis séparément (ne pas l’écrire dans le PDF) |

## Environnement démo propre

```bash
# Flags + seed (base templyo_demo — relative à aujourd’hui)
cp .env.demo.example .env.demo   # puis MONGO_URI / SESSION_SECRET
npm run demo:seed
npm run demo:server              # http://localhost:3100

# Instance publique (depuis le poste, après .env.demo pointant Atlas demo)
npm run demo:seed
node scripts/smoke-prod.js https://demo.templyo.fr
```

Reseed le matin de l’envoi / du test prospect. `OUTBOUND_ENABLED=false` obligatoire.
