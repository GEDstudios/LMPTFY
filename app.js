import { MAX_PROMPT_LENGTH, normalizePrompt, buildShareURL, readPromptFromHash, buildChatGPTURL, startChatGPTHandoff, typingPlan } from './core.mjs';

const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
const input = $('promptInput');
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(`lmptfy:${key}`)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`lmptfy:${key}`, JSON.stringify(value)); } catch { /* Private browsing can disable storage. */ } },
};

const state = {
  speed: 'slow', mode: 'builder', prompt: '', preview: false,
  controller: null, draft: '', draftSpeed: 'slow', shareURL: '', listening: false,
  cancelRedirect: null,
};
function setTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('themeButton').querySelector('span').textContent = dark ? 'Light appearance' : 'Dark appearance';
  $('themeButton').querySelector('use').setAttribute('href', dark ? '#i-sun' : '#i-moon');
  document.querySelector('meta[name="theme-color"]').content = dark ? '#212121' : '#ffffff';
  storage.set('theme', dark ? 'dark' : 'light');
}
setTheme(storage.get('theme', 'light'));

let toastTimer;
function toast(message) {
  clearTimeout(toastTimer);
  const el = $('toast');
  const openDialog = document.querySelector('dialog[open]');
  (openDialog || document.body).append(el);
  el.querySelector('span').textContent = message;
  el.hidden = false;
  toastTimer = setTimeout(() => { el.hidden = true; document.body.append(el); }, 3200);
}

const popovers = [
  ['modelButton', 'modelMenu'], ['toolsButton', 'toolsMenu'],
];
function closeMenus() {
  popovers.forEach(([trigger, menu]) => { $(menu).hidden = true; $(trigger).setAttribute('aria-expanded', 'false'); });
}
popovers.forEach(([trigger, menu]) => {
  $(trigger).addEventListener('click', () => {
    const open = $(menu).hidden;
    closeMenus();
    $(menu).hidden = !open;
    $(trigger).setAttribute('aria-expanded', String(open));
  });
});
document.addEventListener('click', event => {
  if (!popovers.some(([trigger, menu]) => $(trigger).contains(event.target) || $(menu).contains(event.target))) closeMenus();
});

function showDialog(id) {
  cancelHandoff();
  closeMenus();
  const dialog = $(id);
  if (!dialog.open) dialog.showModal();
}
$$('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$$('dialog').forEach(dialog => {
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    if (dialog.contains($('toast'))) { $('toast').hidden = true; document.body.append($('toast')); }
  });
});

function syncInput() {
  input.style.height = '37px';
  input.style.height = `${Math.max(37, Math.min(input.scrollHeight, 200))}px`;
  $('sendButton').disabled = !input.value.trim() || state.mode !== 'builder';
  $('characterCount').hidden = input.value.length < 1700;
  $('characterCount').textContent = `${input.value.length.toLocaleString()} / 2,000`;
  $('characterCount').classList.toggle('at-limit', input.value.length >= MAX_PROMPT_LENGTH);
  if (state.mode === 'builder' && input.value.trim() !== state.prompt) $('shareAgain').hidden = true;
}
input.addEventListener('input', syncInput);
input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (state.mode === 'builder' && input.value.trim()) createLink();
  }
});

function setSpeed(speed) {
  state.speed = speed === 'slow' ? 'slow' : 'normal';
  $$('.speed-option').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.speed === state.speed)));
}
$$('.speed-option').forEach(button => button.addEventListener('click', () => {
  setSpeed(button.dataset.speed); closeMenus();
  $('shareAgain').hidden = true;
  toast(state.speed === 'slow' ? 'Every. Single. Letter.' : 'Slowly enough to make the point.');
}));

function cancelHandoff() {
  state.cancelRedirect?.();
  state.cancelRedirect = null;
  $('redirectNotice').hidden = true;
}

function stopPlayback() {
  cancelHandoff();
  state.controller?.abort();
  state.controller = null;
  $('demoCursor').hidden = true;
  $('demoGuide').hidden = true;
  document.body.classList.remove('is-playing');
}

function resetBuilder({ prompt = '', speed = 'slow', keepLink = false, focus = true } = {}) {
  stopPlayback();
  stopDictation();
  state.mode = 'builder';
  state.preview = false;
  document.body.classList.remove('is-viewing');
  $('startScreen').hidden = false;
  $('conversation').hidden = true;
  $('builderControls').hidden = false;
  $('viewerControls').hidden = true;
  $('shareAgain').hidden = !keepLink;
  $('welcomeHeading').textContent = 'What can I help with?';
  input.readOnly = false;
  input.value = prompt;
  $('sendButton').setAttribute('aria-label', 'Create a prompt link');
  $('sendButton').title = 'Create a prompt link';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  setSpeed(speed);
  syncInput();
  closeMenus();
  window.scrollTo(0, 0);
  if (focus) input.focus({ preventScroll: true });
}

