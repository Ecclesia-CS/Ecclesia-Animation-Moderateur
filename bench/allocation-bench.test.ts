// =============================================================
// Chantier 29 (I1) — exécution du banc d'essai + rapport Markdown
//
//   ALLOC_BENCH=1 npx vitest run bench/
//
// Ignoré par `npm test` (sans la variable d'environnement) : le banc dure
// plusieurs dizaines de secondes et ne teste rien — il **mesure**. Le rapport
// est écrit dans `docs/chantier-29-comparatif-allocation.md`.
// =============================================================

import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  STRATEGIES,
  NORMATIVE,
  EDGE_CASES,
  buildGrid,
  buildPopulation,
  measure,
  checkInvariants,
  type ConfigSpec,
  type RunMetrics,
} from './allocation-bench'

const ENABLED = process.env.ALLOC_BENCH === '1'
const OUT = resolve(__dirname, '../docs/chantier-29-comparatif-allocation.md')

interface Row {
  cfg: ConfigSpec
  byStrategy: Record<string, RunMetrics>
  problems: Record<string, string[]>
}

/**
 * Le banc monopolise le thread plusieurs dizaines de secondes ; sans rendre la
 * main, le worker vitest perd son heartbeat RPC et signale une « unhandled
 * error » purement cosmétique. On cède donc l'event loop entre configurations.
 */
async function runAll(configs: ConfigSpec[]): Promise<Row[]> {
  const rows: Row[] = []
  for (const cfg of configs) {
    const byStrategy: Record<string, RunMetrics> = {}
    const problems: Record<string, string[]> = {}
    for (const s of STRATEGIES) {
      const m = measure(cfg, s.strategy)
      byStrategy[s.key] = m
      problems[s.key] = checkInvariants(cfg, m)
    }
    rows.push({ cfg, byStrategy, problems })
    await new Promise(r => setImmediate(r))
  }
  return rows
}

/** Résumé d'une répartition, lisible d'un coup d'œil. */
function cell(m: RunMetrics): string {
  const frag = m.unmoderatedSeats > 0 ? ` · ${m.unmoderatedSeats} sièges non animés` : ''
  return `**${m.tables} t.**${frag}<br>\`${m.shapeLabel}\``
}

function detailRow(m: RunMetrics): string {
  return [
    `manque anciens **${m.short4}**` + (m.gap4 > 0 ? ` ⚠️ +${m.gap4} vs optimum` : ' ✅'),
    `manque actifs ${m.short1}` + (m.gap1 > 0 ? ` ⚠️ +${m.gap1}` : ''),
    `règle 3 KO ${m.tablesFailingRule3}/${m.tables}`,
    `enregistrables ${m.recordable}`,
    `${m.ms} ms`,
  ].join(' · ')
}

function section(title: string, rows: Row[], detailed: boolean): string {
  const out: string[] = [`\n## ${title}\n`]
  if (!detailed) {
    out.push('| Configuration | ' + STRATEGIES.map(s => s.label).join(' | ') + ' |')
    out.push('|---|' + STRATEGIES.map(() => '---').join('|') + '|')
    for (const r of rows) {
      out.push(
        `| ${r.cfg.label} | ` +
        STRATEGIES.map(s => cell(r.byStrategy[s.key])).join(' | ') +
        ' |',
      )
    }
    return out.join('\n') + '\n'
  }
  for (const r of rows) {
    const pop = buildPopulation(r.cfg)
    out.push(`\n### ${r.cfg.label}\n`)
    out.push(
      `*Population : ${r.cfg.n} participants, ` +
      `${pop.filter(m => m.is_veteran).length} anciens, ` +
      `${pop.filter(m => m.is_active).length} actifs, ` +
      `${pop.filter(m => !m.consents).length} non-consentants, ` +
      `${r.cfg.moderators} modérateur(s).*\n`,
    )
    out.push('| Stratégie | Répartition | Détail |')
    out.push('|---|---|---|')
    for (const s of STRATEGIES) {
      const m = r.byStrategy[s.key]
      const pb = r.problems[s.key].length ? ` 🛑 ${r.problems[s.key].join(', ')}` : ''
      out.push(`| ${s.label} | ${cell(m)}${pb} | ${detailRow(m)} |`)
    }
  }
  return out.join('\n') + '\n'
}

function summary(rows: Row[]): string {
  const out: string[] = ['\n## Synthèse quantitative (grille complète)\n']
  out.push('| Stratégie | Tables (moy.) | **Sièges non animés** (moy.) | Plus grande table non animée (moy.) | Manque actifs (moy.) | Manque anciens (moy.) | Forme retenue exploitée à fond | Temps médian | Temps max |')
  out.push('|---|---|---|---|---|---|---|---|---|')
  for (const s of STRATEGIES) {
    const ms = rows.map(r => r.byStrategy[s.key])
    const avg = (f: (m: RunMetrics) => number) => (ms.reduce((a, m) => a + f(m), 0) / ms.length).toFixed(2)
    const atOpt = ms.filter(m => m.gap4 === 0 && m.gap1 === 0).length
    const times = ms.map(m => m.ms).sort((a, b) => a - b)
    out.push(
      `| ${s.label} | ${avg(m => m.tables)} | **${avg(m => m.unmoderatedSeats)}** | ${avg(m => m.maxUnmoderatedSize)} | ` +
      `${avg(m => m.short1)} | ${avg(m => m.short4)} | ` +
      `${atOpt}/${ms.length} (${Math.round((100 * atOpt) / ms.length)} %) | ` +
      `${times[Math.floor(times.length / 2)]} ms | ${times[times.length - 1]} ms |`,
    )
  }
  out.push('')
  out.push([
    '**Comment lire ces colonnes — et ce qu\'elles ne disent pas :**',
    '',
    '- **Sièges non animés** est la mesure de dégradation pertinente, pas le *nombre* de tables non animées : le §4 préfère explicitement découper la capacité non animée en tables de 5 (« deux tables de 5 valent mieux qu\'une de 10 sans animateur »). Compter les tables pénaliserait donc un comportement voulu.',
    '- **Manque actifs / anciens** = nombre de personnes manquantes cumulé sur toutes les tables pour atteindre les seuils des règles 1 et 4. Directement interprétable, quelle que soit la stratégie.',
    '- ⚠️ **« Forme retenue exploitée à fond »** n\'est *pas* une mesure loyale de la qualité de recherche entre métriques différentes. Elle vérifie que le manque réalisé égale le manque minimal théorique de la forme choisie. Les stratégies en métrique **absolue** optimisent ce manque par construction, donc atteignent 100 % mécaniquement ; les stratégies en **taux** y sont indifférentes (réduire le manque total sans réduire le nombre de tables en échec ne change pas leur score), donc un écart y signifie « objectif indifférent », pas « recherche défaillante ». À ne pas lire comme un classement.',
    '',
    '**La comparaison qui tranche vraiment est scénario par scénario**, en particulier sur les cas de référence ci-dessus — pas sur ces moyennes.',
  ].join('\n'))
  return out.join('\n') + '\n'
}

