// Tests of the final screen (task 19.2). Evidence classes (design.md, "Testing Strategy"):
//   * pure     : `buildEndModel` on REAL `PlayerView`s. Games are run through the real engine and BEGINNER AI: either
//                through the real controller (the screen tests) or through `playGame` (seed sweeps; the controller test
//                of controller.test.ts proves that both reach the same final view). Where a real game cannot produce
//                the case (a tie of the final scores), the view is a MODEL FIXTURE: a clone of a real ENDED view whose
//                `scores` and `ranking` are replaced, `ranking` through the engine's own `rankPlayers`.
//   * fake-DOM : `renderEnd` against the hand-written fake Document of ui/testing/fake-dom.ts with synthetic events and
//                either stub handlers or the REAL controller handlers. NOT a browser: no layout, no real focus, no
//                screen reader.
// The type-level absence of a Guess field is checked by end.test-d.ts (run by `npm run typecheck:game`).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { getStrategy } from '../../ai/registry';
import type { AIStrategy } from '../../ai/strategy';
import { ALL_CARDS } from '../../core/cards';
import { rankPlayers } from '../../core/ranking';
import { replay } from '../../core/replay';
import { defaultConfig } from '../../core/state';
import type { Action, GameConfig, IdentityVisibility, PlayerId } from '../../core/types';
import { viewFor } from '../../core/view';
import type { PlayerView } from '../../core/view';
import { errorMessageKey, resetLanguage, setLanguage, t } from '../../i18n';
import { playGame, strategiesFor } from '../../sim/play-game';
import { createController } from '../controller';
import type { Controller, RenderInput, Schedule } from '../controller';
import { renderWithFocus } from '../dom';
import { regionCells } from '../guess-model';
import { asFake, FakeDocument } from '../testing/fake-dom';
import type { FakeEl } from '../testing/fake-dom';
import { passGate } from '../testing/pass-gate';
import { buildEndModel, END_STRING_KEYS, renderEnd } from './end';
import type { EndDocument, EndHandle, EndInput, EndOpResult, EndOptions } from './end';

afterEach(() => resetLanguage());

// ---------------------------------------------------------------------------------------------------------
// Fixture: real games driven to ENDED
// ---------------------------------------------------------------------------------------------------------

type Kind = 'HUMAN' | 'AI';
const SEAT_IDS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];
const NAMES = ['Alice', 'Bob', 'Carol', 'Dave'] as const;
const ONE_PLUS_THREE: readonly Kind[] = ['HUMAN', 'AI', 'AI', 'AI'];
const TWO_HUMANS: readonly Kind[] = ['HUMAN', 'HUMAN', 'AI', 'AI'];
const FOUR_HUMANS: readonly Kind[] = ['HUMAN', 'HUMAN', 'HUMAN', 'HUMAN'];
const ALL_AI_KINDS: readonly Kind[] = ['AI', 'AI', 'AI', 'AI'];

class Queue {
  readonly fns: (() => void)[] = [];
  readonly schedule: Schedule = (fn) => {
    this.fns.push(fn);
    return {
      cancel: () => {
        const i = this.fns.indexOf(fn);
        if (i >= 0) this.fns.splice(i, 1);
      },
    };
  };
  step(): boolean {
    const fn = this.fns.shift();
    if (fn === undefined) return false;
    fn();
    return true;
  }
}

interface Game {
  readonly ctl: Controller;
  readonly queue: Queue;
  readonly humans: readonly PlayerId[];
  readonly latest: () => RenderInput;
  /** Every Guess value ever submitted in this game (AI and people). Test-only knowledge. */
  readonly guessValues: number[];
}

function seatsOf(kinds: readonly Kind[]): GameConfig['seats'] {
  return kinds.map((kind, i) =>
    kind === 'HUMAN' ? { id: SEAT_IDS[i], kind, name: NAMES[i] } : { id: SEAT_IDS[i], kind, difficulty: 'BEGINNER', name: NAMES[i] },
  ) as unknown as GameConfig['seats'];
}

const configOf = (kinds: readonly Kind[], visibility: IdentityVisibility = 'OWNER_ONLY'): GameConfig => ({
  ...defaultConfig(),
  seats: seatsOf(kinds),
  identityVisibility: visibility,
});

function startGame(kinds: readonly Kind[], seed: number, visibility: IdentityVisibility = 'OWNER_ONLY', randomSeed: () => number = () => seed): Game {
  const queue = new Queue();
  const guessValues: number[] = [];
  let latest: RenderInput | null = null;
  const strategyFor = (difficulty: Parameters<typeof getStrategy>[0]): AIStrategy => {
    const real = getStrategy(difficulty);
    return {
      id: real.id,
      choosePlacement: (view, ctx) => real.choosePlacement(view, ctx),
      chooseGuesses: (view, ctx) => {
        const action = real.chooseGuesses(view, ctx);
        guessValues.push(...Object.values(action.guesses));
        return action;
      },
    };
  };
  const ctl = createController({
    schedule: queue.schedule,
    renderer: (i) => {
      latest = i;
    },
    randomSeed,
    language: () => 'en',
    strategyFor,
  });
  ctl.startGame({ config: configOf(kinds, visibility), seed });
  return { ctl, queue, humans: SEAT_IDS.filter((_, i) => kinds[i] === 'HUMAN'), latest: () => latest as RenderInput, guessValues };
}

const viewOf = (g: Game, seat: PlayerId = 'P0'): PlayerView => g.ctl.getView(seat) as PlayerView;

/** Distinct, high values for the people: 51 - 2 * seat index - key index (4..52). */
const humanGuesses = (seat: PlayerId, keys: readonly string[]): Record<string, number> =>
  Object.fromEntries(keys.map((k, j) => [k, 51 - 2 * SEAT_IDS.indexOf(seat) - j]));

function driveToEnd(g: Game): void {
  for (let i = 0; i < 4000; i++) {
    const view = viewOf(g);
    if (view.phase === 'ENDED') return;
    if (view.phase === 'GUESS_COLLECT') {
      for (const seat of g.humans) {
        const v = viewOf(g, seat);
        if (!v.guessSubmitted[seat]) {
          const values = humanGuesses(seat, v.pendingQuadKeys);
          g.guessValues.push(...Object.values(values));
          passGate(g.ctl);
          g.ctl.dispatchHuman({ type: 'SUBMIT_GUESSES', player: seat, guesses: values });
        }
      }
      while (g.queue.step()) {
        /* AI Seats submit */
      }
    } else if (view.phase === 'REVEAL') {
      if (g.humans.length > 0) {
        passGate(g.ctl);
        g.ctl.dispatchHuman({ type: 'ACK_REVEAL' });
      } else g.queue.step();
    } else if (g.humans.includes(view.turn)) {
      passGate(g.ctl);
      g.ctl.dispatchHuman(getStrategy('BEGINNER').choosePlacement(viewOf(g, view.turn), { decisionSeed: i }) as Action);
    } else if (!g.queue.step()) {
      throw new Error('AI turn without a scheduled step');
    }
  }
  throw new Error('no end');
}

function endedGame(kinds: readonly Kind[], seed = 7, visibility: IdentityVisibility = 'OWNER_ONLY', randomSeed?: () => number): Game {
  const g = startGame(kinds, seed, visibility, randomSeed);
  driveToEnd(g);
  return g;
}

/** A finished all-AI game through `playGame` (a pure sweep helper): its final view for P0, and the engine log. */
function swept(seed: number, visibility: IdentityVisibility = 'OWNER_ONLY') {
  const config = configOf(ALL_AI_KINDS, visibility);
  const result = playGame({ seed, config, strategies: strategiesFor({ P0: 'BEGINNER', P1: 'BEGINNER', P2: 'BEGINNER', P3: 'BEGINNER' }) });
  return { seed, config, log: result.log, view: viewFor(result.final, 'P0') };
}

