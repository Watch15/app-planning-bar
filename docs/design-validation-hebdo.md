# Validation hebdomadaire — design (D-100)

*Cadré 2026-09-10. Flag : `weekly_staff_validation` (`CLIENT_PROFILE=castaniu` + `FEATURE_WEEKLY_VALIDATION=true`).*

## Intention

L’employé **donne son code** au responsable : ce code fait **acte de signature** des heures de la semaine passée, **sur toutes les affaires** où il a travaillé. Trace dans l’**historique** de l’onglet Validation.

La clôture jour OTP **reste** pour produire les `real_*`.

## Décisions figées v1

1. **Dual** : OTP jour inchangé ; hebdo = couche signature.
2. **Fenêtre** : lundi 00:00 → dimanche 23:59 (Paris) de W+1 pour signer la semaine W.
3. **Code** : 4 chiffres **régénéré chaque semaine**, scoped `staff_id + week_start` (un code pour toutes les affaires). Consommé à la signature ; réouverture → nouveau code.
4. **Effet** : une saisie = signature de **toutes** les heures du staff pour W (tous établissements, hors jokers).
5. **Stockage** : `codes_signature_hebdo`, `week_signatures`, flags shifts `staff_week_signed` / `staff_week_signed_at` ; journal `time_validations` `phase: 'week_sign'`.
6. **Réouverture** : patron / directeur / responsable (tant que récap non `patron_valide`). Observateur lecture seule.
7. **Garde récap** : `valider-recap` → 409 si signatures manquantes (flag on).
8. **UI** : page `validation.html` ; entrée header `planning.html` (responsables) ; menu `index.html` (patron/directeur).
9. **Staff** : affiche son code hebdo (pas d’auto-signature).

## Hors v1

- Contestation ligne à ligne.
- Remplacer le pointage jour.
- Push/SMS dédiés.

## Lien backlog

Entrée **D-100** dans `docs/backlog.md`.
