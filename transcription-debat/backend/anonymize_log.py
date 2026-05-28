import csv
import argparse
from pathlib import Path


def parse_ecclesia_csv(path: str) -> list[dict]:
    """Extrait les tours de HISTORIQUE DES TOURS du CSV Ecclesia multi-sections."""
    with open(path, encoding="utf-8") as f:
        reader = csv.reader(f)
        rows = list(reader)

    # Trouver la ligne "HISTORIQUE DES TOURS"
    try:
        history_idx = next(
            i for i, row in enumerate(rows)
            if row and row[0].strip() == "HISTORIQUE DES TOURS"
        )
    except StopIteration:
        raise ValueError("Section 'HISTORIQUE DES TOURS' non trouvée dans le CSV") from None
    # La ligne suivante est l'en-tête des colonnes, on commence après
    data_rows = rows[history_idx + 2:]

    tours = []
    for row in data_rows:
        if len(row) < 6:
            continue
        tours.append({
            "participant": row[1].strip(),
            "debut_iso": row[3].strip(),
            "fin_iso": row[4].strip(),
        })
    return tours
