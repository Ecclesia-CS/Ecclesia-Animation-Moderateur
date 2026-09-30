#!/bin/bash
# ============================================================================
# Ecclesia — nettoyage des worktrees, branches et tags de chantier
# ============================================================================
#
# Contexte : chaque chantier se développe dans son propre worktree git
# (dossier frère de la racine, ou sous .claude/worktrees/). Une fois le
# chantier mergé sur main et poussé, son worktree, sa branche locale et sa
# branche distante n'ont plus d'utilité — mais rien ne les supprime jamais
# automatiquement, d'où l'accumulation. Ce script fait ce ménage.
#
# SANS OPTION : mode simulation (dry-run). Affiche tout ce qui serait
# supprimé, ne touche à rien. C'est le mode par défaut, volontairement.
#
# AVEC --go : exécute réellement les suppressions.
#
# Usage :
#   bash scripts/cleanup-worktrees.sh            # simulation
#   bash scripts/cleanup-worktrees.sh --go        # suppression réelle
#
# Le script est IDEMPOTENT : le relancer (après une interruption, ou
# simplement plus tard) ne casse rien — tout ce qui a déjà été supprimé est
# silencieusement ignoré au tour suivant, seul ce qui reste à nettoyer est
# retraité.
#
# Chantier 136 (2026-09-26) : depuis l'introduction du workflow dev/main
# (CLAUDE.md § Environnements — dev / prod, 2026-09-25), `dev` est une
# branche de travail légitime au même titre que `main` — un chantier mergé
# dans `dev` mais pas encore promu vers `main` n'est pas « pas fini », juste
# pas encore livré en prod. Le script compare donc désormais à `main` OU
# `dev` (ancêtre de l'une des deux = nettoyable), et accepte d'être lancé
# depuis l'une ou l'autre.
#
# Ce que le script ne supprime JAMAIS, par construction (pas seulement par
# convention — ce sont des vérifications faites à l'exécution, pas une
# liste figée à une date donnée) :
#   - les branches `main` et `dev` elles-mêmes ;
#   - toute branche listée dans PROTECTED_BRANCHES ci-dessous (à ce jour :
#     chantier-58-colonnes-sessions — travail réel non mergé, décision de
#     Jules le 2026-09-04 ; chantier-secu-sauvegardes retirée de cette liste
#     le 2026-09-20, mergée sur `main` — chantier 85) ;
#   - tout worktree dont `git status --porcelain` n'est pas vide
#     (modifications ou fichiers non trackés non commités, quels qu'ils
#     soient) ;
#   - toute branche qui n'est un ancêtre ni de `main` ni de `dev` (`git
#     merge-base --is-ancestor`) ;
#   - toute branche mergée localement mais introuvable sur une branche
#     distante `origin/*` (évite de supprimer un commit qui n'existe nulle
#     part ailleurs que sur ce disque).
#
# Un worktree ou une branche qui ne remplit pas TOUTES ces conditions est
# simplement laissé de côté et listé comme tel — jamais supprimé "au cas
# où". En cas de doute, le script se trompe du côté de la prudence.
# ============================================================================

set -uo pipefail
# Pas de `set -e` : une suppression individuelle qui échoue (déjà partie,
# permission refusée, etc.) ne doit pas interrompre le reste du nettoyage.

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DRY_RUN=1
for arg in "$@"; do
  case "$arg" in
    --go) DRY_RUN=0 ;;
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '1,40p' "$0"
      exit 0
      ;;
    *)
      echo "Argument inconnu : $arg" >&2
      echo "Usage : $0 [--go]" >&2
      exit 1
      ;;
  esac
done

MAIN_BRANCH="main"
DEV_BRANCH="dev"

# Branches à ne jamais toucher, quel que soit leur état de merge/push.
PROTECTED_BRANCHES=("$MAIN_BRANCH" "$DEV_BRANCH" "chantier-58-colonnes-sessions")

# Une branche/worktree est nettoyable si elle est un ancêtre de main OU de
# dev — mergée dans l'une des deux, elle n'a plus d'utilité en tant que
# branche de travail séparée, même si l'autre ne l'a pas encore intégrée.
is_ancestor_of_main_or_dev() {
  local sha="$1"
  git merge-base --is-ancestor "$sha" "$MAIN_BRANCH" 2>/dev/null && return 0
  git merge-base --is-ancestor "$sha" "$DEV_BRANCH" 2>/dev/null && return 0
  return 1
}

