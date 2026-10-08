# Let Me Prompt That For You

A minimal ChatGPT-style demonstration: a cursor slowly clicks the message box, types your question, and presses send. Large sarcastic captions guide each step, with an oversized final punchline. After the reveal and a six-second countdown, the page redirects to ChatGPT with the question passed to its draft input. Replay or Stay here cancels the countdown.

This export is ready for GitHub Pages. It needs no build step, dependencies, API keys, or backend.

## Publish on GitHub Pages

1. Create a GitHub repository, for example `let-me-prompt-that-for-you`. Choose a public repository if you use GitHub Free.
2. Extract the ZIP. Upload the extracted contents to the repository's `main` branch. Put `index.html` directly at the repository root, alongside `app.js`, `core.mjs`, `style.css`, and `favicon.svg`. Upload the files, not the ZIP or an extra enclosing folder.
3. Open the repository's **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, select **main** and **/ (root)**, then **Save**.
5. Wait for deployment to finish. GitHub will show your site URL on the Pages settings screen.

Keep the included `.nojekyll` file at the root. If your file picker hides it, you can create an empty file named `.nojekyll` through GitHub's Add file menu.

GitHub's publishing guide: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

New prompt links automatically use the address where the site is running, including a GitHub Pages repository subdirectory or a custom domain.

## Files

- `index.html` — interface and page content
- `style.css` — responsive layout, light/dark appearance, and animation styling
- `app.js` — UI, playback, sharing, and redirect controls
- `core.mjs` — link encoding, ChatGPT destination, and redirect countdown
- `favicon.svg` — browser tab icon
- `.nojekyll` — serve the site as static files
- `package.json` and `tests/core.test.mjs` — optional local validation

## Local preview

From this folder, run:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. Use a local server instead of double-clicking `index.html`, because the app uses JavaScript modules.

To run the included checks with Node.js 20 or newer:

```sh
npm test
```

No `npm install` is needed. Checks cover Unicode prompt links, malformed links, URL encoding, countdown timing, and redirect cancellation. The actual ChatGPT destination interface was not browser-verified in the build environment.

## Behavior and customization

The ChatGPT handoff uses `https://chatgpt.com/?prompt=...`. The question is URL-encoded; the page does not click Send inside ChatGPT. This destination behavior is controlled by ChatGPT. To change the countdown, edit `remaining = 6` inside `startChatGPTHandoff` in `core.mjs`.

The interface is a single centered composer. It includes light/dark appearance in the ChatGPT dropdown, two paced typing speeds, optional browser dictation, and reduced-motion support. New links default to the more deliberate speed. During “Behold. A text box.”, the cursor immediately makes a 2.2-second clockwise loop around the composer with a slight tilt, then clicks inside. Each instruction stage stays visible for at least three seconds, even for one-letter prompts. The first letter appears at about 3.2 seconds. The loop stays within the viewport and cancels with playback. The gap between letters is 78 ms by default, a 20% increase. Typing is capped at 10.8 seconds, including punctuation pauses, and the current step gently pulses to show activity. Prompt links contain their question in the URL fragment; only the appearance preference is saved in local storage.

This is an independent parody, not affiliated with OpenAI. It demonstrates prompts and does not generate AI answers.
