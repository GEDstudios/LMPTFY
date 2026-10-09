import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PROMPT_LENGTH, normalizePrompt, encodePrompt, decodePrompt, readPromptFromHash, buildShareURL, buildChatGPTURL, startChatGPTHandoff, typingPlan, cursorOrbitPoint, cursorGlidePoint, cursorMotionProgress } from '../core.mjs';

test('shared prompts survive a real URL round trip, including Unicode and reserved characters', () => {
  const prompts = [
    'Explain how Wi-Fi works.', 'כתוב לי מייל בעברית 👋', '日本語で説明してください',
    'What about +, /, %, #, &, =, and ?\nKeep the line breaks.', '<script>alert("hello")</script>',
    'a'.repeat(MAX_PROMPT_LENGTH), '🧑🏽‍💻'.repeat(120),
  ];
  for (const prompt of prompts) {
    for (const speed of ['normal', 'slow']) {
      const url = new URL(buildShareURL('https://example.com/app?old=remove#stale', prompt, speed));
      assert.equal(url.origin, 'https://example.com');
      assert.equal(url.pathname, '/app');
      assert.equal(url.search, '');
      assert.deepEqual(readPromptFromHash(url.hash), { prompt, speed });
      assert.equal(decodePrompt(encodePrompt(prompt)), prompt);
    }
  }
});

test('malformed, empty, oversized, and invalid UTF-8 payloads are rejected', () => {
  for (const bad of ['', '%%', '=', 'A', '_w', 'A'.repeat(12001), btoa('a'.repeat(2001)).replace(/=+$/, '')]) {
    assert.throws(() => decodePrompt(bad), `Should reject ${bad.slice(0, 30)}`);
  }
  assert.throws(() => decodePrompt(btoa('   ').replace(/=+$/, '')));
  assert.throws(() => buildShareURL('https://example.com', '   '));
  assert.throws(() => readPromptFromHash('#p=%3Cscript%3E'));
  assert.equal(readPromptFromHash(''), null);
  assert.equal(readPromptFromHash('#unrelated'), null);
  const hash = `#p=${encodePrompt('hello')}&s=unexpected`;
  assert.equal(readPromptFromHash(hash).speed, 'normal');
  for (const bad of ['#ask=', '#ask=+++', '#ask=%FF', '#ask=%zz', `#ask=${'a'.repeat(2001)}`]) {
    assert.throws(() => readPromptFromHash(bad));
  }
});

test('new links are readable and legacy links preserve their prompt and speed parameter', () => {
  assert.equal(buildShareURL('https://example.com/project/', 'Why is the sky blue?'),
    'https://example.com/project/#ask=Why+is+the+sky+blue%3F');
  const unicodeLink = buildShareURL('https://example.com/', 'שלום 👋');
  assert.equal(unicodeLink, 'https://example.com/#ask=שלום+👋');
  assert.deepEqual(readPromptFromHash(new URL(unicodeLink).hash), { prompt: 'שלום 👋', speed: 'slow' });
  const oldPrompt = 'An older link & its question שלום 👋';
  for (const speed of ['normal', 'slow']) {
    const hash = `#p=${encodePrompt(oldPrompt)}${speed === 'slow' ? '&s=slow' : ''}`;
    assert.deepEqual(readPromptFromHash(hash), { prompt: oldPrompt, speed });
  }
});

test('ChatGPT handoff uses an HTTPS ChatGPT URL and preserves the prompt safely', () => {
  const prompt = 'hello&next=https://example.com/#fragment שלום';
  const url = new URL(buildChatGPTURL(prompt));
  assert.equal(url.origin, 'https://chatgpt.com');
  assert.equal(url.searchParams.get('prompt'), prompt);
  assert.equal(url.searchParams.has('q'), false);
  assert.equal([...url.searchParams].length, 1);
});

test('handoff leaves four seconds for the punchline, preserves the draft, and redirects exactly once', () => {
  const ticks = [], destinations = [], queue = [], intervals = [];
  startChatGPTHandoff('Explain this & that שלום 👋', {
    onTick: seconds => ticks.push(seconds),
    navigate: url => destinations.push(url),
    setTimer: (fn, ms) => { intervals.push(ms); queue.push(fn); return fn; },
    clearTimer: () => {},
  });
  assert.deepEqual(ticks, [4]);
  assert.equal(destinations.length, 0);
  for (let i = 0; i < 3; i++) queue.shift()();
  assert.equal(destinations.length, 0);
  const finalTick = queue.shift();
  finalTick();
  finalTick();
  assert.deepEqual(ticks, [4, 3, 2, 1, 0]);
  assert.deepEqual(intervals, [1000, 1000, 1000, 1000]);
  assert.equal(destinations.length, 1);
  assert.equal(new URL(destinations[0]).searchParams.get('prompt'), 'Explain this & that שלום 👋');
});

