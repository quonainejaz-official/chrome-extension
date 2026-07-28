# Deployment Guide — AI Chrome Extension

## 1. Development Setup

### 1.1 Prerequisites

- Node.js 18+ installed
- npm or pnpm package manager
- Google Chrome browser
- VS Code (recommended)

### 1.2 Installation

```bash
# Clone or navigate to project directory
cd ai-chrome-extension

# Install dependencies
npm install

# Start development server
npm run dev
```

### 1.3 Loading in Chrome (Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist` folder from the project
5. Extension icon appears in toolbar
6. Click icon to open side panel

### 1.4 Development Workflow

```bash
# Start dev server with HMR
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint
```

---

## 2. Production Build

### 2.1 Build Process

```bash
# Clean previous builds
npm run clean

# Production build
npm run build

# Verify build output
ls -la dist/
```

### 2.2 Build Output

```
dist/
├── manifest.json
├── background/
│   └── service-worker.js
├── content/
│   └── content-script.js
├── sidepanel/
│   ├── index.html
│   └── assets/
│       ├── main.js
│       └── main.css
├── icons/
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── _locales/
    └── en/
        └── messages.json
```

### 2.3 Build Verification

- [ ] `manifest.json` is valid
- [ ] No TypeScript errors
- [ ] Bundle size < 5MB
- [ ] All icons present
- [ ] No development-only code
- [ ] Source maps not included

---

## 3. Chrome Web Store Preparation

### 3.1 Required Assets

#### Icons
| Size | Purpose |
|------|---------|
| 16x16 | Favicon |
| 32x32 | Windows computers |
| 48x48 | Extensions page |
| 128x128 | Chrome Web Store |

#### Screenshots
| Size | Purpose |
|------|---------|
| 1280x800 | Chrome Web Store listing |
| 640x400 | Promotional tile |

#### Store Listing
- Extension name (max 45 chars)
- Short description (max 132 chars)
- Detailed description (max 16,000 chars)
- Category: Productivity
- Language: English

### 3.2 Store Listing Content

**Name:** AI Page Assistant - Chat with AI about any webpage

**Short Description:** 
AI-powered side panel that helps you understand, summarize, and translate any webpage content.

**Detailed Description:**
AI Page Assistant brings the power of AI directly into your browser. Simply open the side panel and start chatting about whatever page you're viewing.

Features:
- Chat with AI about any webpage content
- Get instant summaries of articles and documents
- Translate pages and selected text to any language
- Ask questions about complex content
- Extract key points from any page
- Support for PDFs and documentation
- Dark and light themes
- Resizable side panel

How to use:
1. Click the extension icon to open the side panel
2. Navigate to any webpage
3. Start chatting with AI about the content
4. Use quick actions for common tasks

Privacy:
- Your data stays on your device
- Only page content you choose to send is processed
- No tracking or analytics
- API key stored securely on your device

### 3.3 Privacy Policy

Create a privacy policy page covering:
- What data is collected
- How data is used
- Data storage and security
- Third-party services (OpenCode Zen API)
- User rights (export, delete)
- Contact information

---

## 4. Chrome Web Store Submission

### 4.1 Developer Account

1. Go to https://chrome.google.com/webstore/devconsole
2. Pay one-time registration fee ($5)
3. Complete account verification
4. Enable 2-factor authentication

### 4.2 Submission Steps

1. Click "New Item" in developer dashboard
2. Upload the ZIP file of the built extension
3. Fill in store listing details
4. Upload screenshots and icons
5. Set pricing (Free)
6. Set visibility (Public or Unlisted for testing)
7. Submit for review

### 4.3 Review Process

- Initial review: 1-3 business days
- Common rejection reasons:
  - Missing privacy policy
  - Unclear permissions justification
  - Misleading description
  - Broken functionality

### 4.4 Post-Approval

- Extension goes live on Chrome Web Store
- Updates typically reviewed within 24 hours
- Monitor user reviews and ratings
- Respond to user feedback

---

## 5. Update Process

### 5.1 Version Numbering

Use semantic versioning: `MAJOR.MINOR.PATCH`

- MAJOR: Breaking changes
- MINOR: New features
- PATCH: Bug fixes

### 5.2 Update Steps

1. Update version in `manifest.json`
2. Update `package.json` version
3. Run production build
4. Test the build
5. Upload new ZIP to Chrome Web Store
6. Add release notes
7. Submit for review

### 5.3 Release Notes Template

```
Version X.Y.Z

Changes:
- [Feature] New feature description
- [Fix] Bug fix description
- [Improvement] Improvement description

Known Issues:
- Any known issues
```

---

## 6. Self-Distribution (Alternative)

### 6.1 ZIP Distribution

```bash
# Create distribution ZIP
npm run build
cd dist
zip -r ../ai-chrome-extension.zip .
```

### 6.2 User Installation

1. Download the ZIP file
2. Extract to a permanent location
3. Open `chrome://extensions/`
4. Enable "Developer mode"
5. Click "Load unpacked"
6. Select the extracted folder

### 6.3 Auto-Updates (Self-Hosted)

For self-hosted updates, create an `update.xml` file:

```xml
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='YOUR_EXTENSION_ID'>
    <updatecheck codebase='https://yourserver.com/extension.zip' 
                 version='1.0.0' />
  </app>
</gupdate>
```

Configure in `manifest.json`:
```json
{
  "update_url": "https://yourserver.com/updates.xml"
}
```

---

## 7. Monitoring & Maintenance

### 7.1 Chrome Web Store Dashboard

Monitor:
- Install count
- Active users
- User ratings
- Crash reports
- User reviews

### 7.2 Maintenance Schedule

- Weekly: Check user reviews
- Monthly: Update dependencies
- Quarterly: Security audit
- As needed: Bug fixes and features

### 7.3 End of Life

When discontinuing:
1. Announce in store listing
2. Set minimum Chrome version high
3. Remove from store (or keep as-is)
4. Archive source code
