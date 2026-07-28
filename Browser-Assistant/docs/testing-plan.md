# Testing Plan — AI Chrome Extension

## 1. Testing Strategy

### 1.1 Testing Levels

| Level | Scope | Tools | Coverage Target |
|-------|-------|-------|-----------------|
| Unit | Individual functions | Vitest | 80%+ |
| Integration | Component interactions | Vitest + Testing Library | Key flows |
| Manual | End-to-end UX | Chrome DevTools | All features |
| Security | Vulnerabilities | Manual audit | All attack surfaces |

### 1.2 Testing Environment

- **Chrome**: Latest stable (114+)
- **OS**: Windows, macOS, Linux (manual)
- **Node.js**: 18+
- **Test Runner**: Vitest
- **Mocking**: Vitest built-in mocks

---

## 2. Unit Tests

### 2.1 Content Extraction Tests

```typescript
// tests/unit/extractor.test.ts

describe('ContentExtractor', () => {
  test('extracts article content from HTML')
  test('handles empty page gracefully')
  test('strips scripts and styles')
  test('truncates content to max length')
  test('preserves paragraph structure')
  test('handles special characters')
  test('extracts metadata correctly')
})

describe('PDFExtractor', () => {
  test('detects PDF viewer embed')
  test('extracts text from PDF')
  test('handles encrypted PDF')
  test('handles large PDF')
})
```

### 2.2 API Client Tests

```typescript
// tests/unit/api-client.test.ts

describe('APIClient', () => {
  test('sends correct request format')
  test('includes authorization header')
  test('handles streaming response')
  test('handles non-streaming response')
  test('retries on 429 error')
  test('retries on 500 error')
  test('gives up after max retries')
  test('handles network timeout')
  test('handles invalid JSON response')
})
```

### 2.3 Token Counter Tests

```typescript
// tests/unit/token-counter.test.ts

describe('TokenCounter', () => {
  test('estimates tokens for short text')
  test('estimates tokens for long text')
  test('handles empty string')
  test('handles unicode characters')
  test('truncates to max tokens')
})
```

### 2.4 Storage Manager Tests

```typescript
// tests/unit/storage-manager.test.ts

describe('StorageManager', () => {
  test('saves and retrieves settings')
  test('adds conversation')
  test('updates conversation')
  test('deletes conversation')
  test('enforces max conversation limit')
  test('encrypts API key')
  test('decrypts API key')
  test('handles storage quota exceeded')
})
```

### 2.5 Message Router Tests

```typescript
// tests/unit/message-router.test.ts

describe('MessageRouter', () => {
  test('routes SEND_MESSAGE correctly')
  test('routes GET_PAGE_CONTEXT correctly')
  test('routes GET_CONVERSATIONS correctly')
  test('handles unknown message type')
  test('handles missing payload')
  test('returns error for invalid messages')
})
```

---

## 3. Integration Tests

### 3.1 Message Flow Tests

```typescript
// tests/integration/messaging.test.ts

describe('Messaging Flow', () => {
  test('side panel sends message, background processes, returns response')
  test('content script extracts content, sends to background')
  test('background requests content from content script')
  test('error propagation through message chain')
})
```

### 3.2 Conversation Flow Tests

```typescript
// tests/integration/conversation.test.ts

describe('Conversation Flow', () => {
  test('create new conversation with first message')
  test('add message to existing conversation')
  test('conversation persists across sessions')
  test('page context attached to conversation')
  test('conversation title auto-generated')
})
```

---

## 4. Manual Testing Checklist

### 4.1 Extension Basics

- [ ] Extension loads without errors
- [ ] Extension icon appears in toolbar
- [ ] Side panel opens on click
- [ ] Side panel closes properly
- [ ] No console errors on load
- [ ] Service worker starts and stays alive

### 4.2 Side Panel UI

