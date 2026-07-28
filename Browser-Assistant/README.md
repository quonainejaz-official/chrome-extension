# AI Page Assistant

An AI-powered Chrome side panel that **reads the page or PDF you're currently viewing** and lets you chat about it — summarize, translate, extract key points, or ask anything.

## Features

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
