# Unslop

Unslop is a Chrome extension that automatically detects AI-generated social media posts and hides or blurs them from a user's feed. It supports LinkedIn, X (Twitter), and Reddit. Detection runs locally in the extension and classification is performed by user-configured LLM endpoints.

## Features
- Detects AI-generated posts and hides/collapses them
- Supports OpenAI-compatible, OpenRouter, ZenMux and other compatible endpoints
- Local caching of decisions by post hash (SHA-256)
- Full settings UI with whitelist/blacklist, sensitivity, appearance, and debug
- No analytics, no backend, no user accounts

## Installation
1. Clone or download the repository
2. Run `npm install`
3. Run `npm run dev` for development

## Development
- `npm run dev` — runs Vite dev server (used for UI pages)
- `npm run build` — builds the extension into `dist/` ready for packaging

## Packaging and Chrome Store
1. Run `npm run build`
2. Load the `dist/` folder in Chrome as an unpacked extension (chrome://extensions)
3. Follow Chrome Web Store publishing guidelines to submit

## API Configuration
From the extension Settings (Options page) you can configure:
- API URL
- API Key
- Model name
- Temperature
- Max tokens

## Privacy
- No analytics
- No telemetry
- No server-side storage
- Only the visible post text is sent to the configured LLM endpoint

## Contributing
Contributions welcome. Please follow best practices, write tests and keep the extension privacy-first.