test('cancelling for replay, exit, or stay-here prevents stale navigation', () => {
  const queue = [], destinations = [], cleared = [];
  const cancel = startChatGPTHandoff('A prompt', {
    onTick: () => {},
    navigate: url => destinations.push(url),
    setTimer: fn => { queue.push(fn); return fn; },
    clearTimer: timer => cleared.push(timer),
  });
  queue.shift()();
  const pending = queue.shift();
  cancel();
  assert.deepEqual(cleared, [pending]);
  pending();
  assert.equal(destinations.length, 0);
  assert.equal(queue.length, 0);
});

test('typing keeps every visible character intact at a half-second cadence, even for long prompts', () => {
  for (const prompt of ['Explain how Wi-Fi works.', '🧑🏽‍💻 שלום', 'e\u0301', 'x'.repeat(2000), '!?'.repeat(1000)]) {
    for (const legacySpeed of ['normal', 'slow']) {
      const plan = typingPlan(prompt, legacySpeed);
      assert.equal(plan.chars.join(''), prompt);
      assert.equal(plan.interval, 500);
      assert.equal(plan.duration, Math.max(0, plan.chars.length - 1) * 500);
    }
  }
  assert.deepEqual(typingPlan('🧑🏽‍💻').chars, ['🧑🏽‍💻']);
  assert.deepEqual(typingPlan('e\u0301').chars, ['e\u0301']);
});

test('long prompts never accelerate or skip letters', () => {
  const plan = typingPlan('x'.repeat(2000));
  assert.equal(plan.chars.length, 2000);
  assert.equal(plan.duration, 999500);
  assert.equal(typingPlan('').duration, 0);
  assert.equal(typingPlan('A').duration, 0);
});

test('normalization is predictable for empty values and the prompt limit', () => {
  assert.equal(normalizePrompt(null), '');
  assert.equal(normalizePrompt({}), '');
  assert.equal(normalizePrompt('  hello  '), 'hello');
  assert.equal(normalizePrompt('a'.repeat(2200)).length, MAX_PROMPT_LENGTH);
  const boundary = normalizePrompt('a'.repeat(1999) + '😀');
  assert.equal(boundary, 'a'.repeat(1999));
  assert.equal(decodePrompt(encodePrompt(boundary)), boundary);
});

test('the cursor makes a complete clockwise loop around the composer', () => {
  const rect = { left: 300, right: 1068, top: 330, bottom: 440 };
  const viewport = { width: 1440, height: 900 };
  const points = [0, .25, .5, .75, 1].map(progress => cursorOrbitPoint(rect, viewport, progress));
  assert.ok(points[0].y < rect.top);
  assert.ok(points[1].x > rect.right);
  assert.ok(points[2].y > rect.bottom);
  assert.ok(points[3].x < rect.left);
  assert.ok(Math.abs(points[0].x - points[4].x) < .001);
  assert.ok(Math.abs(points[0].y - points[4].y) < .001);
  assert.ok(Math.abs(points[4].tilt) < .001);
});

test('the complete cursor stays visible on narrow and short screens throughout the loop', () => {
  const sizes = [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 667, height: 375 }];
  for (const viewport of sizes) {
    const rect = { left: 14, right: viewport.width - 14, top: viewport.height / 2, bottom: viewport.height / 2 + 110 };
    for (let frame = 0; frame <= 100; frame++) {
      const point = cursorOrbitPoint(rect, viewport, frame / 100);
      assert.ok(point.x >= 8 && point.x + 36 <= viewport.width + .001);
      assert.ok(point.y >= 8 && point.y + 42 <= viewport.height + .001);
      assert.ok(Math.abs(point.tilt) <= 10);
    }
  }
});


test('cursor glides begin and end gently, follow an arc, and land exactly on their target', () => {
  const from = { x: 80, y: 100, tilt: 10 };
  const to = { x: 250, y: 280, tilt: 0 };
  const point = t => cursorGlidePoint(from, to, t);
  assert.deepEqual(point(0), from);
  assert.deepEqual(point(1), to);
  assert.ok(point(.5).y < (from.y + to.y) / 2, 'The transition should follow a curve');
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const middleStep = distance(point(.5), point(.501));
  assert.ok(distance(point(0), point(.001)) < middleStep / 100);
  assert.ok(distance(point(.999), point(1)) < middleStep / 100);
  assert.equal(cursorMotionProgress(0), 0);
  assert.equal(cursorMotionProgress(1), 1);
  assert.ok(cursorMotionProgress(.001) < .00001);
});

test('curved cursor transitions remain within the mobile viewport', () => {
  for (const [from, to] of [
    [{ x: 8, y: 8 }, { x: 284, y: 526 }],
    [{ x: 284, y: 526 }, { x: 8, y: 8 }],
    [{ x: 160, y: 230 }, { x: 270, y: 320 }],
  ]) {
    for (let i = 0; i <= 100; i++) {
      const point = cursorGlidePoint(from, to, i / 100);
      assert.ok(point.x >= 8 - 1e-8 && point.x <= 284 + 1e-8);
      assert.ok(point.y >= 8 - 1e-8 && point.y <= 526 + 1e-8);
    }
  }
});