/** MODEL FIXTURE: a real ENDED view with other final scores; `ranking` comes from the engine's `rankPlayers`. */
function withScores(view: PlayerView, scores: Readonly<Record<PlayerId, number>>): PlayerView {
  return { ...view, scores, ranking: rankPlayers(scores).map((e) => ({ player: e.player, score: e.score, rank: e.rank })) };
}
const scoresOf = (p0: number, p1: number, p2: number, p3: number): Record<PlayerId, number> => ({ P0: p0, P1: p1, P2: p2, P3: p3 });

// ---------------------------------------------------------------------------------------------------------
// Rigs
// ---------------------------------------------------------------------------------------------------------

const asDoc = (d: FakeDocument): EndDocument => d as unknown as EndDocument;
const asRoot = (e: FakeEl): HTMLElement => e as unknown as HTMLElement;

type HandlerName = 'restart' | 'replaySameSeed' | 'abandon';

interface Rig {
  readonly doc: FakeDocument;
  readonly root: FakeEl;
  readonly calls: HandlerName[];
  readonly results: EndOpResult[];
  inputFor(view: PlayerView | null): EndInput;
  mount(view: PlayerView | null, options?: EndOptions): EndHandle;
}

/**
 * A rig whose handlers record their calls. `answer` decides the result of a call; the default asks `real` (the handlers
 * of a live controller) when given, else answers `{ ok: true }`.
 */
function rig(real?: Game, answer?: (name: HandlerName) => EndOpResult | undefined, actionCount = 9): Rig {
  setLanguage('en');
  const doc = new FakeDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const calls: HandlerName[] = [];
  const results: EndOpResult[] = [];
  const call = (name: HandlerName): EndOpResult => {
    calls.push(name);
    const result = answer?.(name) ?? (real === undefined ? { ok: true } : real.latest().handlers[name]());
    results.push(result);
    return result;
  };
  const r: Rig = {
    doc,
    root,
    calls,
    results,
    inputFor: (view) => ({
      view,
      model: { actionCount: real === undefined ? actionCount : real.ctl.getModel().actionCount },
      handlers: { restart: () => call('restart'), replaySameSeed: () => call('replaySameSeed'), abandon: () => call('abandon') },
    }),
    mount: (view, options) => renderEnd(asDoc(doc), asRoot(root), r.inputFor(view), t, options),
  };
  return r;
}

const byId = (doc: FakeDocument, id: string): FakeEl => doc.getElementById(id) as FakeEl;
const tagged = (doc: FakeDocument, tag: string): FakeEl[] => doc.all().filter((el) => el.tagName === tag);
const withClass = (doc: FakeDocument, cls: string): FakeEl[] => doc.all().filter((el) => (el.getAttribute('class') ?? '').split(' ').includes(cls));

function dump(el: FakeEl): string {
  const attrs = [...el.attributes].map(([k, v]) => ` ${k}="${v}"`).join('');
  const own = el.children.length === 0 ? el.textContent : '';
  const tag = el.tagName.replace(/\d/g, '#');
  return `<${tag}${attrs}>${own}${el.children.map(dump).join('')}</${tag}>`;
}

/** Every number a person can read or hear: leaf text and `aria-label` values. */
function visibleNumbers(root: FakeEl): string[] {
  const out: string[] = [];
  const visit = (el: FakeEl): void => {
    if (el.children.length === 0) out.push(...(el.textContent.match(/\d+/g) ?? []));
    out.push(...((el.getAttribute('aria-label') ?? '').match(/\d+/g) ?? []));
    el.children.forEach(visit);
  };
  visit(root);
  return out;
}

/** The numbers the public view legitimately puts on the screen. */
function legitNumbers(view: PlayerView): Set<string> {
  const legit = new Set<string>(['10', '2', '3', '4', '5', '6', '7', '8', '9']); // numeral ranks of the card names
  const model = buildEndModel(view);
  if (model === null) return legit;
  for (const seat of model.ranking) for (const n of [seat.rank, seat.finalScore, seat.revealPoints, seat.endBonusDifference, seat.handCount]) legit.add(String(n));
  for (const entry of model.history) {
    legit.add(String(entry.number));
    for (const code of entry.codes) {
      legit.add(String(code.hiddenSum));
      for (const cell of code.cells) for (const d of cell.match(/\d+/g) ?? []) legit.add(d);
      for (const d of code.quadKey.match(/\d+/g) ?? []) legit.add(d);
    }
    for (const seat of entry.seats) {
      legit.add(String(seat.earned));
      legit.add(String(seat.cumulative));
    }
  }
  return legit;
}

const unexplainedNumbers = (root: FakeEl, view: PlayerView): string[] => {
  const legit = legitNumbers(view);
  return visibleNumbers(root).filter((n) => !legit.has(n));
};

const GUESS_WORDS = /guess|예측|myGuesses|submitted|제출/i;
const CARD_ID = /\b[HDCS]-(?:A|10|[2-9JQK])\b/;
const keysDeep = (value: unknown): string[] =>
  typeof value !== 'object' || value === null
    ? []
    : Array.isArray(value)
      ? value.flatMap(keysDeep)
      : Object.entries(value).flatMap(([k, v]) => [k, ...keysDeep(v)]);

/** The rank cell and name of each ranking row, in DOM order. */
const rankingRows = (doc: FakeDocument): { seat: string; name: string; rankText: string; final: string; tied: boolean }[] =>
  tagged(doc, 'tr')
    .filter((tr) => tr.getAttribute('data-rank') !== null)
    .map((tr) => ({
      seat: tr.getAttribute('data-seat') as string,
      name: tr.children[0]?.children[0]?.textContent ?? '',
      rankText: tr.children[1]?.textContent ?? '',
      final: tr.children[2]?.textContent ?? '',
      tied: (tr.getAttribute('class') ?? '').split(' ').includes('is-tied'),
    }));

// Real games used by several tests (built once; every ENDED view is immutable data).
const GAME_1H = endedGame(ONE_PLUS_THREE, 7);
const VIEW_1H = viewOf(GAME_1H);

// ---------------------------------------------------------------------------------------------------------
// The pure model
// ---------------------------------------------------------------------------------------------------------

