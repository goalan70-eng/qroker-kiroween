/**
 * TEST SUPPORT ONLY - merge/report step of the task 7.2 robustness experiment. Pure functions: per-condition result
 * files in, deterministic JSON and Markdown text out (no timestamps, no timings, no pooling across conditions).
 * SYNTHETIC images, not real cameras.
 */
import {
  MIN_TRIALS_PER_CONDITION,
  PASS_CRITERION_TEXT,
  ROBUSTNESS_BASE_SEED,
  SYNTHETIC_DISCLAIMER,
  totalTrials,
  type Condition,
  type Family,
} from './robustness-design';
import type { ConditionResult } from './robustness-trial';

export type Status = 'COMPLETE' | 'INCOMPLETE' | 'SMOKE';
export type Verdict = 'NO_MISIDENTIFICATION_OBSERVED' | 'FAILED_WITH_FINDINGS' | 'NOT_EVALUATED';

export const STATEMENTS = [
  'Synthetic images, not real cameras.',
  'A zero false-acceptance count is an observation, not a mathematical guarantee.',
] as const;

export interface GroupReport {
  group: string;
  conditions: number;
  trials: number;
  correctRateMin: number;
  correctRateMax: number;
  rejectedRateMin: number;
  rejectedRateMax: number;
  conditionsWithMisidentification: number;
  /** Largest per-condition upper bound among the conditions with zero misidentifications (a maximum, not a pooled bound). */
  maxUpperBound95: number | null;
}

export interface FamilyReport {
  family: Family;
  conditions: number;
  trials: number;
  groups: GroupReport[];
}

export interface Report {
  title: string;
  statements: readonly string[];
  disclaimer: string;
  baseSeed: number;
  passCriterion: string;
  status: Status;
  completeness: {
    plannedConditions: number;
    plannedTrials: number;
    foundConditions: number;
    foundTrials: number;
    missing: string[];
    wrongTrialCount: string[];
    smoke: string[];
  };
  verdict: Verdict;
  conditionsWithMisidentification: string[];
  families: FamilyReport[];
  conditions: ConditionResult[];
}

export interface BuildOptions {
  /** Accept missing conditions and smoke runs (the result is then marked INCOMPLETE or SMOKE and no verdict is given). */
  allowPartial?: boolean;
}

export function buildReport(planned: readonly Condition[], found: ReadonlyMap<string, ConditionResult>, opts: BuildOptions = {}): Report {
  const ordered: ConditionResult[] = [];
  const missing: string[] = [];
  const wrong: string[] = [];
  const smoke: string[] = [];
  for (const c of planned) {
    const r = found.get(c.id);
    if (r === undefined) {
      missing.push(c.id);
      continue;
    }
    ordered.push(r);
    if (r.smokeRun === true) smoke.push(c.id);
    else if (r.n !== c.trials || r.n < MIN_TRIALS_PER_CONDITION) wrong.push(c.id);
  }
  const complete = missing.length === 0 && wrong.length === 0 && smoke.length === 0;
  if (!complete && opts.allowPartial !== true) {
    throw new Error(`incomplete data set: ${missing.length} missing, ${wrong.length} with the wrong n, ${smoke.length} smoke results`);
  }
  const status: Status = complete ? 'COMPLETE' : smoke.length > 0 ? 'SMOKE' : 'INCOMPLETE';
  const withMis = ordered.filter((r) => r.misidentified > 0).map((r) => r.id);
  const verdict: Verdict = !complete ? 'NOT_EVALUATED' : withMis.length === 0 ? 'NO_MISIDENTIFICATION_OBSERVED' : 'FAILED_WITH_FINDINGS';

  const families: FamilyReport[] = (['FLAT', 'PHYSICAL'] as const).map((family) => {
    const rs = ordered.filter((r) => r.family === family);
    const groups: GroupReport[] = [];
    for (const g of [...new Set(rs.map((r) => r.group))]) {
      const gr = rs.filter((r) => r.group === g);
      const bounds = gr.map((r) => r.misidentificationUpperBound95).filter((b): b is number => b !== null);
      groups.push({
        group: g,
        conditions: gr.length,
        trials: gr.reduce((t, r) => t + r.n, 0),
        correctRateMin: Math.min(...gr.map((r) => r.correctRate)),
        correctRateMax: Math.max(...gr.map((r) => r.correctRate)),
        rejectedRateMin: Math.min(...gr.map((r) => r.rejectedRate)),
        rejectedRateMax: Math.max(...gr.map((r) => r.rejectedRate)),
        conditionsWithMisidentification: gr.filter((r) => r.misidentified > 0).length,
        maxUpperBound95: bounds.length === 0 ? null : Math.max(...bounds),
      });
    }
    return { family, conditions: rs.length, trials: rs.reduce((t, r) => t + r.n, 0), groups };
  });

  return {
    title: 'Task 7.2 synthetic-image robustness: results per condition',
    statements: STATEMENTS,
    disclaimer: SYNTHETIC_DISCLAIMER,
    baseSeed: ROBUSTNESS_BASE_SEED,
    passCriterion: PASS_CRITERION_TEXT,
    status,
    completeness: {
      plannedConditions: planned.length,
      plannedTrials: totalTrials(planned),
      foundConditions: ordered.length,
      foundTrials: ordered.reduce((t, r) => t + r.n, 0),
      missing,
      wrongTrialCount: wrong,
      smoke,
    },
    verdict,
    conditionsWithMisidentification: withMis,
    families,
    conditions: ordered,
  };
}

