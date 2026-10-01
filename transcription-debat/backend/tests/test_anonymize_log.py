import textwrap
import pytest
from anonymize_log import parse_ecclesia_csv

FIXTURE_CSV = textwrap.dedent("""\
    "Ecclesia — Export débat"
    "Session","ABCDEF","Créé le","2026-05-28T10:00:00+00:00"

    "PARTICIPANTS"
    "Pseudo","Tours","Temps total (s)"
    "Alice",2,120
    "Bob",1,60

    "HISTORIQUE DES TOURS"
    "Tour","Participant","File","Démarré à","Terminé à","Durée (s)"
    1,"Alice","File longue","2026-05-28T11:00:00+00:00","2026-05-28T11:01:00+00:00",60
    2,"Bob","Coupe file","2026-05-28T11:01:00+00:00","2026-05-28T11:02:00+00:00",60
    3,"Alice","Manuel","2026-05-28T11:02:30+00:00","2026-05-28T11:03:00+00:00",30
""")


def test_parse_returns_tours_only(tmp_path):
    f = tmp_path / "test.csv"
    f.write_text(FIXTURE_CSV, encoding="utf-8")
    tours = parse_ecclesia_csv(str(f))
    assert len(tours) == 3


def test_parse_tour_fields(tmp_path):
    f = tmp_path / "test.csv"
    f.write_text(FIXTURE_CSV, encoding="utf-8")
    tours = parse_ecclesia_csv(str(f))
    assert tours[0]["participant"] == "Alice"
    assert tours[0]["debut_iso"] == "2026-05-28T11:00:00+00:00"
    assert tours[0]["fin_iso"] == "2026-05-28T11:01:00+00:00"


def test_parse_order_preserved(tmp_path):
    f = tmp_path / "test.csv"
    f.write_text(FIXTURE_CSV, encoding="utf-8")
    tours = parse_ecclesia_csv(str(f))
    assert [t["participant"] for t in tours] == ["Alice", "Bob", "Alice"]


FIXTURE_HISTORY_CSV_SINGLE_TABLE = textwrap.dedent("""\

    "Table","Code","Tour","Participant","File","Démarré à","Terminé à","Durée (s)"
    "Alice","AAAAAA",1,"Alice","Coupe file","2026-05-28T11:00:00+00:00","2026-05-28T11:01:00+00:00",60
    "Alice","AAAAAA",2,"Bob","File longue","2026-05-28T11:01:00+00:00","2026-05-28T11:02:00+00:00",60
""")

FIXTURE_HISTORY_CSV_MULTI_TABLE = textwrap.dedent("""\

    "Table","Code","Tour","Participant","File","Démarré à","Terminé à","Durée (s)"
    "Alice","AAAAAA",1,"Alice","Coupe file","2026-05-28T11:00:00+00:00","2026-05-28T11:01:00+00:00",60
    "Bob","BBBBBB",1,"Bob","Coupe file","2026-05-28T11:05:00+00:00","2026-05-28T11:06:00+00:00",60
    "Alice","AAAAAA",2,"Carol","File longue","2026-05-28T11:01:00+00:00","2026-05-28T11:02:00+00:00",60
""")


def test_parse_history_format_single_table(tmp_path):
    f = tmp_path / "history.csv"
    f.write_text(FIXTURE_HISTORY_CSV_SINGLE_TABLE, encoding="utf-8-sig")
    tours = parse_ecclesia_csv(str(f))
    assert [t["participant"] for t in tours] == ["Alice", "Bob"]
    assert tours[0]["debut_iso"] == "2026-05-28T11:00:00+00:00"
    assert tours[0]["fin_iso"] == "2026-05-28T11:01:00+00:00"


def test_parse_history_format_multi_table_requires_table_code(tmp_path):
    f = tmp_path / "history.csv"
    f.write_text(FIXTURE_HISTORY_CSV_MULTI_TABLE, encoding="utf-8-sig")
    with pytest.raises(ValueError, match="plusieurs tables"):
        parse_ecclesia_csv(str(f))


