// Tests of the scoreboard (task 18.2): the pure model on REAL `PlayerView`s (games run through the real controller,
// engine and BEGINNER AI) and the component on the hand-written fake Document of ui/testing/fake-dom.ts (fake-DOM
// evidence class: no layout, no screen reader).
import { afterEach, describe, expect, it } from 'vitest';
import { getStrategy } from '../../ai/registry';
import { defaultConfig } from '../../core/state';
import type { Action, GameConfig, PlayerId } from '../../core/types';
import type { PlayerView } from '../../core/view';
import { resetLanguage, setLanguage, t } from '../../i18n';
import { createController } from '../controller';
import type { Controller, Schedule } from '../controller';
import { FakeDocument } from '../testing/fake-dom';
import type { FakeEl } from '../testing/fake-dom';
import { ACTIVE_GLYPH, buildScoreboardModel, renderScoreboard, SCOREBOARD_STRING_KEYS } from './scoreboard';

afterEach(() => resetLanguage());

const SEAT_IDS: readonly PlayerId[] = ['P0', 'P1', 'P2', 'P3'];
const NAMES = ['Alice', 'Bob', 'Carol', 'Dave'] as const;

/** A game whose Seats are all AI except `humans`; the test drives the AI queue and acknowledges reveals itself. */
function game(humans: readonly PlayerId[], seed: number): { ctl: Controller; step: () => boolean } {
  const fns: (() => void)[] = [];
  const schedule: Schedule = (fn) => {
    fns.push(fn);
    return { cancel: () => void fns.splice(fns.indexOf(fn) >>> 0, 1) };
  };
  const ctl = createController({ schedule, renderer: () => undefined, randomSeed: () => seed, language: () => 'en' });
  const seats = SEAT_IDS.map((id, i) =>
    humans.includes(id) ? { id, kind: 'HUMAN', name: NAMES[i] } : { id, kind: 'AI', difficulty: 'BEGINNER', name: NAMES[i] },
  ) as unknown as GameConfig['seats'];
  ctl.startGame({ config: { ...defaultConfig(), seats }, seed });
  return {
    ctl,
    step: () => {
      const fn = fns.shift();
      if (fn === undefined) return false;
      fn();
      return true;
    },
  };
}

/** Steps an all-AI game until `stop(view)` holds; REVEAL is acknowledged on the way (unless it is the stop). */
function playTo(seed: number, stop: (view: PlayerView) => boolean): { view: PlayerView; ctl: Controller } {
  const g = game(['P0'], seed); // one person: without a person the controller acknowledges a reveal by itself
  for (let i = 0; i < 5000; i++) {
    const view = g.ctl.getView('P0') as PlayerView;
    if (stop(view)) return { view, ctl: g.ctl };
    if (view.phase === 'ENDED') throw new Error('ended before the stop');
    if (view.phase === 'REVEAL') g.ctl.dispatchHuman({ type: 'ACK_REVEAL' });
    else if (view.phase === 'GUESS_COLLECT' && !view.guessSubmitted.P0) {
      g.ctl.dispatchHuman({ type: 'SUBMIT_GUESSES', player: 'P0', guesses: Object.fromEntries(view.pendingQuadKeys.map((k) => [k, 20])) });
    } else if (view.phase === 'PLACEMENT' && view.turn === 'P0') {
      g.ctl.dispatchHuman(getStrategy('BEGINNER').choosePlacement(view, { decisionSeed: i }) as Action);
    } else if (!g.step()) throw new Error('stuck');
  }
  throw new Error('no stop');
}

/** Stops in phase once the deck has at most deckAtMost cards (the deck starts with 32 and only shrinks). */
const atPhase = (phase: PlayerView['phase'], deckAtMost = 32) => (v: PlayerView): boolean => v.phase === phase && v.deckCount <= deckAtMost;

const tagged = (doc: FakeDocument, tag: string): FakeEl[] => doc.all().filter((el) => el.tagName === tag);
const classOf = (el: FakeEl): string[] => (el.getAttribute('class') ?? '').split(' ');

