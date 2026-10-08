import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PROMPT_LENGTH, normalizePrompt, encodePrompt, decodePrompt, readPromptFromHash, buildShareURL, buildChatGPTURL, startChatGPTHandoff, typingPlan, cursorOrbitPoint } from '../core.mjs';

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
});

test('ChatGPT handoff uses an HTTPS ChatGPT URL and preserves the prompt safely', () => {
  const prompt = 'hello&next=https://example.com/#fragment שלום';
  const url = new URL(buildChatGPTURL(prompt));
  assert.equal(url.origin, 'https://chatgpt.com');
  assert.equal(url.searchParams.get('prompt'), prompt);
  assert.equal(url.searchParams.has('q'), false);
  assert.equal([...url.searchParams].length, 1);
});

test('handoff leaves six seconds for the punchline, preserves the draft, and redirects exactly once', () => {
  const ticks = [], destinations = [], queue = [];
  startChatGPTHandoff('Explain this & that שלום 👋', {
    onTick: seconds => ticks.push(seconds),
    navigate: url => destinations.push(url),
    setTimer: (fn, ms) => { assert.equal(ms, 1000); queue.push(fn); return fn; },
    clearTimer: () => {},
  });
  assert.deepEqual(ticks, [6]);
  assert.equal(destinations.length, 0);
  for (let i = 0; i < 5; i++) queue.shift()();
  assert.equal(destinations.length, 0);
  const finalTick = queue.shift();
  finalTick();
  finalTick();
  assert.deepEqual(ticks, [6, 5, 4, 3, 2, 1, 0]);
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

test('typing preserves Unicode and stays within its time budget, including punctuation-heavy prompts', () => {
  for (const prompt of ['Explain how Wi-Fi works.', '🧑🏽‍💻 שלום', 'x'.repeat(2000), '!?'.repeat(1000)]) {
    for (const speed of ['normal', 'slow']) {
      const plan = typingPlan(prompt, speed);
      const frames = [];
      let elapsed = 0;
      for (let i = 0; i < plan.chars.length; i += plan.chunk) {
        const frame = plan.chars.slice(i, i + plan.chunk).join('');
        frames.push(frame);
        const pause = Math.min(plan.interval + (/[.,?!]$/.test(frame) ? 60 : 0), plan.maxDelay);
        assert.ok(pause <= 125, 'Typing must keep moving, including at punctuation');
        elapsed += pause;
      }
      assert.equal(frames.join(''), prompt);
      assert.ok(elapsed <= (speed === 'slow' ? 9000 : 6500) + 0.001);
    }
  }
});

test('the default keeps a deliberate cadence without making an ordinary prompt drag', () => {
  assert.equal(readPromptFromHash(new URL(buildShareURL('https://example.com/project/', 'An ordinary question')).hash).speed, 'slow');
  const prompt = 'x'.repeat(100);
  const slow = typingPlan(prompt, 'slow');
  const normal = typingPlan(prompt, 'normal');
  const slowDuration = slow.chars.length / slow.chunk * slow.interval;
  const normalDuration = normal.chars.length / normal.chunk * normal.interval;
  assert.ok(slowDuration >= 5000 && slowDuration <= 7000);
  assert.ok(normalDuration >= 3000 && normalDuration < slowDuration);
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