export function renderJson(report: Report): string {
  return JSON.stringify(report, null, 2) + '\n';
}

const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;
const bound = (r: ConditionResult): string =>
  r.misidentificationUpperBound95 === null ? `trials ${r.misidentifiedTrials.map((m) => `${m.trial} (seed ${m.seed})`).join(', ')}` : `${(100 * r.misidentificationUpperBound95).toFixed(2)}%`;
const kinds = (r: ConditionResult): string => {
  const e = Object.entries(r.rejectionKinds);
  return e.length === 0 ? '-' : e.map(([k, v]) => `${k} ${v}`).join(', ');
};

export function renderMarkdown(report: Report): string {
  const L: string[] = [];
  L.push(`# ${report.title}`);
  L.push('');
  for (const s of report.statements) L.push(`**${s}**`);
  L.push('');
  L.push(`Disclaimer text of every result file: ${report.disclaimer}`);
  L.push('');
  L.push(`Base seed ${report.baseSeed}; trial seed = hash of (base seed, condition id, trial index). Every number below belongs to ONE condition: n, counts, rates and bounds are never pooled across conditions, groups or families. The two families (flat layout, physical geometry) are reported separately. Reproduce one trial with \`npm run robustness -- --repro --cell <id> --trial <i>\`.`);
  L.push('');
  L.push('## 1. Pass criterion and verdict');
  L.push('');
  L.push(report.passCriterion);
  L.push('');
  L.push(`Status of the data set: **${report.status}**. Verdict: **${report.verdict}**.`);
  if (report.verdict === 'FAILED_WITH_FINDINGS') {
    L.push('');
    L.push(`Conditions with at least one misidentification (${report.conditionsWithMisidentification.length}): ${report.conditionsWithMisidentification.join(', ')}. Failing seeds are listed per condition in the tables below and in the JSON file.`);
  }
  L.push('');
  const c = report.completeness;
  L.push(`Planned: ${c.plannedConditions} conditions, ${c.plannedTrials} trials. Found: ${c.foundConditions} conditions, ${c.foundTrials} trials. Missing conditions: ${c.missing.length}. Conditions with a wrong n: ${c.wrongTrialCount.length}. Smoke results: ${c.smoke.length}.`);
  L.push('');
  L.push('## 2. Summary per family and group');
  L.push('');
  L.push('Ranges are minimum to maximum over the conditions of the group (each condition has its own n); they are not pooled rates. "Max bound" is the largest per-condition 95% upper bound among conditions with 0 misidentifications.');
  for (const f of report.families) {
    L.push('');
    L.push(`### ${f.family === 'FLAT' ? 'Family A: flat layout' : 'Family B: physical geometry'} (${f.conditions} conditions, ${f.trials} trials)`);
    L.push('');
    L.push('| Group | Conditions | Trials | Correct rate (min - max) | Rejected rate (min - max) | Conditions with a misidentification | Max bound |');
    L.push('|---|---|---|---|---|---|---|');
    for (const g of f.groups) {
      L.push(`| ${g.group} | ${g.conditions} | ${g.trials} | ${pct(g.correctRateMin)} - ${pct(g.correctRateMax)} | ${pct(g.rejectedRateMin)} - ${pct(g.rejectedRateMax)} | ${g.conditionsWithMisidentification} | ${g.maxUpperBound95 === null ? '-' : `${(100 * g.maxUpperBound95).toFixed(2)}%`} |`);
    }
  }
  L.push('');
  L.push('## 3. Every condition');
  L.push('');
  L.push('Misidentified = IDENTIFIED with a wrong card set or sum, or IDENTIFIED for an incomplete composition. The bound 1 - 0.05^(1/n) is the exact one-sided 95% upper confidence bound on the per-trial misidentification probability of that synthetic condition distribution; it is shown only when the count is 0. For incomplete groups (expectation REJECT) the rejected column is the expected outcome.');
  for (const f of report.families) {
    L.push('');
    L.push(`### ${f.family === 'FLAT' ? 'Family A: flat layout' : 'Family B: physical geometry'}`);
    L.push('');
    L.push('| Condition | Expect | n | Correct | Rejected (kinds) | Misidentified | Bound / failing seeds |');
    L.push('|---|---|---|---|---|---|---|');
    for (const r of report.conditions.filter((x) => x.family === f.family)) {
      L.push(`| ${r.id} | ${r.expectation} | ${r.n} | ${r.correct} (${pct(r.correctRate)}) | ${r.rejected} (${pct(r.rejectedRate)}): ${kinds(r)} | ${r.misidentified} | ${bound(r)} |`);
    }
  }
  L.push('');
  L.push('## 4. Limitations');
  L.push('');
  L.push('- Synthetic images drawn by `src/optical/` and `src/optical/testing/`, not real cameras, printers or paper. Paper show-through, lens distortion, rolling shutter, compression and colour are not simulated.');
  L.push('- Conditions are sampled, not exhaustive; interactions between factors are covered only by the combined profiles, the pair conditions and the randomized mixes listed in `robustness-plan.md`.');
  L.push('- Mathematical guarantee and experimental criterion are different things: the guarantee holds only inside the independent-bit-flip model of design.md section 7; for arbitrary image corruption there is no guarantee, and a zero count is an observation in n synthetic trials.');
  L.push('');
  return L.join('\n') + '\n';
}
