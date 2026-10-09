export const MAX_PROMPT_LENGTH = 2000;
export const DEMO_TIMING = Object.freeze({
  opening: 4500,
  composerOrbit: 3000,
  composerApproach: 800,
  letter: 500,
  typingHold: 1500,
  sendOrbit: 2500,
  sendApproach: 800,
  sendClickApproach: 450,
  loading: 1000,
  redirect: 4000,
});

export function normalizePrompt(value) {
  if (typeof value !== 'string') return '';
  const prompt = value.trim().slice(0, MAX_PROMPT_LENGTH);
  return /[\uD800-\uDBFF]$/.test(prompt) ? prompt.slice(0, -1) : prompt;
}

export function encodePrompt(prompt) {
  const bytes = new TextEncoder().encode(normalizePrompt(prompt));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function decodePrompt(encoded) {
  if (typeof encoded !== 'string' || !encoded || encoded.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error('Invalid prompt link');
  const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
  const prompt = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
  if (!prompt.trim() || prompt.length > MAX_PROMPT_LENGTH) throw new Error('Invalid prompt link');
  return prompt.trim();
}

export function readPromptFromHash(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.has('ask')) {
    // Reject malformed escapes instead of silently replacing broken UTF-8.
    decodeURIComponent(hash);
    const prompt = params.get('ask');
    if (!prompt.trim() || prompt.length > MAX_PROMPT_LENGTH) throw new Error('Invalid prompt link');
    return { prompt: prompt.trim(), speed: params.get('s') === 'normal' ? 'normal' : 'slow' };
  }
  // Links shared by earlier versions keep their original prompt and speed.
  if (!params.has('p')) return null;
  return { prompt: decodePrompt(params.get('p')), speed: params.get('s') === 'slow' ? 'slow' : 'normal' };
}

export function buildShareURL(base, prompt, speed = 'slow') {
  const question = normalizePrompt(prompt);
  if (!question) throw new Error('Write a prompt first');
  const url = new URL(base);
  url.search = '';
  const params = new URLSearchParams({ ask: question });
  if (speed === 'normal') params.set('s', 'normal');
  url.hash = params.toString();
  // Keep Hebrew, other languages, and emoji readable in the copied link.
  // Spaces and URL delimiters remain escaped so the complete link is clickable.
  return url.href.replace(/(?:%[89a-f][0-9a-f])+/gi, encoded => {
    const decoded = decodeURIComponent(encoded);
    return /[\s\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(decoded) ? encoded : decoded;
  });
}

export function buildChatGPTURL(prompt) {
  const url = new URL('https://chatgpt.com/');
  url.searchParams.set('prompt', normalizePrompt(prompt));
  return url.href;
}

export function startChatGPTHandoff(prompt, { onTick, navigate, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const url = buildChatGPTURL(prompt);
  let remaining = DEMO_TIMING.redirect;
  let timer;
  let cancelled = false;
  function tick() {
    if (cancelled) return;
    onTick(remaining / 1000);
    if (remaining === 0) {
      cancelled = true;
      navigate(url);
      return;
    }
    const interval = Math.min(1000, remaining);
    timer = setTimer(() => { remaining -= interval; tick(); }, interval);
  }
  tick();
  return () => { cancelled = true; clearTimer(timer); };
}

export function typingPlan(prompt) {
  const chars = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(prompt), item => item.segment)
    : Array.from(prompt);
  const interval = DEMO_TIMING.letter;
  return { chars, interval, duration: Math.max(0, chars.length - 1) * interval };
}

export function cursorOrbitPoint(rect, viewport, progress) {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const maxX = Math.max(8, viewport.width - 36);
  const maxY = Math.max(8, viewport.height - 42);
  const left = clamp(rect.left - 18, 8, maxX);
  const right = clamp(rect.right + 8, left, maxX);
  const top = clamp(rect.top - 22, 8, maxY);
  const bottom = clamp(rect.bottom + 8, top, maxY);
  const turn = clamp(progress, 0, 1) * Math.PI * 2;
  const angle = turn - Math.PI / 2;
  return {
    x: (left + right) / 2 + Math.cos(angle) * (right - left) / 2,
    y: (top + bottom) / 2 + Math.sin(angle) * (bottom - top) / 2,
    tilt: Math.sin(turn) * 10,
  };
}

export function cursorMotionProgress(progress) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (1 - Math.cos(Math.PI * clamped)) / 2;
}

export function cursorGlidePoint(from, to, progress) {
  const t = cursorMotionProgress(progress);
  const u = 1 - t;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const arc = Math.max(0, Math.min(44, Math.hypot(dx, dy) * .15, Math.min(from.y, to.y) - 8));
  const control1 = { x: from.x + dx * .3, y: from.y + dy * .2 - arc };
  const control2 = { x: from.x + dx * .7, y: from.y + dy * .8 - arc };
  return {
    x: u ** 3 * from.x + 3 * u ** 2 * t * control1.x + 3 * u * t ** 2 * control2.x + t ** 3 * to.x,
    y: u ** 3 * from.y + 3 * u ** 2 * t * control1.y + 3 * u * t ** 2 * control2.y + t ** 3 * to.y,
    tilt: (from.tilt || 0) * u + (to.tilt || 0) * t,
  };
}
