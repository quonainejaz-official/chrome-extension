# AI Page Assistant

An AI-powered Chrome side panel that **reads the page or PDF you're currently viewing** — and, when you ask it to, **operates that page for you**: clicking, filling forms, choosing from dropdowns, ticking boxes and scrolling.

## Features

- **Agent mode** — becomes your hands on the page: click buttons and links, type into fields, select dropdown options, tick checkboxes, scroll, navigate. It asks before it submits anything.
- **Reads your current page automatically** — the extension extracts the live content of the tab you're on (no copy-paste needed)
- **PDF support** — reads PDFs opened in the browser by fetching and parsing them with pdf.js
- **Summarize / analyze / Q&A** on articles, docs, and PDFs
- **Translate** pages and selected text into 12+ languages
- **Multiple models** — a curated set of OpenCode Zen models, plus **your own custom OpenAI-compatible providers**
- **Works out of the box** — ships with a free default model that needs no billing setup
- **Light / Dark / System theme**
- **Fully responsive** minimalist UI that adapts to any panel width
- **Conversation history** stored locally

## Installation (from source)

1. Clone this repository
2. Create a `.env` file with a default OpenCode Zen key (optional — users can also set their own in Settings):
   ```
   VITE_OPENCODE_ZEN_KEY=sk-your-key-here
   ```
3. Run `npm install`
4. Run `npm run build`
5. Open Chrome → `chrome://extensions/`
6. Enable **Developer mode**
7. Click **Load unpacked** and select the `dist` folder

> If you change `host_permissions`, remove and re-load the extension (a plain refresh won't re-prompt for the new permissions).

## Setup

The extension works immediately with the built-in **free** default model (`big-pickle`). To customize:

1. Click the extension icon to open the side panel
2. Open **Settings** (gear icon)
3. Pick a model, and/or paste your own OpenCode Zen API key
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

### Agent mode — letting it act, not just read

Click the **hand icon** in the input bar to switch the chat from *reading* the page to *operating* it. Then just say what you want:

- "Fill this form with my details" — reads the form, matches each field to your saved profile, fills them one by one, and stops so you can review
- "Fill it and submit" — same, but it goes ahead and submits, because you asked
- "Pick India in the country dropdown and tick the terms box"
- "Find the pricing section and click the Enterprise plan"
- "What can I actually do on this page?" — scrolls through and maps out the controls

**How a run works.** Each step is: look at the page → decide one action → do it → look again. You see every action stream into the panel as it happens, with a ✓, ✗ or shield next to it. The **Stop** button ends the run immediately.

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

- **Model** — free / metered OpenCode Zen models and your custom providers
- **OpenCode Zen API key** — overrides the built-in default key (optional)
- **Custom models** — add/remove OpenAI-compatible providers
- **Agent mode** — master switch, and whether new chats start in agent mode
- **Ask before submitting** — confirmation policy, plus the maximum actions per run
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

Each turn of a run:

1. A snapshot function is injected into the tab (main frame plus same-origin iframes). It walks the DOM — including open shadow roots — and tags every visible, actionable element with a `data-aipa-ref` handle: buttons, links, inputs, selects, checkboxes, ARIA widgets, `contenteditable` regions.
2. That becomes a compact list the model can address by ref — role, accessible name, current value, dropdown options, checked state, required/disabled, which form it belongs to, whether it is on screen. Refs are renumbered every turn, so the model can only ever act on what is on the page *right now*.
3. The model replies with exactly one JSON action.
4. The action is executed in the frame that owns the ref, with real event sequences (pointer → mouse → native click) and prototype value setters, so React, Vue and friends register the change rather than silently ignoring it.
5. The result — success, failure, validation error, "that dropdown is custom, here's what opened" — is fed back, and the loop repeats until the model calls `done`, asks you a question, you stop it, or it hits the step cap.

Page text and element labels are passed as clearly delimited untrusted data, with the user's goal restated afterwards, so a page that tries to issue instructions to the agent is treated as content rather than a command.

## Privacy

Your data stays on your device. Page content is sent to the AI provider only when you send a message with page context enabled. No tracking, no analytics. See [PRIVACY.md](PRIVACY.md).

## Technical Details

- **Manifest Version**: 3
- **Frontend**: React 18 + TypeScript + Tailwind CSS
- **Build**: Vite + CRXJS
- **Default API**: OpenCode Zen (`https://opencode.ai/zen/v1`, OpenAI-compatible) — default model `big-pickle` (free)
- **Custom providers**: any OpenAI-compatible `/chat/completions` endpoint
- **PDF parsing**: pdfjs-dist
- **Storage**: `chrome.storage.local`

## Development

```bash
npm install      # install dependencies
npm run dev      # development build with HMR
npm run build    # production build → dist/
npm test         # run unit tests
npm run typecheck
```

## License

MIT
