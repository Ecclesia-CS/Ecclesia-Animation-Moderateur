"""Calcul des opinions de la transcription : carte, camps, énoncés caractéristiques, consensus, fiabilité.

Remplace le placement et les camps décidés à la lecture : à partir des seules prises de position
relevées dans la transcription (voix × énoncés, pour / contre / nuance), tout est calculé, de façon
déterministe, avec des méthodes publiées.

Méthode (références dans « Visualisation prises de positions/audit_methodes_2026-10.md ») :
- Matrice et carte : Polis (Small et al., Recerca 2021, §1.1-1.2). Pour = +1, contre = −1, nuance = 0
  (le « passe » de Polis : un vote réel mais sans côté) ; énoncé sur lequel la voix ne s'est pas exprimée
  = moyenne de la colonne ; ACP, deux composantes ; position multipliée par √(C / Cp) pour que les voix
  qui se sont peu exprimées ne s'agglutinent pas au centre. Une voix avec moins de MIN_VOTES prises de
  position n'est pas placée (Polis : 7 sur une centaine de commentaires, hyperparamètre assumé).
- Camps : Polis §1.3, k-means de 2 à 5 groupes sur la carte, k retenu au meilleur coefficient de
  silhouette (Rousseeuw 1987). En plus : test d'absence de structure (même procédure sur des nuages
  sans groupe, principe de la gap statistic, Tibshirani et al. 2001) et stabilité par rééchantillonnage
  des voix (indice de Rand ajusté, Hubert & Arabie 1985 ; Hennig 2007). Camps affichés seulement s'ils
  battent le hasard.
- Énoncés caractéristiques d'un camp : représentativité de Polis §1.4, P = (1 + N_v) / (2 + N),
  rapport camp / reste, test de deux proportions ; retenus si significatifs (z ≥ 1,2816, seuil 90 %
  du code de Polis) et majoritaires dans le camp.
- Consensus : consensus « tenant compte des groupes » de Polis, produit des P(côté | camp).
  Dissensus : écart de P(pour | camp) entre le camp le plus pour et le plus contre (même définition
  que l'export pré-débat de l'appli).
- Concordance de deux cartes : analyse procustéenne (Gower 1975). Accord entre deux codages :
  alpha de Krippendorff, données nominales (Krippendorff 2004).

Aucune dépendance hors numpy. Toutes les tirages aléatoires sont graines fixes : relancer donne le
même résultat.
"""
from __future__ import annotations

import math

import numpy as np

ENCODE = {"pour": 1.0, "contre": -1.0, "nuance": 0.0}
MIN_VOTES = 3            # prises de position minimales pour placer une voix
MIN_STATEMENT_VOTES = 2  # un énoncé sur lequel moins de 2 voix placées se sont exprimées n'entre pas dans l'ACP
K_MAX = 5
MIN_PER_CAMP = 3         # comme l'appli : k ≤ n / 3
MIN_CAMP_SIZE = 2        # pas de « camp » d'une seule personne : une solution qui en contient une est écartée
SEED = 42
N_NULL = 100           # nuages sans structure (Tibshirani et al. utilisent B = 20 à 100)
N_BOOT = 200
NULL_QUANTILE = 95
Z_SIG_90 = 1.2816


# ───────────────────────── matrice et carte (Polis) ─────────────────────────

def vote_matrix(voices: list[str], statements: list[list[dict]]) -> np.ndarray:
    """voix × énoncés ; NaN = ne s'est pas exprimé. `statements` : pour chaque énoncé, ses prises de
    position [{p, pos}] (au plus une par voix)."""
    idx = {v: i for i, v in enumerate(voices)}
    m = np.full((len(voices), len(statements)), np.nan)
    for j, stances in enumerate(statements):
        for s in stances:
            m[idx[s["p"]], j] = ENCODE[s["pos"]]
    return m


