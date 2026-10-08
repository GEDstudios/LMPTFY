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
  const targetDuration = speed === 'slow' ? 22000 : 15000;
  const interval = speed === 'slow' ? 110 : 70;
  return { chars, interval, chunk: Math.max(1, Math.ceil(chars.length * interval / targetDuration)) };
}
