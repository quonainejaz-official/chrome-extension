# System Design — AI Chrome Extension

## 1. Overview

An AI-powered Chrome Extension that provides a side panel interface for interacting with AI about the currently active tab's content. The extension uses OpenCode Zen (big-pickle model) as the AI backend.

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────┐
│                  Chrome Browser                  │
│                                                  │
│  ┌──────────────┐    ┌───────────────────────┐  │
│  │  Side Panel   │    │    Active Tab          │  │
│  │  (React App)  │◄──►│  (Content Script)      │  │
│  │              │    │                        │  │
│  │  - Chat UI   │    │  - DOM extraction      │  │
│  │  - Settings  │    │  - PDF detection       │  │
│  │  - History   │    │  - Text selection      │  │
│  └──────┬───────┘    └───────────┬───────────┘  │
│         │                        │               │
│         └────────┬───────────────┘               │
│                  ▼                               │
│  ┌──────────────────────────────────────┐       │
│  │        Background Service Worker      │       │
│  │                                      │       │
│  │  - Message routing                   │       │
│  │  - API communication                 │       │
│  │  - Conversation storage              │       │
│  │  - Context processing                │       │
│  └──────────────┬───────────────────────┘       │
│                 │                                │
└─────────────────┼────────────────────────────────┘
                  ▼
┌──────────────────────────────────┐
│     OpenCode Zen API             │
│     Model: big-pickle            │
│                                  │
│  POST /chat/completions          │
│  - User prompt                   │
│  - Page context                  │
│  - System instructions           │
└──────────────────────────────────┘
```

## 3. Component Breakdown

### 3.1 Side Panel (React + TypeScript + Tailwind)
- Resizable width via drag handle
- Chat message interface
- Settings panel for API key configuration
- Conversation history sidebar
- Dark/Light theme toggle

### 3.2 Content Script
- Injected into every active tab
- Extracts page text content (readability algorithm)
- Detects PDF viewer and extracts text
- Captures selected text
- Collects page metadata (title, URL, language)

### 3.3 Background Service Worker
- Routes messages between side panel and content scripts
- Manages API calls to OpenCode Zen
- Stores/retrieves conversations from chrome.storage
- Processes and chunks large content for API limits

### 3.4 Configuration Store
- API key storage (chrome.storage.local with encryption)
- User preferences (theme, default language, etc.)
- Conversation history

## 4. Data Flow

### 4.1 Chat Request Flow
```
User types message in Side Panel
         │
         ▼
Side Panel sends message to Background SW
         │
         ▼
Background SW requests page context from Content Script
         │
         ▼
Content Script extracts page data and returns it
         │
         ▼
Background SW assembles full prompt:
  - System prompt
  - Page context (truncated if needed)
  - User message
  - Conversation history (last N messages)
         │
         ▼
Background SW sends to OpenCode Zen API
         │
         ▼
API response streamed back to Side Panel
         │
         ▼
Side Panel renders AI response
```

### 4.2 Page Context Extraction Flow
```
Content Script loads on tab
         │
         ▼
Detect page type (normal / PDF / protected)
         │
         ▼
Extract content based on type:
  - Normal: Readability.js + DOM parsing
  - PDF: PDF.js text layer extraction
         │
         ▼
Package metadata:
  - title, url, language, selectedText
  - bodyContent (truncated to token limit)
  - pageType
         │
         ▼
Store in content script memory, ready for queries
```

## 5. Technology Decisions

| Component          | Technology          | Reasoning                              |
|-------------------|---------------------|----------------------------------------|
| UI Framework      | React 18            | Component-based, well-supported        |
| Language          | TypeScript          | Type safety, better DX                 |
| Styling           | Tailwind CSS        | Rapid UI, consistent design            |
| Build Tool        | Vite                | Fast builds, good extension support    |
| Manifest          | V3                  | Required for new Chrome extensions     |
| API Backend       | OpenCode Zen        | User-specified                         |
| Storage           | chrome.storage      | Native extension storage               |
| PDF Parsing       | PDF.js              | Browser-native PDF text extraction     |
| Content Extraction| Readability.js      | Mozilla's proven article extraction    |

## 6. Constraints & Considerations

- **Token Limits**: Page content must be truncated to fit within model context window
- **CSP Restrictions**: Extension runs under strict Content Security Policy
- **API Key Security**: Keys stored in chrome.storage.local, never sent to third parties
- **Performance**: Content extraction must not freeze the page
- **PDF Support**: Chrome's built-in PDF viewer has limited DOM access
- **Rate Limiting**: Must handle API rate limits gracefully

## 7. Scalability

The extension is designed for single-user desktop use. Scalability considerations:
- Conversation history capped at configurable limit (default 50 conversations)
- Large page content is chunked and summarized before API calls
- API responses are cached briefly to avoid duplicate calls