# Tags de rollback (pre-merge-chantier-*) créés avant cette date sont
# considérés obsolètes (décision de Jules le 2026-09-04 : "antérieurs au
# chantier 60"). Date de création réelle du tag pre-merge-chantier-60-20260902,
# pas le numéro dans son nom (les noms ne sont pas dans l'ordre chronologique).
# Seuil figé une fois pour toutes — les tags plus récents que ça, y compris
# ceux créés après l'écriture de ce script, ne sont jamais concernés.
TAG_CUTOFF="2026-09-02T17:21:16+02:00"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

is_protected() {
  local name="$1" p
  for p in "${PROTECTED_BRANCHES[@]}"; do
    [ "$name" = "$p" ] && return 0
  done
  return 1
}

cd "$ROOT" || { echo "Impossible d'accéder au dépôt : $ROOT" >&2; exit 1; }

if [ ! -d ".git" ]; then
  echo "Ce script doit être lancé depuis un clone de la racine (pas un worktree)." >&2
  exit 1
fi

current_branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
if [ "$current_branch" != "$MAIN_BRANCH" ] && [ "$current_branch" != "$DEV_BRANCH" ]; then
  echo "Attention : la racine n'est ni sur '$MAIN_BRANCH' ni sur '$DEV_BRANCH' (actuellement '$current_branch')." >&2
  echo "Le script compare tout à '$MAIN_BRANCH' et '$DEV_BRANCH' locaux — passe d'abord sur l'une des deux." >&2
  exit 1
fi

echo "== Mise à jour des références distantes (git fetch, lecture seule) =="
git fetch origin --prune --quiet

if [ "$DRY_RUN" = "1" ]; then
  echo ""
  echo "############################################################"
  echo "# MODE SIMULATION — rien ne sera supprimé."
  echo "# Relancer avec --go pour exécuter réellement."
  echo "############################################################"
fi

removed_count=0
kept_count=0
freed_bytes=0

human_size() {
  # Affiche une taille lisible sans dépendre d'un outil externe particulier
  du -sh "$1" 2>/dev/null | cut -f1
}

bytes_of() {
  du -sb "$1" 2>/dev/null | cut -f1
}

# ---------------------------------------------------------------------------
# 1. Worktrees (dossiers frères + .claude/worktrees/*)
# ---------------------------------------------------------------------------

echo ""
echo "== 1. Worktrees =="

