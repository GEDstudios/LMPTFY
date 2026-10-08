import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_PROMPT_LENGTH, EXAMPLES, normalizePrompt, encodePrompt, decodePrompt, readPromptFromHash, buildShareURL, buildChatGPTURL, startChatGPTHandoff, typingPlan } from '../core.mjs';

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

test('handoff waits three seconds, preserves the draft, and redirects exactly once', () => {
  const ticks = [], destinations = [], queue = [];
  startChatGPTHandoff('Explain this & that שלום 👋', {
    onTick: seconds => ticks.push(seconds),
    navigate: url => destinations.push(url),
    setTimer: (fn, ms) => { assert.equal(ms, 1000); queue.push(fn); return fn; },
    clearTimer: () => {},
  });
  assert.deepEqual(ticks, [3]);
  assert.equal(destinations.length, 0);
  queue.shift()();
  queue.shift()();
  assert.equal(destinations.length, 0);
  const finalTick = queue.shift();
  finalTick();
  finalTick();
  assert.deepEqual(ticks, [3, 2, 1, 0]);
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

test('typing completes every prompt without splitting Unicode code points', () => {
  for (const prompt of [Object.values(EXAMPLES)[0].prompt, '🧑🏽‍💻 שלום', 'x'.repeat(2000)]) {
    for (const speed of ['normal', 'slow']) {
      const plan = typingPlan(prompt, speed);
      const frames = [];
      for (let i = 0; i < plan.chars.length; i += plan.chunk) frames.push(plan.chars.slice(i, i + plan.chunk).join(''));
      assert.equal(frames.join(''), prompt);
      assert.ok(frames.length * plan.interval <= (speed === 'slow' ? 13600 : 8600));
    }
  }
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
