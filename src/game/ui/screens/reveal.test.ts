// Tests of the public reveal screen (task 18.2). Evidence classes (design.md, "Testing Strategy"):
//   * pure     : `buildRevealModel` on REAL `PlayerView`s (games run through the real controller, engine and BEGINNER AI).
//   * fake-DOM : `renderReveal` against the hand-written fake Document of ui/testing/fake-dom.ts with synthetic events
//                and the REAL `handlers.dispatch`. NOT a browser: no layout, no real focus, no screen reader.
// The type-level absence of a Guess field is checked by reveal.test-d.ts (run by `npm run typecheck:game`).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { getStrategy } from '../../ai/registry';
import type { AIStrategy } from '../../ai/strategy';
import { ALL_CARDS } from '../../core/cards';
import { defaultConfig } from '../../core/state';
import type { Action, GameConfig, IdentityVisibility, PlayerId } from '../../core/types';
import type { PlayerView } from '../../core/view';
import { errorMessageKey, resetLanguage, setLanguage, t } from '../../i18n';
import { createController } from '../controller';
import type { Controller, RenderInput, Schedule } from '../controller';
import { asFake, FakeDocument } from '../testing/fake-dom';
import type { FakeEl } from '../testing/fake-dom';
import { buildRevealModel, REVEAL_STRING_KEYS, renderReveal } from './reveal';
import type { RevealAckAction, RevealDispatchResult, RevealDocument, RevealHandle, RevealInput, RevealOptions } from './reveal';

afterEach(() => resetLanguage());

// ---------------------------------------------------------------------------------------------------------
// Fixture: real games driven to a REVEAL (or ENDED) phase
// ---------------------------------------------------------------------------------------------------------

type Kind = 'HUMAN' | 'AI';
const SEAT_IDS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];
const NAMES = ['Alice', 'Bob', 'Carol', 'Dave'] as const;

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

interface SubmittedGuess {
  readonly batch: number;
  readonly values: readonly number[];
}

interface Game {
  readonly ctl: Controller;
  readonly queue: Queue;
  readonly humans: readonly PlayerId[];
  readonly latest: () => RenderInput;
  /** Every Guess ever submitted in this game (AI and people), tagged with the batch index. Test-only knowledge. */
  readonly guesses: SubmittedGuess[];
}

function startGame(kinds: readonly Kind[], seed: number, visibility: IdentityVisibility = 'OWNER_ONLY'): Game {
  const queue = new Queue();
  const guesses: SubmittedGuess[] = [];
  let latest: RenderInput | null = null;
  const strategyFor = (difficulty: Parameters<typeof getStrategy>[0]): AIStrategy => {
    const real = getStrategy(difficulty);
    return {
      id: real.id,
      choosePlacement: (view, ctx) => real.choosePlacement(view, ctx),
      chooseGuesses: (view, ctx) => {
        const action = real.chooseGuesses(view, ctx);
        guesses.push({ batch: view.history.length, values: Object.values(action.guesses) });
        return action;
      },
    };
  };
  const ctl = createController({
    schedule: queue.schedule,
    renderer: (i) => {
      latest = i;
    },
    randomSeed: () => seed,
    language: () => 'en',
    strategyFor,
  });
  const seats = kinds.map((kind, i) =>
    kind === 'HUMAN'
      ? { id: SEAT_IDS[i], kind, name: NAMES[i] }
      : { id: SEAT_IDS[i], kind, difficulty: 'BEGINNER', name: NAMES[i] },
  ) as unknown as GameConfig['seats'];
  ctl.startGame({ config: { ...defaultConfig(), seats, identityVisibility: visibility }, seed });
  return { ctl, queue, humans: SEAT_IDS.filter((_, i) => kinds[i] === 'HUMAN'), latest: () => latest as RenderInput, guesses };
}

const viewOf = (g: Game, seat: PlayerId): PlayerView => g.ctl.getView(seat) as PlayerView;

/** Distinct, high values for the people: 51 - 2 * seat index - key index (4..52). Unlikely to equal a sum or a score. */
const humanGuesses = (seat: PlayerId, keys: readonly string[]): Record<string, number> =>
  Object.fromEntries(keys.map((k, j) => [k, 51 - 2 * SEAT_IDS.indexOf(seat) - j]));