describe('buildEndModel [pure, real views]', () => {
  it('is null unless the phase is ENDED and the view has a ranking', () => {
    const fresh = startGame(ONE_PLUS_THREE, 3);
    expect(viewOf(fresh).phase).not.toBe('ENDED');
    expect(buildEndModel(viewOf(fresh))).toBeNull();
    // a game stopped in the middle (some reveals, not over)
    const middle = startGame(ALL_AI_KINDS, 3);
    for (let i = 0; i < 400 && viewOf(middle).history.length < 2; i++) middle.queue.step();
    expect(viewOf(middle).history.length).toBeGreaterThanOrEqual(2);
    expect(viewOf(middle).phase).not.toBe('ENDED');
    expect(buildEndModel(viewOf(middle))).toBeNull();
    // ENDED but without a ranking (a view the engine never produces): still null, never a guess
    expect(buildEndModel({ ...VIEW_1H, ranking: null })).toBeNull();
    expect(buildEndModel(VIEW_1H)).not.toBeNull();
  });

  it('lists every seat once, in the engine ranking order, with the ranks and scores AS SUPPLIED', () => {
    const view = VIEW_1H;
    const model = buildEndModel(view) as NonNullable<ReturnType<typeof buildEndModel>>;
    const ranking = view.ranking as NonNullable<PlayerView['ranking']>;
    expect(model.ranking.map((s) => s.id)).toEqual(ranking.map((e) => e.player));
    expect(model.ranking.map((s) => s.rank)).toEqual(ranking.map((e) => e.rank));
    expect(model.ranking.map((s) => s.finalScore)).toEqual(ranking.map((e) => e.score));
    for (const seat of model.ranking) {
      expect(seat.finalScore).toBe(view.scores[seat.id]);
      expect(seat.name).toBe(NAMES[SEAT_IDS.indexOf(seat.id)]);
      expect(seat.kind).toBe(SEAT_IDS.indexOf(seat.id) === 0 ? 'HUMAN' : 'AI');
      expect(seat.handCount).toBe(view.handCounts[seat.id]);
    }
    expect(new Set(model.ranking.map((s) => s.id)).size).toBe(4);
    expect(model.provisional).toBe(view.rules.scoreConfig.provisional);
  });

  it('is deeply frozen and JSON-serializable', () => {
    const model = buildEndModel(VIEW_1H) as object;
    const frozen = (v: unknown): boolean => typeof v !== 'object' || v === null || (Object.isFrozen(v) && Object.values(v).every(frozen));
    expect(frozen(model)).toBe(true);
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
  });

  it('carries every history record in order, with cells, cards, sums and per-seat points as the record has them', () => {
    const view = VIEW_1H;
    const model = buildEndModel(view) as NonNullable<ReturnType<typeof buildEndModel>>;
    expect(view.history.length).toBeGreaterThan(1);
    expect(model.history).toHaveLength(view.history.length);
    model.history.forEach((entry, i) => {
      const record = view.history[i] as (typeof view.history)[number];
      expect(entry.number).toBe(record.batchIndex + 1);
      expect(entry.number).toBe(i + 1);
      expect(entry.placer).toEqual({ id: record.placer, name: NAMES[SEAT_IDS.indexOf(record.placer)] });
      expect(entry.codes.map((c) => [c.quadKey, c.hiddenSum, [...c.cards]])).toEqual(record.codes.map((c) => [c.quadKey, c.hiddenSum, [...c.cards]]));
      for (const code of entry.codes) {
        expect(code.cells).toEqual([...regionCells(code.quadKey)]);
        expect(code.cells).toHaveLength(4);
        expect(code.cards).toHaveLength(4); // the engine contract, rendered as is
      }
      expect(entry.seats.map((s) => [s.id, s.earned, s.cumulative])).toEqual(record.perPlayer.map((p) => [p.player, p.earned, p.cumulative]));
    });
  });

  it('has no Guess key at any depth and no key from a hand, the deck or the rules configuration', () => {
    for (const kinds of [ONE_PLUS_THREE, TWO_HUMANS, FOUR_HUMANS]) {
      const g = endedGame(kinds, 7);
      const model = buildEndModel(viewOf(g, g.humans[0] as PlayerId));
      const keys = keysDeep(model);
      expect(keys.filter((k) => GUESS_WORDS.test(k))).toEqual([]);
      expect(keys.filter((k) => /hand$|deck|reward|config|log|seed|myHand|board/i.test(k) && k !== 'handCount')).toEqual([]);
      expect(JSON.stringify(model)).not.toMatch(GUESS_WORDS);
      expect(g.guessValues.length).toBeGreaterThan(0); // the fixture really submitted Guesses
    }
  });

  it('is the same for every viewer of one game', () => {
    for (const kinds of [ONE_PLUS_THREE, TWO_HUMANS, FOUR_HUMANS]) {
      const g = endedGame(kinds, 11);
      const models = SEAT_IDS.map((seat) => JSON.stringify(buildEndModel(viewOf(g, seat))));
      expect(new Set(models).size).toBe(1);
    }
  });

  it('is the same model in OWNER_ONLY and FACE_UP for the SAME game (one engine log replayed under both rules)', () => {
    for (const seed of [2, 5, 9]) {
      const owner = swept(seed, 'OWNER_ONLY');
      const faceConfig = { ...owner.config, identityVisibility: 'FACE_UP' as const };
      const replayed = replay(seed, faceConfig, owner.log);
      expect(replayed.ok).toBe(true);
      const faceView = viewFor((replayed as { ok: true; value: Parameters<typeof viewFor>[0] }).value, 'P0');
      expect(faceView.rules.identityVisibility).toBe('FACE_UP');
      expect(JSON.stringify(buildEndModel(faceView))).toBe(JSON.stringify(buildEndModel(owner.view)));
    }
  });
});

describe('score accounting [pure, real games over several seeds]', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  it('the final score is the engine number for every seat, and the pieces add up exactly once (no double counting)', () => {
    for (const seed of SEEDS) {
      const { view } = swept(seed);
      const model = buildEndModel(view) as NonNullable<ReturnType<typeof buildEndModel>>;
      for (const seat of model.ranking) {
        expect(seat.finalScore, `seed ${seed} ${seat.id}`).toBe(view.scores[seat.id]);
        const earned = view.history.reduce((n, r) => n + (r.perPlayer.find((p) => p.player === seat.id)?.earned ?? 0), 0);
        expect(seat.revealPoints, `seed ${seed} ${seat.id}`).toBe(earned);
        expect(seat.revealPoints + seat.endBonusDifference, `seed ${seed} ${seat.id}`).toBe(seat.finalScore);
      }
    }
  });

  it('TEST-SIDE check against the engine: the difference is the hand-empty bonus for exactly the seat with no cards, else 0', () => {
    let withBonus = 0;
    for (const seed of SEEDS) {
      const { view } = swept(seed);
      const bonus = view.rules.scoreConfig.config.handEmptyBonus;
      const model = buildEndModel(view) as NonNullable<ReturnType<typeof buildEndModel>>;
      const empty = SEAT_IDS.filter((s) => view.handCounts[s] === 0);
      for (const seat of model.ranking) {
        const expected = empty.includes(seat.id) ? bonus : 0;
        expect(seat.endBonusDifference, `seed ${seed} ${seat.id}`).toBe(expected);
        if (expected > 0) withBonus++;
      }
      expect(empty.length, `seed ${seed}: one seat ends with no cards`).toBe(1);
    }
    expect(withBonus).toBe(SEEDS.length);
  });

  it('the screen never reads the bonus rule: changing handEmptyBonus in the rules changes nothing in the model', () => {
    const { view } = swept(3);
    const other = {
      ...view,
      rules: { ...view.rules, scoreConfig: { ...view.rules.scoreConfig, config: { ...view.rules.scoreConfig.config, handEmptyBonus: 999 } } },
    } as PlayerView;
    expect(JSON.stringify(buildEndModel(other))).toBe(JSON.stringify(buildEndModel(view)));
  });

  it('a ranking that disagrees with the scores is refused loudly, never resolved silently', () => {
    const view = VIEW_1H;
    const ranking = view.ranking as NonNullable<PlayerView['ranking']>;
    const first = ranking[0] as (typeof ranking)[number];
    const wrongScore = { ...view, ranking: [{ ...first, score: first.score + 1 }, ...ranking.slice(1)] } as PlayerView;
    expect(() => buildEndModel(wrongScore)).toThrow(RangeError);
    const wrongScores = { ...view, scores: { ...view.scores, [first.player]: first.score + 1 } } as PlayerView;
    expect(() => buildEndModel(wrongScores)).toThrow(RangeError);
    const missingSeat = { ...view, ranking: ranking.slice(1) } as PlayerView;
    expect(() => buildEndModel(missingSeat)).toThrow(RangeError);
    const twice = { ...view, ranking: [first, first, ...ranking.slice(2)] } as PlayerView;
    expect(() => buildEndModel(twice)).toThrow(RangeError);
  });
});

