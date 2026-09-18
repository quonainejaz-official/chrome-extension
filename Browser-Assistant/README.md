# AI Page Assistant

An AI-powered Chrome side panel that **reads the page or PDF you're currently viewing** — and, when you ask it to, **operates that page for you**: clicking, filling forms, choosing from dropdowns, ticking boxes and scrolling.

## Features

- **Acts on the page, not just reads it** — becomes your hands: clicks buttons and links, types into fields, selects dropdown options, ticks checkboxes, scrolls, navigates. It asks before it submits anything, and it works out from your message whether you wanted an answer or an action — no mode to switch.
- **Reads your current page automatically** — the extension extracts the live content of the tab you're on (no copy-paste needed)
- **PDF support** — reads PDFs opened in the browser by fetching and parsing them with pdf.js
- **Summarize / analyze / Q&A** on articles, docs, and PDFs
- **Translate** pages and selected text into 12+ languages
- **Automatic model routing** — ZenMux models are tried by availability priority, with OpenCode Zen as the final fallback
- **Works out of the box** — ships with a free default model that needs no billing setup
- **Light / Dark / System theme**
- **Fully responsive** minimalist UI that adapts to any panel width
- **Conversation history** stored locally

## Installation (from source)

1. Clone this repository
2. Create a `.env` file with the default provider keys:
   ```
   VITE_ZENMUX_API_KEY=sk-your-zenmux-key-here
   VITE_OPENCODE_ZEN_KEY=sk-your-key-here
   ```
3. Run `npm install`
4. Run `npm run build`
5. Open Chrome → `chrome://extensions/`
6. Enable **Developer mode**
7. Click **Load unpacked** and select the `dist` folder