/** Plays until `stop(view)` holds (checked first, so a REVEAL or ENDED phase can be the stop). */
function drive(g: Game, stop: (view: PlayerView) => boolean): boolean {
  const viewer = (g.humans[0] ?? 'P0') as PlayerId;
  for (let i = 0; i < 4000; i++) {
    const view = viewOf(g, viewer);
    if (stop(view)) return true;
    if (view.phase === 'ENDED') return false;
    if (view.phase === 'GUESS_COLLECT') {
      for (const seat of g.humans) {
        const v = viewOf(g, seat);
        if (!v.guessSubmitted[seat]) {
          const values = humanGuesses(seat, v.pendingQuadKeys);
          g.guesses.push({ batch: v.history.length, values: Object.values(values) });
          g.ctl.dispatchHuman({ type: 'SUBMIT_GUESSES', player: seat, guesses: values });
        }
      }
      while (g.queue.step()) {
        /* AI Seats submit */
      }
    } else if (view.phase === 'REVEAL') {
      g.ctl.dispatchHuman({ type: 'ACK_REVEAL' });
    } else if (g.humans.includes(view.turn)) {
      g.ctl.dispatchHuman(getStrategy('BEGINNER').choosePlacement(viewOf(g, view.turn), { decisionSeed: i }) as Action);
    } else if (!g.queue.step()) {
      throw new Error('AI turn without a scheduled step');
    }
  }
  throw new Error('no end');
}

const seedMemo = new Map<string, number>();
/** A game stopped in `REVEAL` whose reveal has `wanted` codes (and at least `minHistory` earlier reveals). */
function revealGame(kinds: readonly Kind[], wanted: number, visibility: IdentityVisibility = 'OWNER_ONLY', minHistory = 0): Game {
  const stop = (v: PlayerView): boolean =>
    v.phase === 'REVEAL' && v.lastReveal !== null && v.lastReveal.codes.length === wanted && v.history.length > minHistory;
  const memo = `${kinds.join()}|${wanted}|${visibility}|${minHistory}`;
  const known = seedMemo.get(memo);
  if (known !== undefined) {
    const g = startGame(kinds, known, visibility);
    if (!drive(g, stop)) throw new Error('memoized seed no longer works');
    return g;
  }
  for (let seed = 1; seed <= 300; seed++) {
    const g = startGame(kinds, seed, visibility);
    if (drive(g, stop)) {
      seedMemo.set(memo, seed);
      return g;
    }
  }
  throw new Error(`no seed gives a reveal with ${wanted} codes`);
}

function endedGame(kinds: readonly Kind[], seed = 7): Game {
  const g = startGame(kinds, seed);
  if (!drive(g, (v) => v.phase === 'ENDED')) throw new Error('game did not end');
  return g;
}

const ONE_PLUS_THREE: readonly Kind[] = ['HUMAN', 'AI', 'AI', 'AI'];
const TWO_HUMANS: readonly Kind[] = ['HUMAN', 'HUMAN', 'AI', 'AI'];
const FOUR_HUMANS: readonly Kind[] = ['HUMAN', 'HUMAN', 'HUMAN', 'HUMAN'];

// ---------------------------------------------------------------------------------------------------------
// Rig
// ---------------------------------------------------------------------------------------------------------

const asDoc = (d: FakeDocument): RevealDocument => d as unknown as RevealDocument;
const asRoot = (e: FakeEl): HTMLElement => e as unknown as HTMLElement;

interface Rig {
  readonly g: Game;
  readonly doc: FakeDocument;
  readonly root: FakeEl;
  readonly calls: RevealAckAction[];
  readonly results: RevealDispatchResult[];
  inputFor(seat: PlayerId): RevealInput;
  mount(seat: PlayerId, options?: RevealOptions): RevealHandle;
}