describe('ties [pure, MODEL FIXTURES cloned from a real ENDED view]', () => {
  const rows = (view: PlayerView) => (buildEndModel(view) as NonNullable<ReturnType<typeof buildEndModel>>).ranking.map((s) => [s.id, s.rank, s.tied] as const);

  it('1,1,3,4: the two leaders share rank 1, the next seat has rank 3 and is not tied', () => {
    expect(rows(withScores(VIEW_1H, scoresOf(5, 5, 3, 0)))).toEqual([['P0', 1, true], ['P1', 1, true], ['P2', 3, false], ['P3', 4, false]]);
  });
  it('1,2,2,4: a tie below the leader', () => {
    expect(rows(withScores(VIEW_1H, scoresOf(9, 4, 4, 1)))).toEqual([['P0', 1, false], ['P1', 2, true], ['P2', 2, true], ['P3', 4, false]]);
  });
  it('1,1,1,1: all four tied', () => {
    expect(rows(withScores(VIEW_1H, scoresOf(6, 6, 6, 6)))).toEqual([['P0', 1, true], ['P1', 1, true], ['P2', 1, true], ['P3', 1, true]]);
  });
  it('order inside a tie is the engine order (seat order), whatever the input order of the scores', () => {
    const view = withScores(VIEW_1H, scoresOf(2, 8, 8, 5));
    expect(rows(view).map(([id]) => id)).toEqual(['P1', 'P2', 'P3', 'P0']);
    expect(rows(view).map(([, rank]) => rank)).toEqual([1, 1, 3, 4]);
  });
  it('the ranks are displayed as supplied, not recomputed: a supplied 1,1,3,4 stays 1,1,3,4 even for other scores of the same order', () => {
    const view = withScores(VIEW_1H, scoresOf(5, 5, 3, 0));
    const supplied = { ...view, ranking: (view.ranking as NonNullable<PlayerView['ranking']>).map((e, i) => ({ ...e, rank: [1, 1, 3, 4][i] as number })) } as PlayerView;
    expect(rows(supplied).map(([, rank]) => rank)).toEqual([1, 1, 3, 4]);
    // a supplied rank that differs from what the scores would give is shown as supplied (the engine is the authority)
    const odd = { ...view, ranking: (view.ranking as NonNullable<PlayerView['ranking']>).map((e, i) => ({ ...e, rank: [1, 2, 3, 4][i] as number })) } as PlayerView;
    expect(rows(odd).map(([, rank]) => rank)).toEqual([1, 2, 3, 4]);
  });
});

// ---------------------------------------------------------------------------------------------------------
// The screen: structure and text
// ---------------------------------------------------------------------------------------------------------