> If you change `host_permissions`, remove and re-load the extension (a plain refresh won't re-prompt for the new permissions).

## Setup

The extension uses **ZenMux automatic routing by default**. Users do not need to choose a model or configure a provider. If all configured ZenMux candidates fail, OpenCode Zen is used automatically. To customize:

1. Click the extension icon to open the side panel
2. Open **Settings** (gear icon)
3. Optionally pick an OpenCode Zen/custom model, and/or paste your own OpenCode Zen API key
4. Start chatting

### Using paid models

Anthropic / OpenAI / Google models on OpenCode Zen are metered and require a **payment method** on your OpenCode Zen account. Without one, the API returns a "no payment method" error. The **Free** models (Big Pickle, DeepSeek, Ling, Nemotron, …) work without any billing.

### Adding a custom model / provider

Settings → **Custom models → Add custom model**. Provide:

- **Display name** — any label
- **Provider** — e.g. OpenAI, Ollama, Groq (informational)
- **Endpoint URL** — a base URL (`https://api.openai.com/v1`) or a full `/chat/completions` URL. Must be OpenAI-compatible.
- **Model ID** — e.g. `gpt-4o`, `llama3.1`
- **API key** — *optional*; leave empty for endpoints that need none (e.g. a local Ollama server)

## Usage

1. Navigate to any web page or open a PDF
2. Open the side panel
3. Make sure page context is enabled (the document icon in the input bar)
4. Ask a question or use a quick action / template

### Letting it act, not just read

There is **no mode to switch**. Say what you want and the assistant works out from your message whether you're asking a question or asking for something to be done — in any language, including Roman Urdu and Hindi. "Is page pe kya likha hai?" gets an answer; "ye form bhar do" gets a run. Just say what you want:

- "Fill this form with my details" — reads the form, matches each field to your saved profile, fills them one by one, and stops so you can review
- "Fill it and submit" — same, but it goes ahead and submits, because you asked
- "Pick India in the country dropdown and tick the terms box"
- "Find the pricing section and click the Enterprise plan"
- "What can I actually do on this page?" — scrolls through and maps out the controls

**How a run works.** Each turn is: look at the page → plan a **batch** of actions → run them → look again. A whole form is filled in one round-trip rather than one per field. The run panel shows the goal, a live timeline with a distinct icon per action, elapsed time, what it's doing right now ("Reading the page", "Deciding the next move", "Rate limited — waiting 8s"), and a **Stop** button that ends it immediately.

A batch stops at the first action the page reacts to — a click, a submit, a navigation — because every element reference after that point is stale. Field edits, dropdown choices and checkbox ticks batch freely.

**What it will not do.**

- Password, card number, CVV, OTP, SSN and API-key fields are refused at the browser level. They are marked locked in what the model sees, *and* blocked again in the code that touches the page — so a mislabelled field or a confused model still can't fill one. The agent tells you which fields you need to type yourself.
- File pickers can't be filled programmatically; it will ask you to choose the file.
- Only `http(s)` pages. Chrome blocks automation on `chrome://`, the Web Store and the new-tab page.

**When it stops to ask.** Submitting a form, leaving the page, and clicking anything worded like *send / order / subscribe / delete* pause the run and show a confirmation card listing what is about to be sent. Anything worded like a **payment, purchase or account deletion always asks**, whatever your settings say.

Settings → **Ask before submitting** controls the rest:

| Mode | Behaviour |
|------|-----------|
| Always ask | Every submit and navigation shows the card |
| Ask unless I clearly asked for it *(default)* | If your own message said "submit it", it goes ahead; otherwise it asks |
| Never ask | Submits without asking — high-risk actions still stop |

### Your details (autofill profile)

Settings → **Your details**. Name, email, phone, company, address, plus any custom fields you add. This is what the agent types into forms.

Stored in `chrome.storage.local` on your device. It is included in the prompt only during an agent run. **There is deliberately no field for passwords, card numbers or ID numbers** — the extension neither stores nor types them.

### Templates

Click the sparkle icon in the input bar for:
- Quick actions (summarize, key points, explain, Q&A)
- Translations (Spanish, French, German, Urdu, Arabic, Chinese, Japanese, English)
- Summarization (brief, detailed, TL;DR)
- Analysis (structure, arguments, code)

### Settings

- **Model** — ZenMux automatic routing by default, plus optional OpenCode Zen models and custom providers
- **OpenCode Zen API key** — overrides the built-in default key (optional)
- **Custom models** — add/remove OpenAI-compatible providers
- **Acting on pages** — master switch; off makes the assistant read-only
- **Ask before submitting** — confirmation policy, plus the action and planning-turn budgets per run
- **Your details** — the autofill profile the agent may type into forms
- **Theme** — Light, Dark, or System
- **Default translation language**
- **Page context** — auto-attach the current page to your messages

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + N` | New chat |
| `Ctrl/Cmd + B` | Toggle conversations sidebar |
| `Ctrl/Cmd + D` | Toggle theme |
| `Ctrl/Cmd + ,` | Open settings |
| `Ctrl/Cmd + /` | Focus input |
| `Enter` | Send message |
| `Shift + Enter` | New line |

## Supported Content

- Regular websites, news articles, documentation, blog posts
- Wikipedia, GitHub READMEs, Medium, etc.
- PDFs served over `http(s)` and opened in the browser

**Limitations:** browser system pages (`chrome://`, the Chrome Web Store, the new-tab page) cannot be read. `file://` PDFs require "Allow access to file URLs" to be enabled for the extension, and some `blob:` PDFs generated in-memory by a viewer may not be fetchable. In these cases the assistant tells you the page can't be accessed instead of guessing.

## How page reading works

The extension does **not** rely on you pasting content. When you send a message with page context on, the background service worker:

1. Resolves your active web tab (skipping extension / system pages)
2. Injects a reader into that tab via `chrome.scripting.executeScript` to pull the visible text (and any selected text)
3. For PDFs, fetches the file and extracts text with pdf.js
4. Passes that content to the model as context

## How agent mode works

Every message goes to the chat path first, with the full page text and the rich answering prompt. That call either answers normally — so summaries, translations and Q&A keep exactly the quality they had — or returns a one-line handoff sentinel, at which point the background starts an agent run with the same goal. One model call decides; nothing is spent on classification.

Each turn of a run:

1. A snapshot function is injected into the tab (main frame plus child frames). It walks the DOM — including open shadow roots — and tags every visible, actionable element with a `data-aipa-ref` handle: buttons, links, inputs, selects, checkboxes, ARIA widgets, `contenteditable` regions.
2. That becomes a compact list the model can address by ref — role, accessible name, current value, dropdown options, checked state, required/disabled, which form it belongs to, whether it is on screen. Refs are renumbered every turn, so the model can only ever act on what is on the page *right now*. The page-text block is only re-sent when the page actually changed, which is most of what a per-turn prompt used to cost.
3. The model replies with a JSON list of actions.
4. The batch is pre-flighted: cut at the first page-changing action, duplicates dropped, fills aimed at locked fields removed, remaining action budget applied. This guarantees a consequential action can only ever be last, so the confirmation gate cannot be skipped by burying a submit mid-batch.
5. Each action is executed in the frame that owns its ref, with real event sequences (pointer → mouse → native click) and prototype value setters, so React, Vue and friends register the change rather than silently ignoring it.
6. The batch aborts the moment anything fails or the page moves; the remaining actions are marked skipped. The indexed results are fed back and the loop repeats until the model calls `done`, asks you a question, you stop it, or it hits the action or turn budget.

A rate limit pauses and retries the turn rather than killing the run — a half-filled form is not thrown away because a free-tier limit fired.

Page text and element labels are passed as clearly delimited untrusted data, with the user's goal restated afterwards, so a page that tries to issue instructions to the agent is treated as content rather than a command.

## Privacy

Your data stays on your device. Page content is sent to the AI provider only when you send a message with page context enabled. No tracking, no analytics. See [PRIVACY.md](PRIVACY.md).

## Technical Details

- **Manifest Version**: 3
- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Build**: Vite + CRXJS
- **Default API**: ZenMux (`https://zenmux.ai/api/v1`, OpenAI-compatible) — automatic availability-priority routing
- **Fallback API**: OpenCode Zen (`https://opencode.ai/zen/v1`, OpenAI-compatible)
- **Custom providers**: any OpenAI-compatible `/chat/completions` endpoint
- **PDF parsing**: pdfjs-dist
- **Storage**: `chrome.storage.local`

## Development

Use the CRXJS dev server for day-to-day work. It keeps the extension's dev
loader connected to a stable `localhost:5173` origin and enables HMR/live
reload for the side panel and content scripts.

```bash
npm install
npm run dev
```

Then, in `chrome://extensions/`, enable Developer mode and click **Load
unpacked** once, selecting this project's `dist` folder. Keep `npm run dev`
running while you work; do not load the `dist` folder again for every change.
CRXJS updates the side panel and content scripts automatically. Changes to the
background service worker may trigger one normal extension reload, but they do
not require loading the folder again.

If Chrome shows `Service worker registration failed` or `Failed to load the
script`, the dev server is not reachable. Start `npm run dev` again before
reloading the extension. The development `service-worker-loader.js` imports
from `http://localhost:5173`, so a stopped dev server cannot run that loader.

For a standalone unpacked build that does not depend on a running dev server:

```bash
npm run build
```

After that build, use Chrome's extension **Reload** button when needed. Do not
use a `dist` folder produced by `npm run dev` as a standalone build.

```bash
npm test
npm run typecheck
```

## License

MIT
