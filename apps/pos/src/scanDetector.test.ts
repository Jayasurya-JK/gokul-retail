// Unit tests for the scanner detector. Run: npm test -w @gokul/pos (Node's built-in test runner, no extra packages).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScanDetector, type ScanStep } from './scanDetector.ts';

/** Feeds `text` then Enter, `gap` ms between keys, starting at `t0`. Returns every step and the time after Enter. */
function type(d: ScanDetector, text: string, gap: number, t0 = 1000, enter = true): { steps: ScanStep[]; t: number } {
  const steps: ScanStep[] = [];
  let t = t0;
  for (const ch of text) {
    steps.push(d.key(ch, t));
    t += gap;
  }
  if (enter) steps.push(d.key('Enter', t));
  return { steps, t };
}
const scans = (steps: ScanStep[]) => steps.flatMap((s) => (s.scan ? [s.scan] : []));
const released = (steps: ScanStep[]) => steps.map((s) => s.release ?? '').join('');

test('a fast burst ended by Enter is a scan and nothing leaks', () => {
  const d = new ScanDetector({ gapMs: 30, minLen: 3 });
  const { steps } = type(d, '8904000000011', 8);
  assert.deepEqual(scans(steps), ['8904000000011']);
  assert.ok(steps.every((s) => s.swallow), 'every key, Enter included, is kept away from the page');
  assert.equal(released(steps), '');
  assert.equal(d.holding, false);
});

test('shop codes with letters scan too (G123, shifted capitals)', () => {
  const d = new ScanDetector();
  assert.deepEqual(scans(type(d, 'G123', 10).steps), ['G123']);
  assert.deepEqual(scans(type(d, 'GK2611O', 12, 5000).steps), ['GK2611O']);
});

test('typing by hand is never a scan: every key comes back, in order', () => {
  const d = new ScanDetector({ gapMs: 30, minLen: 3 });
  const { steps } = type(d, '1234', 120);
  assert.deepEqual(scans(steps), []);
  // the last digit and Enter: Enter hands the last held digit back and is not swallowed
  assert.equal(released(steps), '1234');
  assert.equal(steps.at(-1)?.swallow, false);
});

test('human typing then flush gives the held character back', () => {
  const d = new ScanDetector();
  assert.deepEqual(d.key('a', 100), { swallow: true });
  assert.equal(d.holding, true);
  assert.equal(d.flush(), 'a');
  assert.equal(d.holding, false);
  assert.equal(d.flush(), '');
});

test('a scan right after human typing is still a scan', () => {
  const d = new ScanDetector({ gapMs: 30, minLen: 3 });
  const a = type(d, '5*', 150, 1000, false); // person types the quantity prefix
  const b = type(d, '890400', 6, a.t + 600);
  // the typed quantity prefix comes back in full: '5' when '*' arrives, '*' when the scan's first digit arrives
  assert.equal(released(a.steps) + released(b.steps), '5*');
  assert.deepEqual(scans(b.steps), ['890400']);
});

test('the threshold decides: 35 ms apart is typing at gap 30 and a scan at gap 40', () => {
  const slow = type(new ScanDetector({ gapMs: 30, minLen: 3 }), '12345', 35);
  assert.deepEqual(scans(slow.steps), []);
  const ok = type(new ScanDetector({ gapMs: 40, minLen: 3 }), '12345', 35);
  assert.deepEqual(scans(ok.steps), ['12345']);
});

test('a burst shorter than the minimum length is typing even if fast', () => {
  const d = new ScanDetector({ gapMs: 30, minLen: 3 });
  const { steps } = type(d, '42', 5);
  assert.deepEqual(scans(steps), []);
  assert.equal(released(steps), '42');
});

test('a burst without Enter is not a scan', () => {
  const d = new ScanDetector();
  const { steps } = type(d, '8904000000011', 8, 1000, false);
  assert.deepEqual(scans(steps), []);
  assert.equal(d.flush(), '8904000000011');
});

test('slow Enter after a fast burst is typing', () => {
  const d = new ScanDetector({ gapMs: 30, minLen: 3 });
  const { steps, t } = type(d, '12345', 5, 1000, false);
  const e = d.key('Enter', t + 200);
  assert.equal(e.scan, undefined);
  assert.equal(e.release, '12345');
  assert.equal(e.swallow, false);
  assert.deepEqual(scans(steps), []);
});

test('other keys end the burst and give the text back (Tab, arrows, shortcuts, key repeat)', () => {
  const d = new ScanDetector();
  d.key('a', 100);
  d.key('b', 105);
  const s = d.key('ArrowDown', 108);
  assert.equal(s.release, 'ab');
  assert.equal(s.swallow, false);
  assert.equal(d.key('F2', 200).release, undefined);
});

test('two scans back to back (the same item twice) are two scans', () => {
  const d = new ScanDetector({ gapMs: 30, minLen: 3 });
  const a = type(d, '8904000000011', 7, 1000);
  const b = type(d, '8904000000011', 7, a.t + 60);
  const c = type(d, '8904000000011', 7, b.t + 60);
  assert.deepEqual([...scans(a.steps), ...scans(b.steps), ...scans(c.steps)], ['8904000000011', '8904000000011', '8904000000011']);
});

test('hold time: short for one character, longer once a scan has started', () => {
  const d = new ScanDetector({ gapMs: 30, minLen: 3 });
  d.key('1', 0);
  assert.equal(d.holdMs, 45);
  d.key('2', 5);
  assert.ok(d.holdMs >= 120);
});

test('Enter alone and an empty buffer pass straight through', () => {
  const d = new ScanDetector();
  assert.deepEqual(d.key('Enter', 50), { swallow: false });
  assert.deepEqual(d.key('Tab', 60), { swallow: false });
});
