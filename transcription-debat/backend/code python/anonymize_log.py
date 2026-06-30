import csv
import json
import argparse
import sys
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


def anonymize(tours: list[dict], refused: list[str]) -> tuple[list[dict], dict[str, str]]:
    """Assigne Interlocuteur N (ordre d'apparition) ; refused → [REFUS]."""
    mapping: dict[str, str] = {}
    counter = 1
    for t in tours:
        name = t["participant"]
        if name in mapping:
            continue
        if name in refused:
            mapping[name] = "[REFUS]"
        else:
            mapping[name] = f"Interlocuteur {counter}"
            counter += 1

    anon = []
    for t in tours:
        label = mapping[t["participant"]]
        anon.append({
            "interlocuteur": label,
            "debut_iso": t["debut_iso"],
            "fin_iso": t["fin_iso"],
            "refuse": label == "[REFUS]",
        })
    return anon, mapping


def write_anon_log(tours: list[dict], output_path: str) -> None:
    with open(output_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["interlocuteur", "debut_iso", "fin_iso", "refuse"])
        writer.writeheader()
        for t in tours:
            writer.writerow({**t, "refuse": "true" if t["refuse"] else "false"})


def write_name_map(mapping: dict[str, str], output_path: str) -> None:
    """Écrit la correspondance nom réel → label en JSON, à côté du log anonymisé.

    Consommé par transcribe_offline pour masquer les prénoms réels prononcés dans le
    corps du texte (l'anonymisation des labels ne couvre pas les mentions parlées).
    """
    path = Path(output_path).parent / "name_map.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(mapping, f, ensure_ascii=False, indent=2)


def main() -> None:
    parser = argparse.ArgumentParser(description="Anonymise un export CSV Ecclesia.")
    parser.add_argument("csv", help="Chemin vers le fichier CSV Ecclesia")
    parser.add_argument("--refuse", action="append", default=[], metavar="NOM",
                        help="Nom exact d'un participant ayant refusé l'enregistrement (répétable)")
    parser.add_argument("--output", default=None, help="Chemin de sortie (défaut: log_anon.csv à côté du CSV)")
    args = parser.parse_args()

    try:
        tours = parse_ecclesia_csv(args.csv)
    except FileNotFoundError:
        print(f"Erreur : fichier '{args.csv}' introuvable.", file=sys.stderr)
        sys.exit(1)
    except ValueError as e:
        print(f"Erreur CSV : {e}", file=sys.stderr)
        sys.exit(1)

    anon, mapping = anonymize(tours, refused=args.refuse)

    output_path = args.output or str(Path(args.csv).parent / "log_anon.csv")
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    write_anon_log(anon, output_path)
    write_name_map(mapping, output_path)

    print("Correspondance nom -> label (a conserver) :")
    for name, label in mapping.items():
        print(f"  {name:30s} -> {label}")
    print(f"\nLog anonymisé écrit : {output_path}")


if __name__ == "__main__":
    main()
