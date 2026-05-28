import textwrap
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
