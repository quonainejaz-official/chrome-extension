# Development Roadmap — AI Chrome Extension

## Overview

11-phase development plan from planning to production. Each phase must be completed before moving to the next.

---

## Phase 1 — Project Planning ✅
**Duration:** ~1 hour
**Status:** Complete

### Deliverables
- [x] System design document
- [x] Architecture document
- [x] Product requirements
- [x] Technical requirements
- [x] Database design
- [x] API design
- [x] Security plan
- [x] Development roadmap
- [x] Testing plan
- [x] Deployment guide

---

## Phase 2 — Chrome Extension Foundation
**Duration:** ~2 hours
**Status:** Pending

### Goals
Set up the project skeleton with Manifest V3.

### Tasks
- [ ] Initialize project (package.json, tsconfig, vite config)
- [ ] Create manifest.json (MV3)
- [ ] Set up build pipeline (Vite + CRXJS or equivalent)
- [ ] Create background service worker (empty)
- [ ] Create content script (empty)
- [ ] Create side panel HTML + entry point
- [ ] Set up Chrome messaging between components
- [ ] Verify extension loads in Chrome
- [ ] Verify side panel opens

### Verification
- Extension appears in Chrome extensions page
- Side panel opens when extension icon clicked
- Background service worker starts
- Content script injects on page load
- Messages pass between components

---

## Phase 3 — Side Panel Interface
**Duration:** ~3 hours
**Status:** Pending

### Goals
Build the complete chat UI with modern design.

### Tasks
- [ ] Set up React with Tailwind CSS
- [ ] Implement theme system (dark/light)
- [ ] Build ChatInterface component
- [ ] Build MessageBubble component (user + AI)
- [ ] Build MessageInput component
- [ ] Build ConversationList component
- [ ] Build SettingsPanel component
- [ ] Build ResizeHandle component
- [ ] Implement loading states
- [ ] Implement error display
- [ ] Implement conversation creation/switching
- [ ] Add markdown rendering for AI responses

### Verification
- Chat UI renders properly
- Dark/light theme toggles correctly
- Panel is resizable
- Conversations can be created and switched
- Settings panel opens and saves
- Loading indicators work
- Error messages display properly

---

## Phase 4 — Page Context Understanding
**Duration:** ~2 hours
**Status:** Pending

### Goals
Extract meaningful content from any webpage.

### Tasks
- [ ] Implement DOM content extraction (Readability-based)
- [ ] Implement page metadata collection
- [ ] Implement text selection capture
- [ ] Implement PDF detection and extraction
- [ ] Create context assembly pipeline
- [ ] Handle content truncation for token limits
- [ ] Test on various page types

### Verification
- Extracts article content from news sites
- Extracts documentation content
- Captures selected text
- Detects and extracts PDF content
- Handles large pages without freezing
- Metadata (title, URL, language) correct

---

## Phase 5 — AI Integration
**Duration:** ~3 hours
**Status:** Pending

### Goals
Connect to OpenCode Zen API and handle conversations.

### Tasks
- [ ] Implement API client in background service worker
- [ ] Implement streaming response handling (SSE)
- [ ] Implement prompt assembly (system + context + user)
- [ ] Implement API key management
- [ ] Implement retry logic with backoff
- [ ] Implement token counting/estimation
- [ ] Handle API errors gracefully
- [ ] Test with real API key

### Verification
- API key can be configured
- Messages sent to API receive responses
- Streaming responses display incrementally
- Page context included in API calls
- API errors handled gracefully
- Retries work on failure

---

## Phase 6 — AI Features
**Duration:** ~2 hours
**Status:** Pending

### Goals
Implement translation, summarization, Q&A, and custom prompts.

### Tasks
- [ ] Implement translation feature
- [ ] Implement summarization feature
- [ ] Implement Q&A feature
- [ ] Implement custom prompt handling
- [ ] Add quick action buttons (Summarize, Translate, etc.)
- [ ] Add prompt templates
- [ ] Test all features

