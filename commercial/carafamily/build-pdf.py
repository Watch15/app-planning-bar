#!/usr/bin/env python3
"""Génère le PDF commercial CaraFamily depuis demo-tarifs.html."""
from pathlib import Path
from weasyprint import HTML

HERE = Path(__file__).resolve().parent
SRC = HERE / "demo-tarifs.html"
OUT = HERE / "Templyo-CaraFamily-Demo-Tarifs.pdf"

HTML(filename=str(SRC), base_url=str(HERE)).write_pdf(str(OUT))
print(f"OK → {OUT} ({OUT.stat().st_size} octets)")