$$('[data-action="new"]').forEach(button => button.addEventListener('click', () => resetBuilder()));
$$('[data-action="about"]').forEach(button => button.addEventListener('click', () => showDialog('aboutDialog')));
$('gotIt').addEventListener('click', () => { $('aboutDialog').close(); resetBuilder(); });
$('themeButton').addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); closeMenus();
});
function createLink() {
  const prompt = normalizePrompt(input.value);
  if (!prompt || state.mode !== 'builder') return;
  stopDictation();
  state.prompt = prompt;
  state.shareURL = buildShareURL(location.href, prompt, state.speed);
  $('sharePrompt').textContent = prompt;
  $('shareURL').value = state.shareURL;
  $('copyLink').querySelector('span').textContent = 'Copy link';
  $('copyLink').querySelector('use').setAttribute('href', '#i-copy');
  $('shareAgain').hidden = false;
  showDialog('shareDialog');
}
$('promptForm').addEventListener('submit', event => { event.preventDefault(); createLink(); });
$('shareAgain').addEventListener('click', createLink);
$('shareURL').addEventListener('click', () => $('shareURL').select());

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const selection = document.createElement('textarea');
    selection.value = text;
    selection.style.cssText = 'position:fixed;left:0;top:0;opacity:0;pointer-events:none;';
    (document.querySelector('dialog[open]') || document.body).append(selection);
    selection.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch { /* Manual selection remains available. */ }
    selection.remove();
    return copied;
  }
}
$('copyLink').addEventListener('click', async () => {
  const success = await copyText(state.shareURL);
  if (success) {
    $('copyLink').querySelector('span').textContent = 'Copied!';
    $('copyLink').querySelector('use').setAttribute('href', '#i-check');
    toast('Link copied. A little help is on its way.');
  } else {
    $('shareURL').focus(); $('shareURL').select();
    toast('Link selected. Press Ctrl+C or ⌘C to copy.');
  }
});
$('copyPrompt').addEventListener('click', async () => {
  if (await copyText(state.prompt)) toast('Prompt copied.');
  else {
    const range = document.createRange();
    range.selectNodeContents($('userMessage'));
    const selection = window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    toast('Prompt selected. Press Ctrl+C or ⌘C to copy.');
  }
});

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    function abort() { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); }
    signal.addEventListener('abort', abort, { once: true });
  });
}
function setStep(index, text, detail) {
  $$('.step-dots span').forEach((dot, i) => { dot.classList.toggle('active', i === index); dot.classList.toggle('done', i < index); });
  $('guideText').textContent = text;
  $('guideDetail').textContent = detail;
  $('guideStep').textContent = `STEP 0${index + 1} / 03`;
}
function moveCursor(x, y, duration = 1200) {
  const cursor = $('demoCursor');
  cursor.style.transitionDuration = `${duration}ms`;
  cursor.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}
function clickCursor() {
  const cursor = $('demoCursor');
  cursor.classList.remove('clicked');
  void cursor.offsetWidth;
  cursor.classList.add('clicked');
}

function finishPlayback() {
  stopPlayback();
  state.mode = 'complete';
  $('startScreen').hidden = true;
  $('conversation').hidden = false;
  $('userMessage').textContent = state.prompt;
  $('openChatGPT').href = buildChatGPTURL(state.prompt);
  $('skipButton').hidden = true;
  $('exitPreview').hidden = !state.preview;
  $('userMessage').scrollTop = 0;
  window.scrollTo(0, 0);
  $('revealHeading').focus({ preventScroll: true });
  $('redirectNotice').hidden = false;
  state.cancelRedirect = startChatGPTHandoff(state.prompt, {
    onTick: seconds => {
      $('redirectStatus').textContent = seconds ? `Opening ChatGPT in ${seconds}…` : 'Opening ChatGPT…';
    },
    navigate: url => window.location.assign(url),
  });
}