function mount(view: PlayerView): { doc: FakeDocument; root: FakeEl; handle: ReturnType<typeof renderScoreboard> } {
  setLanguage('en');
  const doc = new FakeDocument();
  const root = doc.createElement('div');
  doc.body.appendChild(root);
  const handle = renderScoreboard(doc as unknown as Document, root as unknown as HTMLElement, view, t);
  return { doc, root, handle };
}

describe('buildScoreboardModel [pure, real views]', () => {
  it('equals the view: names, kinds, scores, Hand counts, deck count, provisional flag', () => {
    const { view } = playTo(5, atPhase('PLACEMENT', 28));
    const model = buildScoreboardModel(view);
    expect(model.rows.map((r) => r.id)).toEqual(['P0', 'P1', 'P2', 'P3']);
    for (const [i, row] of model.rows.entries()) {
      const seat = view.rules.seats[i] as PlayerView['rules']['seats'][number];
      expect(row.name).toBe(seat.name);
      expect(row.kind).toBe(seat.kind);
      expect(row.score).toBe(view.scores[seat.id]);
      expect(row.handCount).toBe(view.handCounts[seat.id]);
    }
    expect(model.deckCount).toBe(view.deckCount);
    expect(model.provisional).toBe(view.rules.scoreConfig.provisional);
    expect(model.provisional).toBe(true);
  });

  it('marks the turn Seat during PLACEMENT only; nobody in GUESS_COLLECT, REVEAL and ENDED', () => {
    const placement = playTo(5, atPhase('PLACEMENT', 28)).view;
    expect(buildScoreboardModel(placement).rows.filter((r) => r.active).map((r) => r.id)).toEqual([placement.turn]);
    for (const phase of ['GUESS_COLLECT', 'REVEAL', 'ENDED'] as const) {
      const view = playTo(5, atPhase(phase)).view;
      expect(view.phase).toBe(phase);
      expect(buildScoreboardModel(view).rows.some((r) => r.active), phase).toBe(false);
    }
  });

  it('is deeply frozen, serializable, and holds no private data or Guess', () => {
    const { view } = playTo(5, atPhase('GUESS_COLLECT'));
    const model = buildScoreboardModel(view);
    const frozen = (v: unknown): boolean => typeof v !== 'object' || v === null || (Object.isFrozen(v) && Object.values(v).every(frozen));
    expect(frozen(model)).toBe(true);
    expect(Object.keys(model).sort()).toEqual(['deckCount', 'provisional', 'rows']);
    expect(Object.keys(model.rows[0] as object).sort()).toEqual(['active', 'handCount', 'id', 'kind', 'name', 'score']);
    expect(JSON.stringify(model)).not.toMatch(/guess|hiddenSum|log|pending|myHand|board/i);
  });

  it('reads the provisional flag from the rules (false when the rules say so) and carries no point value', () => {
    const { view } = playTo(5, atPhase('PLACEMENT', 30));
    const off = { ...view, rules: { ...view.rules, scoreConfig: { ...view.rules.scoreConfig, provisional: false } } } as PlayerView;
    expect(buildScoreboardModel(off).provisional).toBe(false);
    expect(JSON.stringify(buildScoreboardModel(view))).not.toMatch(/reward|bonus/i);
  });
});

