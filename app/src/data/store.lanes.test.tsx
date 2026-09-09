// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HouseholdProvider, useHousehold } from './store';
import { STORAGE_KEYS } from './persist';
import { PRIYA, SAM, category, household, member, purchase } from '../test/fixtures';

// Audit SY-1, the half that needs no sync at all: an edit dispatched from a
// promise continuation (anything after an `await` - a receipt save, a pull's
// hydrate) sits at React's default priority; a tap that edits the household
// before React gets to it renders alone at a higher one. With the save effect
// keyed on `data`, React's rebase then handed out a fresh object on every
// render, the effect re-fired, setMeta re-rendered, and 54 nested commits later
// React threw "Maximum update depth exceeded". Keyed on a commit counter it
// cannot loop. This must stay the FIRST click in this jsdom window: jsdom
// leaves window.event set after a React-handled click, and a later click
// would no longer split lanes.

const blob = () => ({
  version: 1,
  savedAt: '2026-08-30T10:00:00.000Z',
  household: household({ id: 'hh_A', name: 'A home' }),
  members: [member(PRIYA), member(SAM, { color: 'sky' })],
  categories: [category('groceries')],
  transactions: [purchase('t_x', 10), purchase('t_y', 20)],
  goals: [],
  goalContributions: [],
});

type Box = { hh?: ReturnType<typeof useHousehold>; commits: number };
const box: Box = { commits: 0 };

function Probe() {
  box.hh = useHousehold();
  box.commits += 1;
  return h('button', { id: 'edit', onClick: () => box.hh!.updateTransaction('t_y', { title: 'CLICK EDIT' }) }, 'edit');
}

let root: Root | null = null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const micro = async (n: number) => {
  for (let i = 0; i < n; i += 1) await Promise.resolve();
};
async function waitFor(cond: () => boolean, timeoutMs = 5_000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('timeout');
    await sleep(10);
  }
}

let householdWrites = 0;
const errors: string[] = [];
const origSetItem = Storage.prototype.setItem;
const onError = (e: ErrorEvent) => {
  errors.push(e.message);
  e.preventDefault();
};

beforeEach(() => {
  localStorage.clear();
  householdWrites = 0;
  errors.length = 0;
  Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
    if (k === STORAGE_KEYS.household) householdWrites += 1;
    return origSetItem.call(this, k, v);
  };
  window.addEventListener('error', onError);
});
afterEach(() => {
  Storage.prototype.setItem = origSetItem;
  window.removeEventListener('error', onError);
  root?.unmount();
  root = null;
  document.body.innerHTML = '';
});

describe('HouseholdProvider under a lane split (audit SY-1)', () => {
  it('a default-lane edit followed by a discrete click commits both edits without looping', async () => {
    localStorage.setItem(STORAGE_KEYS.household, JSON.stringify(blob()));
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(h(HouseholdProvider, null, h(Probe)));
    await waitFor(() => !!box.hh);
    await sleep(30);
    const writesBefore = householdWrites;
    const commitsBefore = box.commits;

    // Default lane: dispatched from a promise continuation.
    await Promise.resolve();
    box.hh!.updateTransaction('t_x', { title: 'ASYNC EDIT' });
    // Discrete: the user taps something that edits the household before React renders the pending update.
    document.getElementById('edit')!.click();
    await micro(6);
    await sleep(60);

    expect(errors.filter((m) => /Maximum update depth/.test(m))).toEqual([]);
    expect(box.commits - commitsBefore).toBeLessThan(8);
    expect(householdWrites - writesBefore).toBeLessThanOrEqual(3);
    const titles = new Map(box.hh!.transactions.map((t) => [t.id, t.title]));
    expect(titles.get('t_x')).toBe('ASYNC EDIT');
    expect(titles.get('t_y')).toBe('CLICK EDIT');
    // Both edits reached disk in the last save.
    const disk = JSON.parse(localStorage.getItem(STORAGE_KEYS.household)!) as { transactions: Array<{ id: string; title: string }> };
    expect(new Map(disk.transactions.map((t) => [t.id, t.title])).get('t_x')).toBe('ASYNC EDIT');
    expect(new Map(disk.transactions.map((t) => [t.id, t.title])).get('t_y')).toBe('CLICK EDIT');
  }, 20_000);
});
