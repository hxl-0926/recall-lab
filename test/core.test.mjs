import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractCards, validateGeneratedCards, generateCards } from '../src/cards.mjs';
import { schedule } from '../src/scheduler.mjs';
import { Store } from '../src/store.mjs';

const note = '复习应该使用 {{主动回忆}}。\nA {{transaction}} is {{atomic}}.';
test('cloze extraction has exact provenance and one blank per card', () => {
  const cards = extractCards(note, 'a.md');
  assert.equal(cards.length, 3);
  assert.equal(cards[0].answer, '主动回忆');
  assert.equal(cards[0].line, 1);
  assert.equal(cards[1].question, 'A [____] is atomic.');
  assert.deepEqual(cards, extractCards(note, 'a.md'));
});
test('generated answers must occur in claimed source line', () => {
  assert.throws(() => validateGeneratedCards({ cards: [{ question: 'q', answer: 'invented', line: 1 }] }, note, 'a'));
  assert.equal(validateGeneratedCards({ cards: [{ question: 'q', answer: '主动回忆', line: 1 }] }, note, 'a').length, 1);
});
test('scheduler has exact first intervals, lapse delay and ease floor', () => {
  const card = { interval_days: 0, ease: 2.5, repetitions: 0, lapses: 0 };
  const first = schedule(card, 2, 0);
  assert.equal(first.due_at, 86400000);
  assert.equal(schedule(first, 2, 0).interval_days, 3);
  assert.equal(schedule(card, 0, 0).due_at, 600000);
  assert.equal(schedule({ ...card, ease: 1.3 }, 0, 0).ease, 1.3);
  assert.throws(() => schedule(card, 4, 0));
});
test('imports deduplicate and review keys are idempotent', () => {
  const store = new Store();
  try {
    const cards = extractCards(note, 'a');
    assert.equal(store.import(cards, 0), 3);
    assert.equal(store.import(cards, 0), 0);
    const c = store.due(0)[0];
    const result = store.review(c.id, 2, { eventId: 'e1', expectedVersion: 0, now: 0 });
    assert.equal(result.version, 1);
    assert.equal(store.review(c.id, 2, { eventId: 'e1', expectedVersion: 0, now: 0 }).replayed, true);
    assert.equal(store.stats(0).reviews, 1);
    assert.throws(() => store.review(c.id, 3, { eventId: 'e1', expectedVersion: 1, now: 0 }), /different/);
    assert.throws(() => store.review(c.id, 2, { eventId: 'e2', expectedVersion: 0, now: 0 }), /Stale/);
    assert.equal(store.stats(0).reviews, 1);
  } finally { store.close(); }
});
test('failed bulk import rolls back earlier inserted cards', () => {
  const store = new Store();
  try { assert.throws(() => store.import([extractCards(note, 'a')[0], { id: 'broken' }], 0)); assert.equal(store.stats(0).total, 0); }
  finally { store.close(); }
});
test('file database survives reopen', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'recall-test-'));
  try {
    const file = path.join(directory, 'test.db'), first = new Store(file);
    first.import(extractCards(note, 'a'), 0); first.close();
    const second = new Store(file);
    assert.equal(second.stats(0).total, 3); second.close();
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('Ollama adapter validates generated card source', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ response: JSON.stringify({ cards: [{ question: '学习使用什么？', answer: '主动回忆', line: 1 }] }) }));
  assert.equal((await generateCards(note, 'a', 'test', { fetchImpl }))[0].answer, '主动回忆');
});