describe('renderEnd structure [fake-DOM, real game]', () => {
  it('heading, one captioned ranking table, row headers, final scores equal to the engine scores', () => {
    const r = rig();
    const handle = r.mount(VIEW_1H);
    const screen = asFake(handle.element);
    expect(screen.tagName).toBe('section');
    expect(screen.getAttribute('aria-labelledby')).toBe('end-title');
    expect(byId(r.doc, 'end-title').tagName).toBe('h2');
    expect(byId(r.doc, 'end-title').textContent).toBe('Game over');
    const table = withClass(r.doc, 'end-ranking')[0] as FakeEl;
    expect(table.tagName).toBe('table');
    expect(table.children[0]?.tagName).toBe('caption');
    expect(table.children[0]?.textContent).toBe('Final ranking');
    const heads = (table.children[1] as FakeEl).children[0]?.children ?? [];
    expect(heads.map((th) => th.textContent)).toEqual(['Player', 'Rank', 'Final score', 'Points from reveals', 'End bonus (difference)', 'Cards in hand']);
    for (const th of heads) expect(th.getAttribute('scope')).toBe('col');
    const ranking = VIEW_1H.ranking as NonNullable<PlayerView['ranking']>;
    const found = rankingRows(r.doc);
    expect(found.map((row) => row.seat)).toEqual(ranking.map((e) => e.player));
    expect(found.map((row) => row.final)).toEqual(ranking.map((e) => String(VIEW_1H.scores[e.player])));
    expect(found.map((row) => row.name)).toEqual(ranking.map((e) => NAMES[SEAT_IDS.indexOf(e.player)]));
    for (const tr of tagged(r.doc, 'tr').filter((x) => x.getAttribute('data-rank') !== null)) {
      expect(tr.children[0]?.tagName).toBe('th');
      expect(tr.children[0]?.getAttribute('scope')).toBe('row');
      expect(tr.children).toHaveLength(6);
    }
    expect(withClass(r.doc, 'end-note')[0]?.textContent).toContain('final score minus the points from reveals');
  });

  it('one winner: the first row is rank 1 and a row without a shared rank has no tie cue', () => {
    const view = withScores(VIEW_1H, scoresOf(9, 7, 4, 1)); // MODEL FIXTURE for a clean single winner
    const r = rig();
    r.mount(view);
    expect(rankingRows(r.doc).map((row) => row.rankText)).toEqual(['1', '2', '3', '4']);
    expect(withClass(r.doc, 'end-tied')).toHaveLength(0);
    expect(rankingRows(r.doc).some((row) => row.tied)).toBe(false);
  });

  for (const [label, scores, ranks, tiedSeats] of [
    ['1,1,3,4', scoresOf(5, 5, 3, 0), ['1', '1', '3', '4'], ['P0', 'P1']],
    ['1,2,2,4', scoresOf(9, 4, 4, 1), ['1', '2', '2', '4'], ['P1', 'P2']],
    ['1,1,1,1', scoresOf(6, 6, 6, 6), ['1', '1', '1', '1'], ['P0', 'P1', 'P2', 'P3']],
  ] as const) {
    it(`tied scores ${label}: equal rank numbers AND a text cue "tied" (not colour only), in en and ko`, () => {
      const view = withScores(VIEW_1H, scores);
      for (const [lang, cue] of [['en', 'tied'], ['ko', '동점']] as const) {
        const r = rig();
        setLanguage(lang);
        r.mount(view);
        const found = rankingRows(r.doc);
        expect(found.map((row) => (row.rankText.match(/^\d+/) as RegExpMatchArray)[0])).toEqual(ranks);
        const cued = found.filter((row) => row.rankText.includes(cue)).map((row) => row.seat);
        expect(cued.sort(), `${lang}`).toEqual([...tiedSeats].sort());
        expect(found.filter((row) => row.tied).map((row) => row.seat).sort()).toEqual([...tiedSeats].sort());
        expect(withClass(r.doc, 'end-tied').every((el) => el.textContent.includes(cue))).toBe(true);
      }
    });
  }

  it('the final score cell is the engine score even when the score and the reveal points differ (model fixture)', () => {
    const view = withScores(VIEW_1H, scoresOf(40, 30, 20, 10));
    const r = rig();
    r.mount(view);
    expect(rankingRows(r.doc).map((row) => row.final)).toEqual(['40', '30', '20', '10']);
  });

  it('shows per seat the reveal points and the end bonus difference as cells, and they add up to the final score', () => {
    const r = rig();
    r.mount(VIEW_1H);
    for (const tr of tagged(r.doc, 'tr').filter((x) => x.getAttribute('data-rank') !== null)) {
      const [, , final, fromReveals, bonus] = tr.children as FakeEl[];
      expect(Number(fromReveals?.textContent) + Number(bonus?.textContent)).toBe(Number(final?.textContent));
      expect(final?.textContent).toBe(String(VIEW_1H.scores[tr.getAttribute('data-seat') as PlayerId]));
    }
  });

  it('history: every record in order with heading, placer, one section per code, cells, sum, four public cards and a points table', () => {
    const r = rig();
    r.mount(VIEW_1H);
    const history = VIEW_1H.history;
    const batches = withClass(r.doc, 'end-batch');
    expect(batches.map((b) => b.getAttribute('data-batch'))).toEqual(history.map((_, i) => String(i + 1)));
    history.forEach((record, i) => {
      const batch = batches[i] as FakeEl;
      const heading = byId(r.doc, batch.getAttribute('aria-labelledby') as string);
      expect(heading.tagName).toBe('h4');
      expect(heading.textContent).toBe(`Reveal ${i + 1}: the cards were placed by ${NAMES[SEAT_IDS.indexOf(record.placer)]}.`);
      const codes = batch.children.filter((c) => (c.getAttribute('class') ?? '').includes('end-code'));
      expect(codes.map((c) => c.getAttribute('data-quad-key'))).toEqual(record.codes.map((c) => c.quadKey));
      codes.forEach((section, j) => {
        const code = record.codes[j] as (typeof record.codes)[number];
        const title = byId(r.doc, section.getAttribute('aria-labelledby') as string);
        expect(title.tagName).toBe('h5');
        expect(title.textContent).toBe(`Code ${code.quadKey}`);
        const [, cells, sum, list] = section.children as FakeEl[];
        expect(cells?.textContent).toBe(`Board cells: ${regionCells(code.quadKey).join(', ')}`);
        expect(sum?.textContent).toBe(`Hidden sum: ${code.hiddenSum}`);
        expect(list?.getAttribute('aria-label')).toBe(`Revealed cards of code ${code.quadKey}`);
        const faces = (list as FakeEl).children.flatMap((li) => li.children).filter((el) => el.getAttribute('role') === 'img');
        expect(faces).toHaveLength(code.cards.length);
        faces.forEach((face) => expect(face.getAttribute('aria-label')).toMatch(/ of (Hearts|Diamonds|Clubs|Spades)$/));
      });
      const table = batch.children.find((c) => c.tagName === 'table') as FakeEl;
      expect(table.children[0]?.textContent).toBe(`Points of reveal ${i + 1}`);
      const bodyRows = (table.children[2] as FakeEl).children;
      expect(bodyRows.map((tr) => [tr.children[0]?.textContent, tr.children[1]?.textContent, tr.children[2]?.textContent])).toEqual(
        record.perPlayer.map((p) => [NAMES[SEAT_IDS.indexOf(p.player)], String(p.earned), String(p.cumulative)]),
      );
      expect((table.children[1] as FakeEl).children[0]?.children.map((th) => th.textContent)).toEqual(['Player', 'Earned', 'Total']);
    });
  });

  it('a game with a batch of TWO completed codes and several batches renders completely', () => {
    let found: ReturnType<typeof swept> | null = null;
    for (let seed = 1; seed <= 400 && found === null; seed++) {
      const candidate = swept(seed);
      if (candidate.view.history.some((rec) => rec.codes.length === 2) && candidate.view.history.length >= 3) found = candidate;
    }
    expect(found, 'a seed with a two-code batch exists in 1..400').not.toBeNull();
    const view = (found as NonNullable<typeof found>).view;
    const r = rig();
    r.mount(view);
    const expectedCodes = view.history.reduce((n, rec) => n + rec.codes.length, 0);
    expect(withClass(r.doc, 'end-batch')).toHaveLength(view.history.length);
    expect(withClass(r.doc, 'end-code')).toHaveLength(expectedCodes);
    expect(expectedCodes).toBeGreaterThan(view.history.length);
    expect(r.doc.all().filter((el) => el.getAttribute('role') === 'img')).toHaveLength(expectedCodes * 4);
    const twoCode = withClass(r.doc, 'end-batch').find((b) => b.children.filter((c) => (c.getAttribute('class') ?? '').includes('end-code')).length === 2) as FakeEl;
    expect(twoCode).toBeDefined();
    const ids = r.doc.all().map((el) => el.getAttribute('id')).filter((id): id is string => id !== null);
    expect(new Set(ids).size).toBe(ids.length); // heading ids are unique across batches
    expect(unexplainedNumbers(r.root, view)).toEqual([]);
  });

  it('privacy: no CardId and no identity in class, id, data-*, title or aria other than the card name; no owner on a face', () => {
    const r = rig();
    r.mount(VIEW_1H);
    const allowedData = new Set(['data-quad-key', 'data-seat', 'data-rank', 'data-batch', 'data-focus-key']);
    for (const el of r.doc.all()) {
      for (const [name, value] of el.attributes) {
        expect(name, 'no title').not.toBe('title');
        if (name.startsWith('data-')) expect(allowedData.has(name), name).toBe(true);
        expect(value, `${name}=${value}`).not.toMatch(CARD_ID);
      }
      for (const c of (el.getAttribute('class') ?? '').split(' ').filter((x) => x !== '')) {
        expect(c, `class ${c}`).not.toMatch(/^(?:card-face--)?(?:[HDCS]|hearts?|diamonds?|clubs?|spades?|rank-.*|suit-.*)$/i);
      }
    }
    const faces = r.doc.all().filter((el) => el.getAttribute('role') === 'img');
    expect(faces.length).toBeGreaterThanOrEqual(8);
    for (const face of faces) {
      expect(face.hasAttribute('data-owner')).toBe(false);
      expect(face.hasAttribute('data-orientation')).toBe(false);
      expect(face.getAttribute('aria-label')).not.toMatch(/owner|소유자/i);
    }
  });

  it('shows the provisional banner (common string, no number) only when the rules say provisional', () => {
    const r = rig();
    r.mount(VIEW_1H);
    const banner = withClass(r.doc, 'end-banner');
    expect(banner).toHaveLength(1);
    expect(banner[0]?.textContent).toBe('provisional scoring');
    expect(banner[0]?.getAttribute('role')).toBe('note');
    const r2 = rig();
    const off = { ...VIEW_1H, rules: { ...VIEW_1H.rules, scoreConfig: { ...VIEW_1H.rules.scoreConfig, provisional: false } } } as PlayerView;
    r2.mount(off);
    expect(withClass(r2.doc, 'end-banner')).toHaveLength(0);
  });

  it('draws no banner with `banner: false` (a host that mounts components/banner.ts)', () => {
    const r = rig();
    r.mount(VIEW_1H, { banner: false });
    expect(withClass(r.doc, 'end-banner')).toHaveLength(0);
  });

  it('every string key it uses exists in both languages', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      for (const key of END_STRING_KEYS) expect(t(key, { n: 1, name: 'A', key: 'D4', sum: 9, rank: 'K', suit: 'S', cells: 'D4' }), `${lang} ${key}`).not.toBe(key);
    }
  });

  it('renders Korean text after a language change through update, with no missing key anywhere', () => {
    const r = rig();
    const handle = r.mount(VIEW_1H);
    const rematch = byId(r.doc, 'end-rematch');
    setLanguage('ko');
    handle.update(r.inputFor(VIEW_1H));
    expect(byId(r.doc, 'end-title').textContent).toBe('게임 종료');
    expect(byId(r.doc, 'end-rematch')).toBe(rematch); // controls are kept, so the focus survives
    expect(rematch.textContent).toBe('다시 하기');
    expect(byId(r.doc, 'end-replay').textContent).toBe('같은 시드로 다시 하기');
    expect(byId(r.doc, 'end-new-setup').textContent).toBe('새 설정');
    expect(withClass(r.doc, 'end-banner')[0]?.textContent).toBe('임시 점수 규칙');
    const leaves = r.doc.all().filter((el) => el.children.length === 0);
    for (const el of leaves) expect(el.textContent, el.textContent).not.toMatch(/^(?:end|reveal|scoreboard|common|error)\.[A-Za-z.]+$/);
    for (const el of r.doc.all()) expect(el.getAttribute('aria-label') ?? '', 'aria-label').not.toMatch(/^(?:end|reveal|scoreboard|common)\./);
  });
});

