"""Tests d'audit : (1) stabilité des camps pré-débat (bootstrap k-means sur la carte ACP exportée),
(2) carte manuelle des transcriptions vs carte recalculée depuis la matrice voix x énoncés."""
import json, glob, sys
import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score, adjusted_rand_score
from scipy.spatial import procrustes
from scipy.stats import spearmanr

base = sys.argv[1]
rng = np.random.default_rng(0)

print("=== 1. Camps pré-débat ===")
for f in glob.glob(base + "/*/ecclesia_pre_debat_*.json"):
    d = json.load(open(f, encoding="utf-8"))
    X = np.array([[p["x"], p["y"]] for p in d["carte"]["points"]])
    lab = np.array([p["camp"] for p in d["carte"]["points"]])
    n = len(X)
    print(f"\n{f.split(chr(92))[-2] if chr(92) in f else f.split('/')[-2]} : n={n}, variance expliquée={d['carte']['variance_expliquee']}")
    for k in range(2, 6):
        if n // k < 2: break
        km = KMeans(k, n_init=20, random_state=0).fit(X)
        print(f"  k={k} silhouette={silhouette_score(X, km.labels_):.2f}")
    print(f"  silhouette des camps publiés : {silhouette_score(X, lab):.2f}")
    # silhouette sous l'hypothèse nulle : points tirés d'une gaussienne de même covariance (aucune structure)
    k_pub = len(set(lab))
    null = []
    for _ in range(200):
        Z = rng.multivariate_normal(X.mean(0), np.cov(X.T), n)
        null.append(silhouette_score(Z, KMeans(k_pub, n_init=10, random_state=0).fit(Z).labels_))
    print(f"  silhouette nulle (aucune structure, k={k_pub}) : médiane {np.median(null):.2f}, 95e pct {np.percentile(null,95):.2f}")
    # stabilité bootstrap : ARI entre camps publiés et camps recalculés sur rééchantillon
    aris = []
    for _ in range(200):
        idx = rng.choice(n, n, replace=True)
        km = KMeans(k_pub, n_init=10, random_state=0).fit(X[idx])
        aris.append(adjusted_rand_score(lab, km.predict(X)))
    print(f"  stabilité bootstrap (ARI vs camps publiés) : médiane {np.median(aris):.2f}, 10e pct {np.percentile(aris,10):.2f}")

print("\n=== 2. Carte des transcriptions : manuelle vs recalculée ===")
enc = {"pour": 1.0, "contre": -1.0, "nuance": 0.0}
for f in glob.glob(base + "/*/analyse_croisee.json"):
    d = json.load(open(f, encoding="utf-8"))
    voices = list(d["personas"])
    import os
    root = os.path.dirname(os.path.dirname(f))  # transcripts/ -> backend/ via chemins de la spec
    by_key = {t["key"]: json.load(open(os.path.join(os.path.dirname(root), t["analysis"]), encoding="utf-8")) for t in d["tables"]}
    S = []
    for raw in d["statements"]:
        if "from_table" in raw:  # énoncé repris d'une analyse par table (même résolution que build_cross_viz)
            tk = raw["from_table"]
            src = by_key[tk]["synthesis"]["affirmations"][raw["index"]]
            S.append({"stances": [{"p": f"{tk}{x['id'][1:]}", "pos": x["pos"]} for x in src["stances"]]})
        else:
            S.append(raw)
    M = np.full((len(voices), len(S)), np.nan)
    for j, s in enumerate(S):
        for st in s.get("stances", []):
            M[voices.index(st["p"]), j] = enc[st["pos"]]
    fill = np.mean(~np.isnan(M))
    keep = np.sum(~np.isnan(M), 1) >= 2
    print(f"\n{f.split(chr(92))[-2] if chr(92) in f else f.split('/')[-2]} : {len(voices)} voix x {len(S)} énoncés, remplissage {fill:.0%}, voix avec >=2 prises de position : {keep.sum()}")
    if keep.sum() < 4:
        print("  trop peu de données pour une carte calculée"); continue
    Mk = M[keep]
    col_mean = np.nanmean(Mk, 0); col_mean = np.where(np.isnan(col_mean), 0, col_mean)
    Mi = np.where(np.isnan(Mk), col_mean, Mk)
    Mc = Mi - Mi.mean(0)
    U, s, Vt = np.linalg.svd(Mc, full_matrices=False)
    ve = s**2 / np.sum(s**2)
    P = U[:, :2] * s[:2]
    cp = np.sum(~np.isnan(Mk), 1); P = P * np.sqrt(len(S) / cp)[:, None]  # mise à l'échelle Polis
    H = np.array([[d["personas"][v]["x"], d["personas"][v]["y"]] for v, k in zip(voices, keep) if k])
    _, _, disp = procrustes(H, P)
    # corrélation des distances entre paires (indépendante des rotations)
    from scipy.spatial.distance import pdist
    rho = spearmanr(pdist(H), pdist(P)).statistic
    print(f"  ACP des prises de position : variance expliquée {ve[0]:.0%} + {ve[1]:.0%}")
    print(f"  accord carte manuelle / carte calculée : Procrustes R²={1-disp:.2f}, Spearman des distances={rho:.2f}")
    # hypothèse nulle : positions manuelles permutées
    nul = [1 - procrustes(H[rng.permutation(len(H))], P)[2] for _ in range(500)]
    print(f"  R² attendu par hasard : médiane {np.median(nul):.2f}, 95e pct {np.percentile(nul,95):.2f}")
