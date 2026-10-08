export const MAX_PROMPT_LENGTH = 2000;

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
  if (!params.has('p')) return null;
  return { prompt: decodePrompt(params.get('p')), speed: params.get('s') === 'slow' ? 'slow' : 'normal' };
}

export function buildShareURL(base, prompt, speed = 'slow') {
  if (!normalizePrompt(prompt)) throw new Error('Write a prompt first');
  const url = new URL(base);
  url.search = '';
  url.hash = `p=${encodePrompt(prompt)}${speed === 'slow' ? '&s=slow' : ''}`;
  return url.href;
}

export function buildChatGPTURL(prompt) {
  const url = new URL('https://chatgpt.com/');
  url.searchParams.set('prompt', normalizePrompt(prompt));
  return url.href;
}

export function startChatGPTHandoff(prompt, { onTick, navigate, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const url = buildChatGPTURL(prompt);
  let remaining = 6;
  let timer;
  let cancelled = false;
  function tick() {
    if (cancelled) return;
    onTick(remaining);
    if (remaining === 0) {
      cancelled = true;
      navigate(url);
      return;
    }
    remaining -= 1;
    timer = setTimer(tick, 1000);
  }
  tick();
  return () => { cancelled = true; clearTimer(timer); };
}

export function typingPlan(prompt, speed) {
  const chars = Array.from(prompt);
  const duration = speed === 'slow' ? 9000 : 6500;
  const interval = speed === 'slow' ? 65 : 42;
  const chunk = Math.max(1, Math.ceil(chars.length * interval / duration));
  const frames = Math.max(1, Math.ceil(chars.length / chunk));
  return { chars, interval, chunk, duration, maxDelay: duration / frames };
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
