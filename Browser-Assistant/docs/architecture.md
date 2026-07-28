# Architecture — AI Chrome Extension

## 1. Folder Structure

```
ai-chrome-extension/
├── public/
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon32.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   └── manifest.json
├── src/
│   ├── background/
│   │   ├── index.ts                 # Service worker entry
│   │   ├── api-client.ts            # OpenCode Zen API client
│   │   ├── message-router.ts        # Message routing logic
│   │   ├── context-processor.ts     # Process page content for API
│   │   ├── storage-manager.ts       # Chrome storage operations
│   │   └── conversation-manager.ts  # Conversation CRUD
│   ├── content/
│   │   ├── index.ts                 # Content script entry
│   │   ├── extractor.ts             # DOM content extraction
│   │   ├── pdf-extractor.ts         # PDF-specific extraction
│   │   ├── text-selector.ts         # Selected text capture
│   │   └── metadata.ts              # Page metadata collection
│   ├── sidepanel/
│   │   ├── index.html               # Side panel HTML
│   │   ├── main.tsx                 # React entry point
│   │   ├── App.tsx                  # Root component
│   │   ├── components/
│   │   │   ├── ChatInterface.tsx    # Main chat view
│   │   │   ├── MessageBubble.tsx    # Individual message
│   │   │   ├── MessageInput.tsx     # Input area
│   │   │   ├── ConversationList.tsx # History sidebar
│   │   │   ├── SettingsPanel.tsx    # Settings view
│   │   │   ├── ResizeHandle.tsx     # Panel resize logic
│   │   │   ├── ThemeToggle.tsx      # Dark/light switch
│   │   │   ├── LoadingIndicator.tsx # Loading states
│   │   │   └── ErrorDisplay.tsx     # Error messages
│   │   ├── hooks/
│   │   │   ├── useChat.ts           # Chat logic hook
│   │   │   ├── usePageContext.ts    # Page context hook
│   │   │   ├── useTheme.ts          # Theme management
│   │   │   ├── useConversation.ts   # Conversation management
│   │   │   └── useStorage.ts        # Storage operations
│   │   ├── lib/
│   │   │   ├── api.ts               # API communication layer
│   │   │   ├── storage.ts           # Storage utilities
│   │   │   ├── messaging.ts         # Chrome messaging utils
│   │   │   └── utils.ts             # General utilities
│   │   ├── types/
│   │   │   ├── index.ts             # Shared type definitions
│   │   │   ├── messages.ts          # Message type definitions
│   │   │   ├── conversation.ts      # Conversation types
│   │   │   └── api.ts              # API response types
│   │   └── styles/
│   │       └── globals.css          # Global styles + Tailwind
│   ├── shared/
│   │   ├── constants.ts             # Shared constants
│   │   ├── message-types.ts         # Inter-component message types
│   │   └── validation.ts           # Input validation
│   └── utils/
│       ├── token-counter.ts         # Token estimation
│       ├── text-utils.ts            # Text processing
│       └── html-parser.ts           # HTML cleanup
├── scripts/
│   ├── build.ts                     # Build configuration
│   └── zip.ts                       # Production zip creator
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts
├── manifest.json
└── README.md
```

## 2. Communication Architecture

### 2.1 Message Passing

Chrome extension components communicate via `chrome.runtime.sendMessage` and `chrome.runtime.onMessage`.

```
Side Panel ◄────► Background SW ◄────► Content Script
```

### 2.2 Message Types

```typescript
// Side Panel → Background
{ type: 'SEND_MESSAGE', payload: { message, conversationId } }
{ type: 'GET_PAGE_CONTEXT' }
{ type: 'GET_CONVERSATIONS' }
{ type: 'SAVE_SETTINGS', payload: settings }

// Background → Side Panel
{ type: 'AI_RESPONSE', payload: { content, done } }
{ type: 'PAGE_CONTEXT', payload: contextData }
{ type: 'ERROR', payload: { message } }

// Background → Content Script
{ type: 'EXTRACT_CONTENT' }
{ type: 'GET_SELECTION' }

// Content Script → Background
{ type: 'CONTENT_EXTRACTED', payload: pageData }
{ type: 'SELECTION_CAPTURED', payload: { text } }
```

## 3. State Management

### 3.1 Side Panel State (React)

```typescript
interface AppState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  settings: Settings;
  pageContext: PageContext | null;
  theme: 'light' | 'dark';
  panelWidth: number;
}
```

### 3.2 Background State (Service Worker)

```typescript
interface BackgroundState {
  activePorts: Map<string, chrome.runtime.Port>;
  pendingRequests: Map<string, Request>;
  cache: Map<string, CachedResponse>;
}
```

### 3.3 Storage Schema

```
chrome.storage.local:
  ├── api_key: string (encrypted)
  ├── settings: Settings
  ├── conversations: Conversation[]
  ├── theme: 'light' | 'dark'
  └── panelWidth: number
```

## 4. Security Architecture

- API keys stored in `chrome.storage.local` (device-level encryption)
- Content scripts run in isolated worlds
- No external network requests except to OpenCode Zen API
- All user data stays on-device except API calls
- CSP enforced via manifest.json

## 5. Build Pipeline

```
Source Code (TypeScript + React + Tailwind)
         │
         ▼
    Vite Build
         │
    ┌────┴────┐
    ▼         ▼
  Dev Mode   Production
  (HMR)      (Minified)
                │
                ▼
         Chrome Extension
         (manifest.json + bundles)
                │
                ▼
         ZIP for Chrome Web Store
```