### Verification
- Translation works for any language pair
- Summaries generate at different lengths
- Q&A answers questions about page content
- Custom prompts processed with context
- Quick action buttons work
- Prompt templates populate input

---

## Phase 7 — PDF Support
**Duration:** ~1 hour
**Status:** Pending

### Goals
Full support for PDFs opened in Chrome.

### Tasks
- [ ] Detect Chrome PDF viewer
- [ ] Implement PDF text extraction via PDF.js
- [ ] Handle PDF-specific metadata
- [ ] Test with various PDFs (small, large, scanned)
- [ ] Graceful fallback for scanned PDFs

### Verification
- PDF content extracted correctly
- PDF metadata displayed
- AI can answer questions about PDF
- Large PDFs handled without timeout
- Scanned PDFs show appropriate message

---

## Phase 8 — UX Improvements
**Duration:** ~2 hours
**Status:** Pending

### Goals
Polish the user experience.

### Tasks
- [ ] Add keyboard shortcuts
- [ ] Add conversation search
- [ ] Implement conversation persistence
- [ ] Add copy message functionality
- [ ] Add export conversation option
- [ ] Optimize performance
- [ ] Add message re-generation
- [ ] Improve loading experience
- [ ] Add page context indicator
- [ ] Add character/token counter

### Verification
- Keyboard shortcuts work
- Conversations persist across panel close/reopen
- Messages can be copied
- Performance is smooth
- Loading experience is clear

---

## Phase 9 — Security
**Duration:** ~1 hour
**Status:** Pending

### Goals
Harden security for production.

### Tasks
- [ ] Implement API key encryption
- [ ] Audit permissions
- [ ] Implement CSP properly
- [ ] Sanitize all user inputs
- [ ] Sanitize AI responses
- [ ] Remove any debug logging
- [ ] Conduct security review

### Verification
- API key encrypted at rest
- No sensitive data in logs
- CSP properly enforced
- Input sanitization works
- No XSS vulnerabilities

---

## Phase 10 — Testing
**Duration:** ~2 hours
**Status:** Pending

### Goals
Ensure quality through testing.

### Tasks
- [ ] Write unit tests for core utilities
- [ ] Write integration tests for messaging
- [ ] Create manual testing checklist
- [ ] Test on multiple websites
- [ ] Test PDF support
- [ ] Test error scenarios
- [ ] Test API failure handling
- [ ] Performance testing

### Verification
- Unit tests pass
- Manual testing checklist complete
- No critical bugs found
- Performance acceptable

---

## Phase 11 — Production Preparation
**Duration:** ~2 hours
**Status:** Pending

### Goals
Prepare for Chrome Web Store submission.

### Tasks
- [ ] Create extension icons (16, 32, 48, 128px)
- [ ] Create promotional images
- [ ] Write Chrome Web Store description
- [ ] Create privacy policy
- [ ] Create installation guide
- [ ] Create user documentation
- [ ] Final production build
- [ ] Test production build
- [ ] Package for upload

### Verification
- Icons render correctly
- Store listing complete
- Privacy policy published
- Production build works
- Extension package ready for upload

---

## Timeline Summary

| Phase | Description | Duration | Status |
|-------|------------|----------|--------|
| 1 | Project Planning | 1h | ✅ Done |
| 2 | Extension Foundation | 2h | Pending |
| 3 | Side Panel Interface | 3h | Pending |
| 4 | Page Context | 2h | Pending |
| 5 | AI Integration | 3h | Pending |
| 6 | AI Features | 2h | Pending |
| 7 | PDF Support | 1h | Pending |
| 8 | UX Improvements | 2h | Pending |
| 9 | Security | 1h | Pending |
| 10 | Testing | 2h | Pending |
| 11 | Production | 2h | Pending |
| **Total** | | **~21h** | |

## Dependencies

```
Phase 1 ──► Phase 2 ──► Phase 3 ──► Phase 4 ──► Phase 5
                                              └──► Phase 6
Phase 5 ──► Phase 7
Phase 6 ──► Phase 8
Phase 8 ──► Phase 9 ──► Phase 10 ──► Phase 11
```