def polis_map(m: np.ndarray) -> dict | None:
    """ACP façon Polis. Renvoie None s'il y a trop peu de données pour une carte (moins de 3 voix
    placées ou de 2 énoncés exploitables)."""
    votes = np.sum(~np.isnan(m), axis=1)
    placed = np.where(votes >= MIN_VOTES)[0]
    if len(placed) < 3:
        return None
    sub = m[placed]
    cols = np.where(np.sum(~np.isnan(sub), axis=0) >= MIN_STATEMENT_VOTES)[0]
    if len(cols) < 2:
        return None
    sub = sub[:, cols]
    means = np.nanmean(sub, axis=0)
    filled = np.where(np.isnan(sub), means, sub)
    centered = filled - means
    _, s, vt = np.linalg.svd(centered, full_matrices=False)
    comps = vt[:2].copy()
    if comps.shape[0] < 2:
        return None
    # orientation déterministe : l'énoncé qui pèse le plus sur un axe tire vers le côté positif quand on l'approuve
    for k in range(2):
        j = int(np.argmax(np.abs(comps[k])))
        if comps[k, j] < 0:
            comps[k] = -comps[k]
    total = float(np.sum(s ** 2))
    variance = [float(s[k] ** 2 / total) if total > 0 else 0.0 for k in range(2)]
    n_cols = len(cols)
    coords = np.array([project(sub_row, means, comps, n_cols) for sub_row in sub])
    return {"placed": placed.tolist(), "cols": cols.tolist(), "means": means, "components": comps,
            "variance": variance, "coords": coords}


def project(row: np.ndarray, means: np.ndarray, comps: np.ndarray, n_cols: int) -> np.ndarray:
    """Position d'une voix à partir de ses prises de position (NaN = non exprimé) : imputation par la
    moyenne, centrage, projection, mise à l'échelle √(C / Cp) (Polis §1.2)."""
    voted = int(np.sum(~np.isnan(row)))
    filled = np.where(np.isnan(row), means, row) - means
    pos = comps @ filled
    return pos * math.sqrt(n_cols / voted) if voted else pos


# ───────────────────────── camps (k-means + silhouette, Polis §1.3) ─────────────────────────

def _kmeans_once(x: np.ndarray, k: int, rng: np.random.Generator, iters: int = 100):
    n = len(x)
    centers = [x[rng.integers(n)]]
    for _ in range(1, k):  # k-means++
        d2 = np.min(((x[:, None, :] - np.array(centers)[None]) ** 2).sum(-1), axis=1)
        p = d2 / d2.sum() if d2.sum() > 0 else np.full(n, 1 / n)
        centers.append(x[rng.choice(n, p=p)])
    c = np.array(centers, dtype=float)
    labels = np.zeros(n, dtype=int)
    for _ in range(iters):
        labels = np.argmin(((x[:, None, :] - c[None]) ** 2).sum(-1), axis=1)
        new = np.array([x[labels == i].mean(0) if np.any(labels == i) else c[i] for i in range(k)])
        if np.allclose(new, c):
            break
        c = new
    inertia = float(((x - c[labels]) ** 2).sum())
    return labels, c, inertia


def kmeans(x: np.ndarray, k: int, seed: int = SEED, n_init: int = 10):
    rng = np.random.default_rng(seed)
    best = None
    for _ in range(n_init):
        labels, c, inertia = _kmeans_once(x, k, rng)
        if best is None or inertia < best[2] - 1e-12:
            best = (labels, c, inertia)
    return best[0], best[1]


def silhouette(x: np.ndarray, labels: np.ndarray) -> float:
    n = len(x)
    uniq = np.unique(labels)
    if len(uniq) < 2 or n < 3:
        return 0.0
    d = np.sqrt(((x[:, None, :] - x[None]) ** 2).sum(-1))
    scores = []
    for i in range(n):
        same = (labels == labels[i]) & (np.arange(n) != i)
        if not same.any():
            scores.append(0.0)
            continue
        a = d[i, same].mean()
        b = min(d[i, labels == g].mean() for g in uniq if g != labels[i])
        scores.append((b - a) / max(a, b) if max(a, b) > 0 else 0.0)
    return float(np.mean(scores))


