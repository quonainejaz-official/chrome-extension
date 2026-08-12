# Privacy Policy — AI Page Assistant

**Last updated:** July 2026

## Overview

AI Page Assistant ("the Extension") is a Chrome browser extension that reads the web page or PDF you are currently viewing and provides AI-powered assistance (summaries, translations, Q&A). In **agent mode** it can also act on that page on your behalf — clicking, filling in forms, choosing options and scrolling. This policy explains how the Extension handles your data.

## Data Collection

The Extension does **not** collect analytics or telemetry, and does **not** transmit your data to anyone except the AI provider you choose to use, as described below.

### Data Stored Locally on Your Device

Stored in Chrome's local storage (`chrome.storage.local`) on your device only:

- **API key** — your OpenCode Zen key and any keys you add for custom providers
- **Custom models** — the endpoints, model IDs, and optional keys you configure
- **Settings** — theme, default language, selected model, page-context preference
- **Conversations** — chat messages and the page context attached to them
- **Page cache** — a short-lived copy of extracted page content (auto-expires after ~5 minutes)
- **Your details (autofill profile)** — the name, email, phone, company and address you optionally save so the agent can fill forms for you, plus any custom fields you add

> **Note on your details:** the profile has **no fields for passwords, payment card numbers, CVV codes, one-time codes or government ID numbers**, and the Extension will not store them. The code that types into pages refuses to fill any field that looks like one, so those always remain for you to type yourself.

> **Note on API keys:** keys are stored in Chrome's local storage in plain form (the same mechanism Chrome uses for extension data). They are not additionally encrypted at rest. Anyone with access to your Chrome profile could read them, so treat the device accordingly.

### Data Sent to Third Parties

When you send a message, the following is sent **only** to the AI endpoint selected for that message:

- **Default provider:** OpenCode Zen — `https://opencode.ai/zen/v1`
- **Custom providers:** whatever endpoint URL you configured (e.g. OpenAI, a local server)

What is sent:

- **API key** — as an `Authorization` header, for authentication (omitted for custom endpoints you configure without a key)
- **Page content** — the extracted text of your current page/PDF, **only when page context is enabled** for that message
- **Selected text** — if you have text selected on the page
- **Chat messages** — your prompts and recent conversation history
- **During an agent run only:** a structured list of the page's interactive elements (buttons, links, form fields, their labels and current values), and **your saved details**, so the model can decide what to click and what to type. Values of password/card/OTP-style fields are never included.

**No data is sent anywhere else.** The Extension contains no analytics, tracking, or advertising code.

## How Page Content Is Read

- For normal pages, the Extension injects a reader into your active tab via `chrome.scripting.executeScript` to extract visible text at the moment you send a message.
- For PDFs, the Extension fetches the PDF file and extracts its text locally using pdf.js. Parsing happens on your device; only the resulting text is sent to the AI provider (and only with page context enabled).
- Browser system pages (`chrome://`, Chrome Web Store, new-tab) are never read.
- The Extension requests `<all_urls>` host access so it can read whichever page you are viewing. It reads a page only when you send a message with page context on (or when the panel refreshes context).

## How Agent Mode Acts on Pages

- Agent mode is **off by default** and is switched on per chat with the hand button in the input bar. It can be disabled entirely in Settings.
- While a run is active, the Extension injects code into your active tab that dispatches real click, keyboard and input events, and reads element labels and values so it knows what it is doing.
- **It never enters passwords, card numbers, CVV codes, one-time codes, SSNs or API keys.** Those fields are refused by the code that touches the page, independently of what the model asks for.
- Submitting a form, navigating away, and clicking controls worded like *send / order / subscribe / delete* pause the run and ask you first. Payment, purchase and account-deletion wording always asks, regardless of your settings.
- Every action is shown in the panel as it happens, and a Stop button ends the run immediately.
- Only `http(s)` pages can be automated.

## How Your Data Is Used

1. **API key** — solely to authenticate requests to the provider you selected
2. **Page/selected content** — sent as context so the AI can answer about your page; retention on the provider's side is governed by that provider
3. **Conversations & settings** — stored locally for your convenience

## Data Security

- All communication with AI providers uses HTTPS.
- No data is logged, tracked, or sold by the Extension.
- Injected readers and content scripts run in Chrome's isolated world. Outside agent mode they only read page text and do not modify pages; in agent mode they interact with the page exactly as far as the action you asked for requires.

## Data Retention

- **Conversations** — kept until you delete them (up to 50 conversations; oldest are dropped beyond that)
- **Page cache** — auto-expires after ~5 minutes
- **API keys & custom models** — kept until you change or remove them
- **Your details (autofill profile)** — kept until you clear the fields or uninstall
- **Settings** — kept until changed or the Extension is uninstalled

## Your Rights & Controls

- **Control** — disable page-context sharing at any time with the document toggle in the input bar
- **Agent mode** — off unless you turn it on for a chat; can be switched off entirely in Settings; Stop ends any run instantly
- **Your details** — optional; clear any field to stop it being shared
- **Choose your provider** — use the default, your own OpenCode Zen key, or a fully custom endpoint
- **Delete** — remove individual conversations, or uninstall to erase all locally stored data

## Third-Party Services

### OpenCode Zen (default provider)

- Endpoint: `https://opencode.ai/zen/v1`
- Data sent: API key (auth), page content (when enabled), chat messages
- Governed by OpenCode Zen's own privacy policy

### Custom providers (optional)

If you add a custom model, your messages and page content are sent to the endpoint URL you specify. You are responsible for the privacy terms of any endpoint you configure.

## Children's Privacy

The Extension is not directed at children under 13, and does not knowingly collect data from children.

## Changes to This Policy

This policy may be updated over time. Changes will be reflected in the Extension's documentation and store listing.

## Contact

For questions, please open an issue in the project's repository.

## Summary

- Your data stays on your device except the messages/page content you send to your chosen AI provider
- Page content is sent only when you enable page context
- Agent mode is off by default, shows you every action, asks before submitting, and can never type passwords or payment details
- You can use the default provider, your own key, or a custom endpoint
- No tracking, no analytics, no data selling
- API keys are stored locally in Chrome storage (not additionally encrypted)
