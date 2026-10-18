import csv
import json
import argparse
import sys
from pathlib import Path


def parse_ecclesia_csv(path: str, table_code: str | None = None) -> list[dict]:
    """Extrait les tours de parole d'un export CSV Ecclesia.

    Deux formats produits par l'app :
    - export par table (`generateTableCSV`, bouton table) : multi-sections,
      marqueur "HISTORIQUE DES TOURS" puis colonnes Tour, Participant, File,
      Démarré à, Terminé à, Durée (s).
    - export "Historique" de séance (`handleExportHistory`, superadmin) : à
      plat, en-tête Table, Code, Tour, Participant, File, Démarré à,
      Terminé à, Durée (s) — peut contenir **plusieurs tables** (une par
      table de la séance) ; `table_code` sélectionne celle à extraire.
    """
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        rows = list(reader)

    # Format 1 : section "HISTORIQUE DES TOURS"
    history_idx = next(
        (i for i, row in enumerate(rows) if row and row[0].strip() == "HISTORIQUE DES TOURS"),
        None,
    )
    if history_idx is not None:
        # La ligne suivante est l'en-tête des colonnes, on commence après
        data_rows = rows[history_idx + 2:]
        code_col, participant_col, debut_col, fin_col, min_len = None, 1, 3, 4, 6
    else:
        # Format 2 : en-tête à plat "Table,Code,Tour,Participant,..."
        header_idx = next(
            (i for i, row in enumerate(rows)
             if len(row) >= 2 and row[0].strip() == "Table" and row[1].strip() == "Code"),
            None,
        )
        if header_idx is None:
            raise ValueError(
                "Format de CSV non reconnu : ni section 'HISTORIQUE DES TOURS' "
                "(export par table) ni en-tête 'Table,Code,Tour,...' (export "
                "'Historique' de séance) trouvés"
            )
        data_rows = rows[header_idx + 1:]
        code_col, participant_col, debut_col, fin_col, min_len = 1, 3, 5, 6, 8

        codes = sorted({row[code_col].strip() for row in data_rows if len(row) >= min_len})
        if len(codes) > 1:
            if table_code is None:
                raise ValueError(
                    "Ce CSV contient plusieurs tables (" + ", ".join(codes) + ") : "
                    "préciser --table-code <CODE> pour choisir celle à extraire"
                )
            if table_code not in codes:
                raise ValueError(
                    f"Table '{table_code}' absente du CSV (tables présentes : {', '.join(codes)})"
                )
            data_rows = [r for r in data_rows if len(r) >= min_len and r[code_col].strip() == table_code]
        elif codes and table_code is not None and codes[0] != table_code:
            raise ValueError(
                f"Table '{table_code}' absente du CSV (table présente : {codes[0]})"
            )

    tours = []
    for row in data_rows:
        if len(row) < min_len:
            continue
        tours.append({
            "participant": row[participant_col].strip(),
            "debut_iso": row[debut_col].strip(),
            "fin_iso": row[fin_col].strip(),
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
    parser.add_argument("--table-code", default=None, metavar="CODE",
                        help="Code de la table à extraire (requis si le CSV 'Historique' de séance contient plusieurs tables)")
    args = parser.parse_args()

    try:
        tours = parse_ecclesia_csv(args.csv, table_code=args.table_code)
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