def best_k(x: np.ndarray, seed: int = SEED, n_init: int = 10):
    """k de 2 à min(5, n/3) au meilleur coefficient de silhouette, sans camp de moins de MIN_CAMP_SIZE
    voix. None si aucune solution (moins de 6 points)."""
    k_max = min(K_MAX, len(x) // MIN_PER_CAMP)
    best = None
    for k in range(2, k_max + 1):
        labels, centers = kmeans(x, k, seed, n_init)
        if np.min(np.bincount(labels, minlength=k)) < MIN_CAMP_SIZE:
            continue
        sc = silhouette(x, labels)
        if best is None or sc > best[2] + 1e-12:
            best = (k, labels, sc, centers)
    return best


def adjusted_rand(a, b) -> float:
    a, b = np.asarray(a), np.asarray(b)
    n = len(a)
    if n < 2:
        return 1.0
    ua, ia = np.unique(a, return_inverse=True)
    ub, ib = np.unique(b, return_inverse=True)
    table = np.zeros((len(ua), len(ub)))
    np.add.at(table, (ia, ib), 1)
    comb = lambda v: v * (v - 1) / 2  # noqa: E731
    s_ij = comb(table).sum()
    s_a, s_b = comb(table.sum(1)).sum(), comb(table.sum(0)).sum()
    expected = s_a * s_b / comb(n)
    maxi = (s_a + s_b) / 2
    return 1.0 if maxi == expected else float((s_ij - expected) / (maxi - expected))


def camps(x: np.ndarray, seed: int = SEED) -> dict:
    """Camps d'opinion sur la carte, avec leurs indicateurs de validité.
    `nets` : la silhouette dépasse le 95e centile de la même procédure appliquée à des nuages
    gaussiens de même moyenne et covariance (aucun groupe) ; sinon aucun camp n'est affiché."""
    n = len(x)
    out = {"n": n, "k": 0, "labels": [-1] * n, "nets": False, "silhouette": None,
           "silhouette_hasard_95": None, "stabilite": None}
    found = best_k(x, seed)
    if found is None:
        out["raison"] = ("trop peu de voix placées pour former des camps" if n < 2 * MIN_PER_CAMP else
                         "tous les regroupements possibles isolent une seule personne, ce qui ne fait pas un camp")
        return out
    k, labels, sil, centers = found
    rng = np.random.default_rng(seed)
    cov = np.cov(x.T) + 1e-9 * np.eye(2)
    null = []
    for _ in range(N_NULL):
        z = rng.multivariate_normal(x.mean(0), cov, n)
        nb = best_k(z, int(rng.integers(1 << 30)))  # même procédure que sur les vraies données
        null.append(nb[2] if nb else 0.0)
    p95 = float(np.percentile(null, NULL_QUANTILE))
    aris = []
    for _ in range(N_BOOT):
        idx = rng.choice(n, n, replace=True)
        if len(np.unique(idx)) < k:
            continue
        _, c = kmeans(x[idx], k, int(rng.integers(1 << 30)), n_init=3)
        pred = np.argmin(((x[:, None, :] - c[None]) ** 2).sum(-1), axis=1)
        aris.append(adjusted_rand(labels, pred))
    # numérotation stable : du plus grand camp au plus petit, puis de gauche à droite
    order = sorted(range(k), key=lambda g: (-int(np.sum(labels == g)), float(centers[g][0]), float(centers[g][1])))
    remap = {g: i for i, g in enumerate(order)}
    out.update({"k": k, "labels": [remap[int(g)] for g in labels], "silhouette": round(sil, 3),
                "silhouette_hasard_95": round(p95, 3), "nets": bool(sil > p95),
                "stabilite": round(float(np.median(aris)), 3) if aris else None})
    if not out["nets"]:
        out["raison"] = "les groupes trouvés ne se distinguent pas d'un nuage sans structure"
    return out


# ───────────────────────── énoncés : représentativité, consensus, dissensus ─────────────────────────

def _p(n_v: int, n: int) -> float:
    return (1 + n_v) / (2 + n)


def _counts(stances: list[dict], members: set[str]) -> tuple[int, int, int]:
    p = sum(1 for s in stances if s["p"] in members and s["pos"] == "pour")
    c = sum(1 for s in stances if s["p"] in members and s["pos"] == "contre")
    nu = sum(1 for s in stances if s["p"] in members and s["pos"] == "nuance")
    return p, c, nu


def two_prop_z(k1: int, n1: int, k2: int, n2: int) -> float:
    if n1 == 0 or n2 == 0:
        return 0.0
    p = (k1 + k2) / (n1 + n2)
    se = math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
    return 0.0 if se == 0 else (k1 / n1 - k2 / n2) / se


def representative(statements: list[dict], members: set[str], others: set[str], n_max: int = 3) -> list[dict]:
    """Énoncés qui distinguent un camp (Polis §1.4). `statements` : [{text, stances}]. D'abord ceux qui
    distinguent par l'adhésion ; s'il en manque, ceux qui distinguent par le rejet."""
    found = {"pour": [], "contre": []}
    for st in statements:
        pin, cin, nuin = _counts(st["stances"], members)
        pout, cout, nuout = _counts(st["stances"], others)
        nin, nout = pin + cin + nuin, pout + cout + nuout
        for side, kin, kout in (("pour", pin, pout), ("contre", cin, cout)):
            pa, pb = _p(kin, nin), _p(kout, nout)
            z = two_prop_z(kin, nin, kout, nout)
            if nin and pa >= 0.5 and z >= Z_SIG_90:
                found[side].append({"text": st["text"], "sens": side, "ratio": round(pa / pb, 3), "z": round(z, 3),
                                    "part_pour_camp": round(pin / (pin + cin), 3) if pin + cin else None,
                                    "part_pour_reste": round(pout / (pout + cout), 3) if pout + cout else None,
                                    "_key": (pa / pb) * z})
    out = sorted(found["pour"], key=lambda r: -r["_key"])[:n_max]
    out += sorted(found["contre"], key=lambda r: -r["_key"])[: n_max - len(out)]
    for r in out:
        r.pop("_key")
    return out


def group_consensus(stances: list[dict], groups: list[set[str]]) -> dict:
    """Consensus de Polis : produit, sur les camps, de la probabilité (avec pseudo-comptes) d'approuver
    (et, symétriquement, de rejeter)."""
    agree = disagree = 1.0
    for g in groups:
        p, c, nu = _counts(stances, g)
        agree *= _p(p, p + c + nu)
        disagree *= _p(c, p + c + nu)
    return {"pour": agree, "contre": disagree}


def camp_split(stances: list[dict], groups: list[set[str]]) -> float | None:
    """Écart de P(pour | camp) entre le camp le plus pour et le plus contre (camps qui se sont exprimés)."""
    shares = []
    for g in groups:
        p, c, _ = _counts(stances, g)
        if p + c:
            shares.append(_p(p, p + c))
    return max(shares) - min(shares) if len(shares) >= 2 else None


# ───────────────────────── validation ─────────────────────────

def procrustes_r2(a: np.ndarray, b: np.ndarray) -> float:
    """Part de la forme commune à deux nuages de points (1 = superposables par rotation, symétrie et
    changement d'échelle ; 0 = rien en commun)."""
    a = np.asarray(a, float) - np.mean(a, 0)
    b = np.asarray(b, float) - np.mean(b, 0)
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    a, b = a / na, b / nb
    s = np.linalg.svd(a.T @ b, compute_uv=False)
    return float(np.sum(s) ** 2)


def procrustes_null95(a: np.ndarray, b: np.ndarray, seed: int = SEED, n: int = 500) -> float:
    rng = np.random.default_rng(seed)
    return float(np.percentile([procrustes_r2(a[rng.permutation(len(a))], b) for _ in range(n)], 95))


def krippendorff_alpha_nominal(units: list[list[str | None]]) -> float | None:
    """Alpha de Krippendorff, données nominales. `units` : une liste par unité codée (ici un couple
    voix × énoncé), une valeur par codeur, None = non codé. Unités à moins de 2 valeurs ignorées."""
    pairs: dict[tuple[str, str], float] = {}
    for u in units:
        vals = [v for v in u if v is not None]
        m = len(vals)
        if m < 2:
            continue
        for i, a in enumerate(vals):
            for j, b in enumerate(vals):
                if i != j:
                    pairs[(a, b)] = pairs.get((a, b), 0.0) + 1.0 / (m - 1)
    n = sum(pairs.values())
    if n <= 1:
        return None
    cats = sorted({a for a, _ in pairs})
    nc = {c: sum(v for (a, _), v in pairs.items() if a == c) for c in cats}
    d_o = sum(v for (a, b), v in pairs.items() if a != b) / n
    d_e = sum(nc[a] * nc[b] for a in cats for b in cats if a != b) / (n * (n - 1))
    return 1.0 if d_e == 0 else round(1 - d_o / d_e, 3)
