# Technical Requirements — AI Chrome Extension

## 1. Chrome Extension Requirements

### 1.1 Manifest V3 Compliance
- Use Manifest V3 format
- Service worker for background scripts (not persistent background page)
- No remote code execution
- All resources bundled locally

### 1.2 Permissions

```json
{
  "permissions": [
    "activeTab",
    "storage",
    "sidePanel",
    "scripting"
  ],
  "host_permissions": [
    "https://api.opencodezen.com/*"
  ]
}
```

| Permission | Purpose | Justification |
|-----------|---------|---------------|
| activeTab | Access current tab | Extract page content |
| storage | Store settings & conversations | Local persistence |
| sidePanel | Open side panel UI | Main interface |
| scripting | Execute content scripts | Dynamic injection |
| host_permissions | API communication | AI backend calls |

### 1.3 Content Security Policy

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; style-src 'self' 'unsafe-inline'"
  }
}
```

## 2. Frontend Requirements

### 2.1 React Application
- React 18 with TypeScript
- Functional components with hooks
- Strict TypeScript configuration
- No external runtime dependencies in production bundle

### 2.2 Styling
- Tailwind CSS 3.x
- CSS custom properties for theming
- Responsive design (mobile-first not required, desktop-first)
- Consistent spacing scale (4px base)

### 2.3 State Management
- React useState/useReducer for local state
- Context API for global state (theme, settings)
- Chrome storage for persistence

### 2.4 Build System
- Vite with CRXJS plugin for Chrome extension bundling
- TypeScript strict mode
- Tree-shaking enabled
- Source maps for development only

## 3. Backend Requirements (Background Service Worker)

### 3.1 Message Handling
- Chrome runtime message-based communication
- Typed message system with discriminated unions
- Error boundary for message handling
- Timeout for pending requests (30s)

### 3.2 API Client
- OpenCode Zen REST API integration
- Model: big-pickle
- Streaming support (SSE)
- Retry logic with exponential backoff
- Request timeout: 60s
- Max retries: 3

### 3.3 Storage
- chrome.storage.local for all data
- Encryption for API key (AES-256-GCM)
- Quota management (5MB limit)
- Automatic cleanup of old conversations

## 4. Content Script Requirements

### 4.1 Content Extraction
- Readability algorithm for article extraction
- DOM traversal for text content
- HTML cleanup and normalization
- Maximum content length: 50,000 characters

### 4.2 PDF Detection
- Detect Chrome PDF viewer (embed element)
- Access PDF document via PDF.js API
- Extract text layer content
- Handle password-protected PDFs gracefully

### 4.3 Text Selection
- Listen for mouseup/selectionchange events
- Capture selected text (up to 5,000 characters)
- Debounce selection events (300ms)
- Clean up selection highlights

### 4.4 Isolation
- Run in isolated world
- No direct DOM manipulation of host page
- Only read operations, no modifications
- Clean up injected elements

## 5. API Integration Requirements

### 5.1 OpenCode Zen API

```
Endpoint: POST https://api.opencodezen.com/chat/completions
Model: big-pickle
Auth: Bearer {API_KEY}

Request:
{
  "model": "big-pickle",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "stream": true,
  "temperature": 0.7,
  "max_tokens": 4096
}
```

### 5.2 Streaming Response Handling
- Process Server-Sent Events (SSE)
- Parse incremental content chunks
- Handle stream interruptions
- Display tokens as they arrive

### 5.3 Error Handling

| Error Code | Handling |
|-----------|----------|
| 401 | Prompt user to check API key |
| 429 | Show retry countdown |
| 500 | Retry with backoff |
| Timeout | Show timeout message with retry |
| Network | Show offline message |

## 6. Performance Requirements

### 6.1 Bundle Size
- Total extension size: < 5MB
- Side panel JS bundle: < 500KB gzipped
- Content script: < 100KB gzipped
- Background script: < 50KB gzipped

### 6.2 Runtime Performance
- Side panel render: < 200ms
- Content extraction: < 2s
- Message send to API: < 500ms
- First token display: < 3s
- Memory footprint: < 50MB

### 6.3 Caching
- Page content cached for active tab (5 min TTL)
- API responses cached (1 hour TTL)
- Settings cached in memory
- Conversation list cached

## 7. Browser Compatibility

| Browser | Version | Support |
|---------|---------|---------|
| Chrome | 114+ | Full |
| Edge | 114+ | Full (Chromium-based) |
| Brave | Latest | Full (Chromium-based) |
| Opera | Latest | Likely compatible |

## 8. Development Environment

### 8.1 Required Tools
- Node.js 18+
- npm or pnpm
- Chrome browser (for testing)
- VS Code (recommended)

### 8.2 Development Scripts
```json
{
  "dev": "Vite dev server with HMR",
  "build": "Production build",
  "build:dev": "Development build",
  "test": "Run unit tests",
  "lint": "ESLint + Prettier",
  "typecheck": "TypeScript type checking"
}
```
