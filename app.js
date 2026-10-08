import { MAX_PROMPT_LENGTH, normalizePrompt, buildShareURL, readPromptFromHash, buildChatGPTURL, startChatGPTHandoff, typingPlan, cursorOrbitPoint } from './core.mjs';

const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
const input = $('promptInput');
const MIN_STAGE_DURATION_MS = 3000;
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
  return performance.now();
}
async function waitForStep(startedAt, signal) {
  const remaining = MIN_STAGE_DURATION_MS - (performance.now() - startedAt);
  await delay(Math.max(0, remaining), signal);
}
function moveCursor(x, y, duration = 800, easing = 'cubic-bezier(.35,.05,.24,1)') {
  const cursor = $('demoCursor');
  cursor.style.transitionDuration = `${duration}ms`;
  cursor.style.transitionTimingFunction = easing;
  cursor.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}
function createTypingCursor(signal) {
  // A hidden text mirror lets the browser measure wrapping, Unicode, and RTL text.
  const mirror = document.createElement('div');
  const text = document.createTextNode('');
  const caret = document.createElement('span');
  caret.textContent = '\u200b'; // Keep the final line measurable, including after a newline.
  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;box-sizing:border-box;margin:0;border:0;height:0;overflow:hidden;';
  mirror.append(text, caret);
  document.body.append(mirror);
  const properties = [
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch',
    'fontFeatureSettings', 'fontVariationSettings', 'lineHeight', 'letterSpacing',
    'wordSpacing', 'textTransform', 'textIndent', 'textAlign', 'direction', 'unicodeBidi',
    'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'whiteSpace', 'wordBreak', 'overflowWrap',
  ];
  function follow(duration = 60) {
    if (signal.aborted) return;
    const style = getComputedStyle(input);
    for (const property of properties) mirror.style[property] = style[property];
    // clientWidth excludes the scrollbar, so long prompts wrap at the same column.
    mirror.style.width = `${input.clientWidth}px`;
    text.data = input.value;
    const box = input.getBoundingClientRect();
    const origin = mirror.getBoundingClientRect();
    const end = caret.getBoundingClientRect();
    const x = box.left + input.clientLeft + end.left - origin.left - input.scrollLeft + 5;
    const y = box.top + input.clientTop + end.bottom - origin.top - input.scrollTop + 3;
    moveCursor(
      Math.max(8, Math.min(x, window.innerWidth - 36)),
      Math.max(8, Math.min(y, window.innerHeight - 42)),
      duration, 'linear',
    );
  }
  const refresh = () => follow(0);
  function stop() {
    mirror.remove();
    input.removeEventListener('scroll', refresh);
    window.removeEventListener('resize', refresh);
    signal.removeEventListener('abort', stop);
  }
  input.addEventListener('scroll', refresh);
  window.addEventListener('resize', refresh);
  signal.addEventListener('abort', stop, { once: true });
  return { follow, stop };
}
function orbitCursor(rect, signal, duration = 2200) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
    const cursor = $('demoCursor');
    const startedAt = performance.now();
    let frameId;
    cursor.style.transitionDuration = '0ms';
    cursor.classList.remove('clicked');
    function abort() {
      cancelAnimationFrame(frameId);
      reject(new DOMException('Cancelled', 'AbortError'));
    }
    function frame(now) {
      const progress = Math.min(1, Math.max(0, now - startedAt) / duration);
      const point = cursorOrbitPoint(rect, { width: window.innerWidth, height: window.innerHeight }, progress);
      cursor.style.transform = `translate(${point.x.toFixed(2)}px, ${point.y.toFixed(2)}px) rotate(${point.tilt.toFixed(2)}deg)`;
      if (progress === 1) {
        signal.removeEventListener('abort', abort);
        resolve();
      } else frameId = requestAnimationFrame(frame);
    }
    signal.addEventListener('abort', abort, { once: true });
    frame(startedAt);
  });
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
  const stepStartedAt = setStep(0, 'Behold. A text box.', 'Click it. We believe in you.');
  const cursor = $('demoCursor');
  cursor.hidden = false;
  let typingCursor;
  try {
    await orbitCursor($('promptForm').getBoundingClientRect(), signal);
    let box = input.getBoundingClientRect();
    moveCursor(box.left + Math.min(150, box.width * .4), box.top + 14, 450);
    await delay(500, signal);
    clickCursor(); input.focus({ preventScroll: true });
    await delay(300, signal);
    await waitForStep(stepStartedAt, signal);
    setStep(1, 'Now, use your words.', 'The very same question you just asked someone else.');
    typingCursor = createTypingCursor(signal);
    typingCursor.follow(150);
    await delay(150, signal);
    const plan = typingPlan(state.prompt, speed);
    const typingDeadline = performance.now() + plan.duration;
    for (let index = 0; index < plan.chars.length; index += plan.chunk) {
      if (performance.now() >= typingDeadline) {
        input.value = state.prompt;
        input.setSelectionRange(input.value.length, input.value.length);
        syncInput();
        input.scrollTop = input.scrollHeight;
        typingCursor.follow();
        break;
      }
      input.value += plan.chars.slice(index, index + plan.chunk).join('');
      input.setSelectionRange(input.value.length, input.value.length);
      syncInput();
      input.scrollTop = input.scrollHeight;
      typingCursor.follow(Math.min(60, plan.interval));
      const last = plan.chars[Math.min(index + plan.chunk - 1, plan.chars.length - 1)];
      const pause = Math.min(plan.interval + (/[.,?!]/.test(last) ? 60 : 0), plan.maxDelay);
      await delay(Math.max(0, Math.min(pause, typingDeadline - performance.now())), signal);
    }
    typingCursor.stop();
    $('sendButton').disabled = false;
    setStep(2, 'Press the big arrow.', 'Truly groundbreaking stuff.');
    box = $('sendButton').getBoundingClientRect();
    const orbitStart = cursorOrbitPoint(box, { width: window.innerWidth, height: window.innerHeight }, 0);
    moveCursor(orbitStart.x, orbitStart.y, 180);
    await delay(180, signal);
    await orbitCursor(box, signal, 1000);
    moveCursor(box.left + box.width / 2, box.top + box.height / 2, 140);
    await delay(140, signal);
    clickCursor();
    await delay(100, signal);
    finishPlayback();
  } catch (error) {
    if (error.name !== 'AbortError') { finishPlayback(); console.error('Playback could not finish:', error); }
  } finally {
    typingCursor?.stop();
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