/**
 * Les moyennes sur la grille écrasent les différences : ce qui se discute, ce
 * sont les configurations où les stratégies ne produisent **pas** la même
 * chose. On les remonte en tête, triées par ampleur du désaccord.
 */
function divergences(rows: Row[], limit = 25): string {
  const scored = rows.map(r => {
    const ms = STRATEGIES.map(s => r.byStrategy[s.key])
    const spread = (f: (m: RunMetrics) => number) =>
      Math.max(...ms.map(f)) - Math.min(...ms.map(f))
    return { r, score: spread(m => m.tables) * 3 + spread(m => m.short4) * 2 + spread(m => m.unmoderatedSeats) }
  })
  const top = scored.filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit)

  const out: string[] = [
    '\n## Configurations où les stratégies divergent le plus\n',
    `*${scored.filter(x => x.score > 0).length} configurations sur ${rows.length} produisent au moins un désaccord ; voici les ${Math.min(limit, top.length)} plus marquées. Ce sont les scénarios à trancher.*\n`,
  ]
  out.push('| Configuration | ' + STRATEGIES.map(s => s.label).join(' | ') + ' |')
  out.push('|---|' + STRATEGIES.map(() => '---').join('|') + '|')
  for (const { r } of top) {
    out.push(
      `| ${r.cfg.label} | ` +
      STRATEGIES.map(s => {
        const m = r.byStrategy[s.key]
        return `${cell(m)}<br>manque anciens ${m.short4}`
      }).join(' | ') + ' |',
    )
  }
  return out.join('\n') + '\n'
}

describe.skipIf(!ENABLED)('banc d\'essai allocation (chantier 29)', () => {
  it('produit le rapport comparatif', async () => {
    const normative = await runAll(NORMATIVE)
    const edge = await runAll(EDGE_CASES)
    // ALLOC_BENCH_QUICK=1 → grille réduite, pour itérer sur le format du rapport.
    const gridSpecs = buildGrid()
    const grid = await runAll(process.env.ALLOC_BENCH_QUICK === '1' ? gridSpecs.slice(0, 8) : gridSpecs)

    const header = [
      '# Chantier 29 — comparatif des pistes de fiabilisation de la recherche d\'allocation',
      '',
      '> Généré par `ALLOC_BENCH=1 npx vitest run bench/` — **ne pas éditer à la main**.',
      '> Source : `bench/allocation-bench.ts`. Spec de référence : `docs/chantier-5-allocation-v2-spec.md`.',
      '',
      '## Ce qui est comparé',
      '',
      '| Clé | Stratégie | Contenu |',
      '|---|---|---|',
      '| A | actuel (taux) | Code de `main`. Règles 1 et 4 scorées en **taux d\'échec** `-échecs/T`. |',
      '| B | formule absolue seule | Seul le score change : **manque total en personnes**. Recherche inchangée. |',
      '| C | recherche fiabilisée seule | Score historique conservé ; budget **par forme**, 6 démarrages, amorce par quotas, voisinage dirigé à camp constant, élagage par borne. |',
      '| D | absolue + recherche fiabilisée | B + C. |',
      '',
      '**Comment lire une cellule** : `10M 10M 6M 5-` = quatre tables de 10, 10, 6 et 5 personnes ; `M` = animée par un modérateur, `-` = sans animateur.',
      '',
      '**Le critère de fragmentation** : à population égale, une répartition qui produit beaucoup de petites tables *dont une majorité sans animateur* est le symptôme que le chantier vise à corriger. Comparer la colonne A aux autres sur les configurations à moins de 40 % d\'anciens.',
      '',
    ].join('\n')

    const body = [
      header,
      section('Cas de référence (à ne casser sous aucun prétexte)', normative, true),
      section('Cas limites et populations dégradées', edge, true),
      divergences(grid),
      summary(grid),
      section('Grille synthétique complète', grid, false),
    ].join('\n')

    mkdirSync(dirname(OUT), { recursive: true })
    writeFileSync(OUT, body, 'utf8')

    // Invariants durs — aucune stratégie n'a le droit de les violer.
    for (const r of [...normative, ...edge, ...grid]) {
      for (const s of STRATEGIES) {
        expect(r.problems[s.key], `${r.cfg.label} / ${s.label}`).toEqual([])
      }
    }
    // eslint-disable-next-line no-console
    console.log(`\nRapport écrit : ${OUT}\n`)
  }, 600_000)
})