function rig(g: Game, override?: (a: RevealAckAction) => RevealDispatchResult | undefined): Rig {
  setLanguage('en');
  const doc = new FakeDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const calls: RevealAckAction[] = [];
  const results: RevealDispatchResult[] = [];
  const r: Rig = {
    g,
    doc,
    root,
    calls,
    results,
    inputFor: (seat) => ({
      view: g.ctl.getView(seat),
      model: g.ctl.getModel(),
      handlers: {
        dispatch: (action) => {
          calls.push(action);
          const result = override?.(action) ?? g.latest().handlers.dispatch(action);
          results.push(result);
          return result;
        },
      },
    }),
    mount: (seat, options) => renderReveal(asDoc(doc), asRoot(root), r.inputFor(seat), t, options),
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

/** The numbers the public record legitimately puts on the screen (sums, points, the reveal number, ranks, key digits). */
function legitNumbers(view: PlayerView): Set<string> {
  const model = buildRevealModel(view);
  const legit = new Set<string>(['10', '2', '3', '4', '5', '6', '7', '8', '9']); // numeral ranks of the card names
  if (model === null) return legit;
  legit.add(String(model.batchIndex + 1));
  for (const code of model.codes) {
    legit.add(String(code.hiddenSum));
    for (const d of code.quadKey.match(/\d+/g) ?? []) legit.add(d);
  }
  for (const seat of model.seats) {
    legit.add(String(seat.earned));
    legit.add(String(seat.cumulative));
    if (seat.finalScore !== null) legit.add(String(seat.finalScore));
  }
  return legit;
}

/** Numbers on screen that the public record does not explain. A Guess value would show up here. */
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

// ---------------------------------------------------------------------------------------------------------
// The pure model
// ---------------------------------------------------------------------------------------------------------

describe('buildRevealModel [pure, real views]', () => {
  it('equals the engine record and the view: codes, cards, sums, earned, cumulative, placer name', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    const view = viewOf(g, 'P0');
    const record = view.lastReveal as NonNullable<PlayerView['lastReveal']>;
    const model = buildRevealModel(view) as NonNullable<ReturnType<typeof buildRevealModel>>;
    expect(model.batchIndex).toBe(record.batchIndex);
    expect(model.placer).toEqual({ id: record.placer, name: NAMES[SEAT_IDS.indexOf(record.placer)] });
    expect(model.codes).toEqual(record.codes.map((c) => ({ quadKey: c.quadKey, cards: [...c.cards], hiddenSum: c.hiddenSum })));
    for (const code of model.codes) expect(code.cards).toHaveLength(4); // the engine contract, rendered as is
    expect(model.seats.map((s) => [s.id, s.earned, s.cumulative])).toEqual(record.perPlayer.map((p) => [p.player, p.earned, p.cumulative]));
    expect(model.seats.map((s) => s.name)).toEqual(record.perPlayer.map((p) => NAMES[SEAT_IDS.indexOf(p.player)]));
    expect(model.seats.every((s) => s.finalScore === null)).toBe(true); // not ENDED
    expect(model.canContinue).toBe(true);
    expect(model.ended).toBe(false);
    expect(model.provisional).toBe(view.rules.scoreConfig.provisional);
    // In REVEAL the record's cumulative equals the view's score (the bonus belongs to ENDED only).
    for (const s of model.seats) expect(s.cumulative).toBe(view.scores[s.id]);
  });

  it('is deeply frozen and JSON-serializable', () => {
    const model = buildRevealModel(viewOf(revealGame(ONE_PLUS_THREE, 1), 'P0')) as object;
    const frozen = (v: unknown): boolean => typeof v !== 'object' || v === null || (Object.isFrozen(v) && Object.values(v).every(frozen));
    expect(frozen(model)).toBe(true);
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
  });

  it('is null without a reveal (a fresh game) and the screen does not need one to exist', () => {
    const g = startGame(ONE_PLUS_THREE, 3);
    expect(viewOf(g, 'P0').lastReveal).toBeNull();
    expect(buildRevealModel(viewOf(g, 'P0'))).toBeNull();
  });

  it('has no Guess key at any depth and no Guess value tied to the submitted Guesses of the game', () => {
    for (const kinds of [ONE_PLUS_THREE, TWO_HUMANS, FOUR_HUMANS]) {
      const g = revealGame(kinds, 1);
      const view = viewOf(g, g.humans[0] as PlayerId);
      const model = buildRevealModel(view);
      expect(keysDeep(model).filter((k) => GUESS_WORDS.test(k))).toEqual([]);
      const text = JSON.stringify(model);
      expect(text).not.toMatch(GUESS_WORDS);
      // The reveal's numbers are exactly the record's: no number outside the record appears in the serialized model.
      const batch = (view.lastReveal as { batchIndex: number }).batchIndex;
      expect(g.guesses.some((s) => s.batch === batch)).toBe(true); // the fixture really submitted Guesses
      const allowed = new Set<number>();
      const collect = (v: unknown): void => {
        if (typeof v === 'number') allowed.add(v);
        else if (typeof v === 'object' && v !== null) Object.values(v).forEach(collect);
      };
      collect(view.lastReveal);
      collect(view.scores);
      const numbers = (text.replace(/"(?:[HDCS]-(?:A|10|[2-9JQK])|P[0-3])"/g, '""').match(/-?\d+/g) ?? []).map(Number).filter((n) => !allowed.has(n));
      // only the digits inside Quad_Keys such as "D4" may remain (they come from the record's own keys)
      const keyDigits = new Set(((view.lastReveal as NonNullable<PlayerView['lastReveal']>).codes.flatMap((c) => c.quadKey.match(/\d+/g) ?? [])).map(Number));
      expect(numbers.filter((n) => !keyDigits.has(n))).toEqual([]);
    }
  });

  it('is the same for every viewer of one game and in both visibility modes (public data only)', () => {
    for (const visibility of ['OWNER_ONLY', 'FACE_UP'] as const) {
      const g = revealGame(FOUR_HUMANS, 1, visibility);
      const models = SEAT_IDS.map((seat) => JSON.stringify(buildRevealModel(viewOf(g, seat))));
      expect(new Set(models).size, visibility).toBe(1);
      const model = buildRevealModel(viewOf(g, 'P0')) as NonNullable<ReturnType<typeof buildRevealModel>>;
      for (const code of model.codes) expect(code.cards.every((c) => ALL_CARDS.includes(c))).toBe(true);
    }
  });

  it('in ENDED shows the view scores as the final column and no continuation', () => {
    const g = endedGame(ONE_PLUS_THREE);
    const view = viewOf(g, 'P0');
    expect(view.phase).toBe('ENDED');
    const model = buildRevealModel(view) as NonNullable<ReturnType<typeof buildRevealModel>>;
    expect(model.ended).toBe(true);
    expect(model.canContinue).toBe(false);
    for (const seat of model.seats) expect(seat.finalScore).toBe(view.scores[seat.id]);
    // the record's own cumulative is kept next to it (before any hand-empty bonus), not replaced
    const record = view.lastReveal as NonNullable<PlayerView['lastReveal']>;
    expect(model.seats.map((s) => s.cumulative)).toEqual(record.perPlayer.map((p) => p.cumulative));
  });

  it('carries the provisional flag from the rules and no point value', () => {
    const view = viewOf(revealGame(ONE_PLUS_THREE, 1), 'P0');
    expect(buildRevealModel(view)?.provisional).toBe(true);
    const off = { ...view, rules: { ...view.rules, scoreConfig: { ...view.rules.scoreConfig, provisional: false } } } as PlayerView;
    expect(buildRevealModel(off)?.provisional).toBe(false);
    expect(keysDeep(buildRevealModel(view)).some((k) => /reward|bonus|config/i.test(k))).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------------------------------------

describe('renderReveal structure [fake-DOM, real engine]', () => {
  for (const wanted of [1, 2]) {
    it(`${wanted} completed code(s): heading, one named section per code, four public cards, sum, points table`, () => {
      const g = revealGame(ONE_PLUS_THREE, wanted);
      const r = rig(g);
      const view = viewOf(g, 'P0');
      const record = view.lastReveal as NonNullable<PlayerView['lastReveal']>;
      const handle = r.mount('P0');
      const screen = asFake(handle.element);
      expect(screen.tagName).toBe('section');
      const title = byId(r.doc, 'reveal-title');
      expect(title.tagName).toBe('h2');
      expect(title.textContent).toBe('Reveal');
      expect(screen.getAttribute('aria-labelledby')).toBe('reveal-title');
      const sections = withClass(r.doc, 'reveal-code');
      expect(sections.map((s) => s.getAttribute('data-quad-key'))).toEqual(record.codes.map((c) => c.quadKey));
      sections.forEach((section, i) => {
        const code = record.codes[i] as (typeof record.codes)[number];
        const heading = byId(r.doc, section.getAttribute('aria-labelledby') as string);
        expect(heading.tagName).toBe('h3');
        expect(heading.textContent).toBe(`Code ${code.quadKey}`);
        expect(withClass(r.doc, 'reveal-sum')[i]?.textContent).toBe(`Hidden sum: ${code.hiddenSum}`);
        const faces = section.children.flatMap((c) => c.children).flatMap((c) => c.children).filter((el) => el.getAttribute('role') === 'img');
        expect(faces).toHaveLength(code.cards.length);
        expect(faces).toHaveLength(4);
        faces.forEach((face) => expect(face.getAttribute('aria-label')).toMatch(/ of (Hearts|Diamonds|Clubs|Spades)$/));
        const list = section.children.find((c) => c.tagName === 'ul') as FakeEl;
        expect(list.getAttribute('aria-label')).toBe(`Revealed cards of code ${code.quadKey}`);
      });
      expect(withClass(r.doc, 'reveal-placer')[0]?.textContent).toBe(
        `Reveal ${record.batchIndex + 1}: the cards were placed by ${NAMES[SEAT_IDS.indexOf(record.placer)]}.`,
      );
    });
  }

  it('the seat table has a caption, column headers, row headers and the record numbers', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    const r = rig(g);
    r.mount('P0');
    const record = viewOf(g, 'P0').lastReveal as NonNullable<PlayerView['lastReveal']>;
    const table = tagged(r.doc, 'table')[0] as FakeEl;
    expect(table.children[0]?.tagName).toBe('caption');
    expect(table.children[0]?.textContent).toBe('Points of this reveal');
    const heads = tagged(r.doc, 'th').filter((th) => th.getAttribute('scope') === 'col');
    expect(heads.map((th) => th.textContent)).toEqual(['Player', 'Earned', 'Total']);
    const rows = tagged(r.doc, 'tr').filter((tr) => tr.getAttribute('data-seat') !== null);
    expect(rows).toHaveLength(record.perPlayer.length);
    rows.forEach((tr, i) => {
      const p = record.perPlayer[i] as (typeof record.perPlayer)[number];
      const [rowHead, earned, total] = tr.children as [FakeEl, FakeEl, FakeEl];
      expect(rowHead.tagName).toBe('th');
      expect(rowHead.getAttribute('scope')).toBe('row');
      expect(rowHead.textContent).toBe(NAMES[SEAT_IDS.indexOf(p.player)]);
      expect(earned.textContent).toBe(String(p.earned));
      expect(total.textContent).toBe(String(p.cumulative));
      expect(tr.children).toHaveLength(3);
    });
  });

  it('privacy: no CardId and no identity in class, id, data-*, title or aria other than the card name; no owner on a face', () => {
    const g = revealGame(ONE_PLUS_THREE, 2);
    const r = rig(g);
    r.mount('P0');
    const allowedData = new Set(['data-quad-key', 'data-seat', 'data-focus-key']);
    for (const el of r.doc.all()) {
      for (const [name, value] of el.attributes) {
        expect(name, 'no title').not.toBe('title');
        if (name.startsWith('data-')) expect(allowedData.has(name), `${name}`).toBe(true);
        expect(value, `${name}=${value}`).not.toMatch(CARD_ID);
      }
      const classes = (el.getAttribute('class') ?? '').split(' ').filter((c) => c !== '');
      for (const c of classes) expect(c, `class ${c}`).not.toMatch(/^(?:card-face--)?(?:[HDCS]|hearts?|diamonds?|clubs?|spades?|rank-.*|suit-.*)$/i);
    }
    const faces = r.doc.all().filter((el) => el.getAttribute('role') === 'img');
    expect(faces.length).toBeGreaterThanOrEqual(8);
    for (const face of faces) {
      expect(face.hasAttribute('data-owner')).toBe(false); // the record has no owner for a revealed card
      expect(face.hasAttribute('data-orientation')).toBe(false);
      expect(face.getAttribute('aria-label')).not.toMatch(/owner|소유자/i);
    }
  });

  it('shows the provisional banner only when the rules say provisional', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    const r = rig(g);
    r.mount('P0');
    const banner = withClass(r.doc, 'reveal-banner');
    expect(banner).toHaveLength(1);
    expect(banner[0]?.textContent).toBe('provisional scoring');
    expect(banner[0]?.getAttribute('role')).toBe('note');
    expect(banner[0]?.textContent).not.toMatch(/\d/); // no point value in the banner

    const r2 = rig(g);
    const view = viewOf(g, 'P0');
    const off = { ...view, rules: { ...view.rules, scoreConfig: { ...view.rules.scoreConfig, provisional: false } } } as PlayerView;
    renderReveal(asDoc(r2.doc), asRoot(r2.root), { ...r2.inputFor('P0'), view: off }, t);
    expect(withClass(r2.doc, 'reveal-banner')).toHaveLength(0);
  });

  it('draws no banner with `banner: false` (a host that mounts components/banner.ts)', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    const r = rig(g);
    renderReveal(asDoc(r.doc), asRoot(r.root), r.inputFor('P0'), t, { banner: false });
    expect(withClass(r.doc, 'reveal-banner')).toHaveLength(0);
    expect(withClass(r.doc, 'reveal-sum').length).toBeGreaterThan(0); // the content is still there
  });

  it('every string key it uses exists in both languages', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      for (const key of REVEAL_STRING_KEYS) expect(t(key, { n: 1, name: 'A', key: 'D4', sum: 9, rank: 'K', suit: 'S' }), `${lang} ${key}`).not.toBe(key);
    }
  });

  it('renders Korean text after a language change through update, keeping the same elements', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    const r = rig(g);
    const handle = r.mount('P0');
    const button = byId(r.doc, 'reveal-continue');
    setLanguage('ko');
    handle.update(r.inputFor('P0'));
    expect(byId(r.doc, 'reveal-title').textContent).toBe('공개');
    expect(byId(r.doc, 'reveal-continue')).toBe(button);
    expect(button.textContent).toBe('계속');
    expect(withClass(r.doc, 'reveal-banner')[0]?.textContent).toBe('임시 점수 규칙');
    expect(tagged(r.doc, 'th').filter((th) => th.getAttribute('scope') === 'col').map((th) => th.textContent)).toEqual(['플레이어', '획득', '누적']);
  });
});