describe('no Guess on the screen [fake-DOM, real games]', () => {
  for (const [label, kinds] of [['1 human + 3 AI', ONE_PLUS_THREE], ['2 humans + 2 AI', TWO_HUMANS], ['4 humans', FOUR_HUMANS]] as const) {
    it(`${label}: no Guess label and no number the public view does not explain, in en and ko`, () => {
      const g = endedGame(kinds, 7);
      expect(g.guessValues.length).toBeGreaterThan(0);
      const view = viewOf(g);
      for (const lang of ['en', 'ko'] as const) {
        const r = rig();
        setLanguage(lang);
        r.mount(view);
        expect(dump(r.root), lang).not.toMatch(GUESS_WORDS);
        expect(unexplainedNumbers(r.root, view), lang).toEqual([]);
      }
    });
  }

  it('the number scan has teeth: an injected Guess value is reported', () => {
    const r = rig();
    r.mount(VIEW_1H);
    const legit = legitNumbers(VIEW_1H);
    const stray = ['51', '49', '47', '45', '44', '43'].find((n) => !legit.has(n)) as string;
    const p = r.doc.createElement('p');
    p.textContent = stray;
    r.root.appendChild(p);
    expect(unexplainedNumbers(r.root, VIEW_1H)).toEqual([stray]);
  });

  it('the same screen is rendered for every viewer, for 1, 2 and 4 human seats', () => {
    for (const kinds of [ONE_PLUS_THREE, TWO_HUMANS, FOUR_HUMANS]) {
      const g = endedGame(kinds, 11);
      const texts = SEAT_IDS.map((seat) => {
        const r = rig();
        r.mount(viewOf(g, seat));
        return dump(r.root);
      });
      expect(new Set(texts).size).toBe(1);
    }
  });

  it('OWNER_ONLY and FACE_UP give the identical screen for the same game', () => {
    for (const seed of [2, 5]) {
      const owner = swept(seed, 'OWNER_ONLY');
      const replayed = replay(seed, { ...owner.config, identityVisibility: 'FACE_UP' }, owner.log);
      const faceView = viewFor((replayed as { ok: true; value: Parameters<typeof viewFor>[0] }).value, 'P0');
      const a = rig();
      a.mount(owner.view);
      const b = rig();
      b.mount(faceView);
      expect(dump(b.root)).toBe(dump(a.root));
    }
  });
});

// ---------------------------------------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------------------------------------