def test_parse_history_format_multi_table_filters_by_code(tmp_path):
    f = tmp_path / "history.csv"
    f.write_text(FIXTURE_HISTORY_CSV_MULTI_TABLE, encoding="utf-8-sig")
    tours = parse_ecclesia_csv(str(f), table_code="AAAAAA")
    assert [t["participant"] for t in tours] == ["Alice", "Carol"]


def test_parse_history_format_unknown_table_code_raises(tmp_path):
    f = tmp_path / "history.csv"
    f.write_text(FIXTURE_HISTORY_CSV_MULTI_TABLE, encoding="utf-8-sig")
    with pytest.raises(ValueError, match="absente du CSV"):
        parse_ecclesia_csv(str(f), table_code="ZZZZZZ")


def test_parse_unrecognized_format_raises(tmp_path):
    f = tmp_path / "bad.csv"
    f.write_text('"foo","bar"\n1,2\n', encoding="utf-8")
    with pytest.raises(ValueError, match="Format de CSV non reconnu"):
        parse_ecclesia_csv(str(f))


from anonymize_log import anonymize, write_anon_log, write_name_map


def _make_tours():
    return [
        {"participant": "Alice", "debut_iso": "2026-05-28T11:00:00+00:00", "fin_iso": "2026-05-28T11:01:00+00:00"},
        {"participant": "Bob",   "debut_iso": "2026-05-28T11:01:00+00:00", "fin_iso": "2026-05-28T11:02:00+00:00"},
        {"participant": "Alice", "debut_iso": "2026-05-28T11:02:30+00:00", "fin_iso": "2026-05-28T11:03:00+00:00"},
        {"participant": "Carol", "debut_iso": "2026-05-28T11:03:00+00:00", "fin_iso": "2026-05-28T11:04:00+00:00"},
    ]


def test_anonymize_labels_in_first_appearance_order():
    anon, mapping = anonymize(_make_tours(), refused=[])
    assert mapping["Alice"] == "Interlocuteur 1"
    assert mapping["Bob"] == "Interlocuteur 2"
    assert mapping["Carol"] == "Interlocuteur 3"


def test_anonymize_refused_gets_refus_label():
    anon, mapping = anonymize(_make_tours(), refused=["Bob"])
    assert mapping["Bob"] == "[REFUS]"
    assert mapping["Alice"] == "Interlocuteur 1"
    assert mapping["Carol"] == "Interlocuteur 2"


def test_anonymize_refused_flag_in_output():
    anon, _ = anonymize(_make_tours(), refused=["Bob"])
    bob_tours = [t for t in anon if t["interlocuteur"] == "[REFUS]"]
    assert all(t["refuse"] is True for t in bob_tours)
    alice_tours = [t for t in anon if t["interlocuteur"] == "Interlocuteur 1"]
    assert all(t["refuse"] is False for t in alice_tours)


def test_write_name_map_sidecar(tmp_path):
    import json
    out = tmp_path / "log_anon.csv"
    _, mapping = anonymize(_make_tours(), refused=["Bob"])
    write_name_map(mapping, str(out))
    sidecar = tmp_path / "name_map.json"
    assert sidecar.exists()
    data = json.loads(sidecar.read_text(encoding="utf-8"))
    assert data["Alice"] == "Interlocuteur 1"
    assert data["Bob"] == "[REFUS]"


def test_write_anon_log_produces_valid_csv(tmp_path):
    anon, _ = anonymize(_make_tours(), refused=["Bob"])
    out = tmp_path / "log_anon.csv"
    write_anon_log(anon, str(out))
    import csv
    with open(out, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    assert rows[0]["interlocuteur"] == "Interlocuteur 1"
    assert rows[1]["interlocuteur"] == "[REFUS]"
    assert rows[1]["refuse"] == "true"
    assert rows[0]["debut_iso"] == "2026-05-28T11:00:00+00:00"