- [ ] Dark theme displays correctly
- [ ] Light theme displays correctly
- [ ] Theme toggle works
- [ ] Panel is resizable
- [ ] Resize remembers width
- [ ] Chat interface renders
- [ ] Messages scroll properly
- [ ] Input field accepts text
- [ ] Send button works
- [ ] Enter key sends message
- [ ] Shift+Enter adds newline
- [ ] Loading spinner shows during API call
- [ ] Error messages display properly
- [ ] Settings panel opens
- [ ] API key can be entered
- [ ] API key masked in UI
- [ ] Settings save correctly

### 4.3 Page Context

- [ ] Content extracted from news article
- [ ] Content extracted from documentation
- [ ] Content extracted from blog post
- [ ] Content extracted from Wikipedia
- [ ] Content extracted from Medium
- [ ] Selected text captured
- [ ] Page metadata correct
- [ ] PDF content extracted
- [ ] Large page handled without freeze
- [ ] SPA content extracted after load
- [ ] Error page handled gracefully

### 4.4 AI Features

- [ ] Basic chat works
- [ ] AI receives page context
- [ ] AI answers about page content
- [ ] Translation works (any language)
- [ ] Summarization works (brief)
- [ ] Summarization works (detailed)
- [ ] Key points extraction works
- [ ] Custom prompts work
- [ ] Follow-up questions work
- [ ] Code blocks render correctly
- [ ] Markdown renders correctly
- [ ] Streaming response displays

### 4.5 Conversation Management

- [ ] New conversation created
- [ ] Switch between conversations
- [ ] Delete conversation
- [ ] Conversation history persists
- [ ] Archive conversation
- [ ] Search conversations

### 4.6 Error Handling

- [ ] Invalid API key shows error
- [ ] Network failure shows error
- [ ] API rate limit handled
- [ ] API timeout handled
- [ ] Empty message prevented
- [ ] Very long message handled
- [ ] Content extraction failure handled

### 4.7 Performance

- [ ] Side panel opens < 500ms
- [ ] Content extraction < 2s
- [ ] API response starts < 3s
- [ ] No memory leaks after extended use
- [ ] Smooth scrolling in chat
- [ ] No UI lag during streaming

### 4.8 Keyboard Shortcuts

- [ ] Open/close side panel shortcut
- [ ] Send message shortcut
- [ ] New conversation shortcut
- [ ] Settings shortcut
- [ ] Focus input shortcut

---

## 5. Test Scenarios by Website Type

### 5.1 News Websites
- [ ] BBC News article
- [ ] CNN article
- [ ] Reuters article
- [ ] The Verge article

### 5.2 Documentation
- [ ] MDN Web Docs
- [ ] React documentation
- [ ] Python documentation
- [ ] GitHub README

### 5.3 Web Applications
- [ ] Gmail
- [ ] Google Docs
- [ ] Notion
- [ ] Figma

### 5.4 PDF Documents
- [ ] Short PDF (1-2 pages)
- [ ] Medium PDF (10-20 pages)
- [ ] Long PDF (50+ pages)
- [ ] PDF with images
- [ ] Password-protected PDF

### 5.5 Special Cases
- [ ] Pages with infinite scroll
- [ ] Pages with heavy JavaScript
- [ ] Pages with iframes
- [ ] Pages requiring login
- [ ] Pages with dark background
- [ ] Pages in foreign languages
- [ ] Pages with tables
- [ ] Pages with code blocks

---

## 6. Edge Cases

- [ ] Send empty message
- [ ] Send very long message (10,000 chars)
- [ ] Rapid message sending
- [ ] Close panel during API call
- [ ] Switch tabs during API call
- [ ] Clear API key while in use
- [ ] Storage quota exceeded
- [ ] Multiple rapid theme toggles
- [ ] Resize to minimum width
- [ ] Resize to maximum width
- [ ] Open panel on chrome:// pages
- [ ] Open panel on extension pages
- [ ] Open panel on new tab page

---

## 7. Cross-Browser Testing

| Browser | Version | Status |
|---------|---------|--------|
| Chrome | 114+ | Required |
| Edge | 114+ | Recommended |
| Brave | Latest | Optional |
| Opera | Latest | Optional |

---

## 8. Regression Testing

After any code change, verify:
1. Extension loads without errors
2. Side panel opens
3. Basic chat works
4. Content extraction works
5. No console errors