describe('renderScoreboard [fake-DOM]', () => {
  it('is an accessible table: caption, three column headers, a row header per Seat, values from the view', () => {
    const { view } = playTo(5, atPhase('PLACEMENT', 28));
    const { doc } = mount(view);
    const table = tagged(doc, 'table')[0] as FakeEl;
    expect(table.children[0]?.tagName).toBe('caption');
    expect(table.children[0]?.textContent).toBe('Scoreboard');
    const heads = tagged(doc, 'th').filter((th) => th.getAttribute('scope') === 'col');
    expect(heads.map((th) => th.textContent)).toEqual(['Player', 'Score', 'Cards in hand']);
    const rows = tagged(doc, 'tr').filter((tr) => tr.getAttribute('data-seat') !== null);
    expect(rows).toHaveLength(4);
    rows.forEach((tr, i) => {
      const id = SEAT_IDS[i] as PlayerId;
      const [rowHead, score, hand] = tr.children as [FakeEl, FakeEl, FakeEl];
      expect(rowHead.tagName).toBe('th');
      expect(rowHead.getAttribute('scope')).toBe('row');
      expect(rowHead.textContent.startsWith(NAMES[i] as string)).toBe(true);
      expect(rowHead.textContent).toContain(i === 0 ? '(person)' : '(AI)'); // the public seat kind
      expect(score.textContent).toBe(String(view.scores[id]));
      expect(hand.textContent).toBe(String(view.handCounts[id]));
    });
    expect(doc.all().find(el => classOf(el).includes('deck-count'))?.textContent).toBe(`Cards left in the deck: ${view.deckCount}`);
  });

  it('shows the Seat kind from the rules for people and AI', () => {
    const g = game(['P0', 'P2'], 5);
    const view = g.ctl.getView('P0') as PlayerView;
    const { doc } = mount(view);
    const heads = tagged(doc, 'tr').filter((tr) => tr.getAttribute('data-seat') !== null).map((tr) => tr.children[0]?.textContent);
    expect(heads).toEqual(['Alice (person)', 'Bob (AI)', 'Carol (person)', 'Dave (AI)'].map((s, i) => (i === 0 ? `${s} ${ACTIVE_GLYPH} current turn` : s)));
  });

  it('marks the active Seat with text, a glyph and the class is-active, and no other Seat', () => {
    const { view } = playTo(5, atPhase('PLACEMENT', 28));
    const { doc } = mount(view);
    const rows = tagged(doc, 'tr').filter((tr) => tr.getAttribute('data-seat') !== null);
    const active = rows.filter((tr) => classOf(tr).includes('is-active'));
    expect(active.map((tr) => tr.getAttribute('data-seat'))).toEqual([view.turn]);
    const head = (active[0] as FakeEl).children[0] as FakeEl;
    expect(head.textContent).toContain('current turn'); // text, not colour alone
    expect(head.textContent).toContain(ACTIVE_GLYPH);
    for (const tr of rows.filter((r) => r !== active[0])) {
      expect(tr.textContent).not.toContain('current turn');
      expect(classOf(tr)).not.toContain('is-active');
    }
    // the glyph itself is decoration for assistive technology; the words carry the meaning
    const glyph = head.children[head.children.length - 1]?.children[0] as FakeEl;
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks nobody in REVEAL and ENDED', () => {
    for (const phase of ['REVEAL', 'ENDED'] as const) {
      const { doc } = mount(playTo(5, atPhase(phase)).view);
      expect(doc.all().some((el) => classOf(el).includes('is-active')), phase).toBe(false);
      expect(doc.all().some((el) => el.textContent === 'current turn'), phase).toBe(false);
    }
  });

  it('shows the provisional banner with the common text only while provisional is true', () => {
    const { view } = playTo(5, atPhase('PLACEMENT', 30));
    const on = mount(view);
    const banner = on.doc.all().filter((el) => classOf(el).includes('scoreboard-banner'));
    expect(banner).toHaveLength(1);
    expect(banner[0]?.textContent).toBe('provisional scoring');
    expect(banner[0]?.getAttribute('role')).toBe('note');
    expect(banner[0]?.textContent).not.toMatch(/\d/);
    const off = { ...view, rules: { ...view.rules, scoreConfig: { ...view.rules.scoreConfig, provisional: false } } } as PlayerView;
    const none = mount(off);
    expect(none.doc.all().some((el) => classOf(el).includes('scoreboard-banner'))).toBe(false);
  });

  it('draws no banner with `banner: false` (a host that mounts components/banner.ts), and the rest is unchanged', () => {
    const { view } = playTo(5, atPhase('PLACEMENT', 30));
    const plain = mount(view);
    const doc = new FakeDocument();
    const root = doc.createElement('div');
    doc.body.appendChild(root);
    renderScoreboard(doc as unknown as Document, root as unknown as HTMLElement, view, t, { banner: false });
    expect(doc.all().some((el) => classOf(el).includes('scoreboard-banner'))).toBe(false);
    expect(doc.all().length).toBe(plain.doc.all().length - 1);
  });

  it('update re-renders from the newest view, in Korean after a language change; dispose removes the element', () => {
    const first = playTo(5, atPhase('PLACEMENT', 30)).view;
    const later = playTo(5, atPhase('PLACEMENT', 10)).view;
    const { doc, root, handle } = mount(first);
    const element = handle.element;
    setLanguage('ko');
    handle.update(later);
    expect(handle.element).toBe(element);
    expect(tagged(doc, 'caption')[0]?.textContent).toBe('점수판');
    expect(tagged(doc, 'th').filter((th) => th.getAttribute('scope') === 'col').map((th) => th.textContent)).toEqual(['플레이어', '점수', '손패 수']);
    const rows = tagged(doc, 'tr').filter((tr) => tr.getAttribute('data-seat') !== null);
    rows.forEach((tr, i) => expect(tr.children[1]?.textContent).toBe(String(later.scores[SEAT_IDS[i] as PlayerId])));
    expect(doc.all().find((el) => classOf(el).includes('deck-count'))?.textContent).toBe(`남은 덱 카드: ${later.deckCount}장`);
    expect(doc.all().find((el) => classOf(el).includes('scoreboard-banner'))?.textContent).toBe('임시 점수 규칙');
    expect(rows.some((tr) => tr.textContent.includes('현재 차례'))).toBe(true);
    handle.dispose();
    handle.dispose();
    handle.update(first);
    expect(root.children).toHaveLength(0);
  });

  it('shows no private data: no Guess word, no card identity, no board, only public seat and score labels', () => {
    const { view } = playTo(5, atPhase('GUESS_COLLECT'));
    const { doc } = mount(view);
    const text = doc.all().map((el) => `${[...el.attributes].filter(([k, v]) => k !== 'aria-hidden' || v !== 'true').map(([k, v]) => `${k}=${v}`).join(' ')} ${el.children.length === 0 ? el.textContent : ''}`).join('\n');
    expect(text).not.toMatch(/guess|예측|hidden|pending/i);
    expect(text).not.toMatch(/\b[HDCS]-(?:A|10|[2-9JQK])\b/);
    for (const el of doc.all()) {
      for (const [name, value] of el.attributes) {
        if (name === 'data-label') expect(value).toBe('Score');
        else if (name.startsWith('data-')) expect(name).toBe('data-seat');
      }
    }
  });

  it('draws one anonymous back per held card and removes the top card when the deck runs out', () => {
    const { view } = playTo(5, atPhase('PLACEMENT', 28));
    const { doc, handle } = mount(view);
    for (const count of [4, 3, 1, 0]) {
      handle.update({ ...view, deckCount: count, handCounts: { ...view.handCounts, P0: count } });
      const backs = doc.all().filter(el => classOf(el).includes('seat-card-back'));
      expect(backs).toHaveLength(count + view.handCounts.P1 + view.handCounts.P2 + view.handCounts.P3);
      const stack = doc.all().find(el => classOf(el).includes('deck-stack'))!;
      expect(stack.getAttribute('style')).toBe(`--deck-count: ${count}`);
      expect(stack.children.some(el => classOf(el).includes('table-card-back'))).toBe(count > 0);
      expect(doc.all().find(el => classOf(el).includes('deck-number'))?.textContent).toBe(String(count));
    }
  });

  it('every string key it uses exists in both languages', () => {
    for (const lang of ['en', 'ko'] as const) {
      setLanguage(lang);
      for (const key of SCOREBOARD_STRING_KEYS) expect(t(key, { count: 3 }), `${lang} ${key}`).not.toBe(key);
    }
  });
});
