# Bizee Order Autofill (dev tool)

A throwaway Chrome extension that autofills the partner-dashboard "new formation
order" wizard (`http://localhost:5173/orders/new/formation`, etc.) with plausible
test data, so you can click through and test orders quickly instead of typing
every field by hand. Lives outside `platform-api` and `platform-dashboard` —
no changes to either repo.

## How it works

- Runs as a content script only on `http://localhost:5173/*`.
- The dashboard form is plain Vue with no data-path attributes on inputs, so
  the tool matches each visible `<label>` to its sibling `<input>`/`<select>`.
- Before filling, it calls `GET /api/v1/jurisdictions/{state}/{entity_type}/sample?product=formation&bundle_type=...`
  (reusing the dashboard's own token from `localStorage.tokens.access_token`)
  and flattens every leaf value in the response keyed by its field name. That
  endpoint returns a *different* shape than the form's schema paths, so
  instead of a path-for-path mapping, each visible label is matched against
  the sample by field name (with common aliases — `zip`/`zip_code`,
  `first_name`, `ssn`, etc.) — real, jurisdiction-valid values wherever a
  name matches, falling back to hardcoded heuristics (`guessTextValue` /
  `chooseSelectOption` in `content.js`) for anything the sample doesn't cover.
- It fills the **currently active step only** (only one step is ever rendered
  at a time), repeats until no more fields appear (this catches conditional
  fields and member/director/officer "Number of…" groups), then clicks
  **Next** and moves to the following step.
- It stops on the last step and leaves **Validate**/**Submit Order** to you —
  it never submits an order on its own.
- **Never overwrites a field that already has a value.** This matters for two
  reasons: re-clicking Autofill after a validation error won't stomp fields
  you just fixed by hand, and if you manually correct a field and move to the
  next tab yourself, clicking Autofill again just picks up wherever the
  wizard currently is.

## Install (unpacked)

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select this folder (`order-autofill-extension/`).
2. Open the dashboard, go to **New Order → Formation**.
3. Pick **State** and **Entity Type** yourself (2 clicks — the tool
   deliberately doesn't touch product/jurisdiction selection).
4. Click the **⚡ Autofill** button (bottom-right floating panel).

## When it stops and asks for help

If a step's validation fails after clicking Next, the panel shows which
fields are still flagged (read from the inline `.text-error-200` error text)
and stops. Fix those fields by hand, then click **Autofill** again — it
resumes from the current step instead of starting over.

## Known limitations (v1)

- Value guesses are label-text heuristics, not schema-aware — a field with an
  unusual regex (e.g. a jurisdiction-specific ID format) may fail validation
  and need a manual fix. The panel will tell you which ones.
- Address-state dropdowns are matched to the jurisdiction's top-level State
  selection where possible; other selects fall back to a keyword match or the
  first real option.
- Google Places autocomplete on address fields (if
  `VITE_GOOGLE_MAPS_API_KEY` is set) isn't specifically handled — plain text
  entry still works, just without the autocomplete dropdown.

## Planned next step (not built yet)

For fields the heuristics can't guess correctly, fall back to a Gemini API
call (`gemini-flash-latest`) seeded with the field's label + validation hint
text, to generate a plausible value. Deferred until the heuristic-only
version has been used enough to know which fields actually need it.
