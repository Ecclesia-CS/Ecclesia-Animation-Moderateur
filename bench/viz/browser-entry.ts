// Point d'entrée de bundling pour la page d'exploration — réexporte le vrai
// code (aucune réimplémentation) pour un usage navigateur (curseurs en direct).
export { runAllocation, TABLE_TOTAL_MAX, TABLE_MIN, TABLE_MAX_ACTIVE, SINGLE_TABLE_MAX, veteranThreshold } from '../../src/lib/allocation'
export { buildPopulation, buildModerators } from '../allocation-bench'
