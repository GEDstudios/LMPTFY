export const MAX_PROMPT_LENGTH = 2000;

export const EXAMPLES = Object.freeze({
  email: { title: 'Write that email', icon: 'mail', prompt: 'Write a polite email declining a meeting that really could have been an email.' },
  explain: { title: "Explain it like I'm five", icon: 'lightbulb', prompt: "Explain how Wi-Fi works like I'm five years old. Keep it simple and use a fun analogy." },
  code: { title: "Why isn't my code working?", icon: 'code', prompt: 'Explain the difference between =, ==, and === in JavaScript, with a simple example of each.' },
  debate: { title: 'Settle the group chat debate', icon: 'info', prompt: 'Is a hot dog a sandwich? Give me the strongest argument for each side, then settle the debate.' },
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
  if (!params.has('p')) return null;
  return { prompt: decodePrompt(params.get('p')), speed: params.get('s') === 'slow' ? 'slow' : 'normal' };
}

export function buildShareURL(base, prompt, speed = 'normal') {
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
  let remaining = 3;
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
  const targetDuration = speed === 'slow' ? 13500 : 8500;
  const interval = speed === 'slow' ? 70 : 36;
  return { chars, interval, chunk: Math.max(1, Math.ceil(chars.length * interval / targetDuration)) };
}