worktree_data="$(git worktree list --porcelain | awk '
  /^worktree /  { path=substr($0,10) }
  /^HEAD /      { sha=$2 }
  /^branch /    { br=$2; sub(/^refs\/heads\//,"",br) }
  /^detached/   { br="DETACHED" }
  /^$/          { if (path != "") print path"\t"sha"\t"br; path=""; sha=""; br="" }
  END           { if (path != "") print path"\t"sha"\t"br }
')"

known_worktree_branches=""

while IFS=$'\t' read -r wpath wsha wbranch; do
  [ -z "$wpath" ] && continue
  [ "$wpath" = "$ROOT" ] && continue  # la racine elle-même

  name="$(basename "$wpath")"

  if [ "$wbranch" = "DETACHED" ] || [ -z "$wbranch" ]; then
    echo "  [ignoré]   $name — HEAD détaché, à vérifier à la main"
    kept_count=$((kept_count + 1))
    continue
  fi

  known_worktree_branches="$known_worktree_branches
$wbranch"

  if is_protected "$wbranch"; then
    echo "  [protégé]  $name (branche $wbranch)"
    kept_count=$((kept_count + 1))
    continue
  fi

  if [ -n "$(git -C "$wpath" status --porcelain 2>/dev/null)" ]; then
    echo "  [conservé] $name (branche $wbranch) — modifications non commitées"
    kept_count=$((kept_count + 1))
    continue
  fi

  if ! is_ancestor_of_main_or_dev "$wsha"; then
    echo "  [conservé] $name (branche $wbranch) — pas mergée dans $MAIN_BRANCH ni $DEV_BRANCH"
    kept_count=$((kept_count + 1))
    continue
  fi

  if ! git branch -r --contains "$wsha" 2>/dev/null | grep -q '^[[:space:]]*origin/'; then
    echo "  [conservé] $name (branche $wbranch) — mergée localement mais absente d'origin"
    kept_count=$((kept_count + 1))
    continue
  fi

  size="$(human_size "$wpath")"
  echo "  [supprimé] $name (branche $wbranch, ~${size:-?})"
  removed_count=$((removed_count + 1))

  if [ "$DRY_RUN" = "0" ]; then
    b="$(bytes_of "$wpath")"
    git worktree remove --force "$wpath" 2>/dev/null || rm -rf "$wpath"
    git branch -d "$wbranch" 2>/dev/null
    freed_bytes=$((freed_bytes + ${b:-0}))
  fi
done <<< "$worktree_data"

git worktree prune 2>/dev/null

# ---------------------------------------------------------------------------
# 2. Branches locales sans worktree associé
# ---------------------------------------------------------------------------

echo ""
echo "== 2. Branches locales sans worktree =="

while IFS= read -r br; do
  [ -z "$br" ] && continue
  echo "$known_worktree_branches" | grep -qx "$br" && continue  # déjà traitée au point 1
  if is_protected "$br"; then
    echo "  [protégée]  $br"
    continue
  fi

  sha="$(git rev-parse "refs/heads/$br" 2>/dev/null)"
  [ -z "$sha" ] && continue

  if ! is_ancestor_of_main_or_dev "$sha"; then
    echo "  [conservée] $br — pas mergée dans $MAIN_BRANCH ni $DEV_BRANCH"
    continue
  fi
  if ! git branch -r --contains "$sha" 2>/dev/null | grep -q '^[[:space:]]*origin/'; then
    echo "  [conservée] $br — mergée localement mais absente d'origin"
    continue
  fi

  echo "  [supprimée] $br"
  if [ "$DRY_RUN" = "0" ]; then
    git branch -d "$br" 2>/dev/null || echo "    échec (déjà supprimée ou pas mergée au sens strict de git) : $br"
  fi
done <<< "$(git for-each-ref --format='%(refname:short)' refs/heads/)"

# ---------------------------------------------------------------------------
# 3. Branches distantes (origin) entièrement mergées
# ---------------------------------------------------------------------------

echo ""
echo "== 3. Branches distantes sur origin =="

while IFS= read -r rb; do
  [ -z "$rb" ] && continue
  name="${rb#origin/}"
  [ "$name" = "HEAD" ] && continue
  if is_protected "$name"; then
    echo "  [protégée]  origin/$name"
    continue
  fi

  sha="$(git rev-parse "$rb" 2>/dev/null)"
  [ -z "$sha" ] && continue

  if ! is_ancestor_of_main_or_dev "$sha"; then
    echo "  [conservée] origin/$name — pas mergée dans $MAIN_BRANCH ni $DEV_BRANCH"
    continue
  fi

  echo "  [supprimée] origin/$name"
  if [ "$DRY_RUN" = "0" ]; then
    git push origin --delete "$name" 2>/dev/null || echo "    déjà absente côté origin : $name"
  fi
done <<< "$(git for-each-ref --format='%(refname:short)' refs/remotes/origin/)"

# ---------------------------------------------------------------------------
# 4. Tags de rollback antérieurs au chantier 60
# ---------------------------------------------------------------------------

echo ""
echo "== 4. Tags de rollback (pre-merge-chantier-*, avant $TAG_CUTOFF) =="

while IFS='|' read -r tag tagdate; do
  [ -z "$tag" ] && continue
  if [[ "$tagdate" < "$TAG_CUTOFF" ]]; then
    echo "  [supprimé] $tag ($tagdate)"
    if [ "$DRY_RUN" = "0" ]; then
      git tag -d "$tag" >/dev/null 2>&1
      git push origin --delete "$tag" 2>/dev/null || echo "    déjà absent côté origin : $tag"
    fi
  fi
done <<< "$(git for-each-ref --format='%(refname:short)|%(creatordate:iso-strict)' refs/tags/pre-merge-*)"

# ---------------------------------------------------------------------------
# Résumé
# ---------------------------------------------------------------------------

echo ""
echo "== Résumé =="
echo "Worktrees traités : $removed_count supprimé(s), $kept_count conservé(s)."
if [ "$DRY_RUN" = "1" ]; then
  echo ""
  echo "Simulation terminée — rien n'a été modifié. Relancer avec --go pour exécuter."
else
  if [ "$freed_bytes" -gt 0 ] 2>/dev/null; then
    echo "Espace disque libéré (worktrees) : $(numfmt --to=iec-i --suffix=B "$freed_bytes" 2>/dev/null || echo "${freed_bytes} octets")"
  fi
  echo ""
  echo "-- Vérifications --"
  git status
  echo ""
  git worktree list
  echo ""
  ( npx tsc --noEmit && echo "tsc --noEmit : OK" ) || echo "tsc --noEmit : ÉCHEC — à examiner avant de continuer."
fi