describe('no Guess on the screen [fake-DOM, real engine]', () => {
  for (const [label, kinds] of [['1 human + 3 AI', ONE_PLUS_THREE], ['2 humans + 2 AI', TWO_HUMANS], ['4 humans', FOUR_HUMANS]] as const) {
    for (const visibility of ['OWNER_ONLY', 'FACE_UP'] as const) {
      it(`${label}, ${visibility}: no Guess label, no number the record does not explain, in en and ko`, () => {
        const g = revealGame(kinds, 1, visibility);
        const batch = (viewOf(g, 'P0').lastReveal as { batchIndex: number }).batchIndex;
        expect(g.guesses.filter((s) => s.batch === batch).length).toBeGreaterThanOrEqual(1);
        for (const lang of ['en', 'ko'] as const) {
          const r = rig(g);
          setLanguage(lang);
          r.mount('P0');
          const html = dump(r.root);
          expect(html, `${lang}`).not.toMatch(GUESS_WORDS);
          expect(unexplainedNumbers(r.root, viewOf(g, 'P0')), `${lang}`).toEqual([]);
        }
      });
    }
  }

  it('the number scan has teeth: an injected Guess value is reported', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    const r = rig(g);
    r.mount('P0');
    const view = viewOf(g, 'P0');
    const legit = legitNumbers(view);
    const stray = ['51', '49', '47', '45', '44'].find((n) => !legit.has(n)) as string;
    const p = r.doc.createElement('p');
    p.textContent = stray;
    r.root.appendChild(p);
    expect(unexplainedNumbers(r.root, view)).toEqual([stray]);
  });

  it('the same reveal is rendered for 1, 2 and 4 human Seats and for every viewer', () => {
    for (const kinds of [ONE_PLUS_THREE, TWO_HUMANS, FOUR_HUMANS]) {
      const g = revealGame(kinds, 1);
      const texts = g.humans.map((seat) => {
        const r = rig(g);
        r.mount(seat);
        return dump(r.root);
      });
      expect(new Set(texts).size).toBe(1);
    }
  });
});

