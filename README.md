# Let Me Ask AI For You

A buildless, responsive parody inspired by Let Me Google That For You. Write a question and create a readable link. The recipient watches a cursor circle the composer, type the question, circle Send, and open ChatGPT with the question prefilled using its `prompt` parameter.

The main page has a large **LET ME ASK AI FOR YOU** heading, no model button, and no Tools menu. Appearance settings live in the About dialog. The microphone has been removed. Reduced-motion support, native sharing, and Copy link remain available. The header's Make your own action opens a fresh composer and cancels playback. The final countdown shows only the punchline and a small countdown / Stay here control; choosing Stay here reveals the manual Open in ChatGPT and Replay buttons and restores the header action. Preview preserves the creator's draft through Exit preview.

## Timing

- Opening: at least 4.5 seconds, including a slightly faster 3-second orbit around the composer and an 800 ms curved glide to the actual text caret. Orbits gently accelerate and slow down at their endpoints.
- Typing: one visible character every 500 ms. Emoji and combining characters remain together where Intl.Segmenter is available. Long questions retain this pace; there is no acceleration or typing time cap.
- After typing: a 1.5-second hold, with the cursor at the end of the text.
- Send: an 800 ms curved approach, a 2.5-second orbit, and a 450 ms glide into the button. Clicking shows a small loading ring around Send for exactly one second before the final screen.
- Final reveal: ChatGPT opens after four seconds. Stay here, Make your own, Replay, Exit preview, or opening a dialog cancels the pending redirect.

Timing values are centralized in `DEMO_TIMING` in `core.mjs`. The older speed parameters still parse for link compatibility; all demonstrations now use the requested half-second cadence. Skip and reduced-motion preferences can bypass the animation.

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



## Development and verification

The deployable files are at the root of this ZIP. No dependencies or build step are required. Run `npm test` for link round trips, malformed payloads, Unicode text, typing cadence, cursor orbits, smooth bounded transitions, redirect timing, cancellation, and JavaScript syntax.

Browser QA and real-device checks remain outstanding. ChatGPT controls the destination's prefill behavior. Code checks do not confirm signed-in, signed-out, or in-app-browser behavior.



## Readable links and privacy

Links use the page's current origin and path, so the same files work on GitHub Pages, including repository subdirectories and custom domains. New links include the question in readable form, for example `#ask=Why+is+the+sky+blue%3F`. Unicode and emoji stay readable; reserved characters are escaped. Old `#p=...` links remain supported.

The full question is in the URL fragment, not stored by an application server. Encoding is not encryption. Long questions create long links; very short codes would require a backend. Only the appearance preference is stored locally. Native sharing sends the link and product title; Copy link is always available, and cancelling native sharing makes no changes.

This is an independent parody, not affiliated with OpenAI. It does not generate an AI answer. The favicon uses the official SVG from https://chatgpt.com/cdn/assets/favicon-l4nq08hd.svg.
