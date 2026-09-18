# Changelog

All notable changes to AI Page Assistant are documented here.

## [1.1.0] - 2026-09-18

### Added

- Page agent mode that can inspect the current page and carry out requested actions such as clicking, filling fields, selecting options, toggling checkboxes, scrolling, and navigating.
- Automatic intent handoff between normal page chat and action runs, so users do not need to switch modes.
- Support for actionable elements inside frames and open shadow roots, with fresh references generated for each run turn.
- Saved profile details for filling ordinary form fields, with protected handling for passwords, payment details, OTPs, API keys, and other sensitive fields.
- Confirmation cards and safety gates for submissions, navigation, publishing, payments, deletion, and other consequential actions.
- Live run progress, action traces, stop controls, and clearer recovery messages for stalled, rate-limited, or failed runs.
- ZenMux availability-priority model routing with OpenCode Zen fallback, plus custom OpenAI-compatible providers.
- Additional accessibility labels, keyboard-friendly controls, responsive side-panel layout, and refined light/dark/system theme styling.

### Fixed

- Prevented stale page references from applying actions to the wrong element after page updates or navigation.
- Prevented optional form fields from shifting later values into the wrong fields.
- Improved label detection for forms with repeated or visually separated field groups.
- Prevented agent handoff markers and intermediate action data from appearing as normal chat responses.
- Improved model error reporting and retry behavior for rate limits and provider failures.

### Known limitations

- Chrome system pages, the Web Store, and the new-tab page cannot be read or automated.
- File pickers and sensitive fields must be completed by the user.
- A production build requires the configured provider environment variables at build time.