describe('continue control [fake-DOM, real engine]', () => {
  it('is a native button with the focus on show, and one activation sends ACK_REVEAL once', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    const r = rig(g);
    const handle = r.mount('P0');
    const button = byId(r.doc, 'reveal-continue');
    expect(button.tagName).toBe('button');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.getAttribute('data-focus-key')).toBe('reveal-continue');
    expect(button.textContent).toBe('Continue');
    expect(r.doc.activeElement).toBe(button);
    expect(handle.mode).toBe('active');
    button.fire('click');
    expect(r.calls).toEqual([{ type: 'ACK_REVEAL' }]);
    expect(r.results[0]).toEqual({ ok: true });
    expect(viewOf(g, 'P0').phase).not.toBe('REVEAL'); // the engine moved on
    expect(handle.mode).toBe('sent');
    expect(r.doc.getElementById('reveal-continue')).toBeNull();
    const status = byId(r.doc, 'reveal-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('Continuing the game.');
    expect(r.doc.activeElement).toBe(status); // the focus did not fall to the page
  });

  it('a double click, a second Enter and acknowledge() after the first send nothing more', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    const r = rig(g);
    const handle = r.mount('P0');
    const button = byId(r.doc, 'reveal-continue');
    button.fire('click');
    button.fire('click');
    button.fire('keydown', { key: 'Enter' });
    handle.acknowledge();
    expect(r.calls).toHaveLength(1);
  });

  it('Enter and Space on the button act once each press and prevent the native click', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    const r = rig(g);
    r.mount('P0');
    const button = byId(r.doc, 'reveal-continue');
    const e = button.fire('keydown', { key: 'Enter' });
    expect(e.defaultPrevented).toBe(true);
    expect(r.calls).toHaveLength(1);
    // a held key and modified keys do nothing (the handle is already used up here; use a fresh one)
    const g2 = revealGame(ONE_PLUS_THREE, 1);
    const r2 = rig(g2);
    r2.mount('P0');
    const b2 = byId(r2.doc, 'reveal-continue');
    b2.fire('keydown', { key: 'Enter', repeat: true });
    b2.fire('keydown', { key: 'Enter', ctrlKey: true });
    b2.fire('keydown', { key: 'a' });
    expect(r2.calls).toHaveLength(0);
    b2.fire('keydown', { key: ' ' });
    expect(r2.calls).toHaveLength(1);
  });

  it('a stale handle sends nothing: the engine moved on, the action count or the phase changed', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    const r = rig(g);
    const handle = r.mount('P0');
    g.ctl.dispatchHuman({ type: 'ACK_REVEAL' }); // somebody else continued
    handle.update(r.inputFor('P0'));
    expect(handle.mode).toBe('stale');
    expect(r.doc.getElementById('reveal-continue')).toBeNull();
    expect(byId(r.doc, 'reveal-status').textContent).toBe('This reveal is out of date.');
    handle.acknowledge();
    expect(r.calls).toHaveLength(0);

    // a changed action count alone (same phase) also stales the handle before it sends
    const g2 = revealGame(ONE_PLUS_THREE, 1);
    const r2 = rig(g2);
    const h2 = r2.mount('P0');
    const input = r2.inputFor('P0');
    const moved: RevealInput = { ...input, model: { actionCount: input.model.actionCount + 1 } };
    h2.update(moved);
    h2.acknowledge();
    expect(h2.mode).toBe('stale');
    expect(r2.calls).toHaveLength(0);
  });

  it('a screen mounted after the phase moved on (no REVEAL) offers no control and sends nothing', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    g.ctl.dispatchHuman({ type: 'ACK_REVEAL' });
    const view = viewOf(g, 'P0');
    expect(view.phase).not.toBe('REVEAL');
    expect(view.lastReveal).not.toBeNull();
    const r = rig(g);
    const handle = r.mount('P0');
    expect(handle.mode).toBe('stale');
    expect(r.doc.getElementById('reveal-continue')).toBeNull();
    handle.acknowledge();
    expect(r.calls).toHaveLength(0);
  });

  it('in ENDED the screen shows the reveal and the final column but no continue control', () => {
    const g = endedGame(ONE_PLUS_THREE);
    const r = rig(g);
    const handle = r.mount('P0');
    const view = viewOf(g, 'P0');
    expect(handle.mode).toBe('ended');
    expect(tagged(r.doc, 'button')).toHaveLength(0);
    expect(r.doc.getElementById('reveal-continue')).toBeNull();
    handle.acknowledge();
    byId(r.doc, 'reveal-status').fire('click');
    expect(r.calls).toHaveLength(0);
    expect(byId(r.doc, 'reveal-status').textContent).toBe('The game is over.');
    const heads = tagged(r.doc, 'th').filter((th) => th.getAttribute('scope') === 'col').map((th) => th.textContent);
    expect(heads).toEqual(['Player', 'Earned', 'Total', 'Final score (including any end-of-game bonus)']);
    const rows = tagged(r.doc, 'tr').filter((tr) => tr.getAttribute('data-seat') !== null);
    for (const tr of rows) {
      const seat = tr.getAttribute('data-seat') as PlayerId;
      expect(tr.children).toHaveLength(4);
      expect(tr.children[3]?.textContent).toBe(String(view.scores[seat]));
    }
    expect(unexplainedNumbers(r.root, view)).toEqual([]);
  });

  it('with no reveal it shows a neutral empty state and no control, and never throws', () => {
    const g = startGame(ONE_PLUS_THREE, 3);
    const r = rig(g);
    const handle = r.mount('P0');
    expect(handle.mode).toBe('empty');
    expect(withClass(r.doc, 'reveal-empty')[0]?.textContent).toBe('There is no reveal to show yet.');
    expect(tagged(r.doc, 'button')).toHaveLength(0);
    handle.acknowledge();
    handle.update({ ...r.inputFor('P0'), view: null });
    expect(r.calls).toHaveLength(0);
    setLanguage('ko');
    handle.update(r.inputFor('P0'));
    expect(withClass(r.doc, 'reveal-empty')[0]?.textContent).toBe('아직 공개할 결과가 없습니다.');
  });

  it('shows the engine message when dispatch is refused and keeps the control', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    const r = rig(g, () => ({ ok: false, reason: 'ENGINE', code: 'WRONG_PHASE' }));
    const handle = r.mount('P0');
    byId(r.doc, 'reveal-continue').fire('click');
    expect(r.calls).toHaveLength(1);
    const alert = withClass(r.doc, 'reveal-engine-error')[0] as FakeEl;
    expect(alert.getAttribute('role')).toBe('alert');
    expect(alert.textContent).toBe(t(errorMessageKey('WRONG_PHASE')));
    expect(alert.textContent).not.toBe('');
    expect(handle.mode).toBe('active');
    expect(r.doc.getElementById('reveal-continue')).not.toBeNull();
    byId(r.doc, 'reveal-continue').fire('click'); // a refused request may be retried
    expect(r.calls).toHaveLength(2);
  });

  it('shows the REAL engine error when the engine already moved on but the host did not re-render', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    const r = rig(g);
    const handle = r.mount('P0');
    g.ctl.dispatchHuman({ type: 'ACK_REVEAL' });
    handle.acknowledge(); // the handle still holds the old input, so it tries
    const result = r.results[0] as RevealDispatchResult;
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('ENGINE');
    const alert = withClass(r.doc, 'reveal-engine-error')[0] as FakeEl;
    expect(alert.textContent).toBe(t(errorMessageKey(result.code as NonNullable<typeof result.code>)));
  });

  it('a BUSY result sends nothing visible and keeps the control for another try', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    const r = rig(g, () => ({ ok: false, reason: 'BUSY' }));
    const handle = r.mount('P0');
    handle.acknowledge();
    expect(handle.mode).toBe('active');
    expect(withClass(r.doc, 'reveal-engine-error')[0]?.textContent).toBe('');
  });

  it('NO_GAME and DISPOSED turn the screen stale', () => {
    for (const reason of ['NO_GAME', 'DISPOSED']) {
      const g = revealGame(ONE_PLUS_THREE, 1);
      const r = rig(g, () => ({ ok: false, reason }));
      const handle = r.mount('P0');
      handle.acknowledge();
      expect(handle.mode, reason).toBe('stale');
    }
  });

  it('a re-render inside dispatch (the controller renders synchronously) does not stale the handle itself', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    const r = rig(g);
    const handle = r.mount('P0');
    const unsubscribe = g.ctl.subscribe(() => handle.update(r.inputFor('P0')));
    handle.acknowledge();
    unsubscribe();
    expect(r.calls).toHaveLength(1);
    expect(handle.mode).toBe('sent');
    expect(byId(r.doc, 'reveal-status').textContent).toBe('Continuing the game.');
  });
});