async function playPrompt(prompt, speed = 'slow', preview = false) {
  stopPlayback();
  stopDictation();
  $$('dialog[open]').forEach(dialog => dialog.close());
  closeMenus();
  state.mode = 'playing';
  state.prompt = normalizePrompt(prompt);
  state.preview = preview;
  setSpeed(speed);
  const controller = new AbortController(); state.controller = controller;
  const { signal } = controller;
  document.body.classList.add('is-viewing', 'is-playing');
  $('startScreen').hidden = false;
  $('conversation').hidden = true;
  $('builderControls').hidden = true;
  $('viewerControls').hidden = false;
  $('previewLabel').hidden = !preview;
  $('exitPreview').hidden = !preview;
  $('skipButton').hidden = false;
  $('welcomeHeading').textContent = 'What can I help with?';
  input.value = ''; input.readOnly = true; syncInput();
  $('sendButton').setAttribute('aria-label', 'Send prompt in demonstration');
  $('sendButton').title = 'Send prompt in demonstration';
  window.scrollTo(0, 0);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { finishPlayback(); return; }
  $('demoGuide').hidden = false;
  setStep(0, 'Behold. A text box.', 'Click it. We believe in you.');
  const cursor = $('demoCursor');
  cursor.hidden = false;
  moveCursor(window.innerWidth * .72, Math.min(window.innerHeight - 130, window.innerHeight * .7), 0);
  try {
    await delay(2200, signal);
    let box = input.getBoundingClientRect();
    moveCursor(box.left + Math.min(150, box.width * .4), box.top + 14);
    await delay(1400, signal);
    clickCursor(); input.focus({ preventScroll: true });
    await delay(900, signal);
    setStep(1, 'Now, use your words.', 'The very same question you just asked someone else.');
    moveCursor(box.right - 40, box.bottom + 48, 1100);
    await delay(1000, signal);
    const plan = typingPlan(state.prompt, speed);
    for (let index = 0; index < plan.chars.length; index += plan.chunk) {
      input.value += plan.chars.slice(index, index + plan.chunk).join('');
      syncInput();
      input.scrollTop = input.scrollHeight;
      const last = plan.chars[Math.min(index + plan.chunk - 1, plan.chars.length - 1)];
      await delay(plan.interval + (/[.,?!]/.test(last) ? 100 : 0), signal);
    }
    $('sendButton').disabled = false;
    await delay(1400, signal);
    setStep(2, 'Press the big arrow.', 'Truly groundbreaking stuff.');
    await delay(1300, signal);
    box = $('sendButton').getBoundingClientRect();
    moveCursor(box.left + box.width / 2, box.top + box.height / 2, 1200);
    await delay(1400, signal);
    clickCursor();
    await delay(850, signal);
    finishPlayback();
  } catch (error) {
    if (error.name !== 'AbortError') { finishPlayback(); console.error('Playback could not finish:', error); }
  }
}

$('previewButton').addEventListener('click', () => {
  state.draft = input.value; state.draftSpeed = state.speed;
  void playPrompt(state.prompt, state.speed, true);
});
$('exitPreview').addEventListener('click', () => resetBuilder({ prompt: state.draft, speed: state.draftSpeed, keepLink: true }));
$('skipButton').addEventListener('click', finishPlayback);
$('replayButton').addEventListener('click', () => void playPrompt(state.prompt, state.speed, state.preview));
$('makeOwn').addEventListener('click', () => resetBuilder());
$('cancelRedirect').addEventListener('click', () => { cancelHandoff(); toast("Staying here. Open ChatGPT whenever you're ready."); });
$('openChatGPT').addEventListener('click', cancelHandoff);
window.addEventListener('pagehide', cancelHandoff);

let recognition;
function stopDictation() {
  const wasListening = state.listening;
  state.listening = false;
  $('micButton').classList.remove('listening');
  $('micButton').setAttribute('aria-label', 'Dictate a prompt');
  if (recognition && wasListening) {
    try { recognition.stop(); } catch { /* Recognition may already have ended. */ }
  }
}
$('micButton').addEventListener('click', () => {
  if (state.mode !== 'builder') return;
  if (state.listening) { stopDictation(); return; }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { toast('Voice input is unavailable here. Type your prompt to get started.'); input.focus(); return; }
  recognition = new SpeechRecognition();
  recognition.lang = navigator.language || 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;
  const original = input.value.trim();
  recognition.onresult = event => {
    const spoken = Array.from(event.results).map(result => result[0].transcript).join(' ');
    input.value = `${original}${original ? ' ' : ''}${spoken}`.slice(0, MAX_PROMPT_LENGTH);
    syncInput();
  };
  recognition.onend = stopDictation;
  recognition.onerror = event => {
    stopDictation();
    toast(event.error === 'not-allowed' ? 'Microphone access is off. You can type your prompt instead.' : "Couldn't hear that. Try again or type your prompt.");
  };
  try {
    recognition.start(); state.listening = true;
    $('micButton').classList.add('listening'); $('micButton').setAttribute('aria-label', 'Stop dictation');
  } catch { stopDictation(); toast('Voice input is unavailable. You can type your prompt instead.'); }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') { closeMenus(); }
  if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'o') {
    event.preventDefault(); $$('dialog[open]').forEach(dialog => dialog.close()); resetBuilder();
  }
});

function readLocation() {
  try {
    const shared = readPromptFromHash(location.hash);
    if (shared) void playPrompt(shared.prompt, shared.speed);
    else if (state.mode !== 'builder') resetBuilder({ focus: false });
  } catch {
    resetBuilder({ focus: false });
    toast("That link looks incomplete. You can create a fresh one here.");
  }
}
window.addEventListener('hashchange', readLocation);
syncInput();
readLocation();
