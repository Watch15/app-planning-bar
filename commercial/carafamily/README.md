# Pack commercial — CaraFamily

Sources du document client **démo + tarifs**, et note interne de briefing.

| Fichier | Rôle |
|---|---|
| `demo-tarifs.html` + `demo-tarifs.css` | Source WeasyPrint du PDF client |
| `build-pdf.py` | Génère `Templyo-CaraFamily-Demo-Tarifs.pdf` |
| `Templyo-CaraFamily-Demo-Tarifs.pdf` | Document à envoyer au prospect |
| `Templyo-CaraFamily.docx` | Note interne (ne pas envoyer) |
| `../docs/prospects/carafamily-briefing.md` | Même briefing en Markdown |

```bash
python3 commercial/carafamily/build-pdf.py
```

Le PDF pointe vers `demo.templyo.fr` et `demo.templyo.fr/demo-guide.html`.
Mot de passe des comptes : transmis séparément, jamais dans le PDF.