describe('focus and lifecycle [fake-DOM]', () => {
  it('keeps the focus on the continue button through a re-render, and honours autoFocus: false', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    const r = rig(g);
    const handle = r.mount('P0');
    const button = byId(r.doc, 'reveal-continue');
    expect(r.doc.activeElement).toBe(button);
    handle.update(r.inputFor('P0'));
    expect(r.doc.activeElement).toBe(button);
    setLanguage('ko');
    handle.update(r.inputFor('P0'));
    expect(r.doc.activeElement).toBe(byId(r.doc, 'reveal-continue'));

    const r2 = rig(g);
    r2.mount('P0', { autoFocus: false });
    expect(r2.doc.activeElement).toBeNull();
  });

  it('dispose removes the element, is idempotent, and later calls do nothing', () => {
    const g = revealGame(ONE_PLUS_THREE, 1);
    const r = rig(g);
    const handle = r.mount('P0');
    handle.dispose();
    handle.dispose();
    expect(r.root.children).toHaveLength(0);
    handle.acknowledge();
    handle.update(r.inputFor('P0'));
    expect(r.calls).toHaveLength(0);
    expect(r.root.children).toHaveLength(0);
  });
});

describe('source and string rules', () => {
  const SOURCE = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'reveal.ts'), 'utf8');
  it('never parses HTML, never touches globals, storage or the network, and has no Guess identifier', () => {
    expect(SOURCE).not.toMatch(/inner\s*HTML|outer\s*HTML|insertAdjacentHTML|document\.write/);
    expect(SOURCE).not.toMatch(/\b(?:window|globalThis|localStorage|sessionStorage|console|fetch)\b\s*[.(]/);
    const code = SOURCE.replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/myGuesses|guessSubmitted|SUBMIT_GUESSES/);
  });
});
