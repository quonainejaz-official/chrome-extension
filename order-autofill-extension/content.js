// Bizee Order Autofill (dev tool) — content script.
// Injected only on http://localhost:5173/* (see manifest.json).
// Fills the /orders/new/:product wizard with plausible test data, tab by tab,
// then stops before Validate/Submit so a human always makes the final call.

(function () {
  if (window.__bizeeAutofillInjected) return;
  window.__bizeeAutofillInjected = true;

  // "Entity Type" and "Bundle" only ever label the top-of-page jurisdiction
  // selectors — safe to skip by text everywhere. "State" is NOT safe to skip
  // by text: every address block in the wizard (Principal Address, EIN,
  // member/director/shareholder addresses, ...) reuses the exact same plain
  // "State" label. Skipping by text alone silently discarded every one of
  // those fields, not just the one bootstrap selector it was meant for — see
  // the per-pass "first occurrence only" handling in fillPass() below.
  const ALWAYS_BOOTSTRAP_LABELS = new Set(['entity type', 'bundle']);

  // ---------- small DOM helpers ----------

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function findButtonByText(text) {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.find((b) => b.textContent.trim().toLowerCase().startsWith(text.toLowerCase()));
  }

  function allLabels() {
    return Array.from(document.querySelectorAll('label'));
  }

  function labelText(label) {
    // The label wraps the visible text in its own <span>, plus a sibling
    // <FieldHint> whose tooltip text is only visually hidden (opacity/visibility
    // CSS, not removed from the DOM) — label.textContent would otherwise pull
    // that hint text in too and garble every downstream match. Read just the
    // first <span> (field name + required "*"), not the whole label.
    const span = label.querySelector('span');
    const raw = span ? span.textContent : label.textContent;
    return raw.replace('*', '').trim();
  }

  function controlForLabel(label) {
    const wrap = label.parentElement;
    if (!wrap) return null;
    return wrap.querySelector('select, input');
  }

  function setNativeValue(el, value) {
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  }

  function fireInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function fireChange(el) {
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // The top-of-page jurisdiction "State" is always the first <select> on the
  // wizard (see chooseSelectOption's address-state path). Read it once here so
  // both country/county heuristics and the state-dropdown match agree.
  function getJurisdictionState() {
    return (document.querySelector('select')?.value || '').trim().toUpperCase();
  }

  // A real, representative county per state (usually the most populous) so the
  // free-text "County" field stays relevant to the chosen jurisdiction instead
  // of a hardcoded Arizona value. County has no enum/regex in the schema — the
  // backend just stores the string — so any real county name is valid.
  const STATE_COUNTIES = {
    AL: 'Jefferson', AK: 'Anchorage', AZ: 'Maricopa', AR: 'Pulaski', CA: 'Los Angeles',
    CO: 'Denver', CT: 'Fairfield', DE: 'New Castle', DC: 'District of Columbia',
    FL: 'Miami-Dade', GA: 'Fulton', HI: 'Honolulu', ID: 'Ada', IL: 'Cook', IN: 'Marion',
    IA: 'Polk', KS: 'Johnson', KY: 'Jefferson', LA: 'East Baton Rouge', ME: 'Cumberland',
    MD: 'Montgomery', MA: 'Middlesex', MI: 'Wayne', MN: 'Hennepin', MS: 'Hinds',
    MO: 'St. Louis', MT: 'Yellowstone', NE: 'Douglas', NV: 'Clark', NH: 'Hillsborough',
    NJ: 'Bergen', NM: 'Bernalillo', NY: 'New York', NC: 'Mecklenburg', ND: 'Cass',
    OH: 'Franklin', OK: 'Oklahoma', OR: 'Multnomah', PA: 'Philadelphia', RI: 'Providence',
    SC: 'Greenville', SD: 'Minnehaha', TN: 'Shelby', TX: 'Harris', UT: 'Salt Lake',
    VT: 'Chittenden', VA: 'Fairfax', WA: 'King', WV: 'Kanawha', WI: 'Milwaukee', WY: 'Laramie',
  };

  // ---------- sample data (GET /jurisdictions/{state}/{entity_type}/sample) ----------
  //
  // The sample endpoint returns the partner-facing v0 wire shape, which is a
  // *different* shape than the schema-driven paths the form binds to (see
  // README). Rather than translate paths 1:1, we flatten every leaf value in
  // the sample response keyed by its own field name (last path segment) and
  // match those against form labels by name — tolerant of the shape mismatch,
  // and it gives us real, jurisdiction-valid values (correct regex/format)
  // instead of generic placeholders wherever a name match is found.

  let sampleIndex = null; // Map<string, string[]> — flattened leaves, for value lookups
  let sampleRaw = null; // parsed `data` body, for structural lookups (contact counts per role)
  const sampleUsage = new Map(); // Map<string, number> — cursor per key, cycles

  // The sample's contacts[] mixes every role (member/director/officer/
  // shareholder) into one flat array tagged by contact_type. Count-driven
  // role steps (MemberGroupsField's "Number of X") and array-driven role
  // steps (SchemaArray's Add/Remove, e.g. Shareholder) both need to know how
  // many people of a given role the sample actually describes.
  function countContactsOfType(role) {
    const contacts = sampleRaw?.company?.contacts;
    if (!Array.isArray(contacts)) return null;
    const n = contacts.filter((c) => c && c.contact_type === role).length;
    return n > 0 ? n : null;
  }

  function getAuthToken() {
    try {
      const raw = localStorage.getItem('tokens');
      if (!raw) return null;
      return JSON.parse(raw)?.access_token ?? null;
    } catch {
      return null;
    }
  }

  function flattenLeaves(node, into) {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      node.forEach((v) => flattenLeaves(v, into));
      return;
    }
    if (typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) {
        if (value !== null && typeof value === 'object') {
          flattenLeaves(value, into);
        } else if (value !== null && value !== '' && value !== undefined) {
          if (!into.has(key)) into.set(key, []);
          into.get(key).push(String(value));
        }
      }
      return;
    }
  }

  async function fetchSample(state, entityType, bundleType) {
    const token = getAuthToken();
    if (!token) {
      report('No auth token found in localStorage — skipping sample data, using heuristics only.');
      return null;
    }
    try {
      const url = `/api/v1/jurisdictions/${encodeURIComponent(state)}/${encodeURIComponent(entityType)}/sample?product=formation&bundle_type=${encodeURIComponent(bundleType)}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        report(`Sample API returned ${res.status} — using heuristics only.`);
        return null;
      }
      const body = await res.json();
      const data = body?.data ?? body;
      const map = new Map();
      flattenLeaves(data, map);
      sampleRaw = data;
      return map;
    } catch (e) {
      report(`Sample API fetch failed (${e.message}) — using heuristics only.`);
      return null;
    }
  }

  function normalizeLabelKey(label) {
    return label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  const KEY_ALIASES = [
    ['zip', 'zip_code', 'postal_code'],
    ['street', 'street1', 'address_line_1', 'address1'],
    ['legal_name', 'name', 'company_name', 'entity_name'],
    ['ssn', 'social_security_number'],
    ['ein', 'employer_identification_number', 'federal_ein'],
    ['first_name', 'firstname'],
    ['last_name', 'lastname'],
    ['ownership_percentage', 'percentage', 'ownership'],
    ['phone', 'phone_number', 'tel'],
    ['email', 'email_address'],
    ['date_of_birth', 'dob'],
    ['statement', 'business_purpose', 'purpose'],
    ['number_of_shares', 'authorized_shares', 'shares_authorized', 'total_shares'],
    ['par_value', 'par_value_per_share'],
  ];

  function candidateKeysForLabel(label) {
    const norm = normalizeLabelKey(label);
    const out = new Set([norm]);
    for (const group of KEY_ALIASES) {
      if (group.includes(norm)) group.forEach((k) => out.add(k));
    }
    return Array.from(out);
  }

  function consumeSampleValue(label) {
    if (!sampleIndex) return null;
    for (const key of candidateKeysForLabel(label)) {
      const values = sampleIndex.get(key);
      if (!values || values.length === 0) continue;
      const i = (sampleUsage.get(key) ?? 0) % values.length;
      sampleUsage.set(key, i + 1);
      return values[i];
    }
    return null;
  }

  // ---------- value heuristics ----------

  function chooseSelectOption(label, selectEl) {
    const lower = label.toLowerCase();
    const options = Array.from(selectEl.options).filter((o) => o.value !== '');
    if (options.length === 0) return null;

    const prefer = (pred) => options.find(pred);
    let picked = null;

    // Address-state dropdowns get a dedicated, unconditional path: match
    // against the jurisdiction state already chosen at the top of the page
    // (always correct for this tool's test data — every address in the
    // sample matches the jurisdiction). This runs BEFORE the generic sample
    // lookup on purpose — it doesn't depend on the sample payload's "state"
    // leaves being flattened/matched correctly, only on the one dropdown
    // that's already guaranteed to have a real value.
    if (lower === 'state') {
      const topState = getJurisdictionState();
      if (topState) {
        picked = prefer((o) => o.value.trim().toUpperCase() === topState);
        if (picked) return picked.value;
      }
    }

    // Officer titles must be unique per company (President/Secretary/Treasurer/
    // Vice President each appear at most once). SchemaField even hides a title
    // already picked by a sibling officer from this dropdown — so filling every
    // officer with the same first option left the later ones holding a value
    // that was no longer a valid option, which Vue then reset to blank (the
    // "missed" title). Pick an option not already chosen by any other title
    // <select> currently on the page. With only one title field, `used` is
    // empty and this behaves exactly like the default first-option pick.
    if (lower === 'title' || lower.endsWith(' title')) {
      const used = new Set();
      for (const lbl of allLabels()) {
        const t = labelText(lbl).toLowerCase();
        if (t === 'title' || t.endsWith(' title')) {
          const ctrl = controlForLabel(lbl);
          if (ctrl && ctrl !== selectEl && ctrl.value) used.add(ctrl.value.trim().toLowerCase());
        }
      }
      picked = prefer(
        (o) => !used.has(o.value.trim().toLowerCase()) && !used.has(o.textContent.trim().toLowerCase()),
      );
      if (picked) return picked.value;
    }

    const sampleValue = consumeSampleValue(label);
    if (sampleValue) {
      const sv = sampleValue.toLowerCase();
      picked = prefer((o) => o.value.toLowerCase() === sv || o.textContent.toLowerCase().includes(sv));
      if (picked) return picked.value;
    }

    if (lower.includes('management') || lower.includes('managed')) {
      picked = prefer((o) => /member/i.test(o.value) || /member/i.test(o.textContent));
    } else if (lower.includes('classification') || lower === 'type' || lower.endsWith(' type')) {
      picked = prefer((o) => /individual/i.test(o.value) || /individual/i.test(o.textContent));
    } else if (lower.includes('ssn') || lower.includes('identifier')) {
      picked = prefer((o) => /^ssn$/i.test(o.value) || /^ssn$/i.test(o.textContent));
    } else if (lower === 'file' || lower.endsWith(' file')) {
      picked = prefer((o) => /^yes$/i.test(o.value) || /^yes$/i.test(o.textContent));
    } else if (lower.includes('designator')) {
      picked = prefer((o) => /llc/i.test(o.value) || /llc/i.test(o.textContent));
    } else if (lower.includes('country')) {
      picked = prefer((o) => /^us$|united states/i.test(o.value) || /^us$|united states/i.test(o.textContent));
    }

    return (picked || options[0]).value;
  }

  function guessTextValue(label, inputEl) {
    const lower = label.toLowerCase();
    const type = inputEl.type;

    // MemberGroupsField's count field ("Number of Members/Directors/Officers")
    // drives how many per-person groups render. Use the sample's actual count
    // for that role (contacts[] tagged by contact_type) rather than always 1 —
    // matched narrowly so it doesn't swallow unrelated fields like "Number Of
    // Shares" (that's a share count, handled by the number_of_shares alias
    // below via the general sample lookup).
    const roleCountMatch = lower.match(/^number of (member|director|officer|shareholder)s?$/);
    if (roleCountMatch) {
      return String(countContactsOfType(roleCountMatch[1]) ?? 1);
    }

    const sampleValue = consumeSampleValue(label);
    if (sampleValue) return sampleValue;

    // Realistic enterprise-grade test data — structured so address fields
    // (street + city + state + zip) always stay consistent with each other.
    const people = [
      { first: 'Alexander', last: 'Sterling',   middle: 'James',    suffix: 'Jr.', dob: '03/15/1985', ssn: '478-29-1563' },
      { first: 'Marcus',    last: 'Chen',       middle: 'Wei',      suffix: 'Sr.', dob: '07/22/1978', ssn: '521-73-8946' },
      { first: 'Priya',     last: 'Kapoor',     middle: 'Anjali',   suffix: 'II',  dob: '11/03/1990', ssn: '639-48-2175' },
      { first: 'James',     last: 'Wellington', middle: 'Edward',   suffix: 'III', dob: '05/29/1982', ssn: '384-62-9107' },
      { first: 'Catherine', last: 'Bennett',    middle: 'Rose',     suffix: 'IV',  dob: '09/14/1988', ssn: '715-83-4629' },
    ];

    // Each address is a complete, consistent unit — street, city, zip, unit and
    // county all belong to the same real-world location so the form never gets
    // mismatched data. Scottsdale and Phoenix are both in Maricopa County, AZ,
    // so the county stays genuinely correct alongside the rest of the address.
    const addresses = [
      { street: '4521 Corporate Parkway, Suite 300',   city: 'Scottsdale', zip: '85251', unit: 'Suite 300', county: 'Maricopa' },
      { street: '12800 N Tatum Boulevard, Suite 220',  city: 'Phoenix',    zip: '85016', unit: 'Suite 220', county: 'Maricopa' },
      { street: '3300 E Camelback Road, Suite 150',    city: 'Phoenix',    zip: '85018', unit: 'Suite 150', county: 'Maricopa' },
      { street: '8840 E Rovey Avenue',                 city: 'Scottsdale', zip: '85255', unit: 'Suite 100', county: 'Maricopa' },
      { street: '21001 N Tatum Blvd, Unit 102',        city: 'Phoenix',    zip: '85050', unit: 'Unit 102',  county: 'Maricopa' },
    ];

    const companies = [
      'Sterling Capital Holdings LLC',
      'Meridian Technology Partners LLC',
      'Atlas Strategic Ventures LLC',
      'Pinnacle Commerce Group LLC',
      'Crestview Digital Solutions LLC',
    ];

    const phones  = ['4805559247', '6025551834', '4805553961', '6025557209', '4805556015'];
    const emails  = [
      'a.sterling@sterlingholdings.com',
      'm.chen@meridian-tech.com',
      'p.kapoor@atlasventures.io',
      'j.wellington@pinnaclecommerce.com',
      'c.bennett@crestviewdigital.com',
    ];
    const titles   = ['Managing Member', 'Member', 'Manager', 'Authorized Representative', 'Signatory'];
    const purposes = [
      'Technology consulting and software development services.',
      'Business advisory and management consulting services.',
      'Real estate investment and property management operations.',
      'Digital marketing and e-commerce solutions provider.',
      'Financial planning and investment advisory services.',
    ];

    // Deterministic index from label hash — related fields (name parts,
    // address parts) are normalized to a shared key so they always resolve
    // to the same person/address record.
    function poolIndex(key) {
      let h = 0;
      for (let i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
      return Math.abs(h) % people.length;
    }
    // "First/Middle/Last Name" / "Suffix" / "SSN" / "DOB" → same person
    const personKey = lower.replace(/first.?name|last.?name|middle.?name|suffix|social.?security|ssn|date.?of.?birth|dob/gi, 'person');
    // "Street" / "City" / "Zip" / "Unit" / "Suite" / "County" → same address
    const addrKey = lower.replace(/street|city|zip|postal|unit|suite|county/gi, 'address');
    const personIdx = poolIndex(personKey);
    const addrIdx   = poolIndex(addrKey);

    function pickFromPool(pool) { return pool[poolIndex(lower) % pool.length]; }

    if (type === 'email') return emails[personIdx % emails.length];
    if (type === 'tel') return phones[personIdx % phones.length];

    if (/first name/.test(lower)) return people[personIdx].first;
    if (/last name/.test(lower))  return people[personIdx].last;
    if (/middle name/.test(lower)) return people[personIdx].middle;
    if (/^suffix$/.test(lower))    return people[personIdx].suffix;
    if (/legal name|company name|entity name/.test(lower)) return companies[personIdx % companies.length];
    if (/designator/.test(lower)) return 'LLC';
    if (/street/.test(lower))     return addresses[addrIdx].street;
    if (/^city$/.test(lower))     return addresses[addrIdx].city;
    if (/zip|postal/.test(lower)) return addresses[addrIdx].zip;
    if (/^(unit|suite)$/.test(lower)) return addresses[addrIdx].unit;
    if (/county/.test(lower))     return STATE_COUNTIES[getJurisdictionState()] || addresses[addrIdx].county;
    if (/country/.test(lower))    return 'US'; // codebase stores country as the 2-letter 'US' everywhere
    if (/note/.test(lower))       return 'Test order created via Bizee autofill dev tool.';
    if (/ownership|percentage/.test(lower)) return '100';
    if (/social security|^ssn$/.test(lower)) return people[personIdx].ssn;
    if (/itin/.test(lower)) return '947-56-8231';
    if (/employer identification|federal tax|^ein$/.test(lower)) return '84-2957310';
    if (/date of birth|\bdob\b/.test(lower)) return people[personIdx].dob;
    if (/^title$/.test(lower)) return titles[personIdx % titles.length];
    if (/purpose/.test(lower)) return purposes[personIdx % purposes.length];
    if (/phone/.test(lower)) return phones[personIdx % phones.length];
    if (/number of/.test(lower)) return '1';
    if (/^shares$/.test(lower)) return '1000';
    if (/^par value/.test(lower)) return '0.001';

    // Contextual fallback instead of generic "Sample Data"
    if (/website|url|domain/.test(lower)) return 'https://www.sterlingholdings.com';
    if (/description|business description|activity/.test(lower)) return 'Technology consulting and software development.';
    if (/fiscal year|year end/.test(lower)) return '12/31';
    if (/naics|sic|industry/.test(lower)) return '541511';
    if (/date|effective/.test(lower)) return '01/15/2025';
    return 'N/A';
  }

  // ---------- fill loop ----------

  // Shareholders (and any other role modeled as a plain array rather than a
  // MemberGroupsField count) render via SchemaArray: an "Add" button that
  // appends one blank item at a time, no upfront count field at all. Grow
  // each array section to match the sample's actual count for that role
  // before trying to fill anything inside it.
  async function growArraysToSampleCounts() {
    const addButtons = Array.from(document.querySelectorAll('button')).filter(
      (b) => b.textContent.trim() === 'Add',
    );
    for (const addBtn of addButtons) {
      try {
        const headerRow = addBtn.parentElement;
        const outer = headerRow?.parentElement;
        if (!outer) continue;
        const heading = headerRow.querySelector('h3')?.textContent.trim() || '';
        if (!heading) continue; // not a SchemaArray "Add" button (no h3 heading sibling) — leave it alone
        const singular = heading.toLowerCase().replace(/ies$/, 'y').replace(/s$/, '');
        const desired = countContactsOfType(singular) ?? 1;

        let guard = 0;
        while (guard++ < 15) {
          const currentCount = Array.from(outer.querySelectorAll('button')).filter(
            (b) => b.textContent.trim() === 'Remove',
          ).length;
          if (currentCount >= desired || addBtn.disabled) break;
          addBtn.click();
          await sleep(150);
        }
      } catch (e) {
        console.error('[bizee-autofill] array-grow error:', e);
      }
    }
  }

  // One pass over every currently-rendered field. `changed` means it wrote a
  // value; `waitingForCatalog` means a select is present but its options
  // (e.g. a states catalog) haven't loaded yet — the caller keeps looping
  // instead of treating the step as "settled" while that's still true.
  async function fillPass() {
    let changed = false;
    let waitingForCatalog = false;
    let sawBootstrapState = false; // the top-of-page jurisdiction "State" — skip only this one occurrence

    for (const label of allLabels()) {
      // One field's exception must never abort the rest of the pass — without
      // this, a single unexpected DOM shape silently killed every field that
      // came after it in the same iteration (including, sometimes, State).
      try {
        const text = labelText(label);
        const lower = text.toLowerCase();

        const el = controlForLabel(label);

        if (ALWAYS_BOOTSTRAP_LABELS.has(lower)) continue;
        if (lower === 'state' && !sawBootstrapState) {
          sawBootstrapState = true;
          continue;
        }
        if (!el) continue;

        // Address-"State" selects render pre-seeded with a default option
        // (the first alphabetically, e.g. "AL") rather than truly blank —
        // that's not user data, so unlike every other field it doesn't earn
        // the never-overwrite protection. Always correct it to match the
        // jurisdiction already chosen if it's currently wrong (a no-op once
        // it's already right, so this can't loop or clobber a deliberate
        // manual override for long — it only fires while mismatched).
        const isStateSelect = el.tagName === 'SELECT' && lower === 'state';

        if (el.value && !isStateSelect) continue; // never overwrite a value that's already there —
        // covers both fields we already filled and fields the user fixed by hand.

        if (el.tagName === 'SELECT') {
          if (el.options.length <= 1) {
            waitingForCatalog = true; // catalog (e.g. states) still loading — retry
            continue;
          }
          const value = chooseSelectOption(text, el);
          if (!value) continue;
          if (isStateSelect && value === el.value) continue; // already correct — avoid a no-op refire
          setNativeValue(el, value);
          fireChange(el);
          changed = true;
        } else {
          const value = guessTextValue(text, el);
          if (value === null) continue;
          setNativeValue(el, value);
          fireInput(el);
          changed = true;
        }

        // The "Number of X" count field (member/director/officer groups)
        // causes new labels to mount reactively — give Vue a beat before the
        // next pass re-queries the DOM, so newly-added group fields are seen.
        if (/number of/.test(lower)) {
          await sleep(150);
        }
      } catch (e) {
        console.error('[bizee-autofill] field error:', labelText(label), e);
      }
    }

    return { changed, waitingForCatalog };
  }

  async function settleStep() {
    await growArraysToSampleCounts();

    // Time-boxed rather than pass-count-boxed: a still-loading catalog select
    // must not be mistaken for "nothing left to do" just because no other
    // field changed on that particular pass.
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      await growArraysToSampleCounts();
      const { changed, waitingForCatalog } = await fillPass();
      await sleep(150);
      if (!changed && !waitingForCatalog) break;
    }
  }

  function currentErrors() {
    return Array.from(document.querySelectorAll('.text-error-200'))
      .map((el) => el.textContent.trim())
      .filter(Boolean);
  }

  let statusEl = null;
  let sampleFetchedFor = null; // `${state}|${entityType}|${bundleType}` — avoid refetching on resume

  function report(msg) {
    if (statusEl) statusEl.textContent = msg;
    console.log('[bizee-autofill]', msg);
  }

  async function runOrResume() {
    try {
      // Bootstrap gate: require State + Entity Type to already be chosen —
      // that's two clicks and keeps this tool out of product-selection logic.
      const selects = Array.from(document.querySelectorAll('select'));
      const stateSelect = selects[0];
      const entitySelect = selects[1];
      if (!stateSelect?.value || !entitySelect?.value) {
        report('Pick State + Entity Type first, then click Autofill again.');
        return;
      }

      // A third top-level select only renders when the product has a bundle
      // choice (see CreateOrderView.vue) — default to "basic" otherwise.
      const bundleSelect = selects.find((s) => s !== stateSelect && s !== entitySelect && /basic|advanced/i.test(s.value || ''));
      const bundleType = bundleSelect?.value || 'basic';
      const sampleKey = `${stateSelect.value}|${entitySelect.value}|${bundleType}`;

      if (sampleFetchedFor !== sampleKey) {
        report('Fetching sample data…');
        sampleIndex = await fetchSample(stateSelect.value, entitySelect.value, bundleType);
        sampleUsage.clear();
        sampleFetchedFor = sampleKey;
      }

      for (let step = 0; step < 15; step++) {
        await settleStep();

        const next = findButtonByText('Next');
        if (!next) {
          report('Reached the last step — review and click Validate/Submit yourself.');
          return;
        }

        next.click();
        await sleep(200);

        const errs = currentErrors();
        if (errs.length > 0) {
          report(
            `Stopped — needs manual input: ${errs.slice(0, 4).join(' | ')}${errs.length > 4 ? ' …' : ''}. ` +
              `Fix those, then click Autofill again to continue.`,
          );
          return;
        }
      }

      report('Filled as many steps as this tool allows (15) — check the wizard.');
    } catch (e) {
      console.error('[bizee-autofill] runOrResume error:', e);
      report(`Error: ${e.message} — see DevTools console for the full stack trace.`);
    }
  }

  // ---------- floating panel ----------

  const POS_KEY = 'bizeeAutofillPanelPos';

  function loadPanelPos() {
    try {
      return JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function savePanelPos(pos) {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      /* ignore */
    }
  }

  function makeDraggable(host, handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    handle.addEventListener('pointerdown', (e) => {
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      const rect = host.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      e.preventDefault();
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = host.getBoundingClientRect();
      let left = startLeft + (e.clientX - startX);
      let top = startTop + (e.clientY - startY);
      // Keep it fully on-screen so it can't get dragged somewhere unreachable.
      left = Math.max(0, Math.min(window.innerWidth - rect.width, left));
      top = Math.max(0, Math.min(window.innerHeight - rect.height, top));
      host.style.left = `${left}px`;
      host.style.top = `${top}px`;
      host.style.right = 'auto';
      host.style.bottom = 'auto';
    });

    const stop = (e) => {
      if (!dragging) return;
      dragging = false;
      const rect = host.getBoundingClientRect();
      savePanelPos({ left: rect.left, top: rect.top });
    };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  }

  function injectPanel() {
    if (document.getElementById('bizee-autofill-panel')) return;
    if (!/\/orders\/new\//.test(location.pathname)) return;

    const host = document.createElement('div');
    host.id = 'bizee-autofill-panel';
    const saved = loadPanelPos();
    if (saved) {
      host.style.cssText = `position:fixed;left:${saved.left}px;top:${saved.top}px;z-index:2147483647;`;
    } else {
      host.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;';
    }
    document.body.appendChild(host);

    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        .panel { font-family: system-ui, sans-serif; background: #1f2937; color: #fff;
          border-radius: 10px; box-shadow: 0 4px 16px rgba(0,0,0,.3); max-width: 280px;
          overflow: hidden; }
        .drag-handle { cursor: move; padding: 6px 10px; background: #111827;
          font-size: 11px; color: #9ca3af; user-select: none; touch-action: none;
          display: flex; align-items: center; justify-content: space-between; }
        .body { padding: 10px 12px; }
        button { background: #f97316; color: #fff; border: none; border-radius: 6px;
          padding: 6px 10px; font-size: 13px; font-weight: 600; cursor: pointer; }
        button:hover { background: #ea580c; }
        .status { font-size: 11px; margin-top: 6px; color: #d1d5db; line-height: 1.4; }
      </style>
      <div class="panel">
        <div class="drag-handle" id="handle">⠿⠿ drag</div>
        <div class="body">
          <button id="run">⚡ Autofill</button>
          <div class="status" id="bizee-autofill-status">Idle. Pick State + Entity Type, then click.</div>
        </div>
      </div>
    `;
    statusEl = root.getElementById('bizee-autofill-status');
    root.getElementById('run').addEventListener('click', () => {
      report('Running…');
      runOrResume();
    });
    makeDraggable(host, root.getElementById('handle'));
  }

  injectPanel();
  // The wizard route is client-side (SPA); re-check periodically in case the
  // panel needs to (re)appear after navigation without a full page load.
  setInterval(injectPanel, 1000);
})();
