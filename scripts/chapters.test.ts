import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ChapterBook, eligibleChapters, type ChapterCandidate } from '../src/sim/chapters';
import { Sim } from '../src/sim/simulation';
import { CHAPTERS } from '../src/ui/chapter-data';

const base = new Sim(12, 'sandbox').alive[0].genome;
const animal = (): ChapterCandidate => ({
  speciesId: 5, name: 'Test lineage', hue: 22, cell: 100, established: true, landCells: 5, landShare: 0.8,
  genome: { ...base, tier: 4, diet: 'omni', habitat: 'terrestrial', size: 5, fur: 0.7, social: 0.8, intel: 0.8, grasp: 0.8, flight: 0 },
});

test('all five local recordings are bundled with their own duration and embedded script', () => {
  assert.equal(new Set(CHAPTERS.map(c => c.id)).size, 5);
  for (const c of CHAPTERS) {
    assert.ok(existsSync(fileURLToPath(c.audio)), c.audio);
    assert.ok(c.duration > 25 && c.duration < 55);
    assert.ok(c.transcript.length > 100);
  }
  assert.ok(CHAPTERS.find(c => c.id === 'mind')!.transcript.endsWith('What does it mean to be alive?'));
  assert.ok(!CHAPTERS[0].transcript.includes('Let there be life')); // absent from the supplied recording
});

test('amphibious genes alone do not trigger landfall; plants and unestablished animals never qualify', () => {
  const c = animal();
  c.genome.habitat = 'amphibious'; c.landShare = 0.2;
  assert.deepEqual(eligibleChapters(c), []);
  c.landShare = 0.8; c.landCells = 1;
  assert.deepEqual(eligibleChapters(c), []);
  c.landCells = 5; c.established = false;
  assert.deepEqual(eligibleChapters(c), []);
  c.established = true; c.genome.diet = 'photo';
  assert.deepEqual(eligibleChapters(c), []);
});

test('mammal-like and questioning-mind chapters require combinations of traits', () => {
  const c = animal();
  assert.deepEqual(eligibleChapters(c), ['shore', 'warmth', 'mind']);
  c.genome.social = 0.1;
  assert.deepEqual(eligibleChapters(c), ['shore']);
  c.genome.flight = 0.8;
  assert.deepEqual(eligibleChapters(c), ['shore', 'flight']);
});

test('qualifying lineages must persist, each chapter unlocks once, and recordings retain the original genome', () => {
  const c = animal(), book = new ChapterBook(c);
  assert.deepEqual(book.observe([c], 8, 100), []);
  assert.deepEqual(book.observe([c], 32, 200), []);
  const added = book.observe([c], 40, 300);
  assert.deepEqual(added.map(c => c.id), ['shore', 'warmth', 'mind']);
  assert.deepEqual(book.observe([c], 48, 400), []);
  c.genome.fur = 0;
  assert.equal(book.records.get('warmth')!.genome.fur, 0.7);
  assert.equal(book.records.get('shore')!.year, 300);
});

test('loss of a qualifying population resets persistence and a new world resets the chapter book', () => {
  const c = animal(), book = new ChapterBook(c);
  book.observe([c], 8, 100);
  book.observe([], 16, 200);
  assert.deepEqual(book.observe([c], 40, 300), []);
  assert.equal(book.observe([c], 72, 400).length, 3);
  assert.deepEqual([...new ChapterBook(c).records.keys()], ['spark']);
});

test('flight can unlock before mammal-like traits and chapters do not impose a fixed sequence', () => {
  const c = animal(), book = new ChapterBook(c);
  c.genome.fur = 0; c.genome.flight = 0.8;
  book.observe([c], 8, 0);
  assert.deepEqual(book.observe([c], 40, 100).map(c => c.id), ['shore', 'flight']);
  assert.equal(book.records.has('warmth'), false);
});