describe('controls [fake-DOM, stub handlers]', () => {
  it('three native buttons, in order, with data-focus-key, hints, and the focus on the first one when shown', () => {
    const r = rig();
    const handle = r.mount(VIEW_1H);
    const buttons = tagged(r.doc, 'button');
    expect(buttons.map((b) => b.getAttribute('id'))).toEqual(['end-rematch', 'end-replay', 'end-new-setup']);
    expect(buttons.map((b) => b.textContent)).toEqual(['Rematch', 'Replay same seed', 'New setup']);
    for (const b of buttons) {
      expect(b.getAttribute('type')).toBe('button');
      expect(b.getAttribute('data-focus-key')).toBe(b.getAttribute('id'));
      const hint = byId(r.doc, b.getAttribute('aria-describedby') as string);
      expect(hint.tagName).toBe('p');
      expect(hint.textContent).not.toBe('');
    }
    expect(withClass(r.doc, 'end-controls')[0]?.getAttribute('role')).toBe('group');
    expect(r.doc.activeElement).toBe(buttons[0]);
    expect(handle.mode).toBe('active');
    expect(Object.keys(handle).sort()).toEqual(['dispose', 'element', 'focusFirst', 'mode', 'newSetup', 'rematch', 'replay', 'update']);
  });

  it('Tab order is the DOM order: no focusable element other than the three buttons has a non-negative tabindex', () => {
    const r = rig();
    r.mount(VIEW_1H);
    const focusable = r.doc.all().filter((el) => el.tagName === 'button' || (el.hasAttribute('tabindex') && Number(el.getAttribute('tabindex')) >= 0) || el.tagName === 'a' || el.tagName === 'input');
    expect(focusable.map((el) => el.getAttribute('id'))).toEqual(['end-rematch', 'end-replay', 'end-new-setup']);
    expect(byId(r.doc, 'end-title').getAttribute('tabindex')).toBe('-1');
  });

  for (const [button, method, handler] of [
    ['end-rematch', 'rematch', 'restart'],
    ['end-replay', 'replay', 'replaySameSeed'],
    ['end-new-setup', 'newSetup', 'abandon'],
  ] as const) {
    it(`${button}: a click and the handle method each call ${handler} once`, () => {
      const r = rig(undefined, () => ({ ok: false, reason: 'BUSY' })); // BUSY keeps the control, so both ways can be tried
      const handle = r.mount(VIEW_1H);
      byId(r.doc, button).fire('click');
      expect(r.calls).toEqual([handler]);
      handle[method]();
      expect(r.calls).toEqual([handler, handler]);
    });
  }

  it('after an ok result the handle is spent: a double click, three different buttons in a row and every method do nothing more', () => {
    const r = rig();
    const handle = r.mount(VIEW_1H);
    const rematch = byId(r.doc, 'end-rematch');
    const replayButton = byId(r.doc, 'end-replay');
    const setup = byId(r.doc, 'end-new-setup');
    rematch.fire('click');
    rematch.fire('click');
    replayButton.fire('click');
    setup.fire('click');
    rematch.fire('keydown', { key: 'Enter' });
    handle.rematch();
    handle.replay();
    handle.newSetup();
    expect(r.calls).toEqual(['restart']);
    expect(handle.mode).toBe('sent');
    expect(r.doc.getElementById('end-rematch')).toBeNull();
    const status = byId(r.doc, 'end-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('Leaving the final screen.');
    expect(r.doc.activeElement).toBe(status); // the focus did not fall to the page
    expect(tagged(r.doc, 'button')).toHaveLength(0);
  });

  it('single flight: while one handler runs, the other controls and a repeat do nothing', () => {
    let r: Rig;
    r = rig(undefined, (name) => {
      if (name === 'restart') {
        byId(r.doc, 'end-replay').fire('click');
        byId(r.doc, 'end-new-setup').fire('click');
        byId(r.doc, 'end-rematch').fire('click');
      }
      return { ok: true };
    });
    r.mount(VIEW_1H);
    byId(r.doc, 'end-rematch').fire('click');
    expect(r.calls).toEqual(['restart']);
  });

  it('Enter and Space act once per press and prevent the native click; held, modified and other keys do nothing', () => {
    const r = rig(undefined, () => ({ ok: false, reason: 'BUSY' }));
    r.mount(VIEW_1H);
    const replayButton = byId(r.doc, 'end-replay');
    expect(replayButton.fire('keydown', { key: 'Enter' }).defaultPrevented).toBe(true);
    expect(replayButton.fire('keydown', { key: ' ' }).defaultPrevented).toBe(true);
    expect(r.calls).toEqual(['replaySameSeed', 'replaySameSeed']);
    replayButton.fire('keydown', { key: 'Enter', repeat: true });
    replayButton.fire('keydown', { key: 'Enter', ctrlKey: true });
    replayButton.fire('keydown', { key: 'Enter', altKey: true });
    replayButton.fire('keydown', { key: 'a' });
    replayButton.fire('keydown', { key: 'Tab' });
    expect(r.calls).toHaveLength(2);
  });

  it('shows the localized engine message for an ENGINE refusal and keeps the controls usable', () => {
    const r = rig(undefined, () => ({ ok: false, reason: 'ENGINE', code: 'WRONG_PHASE' }));
    const handle = r.mount(VIEW_1H);
    byId(r.doc, 'end-rematch').fire('click');
    const alert = withClass(r.doc, 'end-engine-error')[0] as FakeEl;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toBe(t(errorMessageKey('WRONG_PHASE')));
    expect(alert.textContent).not.toBe('');
    expect(handle.mode).toBe('active');
    byId(r.doc, 'end-new-setup').fire('click'); // another control may be tried
    expect(r.calls).toEqual(['restart', 'abandon']);
    setLanguage('ko');
    handle.update(r.inputFor(VIEW_1H));
    expect(alert.textContent).toBe(t(errorMessageKey('WRONG_PHASE')));
  });

  it('BUSY shows nothing and keeps the controls; NO_GAME and DISPOSED leave nothing to press (stale)', () => {
    const busy = rig(undefined, () => ({ ok: false, reason: 'BUSY' }));
    const hb = busy.mount(VIEW_1H);
    hb.rematch();
    expect(hb.mode).toBe('active');
    expect(withClass(busy.doc, 'end-engine-error')[0]?.textContent).toBe('');
    expect(tagged(busy.doc, 'button')).toHaveLength(3);
    for (const reason of ['NO_GAME', 'DISPOSED']) {
      const r = rig(undefined, () => ({ ok: false, reason }));
      const handle = r.mount(VIEW_1H);
      handle.replay();
      expect(handle.mode, reason).toBe('stale');
      expect(tagged(r.doc, 'button'), reason).toHaveLength(0);
      expect(byId(r.doc, 'end-status').textContent).toBe('This final screen is out of date.');
      handle.rematch();
      handle.newSetup();
      expect(r.calls, reason).toEqual(['replaySameSeed']);
      expect(withClass(r.doc, 'end-engine-error')[0]?.textContent, reason).toBe('');
    }
  });

  it('a rejected handler that throws does not leave the handle stuck: the controls work again', () => {
    let first = true;
    const r = rig(undefined, () => {
      if (first) {
        first = false;
        throw new Error('boom');
      }
      return { ok: true };
    });
    const handle = r.mount(VIEW_1H);
    expect(() => handle.rematch()).toThrow('boom');
    handle.rematch();
    expect(r.calls).toEqual(['restart', 'restart']);
    expect(handle.mode).toBe('sent');
  });

  it('a model that is not ENDED gets a neutral message and no active control, and nothing is ever called', () => {
    const fresh = startGame(ONE_PLUS_THREE, 3);
    for (const view of [viewOf(fresh), null]) {
      const r = rig();
      const handle = r.mount(view);
      expect(handle.mode).toBe('empty');
      expect(withClass(r.doc, 'end-empty')[0]?.textContent).toBe('There is no final result to show yet.');
      expect(tagged(r.doc, 'button')).toHaveLength(0);
      handle.rematch();
      handle.replay();
      handle.newSetup();
      handle.update(r.inputFor(view));
      setLanguage('ko');
      handle.update(r.inputFor(view));
      expect(withClass(r.doc, 'end-empty')[0]?.textContent).toBe('아직 보여 줄 최종 결과가 없습니다.');
      expect(r.calls).toEqual([]);
      expect(r.doc.activeElement).toBe(byId(r.doc, 'end-title')); // the heading takes the focus
    }
  });

  it('update with another phase or another action count turns the handle stale; it keeps showing the result and sends nothing', () => {
    const r = rig();
    const handle = r.mount(VIEW_1H);
    const fresh = viewOf(startGame(ONE_PLUS_THREE, 3));
    handle.update(r.inputFor(fresh));
    expect(handle.mode).toBe('stale');
    expect(tagged(r.doc, 'button')).toHaveLength(0);
    expect(byId(r.doc, 'end-status').textContent).toBe('This final screen is out of date.');
    expect(withClass(r.doc, 'end-ranking')).toHaveLength(1); // the last final result stays readable
    handle.rematch();
    handle.replay();
    handle.newSetup();
    expect(r.calls).toEqual([]);

    const r2 = rig(undefined, undefined, 9);
    const h2 = r2.mount(VIEW_1H);
    h2.update({ ...r2.inputFor(VIEW_1H), model: { actionCount: 10 } });
    expect(h2.mode).toBe('stale');
    h2.rematch();
    expect(r2.calls).toEqual([]);

    const r3 = rig();
    const h3 = r3.mount(VIEW_1H);
    h3.update(r3.inputFor(null));
    expect(h3.mode).toBe('stale');
  });

  it('a view whose ranking and scores disagree shows an alert instead of a result, and the controls still work', () => {
    const ranking = VIEW_1H.ranking as NonNullable<PlayerView['ranking']>;
    const bad = { ...VIEW_1H, ranking: [{ ...(ranking[0] as (typeof ranking)[number]), score: 999 }, ...ranking.slice(1)] } as PlayerView;
    const r = rig();
    const handle = r.mount(bad);
    expect(handle.mode).toBe('invalid');
    expect(withClass(r.doc, 'end-inconsistent')[0]?.getAttribute('role')).toBe('alert');
    expect(withClass(r.doc, 'end-ranking')).toHaveLength(0);
    expect(r.doc.getElementById('end-rematch')).not.toBeNull();
    handle.newSetup();
    expect(r.calls).toEqual(['abandon']);
  });

  it('dispose removes the element, is idempotent, and later callbacks do nothing', () => {
    const r = rig();
    const handle = r.mount(VIEW_1H);
    const rematch = byId(r.doc, 'end-rematch');
    handle.dispose();
    handle.dispose();
    expect(r.root.children).toHaveLength(0);
    rematch.fire('click');
    handle.rematch();
    handle.replay();
    handle.newSetup();
    handle.update(r.inputFor(VIEW_1H));
    handle.focusFirst();
    expect(r.calls).toEqual([]);
    expect(r.root.children).toHaveLength(0);
  });

  it('disposing from inside the handler (the host replaces the screen while the next one renders) touches nothing afterwards', () => {
    let handle: EndHandle | null = null;
    const r = rig(undefined, () => {
      (handle as EndHandle).dispose();
      return { ok: true };
    });
    handle = r.mount(VIEW_1H);
    handle.rematch();
    expect(r.root.children).toHaveLength(0);
    expect(handle.mode).toBe('active'); // never moved: disposed before the result was read
  });
});

describe('focus [fake-DOM]', () => {
  it('honours autoFocus: false, and focusFirst moves the focus to the first control', () => {
    const r = rig();
    const handle = r.mount(VIEW_1H, { autoFocus: false });
    expect(r.doc.activeElement).toBeNull();
    handle.focusFirst();
    expect(r.doc.activeElement).toBe(byId(r.doc, 'end-rematch'));
  });

  it('keeps the focus on the same control through a language-switch re-render, also with the host-style renderWithFocus', () => {
    const r = rig();
    const handle = r.mount(VIEW_1H);
    for (const id of ['end-replay', 'end-new-setup', 'end-rematch']) {
      byId(r.doc, id).focus();
      setLanguage('ko');
      handle.update(r.inputFor(VIEW_1H));
      expect(r.doc.activeElement, id).toBe(byId(r.doc, id));
      setLanguage('en');
      renderWithFocus(r.doc as never, () => handle.update(r.inputFor(VIEW_1H)));
      expect(r.doc.activeElement, id).toBe(byId(r.doc, id));
    }
  });

  it('the status text takes the focus after a stale update that removes the focused button', () => {
    const r = rig();
    const handle = r.mount(VIEW_1H);
    byId(r.doc, 'end-replay').focus();
    handle.update(r.inputFor(null));
    expect(r.doc.activeElement === null || r.doc.activeElement === byId(r.doc, 'end-status')).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------
// Controls against the REAL controller
// ---------------------------------------------------------------------------------------------------------

describe('controls with the real controller handlers [fake-DOM, real engine]', () => {
  const dealOf = (g: Game): string => JSON.stringify(SEAT_IDS.map((seat) => g.ctl.getView(seat)));

  it('Rematch: the same seats and options with a NEW seed from the injected sequence; the deal changes', () => {
    let draws = 0;
    const seeds = [101, 102];
    const g = endedGame(TWO_HUMANS, 7, 'FACE_UP', () => seeds[draws++] as number);
    const before = viewOf(g);
    const r = rig(g);
    const handle = r.mount(before);
    byId(r.doc, 'end-rematch').fire('click');
    expect(r.calls).toEqual(['restart']);
    expect(r.results).toEqual([{ ok: true }]);
    expect(draws).toBe(1); // exactly one draw for the new seed
    expect(handle.mode).toBe('sent');
    const after = viewOf(g);
    expect(after.phase).not.toBe('ENDED');
    expect(after.rules.seats).toEqual(before.rules.seats); // same seats
    expect(after.rules.identityVisibility).toBe('FACE_UP'); // same options
    expect(after.rules.scoreConfig).toEqual(before.rules.scoreConfig);
    // the new deal is the deal of seed 101: compare with a fresh game started with that seed and the same configuration
    const reference = startGame(TWO_HUMANS, 101, 'FACE_UP');
    expect(dealOf(g)).toBe(dealOf(reference));
    const original = startGame(TWO_HUMANS, 7, 'FACE_UP');
    expect(dealOf(g)).not.toBe(dealOf(original));
  });

  it('Replay same seed: the identical initial deal, no seed drawn', () => {
    let draws = 0;
    const g = endedGame(TWO_HUMANS, 7, 'OWNER_ONLY', () => 100 + draws++);
    const r = rig(g);
    const handle = r.mount(viewOf(g));
    byId(r.doc, 'end-replay').fire('click');
    expect(r.calls).toEqual(['replaySameSeed']);
    expect(r.results).toEqual([{ ok: true }]);
    expect(draws).toBe(0);
    expect(handle.mode).toBe('sent');
    expect(g.ctl.getModel().screen).toBe('GAME');
    expect(g.ctl.getModel().actionCount).toBe(0);
    expect(g.ctl.getView('P0')).toEqual(viewOf(startGame(TWO_HUMANS, 7, 'OWNER_ONLY')));
    for (const seat of SEAT_IDS) expect(g.ctl.getView(seat)).toEqual(startGame(TWO_HUMANS, 7).ctl.getView(seat));
  });

  it('New setup: back to the setup screen without a confirmation', () => {
    const g = endedGame(ONE_PLUS_THREE, 7);
    const r = rig(g);
    r.mount(viewOf(g));
    byId(r.doc, 'end-new-setup').fire('click');
    expect(r.calls).toEqual(['abandon']);
    expect(r.results).toEqual([{ ok: true }]);
    expect(g.ctl.getModel()).toMatchObject({ screen: 'SETUP', viewer: null, actionCount: 0 });
    expect(g.ctl.getView('P0')).toBeNull();
  });

  it('a disposed controller answers DISPOSED and the handle goes inert; a controller without a game answers NO_GAME', () => {
    const g = endedGame(ONE_PLUS_THREE, 7);
    const r = rig(g);
    const handle = r.mount(viewOf(g));
    const handlers = g.latest().handlers;
    g.ctl.dispose();
    expect(handlers.restart()).toEqual({ ok: false, reason: 'DISPOSED' });
    handle.rematch();
    expect(r.results).toEqual([{ ok: false, reason: 'DISPOSED' }]);
    expect(handle.mode).toBe('stale');
    handle.replay();
    expect(r.calls).toEqual(['restart']);

    const g2 = endedGame(ONE_PLUS_THREE, 7);
    const r2 = rig(g2);
    const h2 = r2.mount(viewOf(g2));
    g2.ctl.abandon(); // the game is gone behind the screen
    h2.replay();
    expect(r2.results).toEqual([{ ok: false, reason: 'NO_GAME' }]);
    expect(h2.mode).toBe('stale');
  });

  it('a stale handle after the controller started another game sends nothing', () => {
    const g = endedGame(ONE_PLUS_THREE, 7);
    const r = rig(g);
    const handle = r.mount(viewOf(g));
    g.ctl.replaySameSeed();
    handle.update(r.inputFor(viewOf(g)));
    expect(handle.mode).toBe('stale');
    handle.rematch();
    expect(r.calls).toEqual([]);
  });

  it('the controller renders the next screen inside the call: an update during the handler does not stale the result', () => {
    const g = endedGame(ONE_PLUS_THREE, 7);
    const r = rig(g);
    const handle = r.mount(viewOf(g));
    const off = g.ctl.subscribe(() => handle.update(r.inputFor(viewOf(g))));
    handle.rematch();
    off();
    expect(r.calls).toEqual(['restart']);
    expect(handle.mode).toBe('sent');
  });
});

// ---------------------------------------------------------------------------------------------------------
// Source rules
// ---------------------------------------------------------------------------------------------------------

describe('source and style rules', () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const SOURCE = readFileSync(join(HERE, 'end.ts'), 'utf8');
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('never parses HTML, never touches globals, storage, the console, the network, a clock or a random source', () => {
    expect(CODE).not.toMatch(/inner\s*HTML|outer\s*HTML|insertAdjacentHTML|document\.write/);
    expect(CODE).not.toMatch(/\b(?:window|globalThis|localStorage|sessionStorage|console|fetch|indexedDB|navigator)\b/);
    expect(CODE).not.toMatch(/Math\.random|Date\b|performance\.now|crypto|setTimeout|setInterval/);
  });

  it('has no Guess identifier and no import of the engine, the state or the controller', () => {
    expect(CODE).not.toMatch(/myGuesses|guessSubmitted|SUBMIT_GUESSES/);
    expect(CODE).not.toMatch(/handEmptyBonus|rewardByError|scoreConfig\.config/); // no score rule is read
    for (const m of SOURCE.matchAll(/^import .* from '([^']+)'/gm)) expect(m[1], m[0]).not.toMatch(/core\/(engine|state|deck|replay|rules|ranking|score)|controller|ai\//);
  });

  it('the styles are linked into the production page (task 19.4) and keep the touch target and the focus ring', () => {
    const css = readFileSync(join(HERE, '..', 'styles', 'end.css'), 'utf8');
    expect(css).toMatch(/\.end-button\s*\{[^}]*min-block-size:\s*var\(--touch-min\)/);
    expect(css).toMatch(/\.end-button\s*\{[^}]*min-inline-size:\s*var\(--touch-min\)/);
    expect(css).toMatch(/\.end-button:focus-visible/);
    expect(css).not.toMatch(/url\(|@import|https?:/);
    const html = readFileSync(join(HERE, '..', 'index.html'), 'utf8');
    expect(html).toMatch(/styles\/end\.css/);
  });

  it('ALL_CARDS is the catalogue the privacy scan relies on', () => {
    expect(ALL_CARDS).toHaveLength(52);
  });
});
