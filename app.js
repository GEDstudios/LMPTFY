import { MAX_PROMPT_LENGTH, DEMO_TIMING, normalizePrompt, buildShareURL, readPromptFromHash, buildChatGPTURL, startChatGPTHandoff, typingPlan, cursorOrbitPoint, cursorMotionProgress, cursorGlidePoint } from './core.mjs';

const $ = id => document.getElementById(id);
const $$ = selector => [...document.querySelectorAll(selector)];
const input = $('promptInput');
const MIN_STAGE_DURATION_MS = DEMO_TIMING.opening;
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(`lmptfy:${key}`)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`lmptfy:${key}`, JSON.stringify(value)); } catch { /* Private browsing can disable storage. */ } },
};

const state = {
  speed: 'slow', mode: 'builder', prompt: '', preview: false,
  controller: null, draft: '', draftSpeed: 'slow', shareURL: '',
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

function showDialog(id) {
  cancelHandoff();
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
}

function cancelHandoff() {
  state.cancelRedirect?.();
  state.cancelRedirect = null;
  $('redirectNotice').hidden = true;
  if (state.mode === 'complete') {
    $('finalActions').hidden = false;
    $('viewerControls').hidden = false;
  }
}

function stopPlayback() {
  cancelHandoff();
  state.controller?.abort();
  state.controller = null;
  $('demoCursor').hidden = true;
  $('demoGuide').hidden = true;
  $('sendButton').classList.remove('is-loading');
  $('sendButton').removeAttribute('aria-busy');
  document.body.classList.remove('is-playing', 'is-complete');
}

function resetBuilder({ prompt = '', speed = 'slow', keepLink = false, focus = true } = {}) {
  stopPlayback();
  state.mode = 'builder';
  state.preview = false;
  document.body.classList.remove('is-viewing');
  $('startScreen').hidden = false;
  $('conversation').hidden = true;
  $('builderControls').hidden = false;
  $('viewerControls').hidden = true;
  $('shareAgain').hidden = !keepLink;
  $('welcomeHeading').textContent = 'LET ME ASK AI FOR YOU';
  input.readOnly = false;
  input.value = prompt;
  $('sendButton').setAttribute('aria-label', 'Create a prompt link');
  $('sendButton').title = 'Create a prompt link';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  setSpeed(speed);
  syncInput();
  window.scrollTo(0, 0);
  if (focus) input.focus({ preventScroll: true });
}

$$('[data-action="new"]').forEach(button => button.addEventListener('click', () => resetBuilder()));
$$('[data-action="about"]').forEach(button => button.addEventListener('click', () => showDialog('aboutDialog')));
$('gotIt').addEventListener('click', () => { $('aboutDialog').close(); resetBuilder(); });
$('themeButton').addEventListener('click', () => {
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});
function createLink() {
  const prompt = normalizePrompt(input.value);
  if (!prompt || state.mode !== 'builder') return;
  state.prompt = prompt;
  state.shareURL = buildShareURL(location.href, prompt, state.speed);
  $('sharePrompt').textContent = prompt;
  $('shareURL').value = state.shareURL;
  $('copyLink').querySelector('span').textContent = 'Copy link';
  $('copyLink').querySelector('use').setAttribute('href', '#i-copy');
  $('nativeShare').hidden = !canShareLink();
  $('shareAgain').hidden = false;
  showDialog('shareDialog');
}
$('promptForm').addEventListener('submit', event => { event.preventDefault(); createLink(); });
$('shareAgain').addEventListener('click', createLink);
$('shareURL').addEventListener('click', () => $('shareURL').select());

function shareData() {
  return { title: 'Let Me Ask AI For You', url: state.shareURL };
}
function canShareLink() {
  if (typeof navigator.share !== 'function') return false;
  try {
    return typeof navigator.canShare !== 'function' || navigator.canShare(shareData());
  } catch {
    return false;
  }
}
$('nativeShare').addEventListener('click', async () => {
  const button = $('nativeShare');
  if (!state.shareURL || button.disabled) return;
  button.disabled = true;
  try {
    // Invoke directly from the tap so the browser retains user activation.
    await navigator.share(shareData());
  } catch (error) {
    if (error.name !== 'AbortError') {
      toast('Sharing is unavailable here. Use Copy link instead.');
      $('copyLink').focus();
    }
  } finally {
    button.disabled = false;
  }
});

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
let cursorPosition = { x: 0, y: 0, tilt: 0 };
function paintCursor(point) {
  cursorPosition = { x: point.x, y: point.y, tilt: point.tilt || 0 };
  $('demoCursor').style.transform = `translate(${point.x.toFixed(2)}px, ${point.y.toFixed(2)}px) rotate(${cursorPosition.tilt.toFixed(2)}deg)`;
}
function moveCursor(x, y, duration = 140, easing = 'cubic-bezier(.25,.1,.25,1)') {
  const cursor = $('demoCursor');
  cursor.style.transitionDuration = `${duration}ms`;
  cursor.style.transitionTimingFunction = easing;
  paintCursor({ x, y, tilt: 0 });
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
  function position() {
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
    return {
      x: Math.max(8, Math.min(x, window.innerWidth - 36)),
      y: Math.max(8, Math.min(y, window.innerHeight - 42)),
    };
  }
  function follow(duration = 140) {
    if (signal.aborted) return;
    const point = position();
    moveCursor(point.x, point.y, duration);
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
  return { position, follow, stop };
}
function animateCursor(pointAt, signal, duration) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Cancelled', 'AbortError'));
    const startedAt = performance.now();
    let frameId;
    $('demoCursor').style.transitionDuration = '0ms';
    function abort() {
      cancelAnimationFrame(frameId);
      reject(new DOMException('Cancelled', 'AbortError'));
    }
    function frame(now) {
      if (signal.aborted) return;
      const progress = Math.min(1, Math.max(0, now - startedAt) / duration);
      paintCursor(pointAt(progress));
      if (progress === 1) {
        signal.removeEventListener('abort', abort);
        resolve();
      } else frameId = requestAnimationFrame(frame);
    }
    signal.addEventListener('abort', abort, { once: true });
    frame(startedAt);
  });
}
function orbitCursor(rect, signal, duration = DEMO_TIMING.composerOrbit) {
  $('demoCursor').classList.remove('clicked');
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  return animateCursor(progress => cursorOrbitPoint(rect, viewport, cursorMotionProgress(progress)), signal, duration);
}
function glideCursor(target, signal, duration) {
  const from = { ...cursorPosition };
  const to = {
    x: Math.max(8, Math.min(target.x, window.innerWidth - 36)),
    y: Math.max(8, Math.min(target.y, window.innerHeight - 42)),
    tilt: target.tilt || 0,
  };
  return animateCursor(progress => cursorGlidePoint(from, to, progress), signal, duration);
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
  document.body.classList.add('is-complete');
  $('finalActions').hidden = true;
  $('viewerControls').hidden = !state.preview;
  $('startScreen').hidden = true;
  $('conversation').hidden = false;
  $('openChatGPT').href = buildChatGPTURL(state.prompt);
  $('skipButton').hidden = true;
  $('exitPreview').hidden = !state.preview;
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
  $$('dialog[open]').forEach(dialog => dialog.close());
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
  $('viewerCreate').hidden = preview;
  $('skipButton').hidden = false;
  $('welcomeHeading').textContent = 'LET ME ASK AI FOR YOU';
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
    typingCursor = createTypingCursor(signal);
    await glideCursor(typingCursor.position(), signal, DEMO_TIMING.composerApproach);
    clickCursor(); input.focus({ preventScroll: true });
    await delay(200, signal);
    await waitForStep(stepStartedAt, signal);
    setStep(1, 'Now, use your words.', 'The very same question you just asked someone else.');
    const plan = typingPlan(state.prompt);
    for (let index = 0; index < plan.chars.length; index++) {
      if (index > 0) await delay(plan.interval, signal);
      input.value += plan.chars[index];
      input.setSelectionRange(input.value.length, input.value.length);
      syncInput();
      input.scrollTop = input.scrollHeight;
      typingCursor.follow(140);
    }
    await delay(DEMO_TIMING.typingHold, signal);
    typingCursor.stop();
    $('sendButton').disabled = false;
    setStep(2, 'Press the big arrow.', 'Truly groundbreaking stuff.');
    const box = $('sendButton').getBoundingClientRect();
    const orbitStart = cursorOrbitPoint(box, { width: window.innerWidth, height: window.innerHeight }, 0);
    await glideCursor(orbitStart, signal, DEMO_TIMING.sendApproach);
    await orbitCursor(box, signal, DEMO_TIMING.sendOrbit);
    await glideCursor({ x: box.left + box.width / 2, y: box.top + box.height / 2 }, signal, DEMO_TIMING.sendClickApproach);
    clickCursor();
    $('sendButton').classList.add('is-loading');
    $('sendButton').setAttribute('aria-busy', 'true');
    $('sendButton').disabled = true;
    await delay(DEMO_TIMING.loading, signal);
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
$('cancelRedirect').addEventListener('click', () => { cancelHandoff(); toast("Staying here. Open ChatGPT whenever you're ready."); });
$('openChatGPT').addEventListener('click', cancelHandoff);
window.addEventListener('pagehide', cancelHandoff);

document.addEventListener('keydown', event => {
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
