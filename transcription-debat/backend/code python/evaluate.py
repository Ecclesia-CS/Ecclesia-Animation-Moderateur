"""Évaluer un transcript — sans référence (indicateurs) ou sur extraits corrigés à l'écoute.

  metrics : compare les indicateurs indirects de plusieurs transcripts (.json)
      python "code python/evaluate.py" metrics A.json B.json

  kit : prépare des extraits de référence à corriger à l'écoute
        (texte pré-rempli + audio découpé à la même fenêtre, via ffmpeg)
      python "code python/evaluate.py" kit T_corrected.json --audio audio.mp3 \\
             --windows 460-760,4300-4600,6400-6700 --out transcripts/<Thème>/<CODE>/reference

  score : WER (texte) et WDER (attribution) d'un transcript sur un extrait corrigé
      python "code python/evaluate.py" score reference/extrait_1.txt T_corrected.json

Un extrait corrigé ne doit contenir que ce qui est réellement dit et le vrai orateur
de chaque ligne ; c'est la seule mesure qui prouve qu'une modification du pipeline
améliore le résultat (les indicateurs indirects ne sont que des indices).
Les extraits contiennent des données personnelles : ils restent dans transcripts/
(non versionné).
"""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

from quality import normalize_tokens, parse_reference_txt, transcript_metrics, wer_wder

_WINDOW = re.compile(r"^#\s*fenetre:\s*([\d.]+)-([\d.]+)", re.MULTILINE)


def _hms(t: float) -> str:
    t = int(t)
    return f"{t // 3600:02d}:{(t % 3600) // 60:02d}:{t % 60:02d}"


def parse_windows(spec: str) -> list[tuple[float, float]]:
    out = []
    for part in spec.split(","):
        a, b = part.split("-")
        out.append((float(a), float(b)))
    return out


def _in_window(seg: dict, window: tuple[float, float]) -> bool:
    mid = (seg["start"] + seg["end"]) / 2
    return window[0] <= mid < window[1]


def make_reference_text(segments: list[dict], window: tuple[float, float], code: str, clip_name: str | None = None) -> str:
    """Extrait pré-rempli (segments dont le milieu tombe dans la fenêtre), à corriger."""
    a, b = window
    head = [
        f"# EXTRAIT DE RÉFÉRENCE — {code} — de {_hms(a)} à {_hms(b)}",
        f"# fenetre: {a:.1f}-{b:.1f}",
        f"# Écoute {clip_name or 'l’audio'} (il démarre à {_hms(a)} du débat) et corrige chaque ligne :",
        "#  - le texte : exactement ce qui est dit (euh, répétitions et phrases inachevées compris) ;",
        "#  - l'orateur : Interlocuteur N, ou [?] si tu ne peux vraiment pas savoir ;",
        "#  - découpe une ligne en deux si l'orateur change en cours de ligne (même minutage approximatif).",
        "# Garde les prénoms masqués ([prénom], labels). Les lignes # sont ignorées.",
        "",
    ]
    body = [f"[{_hms(s['start'])}] {s['speaker']}: {s['text']}" for s in segments if _in_window(s, window)]
    return "\n".join(head + body) + "\n"


def _words_with_speaker(lines) -> list[tuple[str, str]]:
    out = []
    for spk, text in lines:
        out.extend((tok, spk) for tok in normalize_tokens(text))
    return out


def score_reference(reference_text: str, segments: list[dict]) -> dict:
    """WER / WDER du transcript sur la fenêtre de l'extrait de référence."""
    m = _WINDOW.search(reference_text)
    if not m:
        raise ValueError("Extrait sans ligne « # fenetre: début-fin ».")
    window = (float(m.group(1)), float(m.group(2)))
    ref = _words_with_speaker((spk, txt) for _, spk, txt in parse_reference_txt(reference_text))
    hyp = _words_with_speaker((s["speaker"], s["text"]) for s in segments if _in_window(s, window) and not s.get("refused"))
    return {"fenetre": window, **wer_wder(ref, hyp)}


def _load(path: str) -> list[dict]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_m = sub.add_parser("metrics", help="indicateurs indirects de un ou plusieurs transcripts")
    p_m.add_argument("transcripts", nargs="+")
    p_k = sub.add_parser("kit", help="prépare des extraits de référence à corriger à l'écoute")
    p_k.add_argument("transcript")
    p_k.add_argument("--audio", required=True)
    p_k.add_argument("--windows", required=True, help="début-fin en secondes, séparés par des virgules")
    p_k.add_argument("--out", required=True)
    p_k.add_argument("--code", default="")
    p_s = sub.add_parser("score", help="WER / WDER d'un transcript sur un extrait corrigé")
    p_s.add_argument("reference")
    p_s.add_argument("transcripts", nargs="+")
    args = parser.parse_args()

    if args.cmd == "metrics":
        for path in args.transcripts:
            m = transcript_metrics(_load(path))
            print(f"\n{path}")
            print(f"  segments {m['segments']} · durée {m['duration_sec']:.0f} s · non attribué [?] {m['unknown_ratio'] * 100:.1f} %")
            print(f"  phrases coupées aux changements d'orateur : {m['mid_sentence_cuts']}/{m['speaker_changes']}")
            print(f"  artefacts « l 'état » : {m['legacy_join_artifacts']} · mots douteux signalés : {m['low_conf_words']}")
            print(f"  provenance de l'orateur (s) : { {k: round(v) for k, v in m['by_source_sec'].items()} }")
    elif args.cmd == "kit":
        out = Path(args.out)
        out.mkdir(parents=True, exist_ok=True)
        segs = _load(args.transcript)
        for i, (a, b) in enumerate(parse_windows(args.windows), start=1):
            clip = out / f"extrait_{i}.mp3"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", str(a), "-t", str(b - a),
                            "-i", args.audio, "-ac", "1", "-b:a", "96k", str(clip)], check=True)
            (out / f"extrait_{i}.txt").write_text(
                make_reference_text(segs, (a, b), args.code, clip_name=clip.name), encoding="utf-8")
            print(f"Extrait {i} : {out / f'extrait_{i}.txt'} + {clip.name}")
    else:
        ref = Path(args.reference).read_text(encoding="utf-8")
        for path in args.transcripts:
            r = score_reference(ref, _load(path))
            print(f"{path}\n  WER {r['wer'] * 100:.1f} % ({r['sub']} subst., {r['del']} suppr., {r['ins']} ins. "
                  f"sur {r['ref_words']} mots) · WDER {r['wder'] * 100:.1f} %")


if __name__ == "__main__":
    main()
