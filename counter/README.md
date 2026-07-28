# Attendance Tracker — Chrome Extension

A production-ready Manifest V3 Chrome Extension that analyzes your office attendance page and provides a clean summary of late days, short leaves, full leaves, office time shortage, and more.

---

## Features

- **Office Time Short** — calculates total time short across all working days
- **Late Days** — counts arrivals flagged as "Late" or "Will be late"
- **Short Leave Days** — counts rows with "Short Leave" in Reason
- **Half Leaves** — detects half leaves by keyword or ~50% hours worked (configurable)
- **Full Leaves** — counts absent working days (excludes weekends & holidays)
- **Weekend Exclusion** — Saturday/Sunday never counted in statistics
- **Public Holiday Exclusion** — holidays, office closed days ignored
- **Dynamic Column Detection** — reads table headers; column order does not matter
- **Export CSV** — download full attendance data + summary
- **Copy Summary** — one-click copy to clipboard
- **Dark Mode** — toggle between light and dark themes
- **Toast Notifications** — visual feedback for actions
- **Loading Spinner** — shown while parsing

---

## File Structure

```
attendance-tracker/
├── manifest.json
├── background.js
├── content.js
├── attendanceParser.js
├── attendanceCalculator.js
├── popup.html
├── popup.css
├── popup.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

---

## Installation

### Step 1: Load in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `attendance-tracker` folder
5. The extension icon appears in your toolbar

### Step 2: Use

1. Navigate to your attendance website
2. Select a date range and click **Search** to load attendance rows
3. Click the extension icon in the toolbar
4. The popup automatically parses visible rows and shows statistics

### Step 3: Refresh

Click the **Refresh** button in the popup to re-analyze the page at any time.

---

## Customization

### Changing Half Leave Detection

Edit `attendanceParser.js` → `isHalfLeave()` method:

```javascript
isHalfLeave(reasonStr, hoursWorkedMin, officeHoursMin) {
  // Keyword match
  if (reasonStr && reasonStr.trim().toLowerCase().includes('half leave')) {
    return true;
  }
  // Ratio-based detection (default: 40%-60% of office hours)
  if (officeHoursMin > 0 && hoursWorkedMin > 0) {
    const ratio = hoursWorkedMin / officeHoursMin;
    return ratio >= 0.4 && ratio <= 0.6;
  }
  return false;
}
```

Adjust the ratio bounds `0.4` and `0.6` as needed.

### Adding Holiday Keywords

Edit `attendanceParser.js` → `HOLIDAY_KEYWORDS` array:

```javascript
HOLIDAY_KEYWORDS: [
  'holiday', 'public holiday', 'gazetted holiday',
  'office closed', 'restricted holiday',
  'add your custom keyword here'
]
```

### Adding Column Aliases

If your table headers use different names, add them to `COLUMN_ALIASES` in `attendanceParser.js`.

---

## Architecture

| File | Purpose |
|---|---|
| `attendanceParser.js` | DOM parsing, column detection, row data extraction |
| `attendanceCalculator.js` | Statistics computation, CSV/text export |
| `content.js` | Content script bridge (sends parse requests) |
| `popup.js` | UI controller (render, copy, export, theme) |
| `popup.html/css` | Popup UI layout and styles |
| `background.js` | Service worker for lifecycle events |

---

## Permissions

- `activeTab` — access the current tab
- `scripting` — inject parser scripts on demand

---

## Browser Compatibility

- Chrome 88+ (Manifest V3)
- Edge 88+ (Chromium-based)

---

## License

MIT
