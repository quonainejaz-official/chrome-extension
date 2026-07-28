# Database Design — AI Chrome Extension

## 1. Storage Overview

The extension uses `chrome.storage.local` as its persistence layer. All data is stored as JSON on the user's device.

**Chrome Storage Limits:**
- `chrome.storage.local`: 5MB (10MB with `unlimitedStorage` permission)
- We target 5MB without requesting additional permissions

## 2. Storage Schema

### 2.1 Settings

```typescript
interface Settings {
  apiKey: string;              // Encrypted API key
  apiKeyConfigured: boolean;   // Whether API key is set
  defaultLanguage: string;     // Default translation target (ISO 639-1)
  summaryLength: 'brief' | 'standard' | 'detailed';
  theme: 'light' | 'dark' | 'system';
  panelWidth: number;          // Side panel width in pixels
  autoContext: boolean;        // Auto-send page context with messages
  maxConversations: number;    // Max stored conversations (default: 50)
  streamingEnabled: boolean;   // Enable streaming responses
  fontSize: 'small' | 'medium' | 'large';
}
```

**Storage Key:** `settings`

### 2.2 Conversations

```typescript
interface Conversation {
  id: string;                  // UUID v4
  title: string;               // Auto-generated from first message
  tabUrl: string;              // URL of tab when created
  tabTitle: string;            // Title of tab when created
  pageContext: PageContext;     // Snapshot of page context at creation
  createdAt: number;           // Timestamp
  updatedAt: number;           // Timestamp
  messages: Message[];
  archived: boolean;
}

interface Message {
  id: string;                  // UUID v4
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: {
    tokensUsed?: number;
    model?: string;
    pageContextIncluded?: boolean;
  };
}

interface PageContext {
  url: string;
  title: string;
  content: string;             // Extracted text (truncated)
  selectedText?: string;       // Text selected when chat started
  language: string;
  pageType: 'webpage' | 'pdf' | 'unknown';
  extractedAt: number;
}
```

**Storage Key:** `conversations` (Array<Conversation>)

### 2.3 Conversation Index

```typescript
interface ConversationIndex {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
}
```

**Storage Key:** `conversationIndex`

## 3. Data Layout

```
chrome.storage.local
│
├── "settings" ──────────────── Settings object
│
├── "conversations" ─────────── Array<Conversation> (max 50)
│   └── [0..N]
│       ├── id
│       ├── title
│       ├── tabUrl
│       ├── tabTitle
│       ├── pageContext
│       ├── createdAt
│       ├── updatedAt
│       ├── messages[] (max 200 per conversation)
│       │   └── [0..N]
│       │       ├── id
│       │       ├── role
│       │       ├── content
│       │       ├── timestamp
│       │       └── metadata
│       └── archived
│
├── "conversationIndex" ────── Quick-access list
│
├── "pageCache" ────────────── Temporary page content cache
│   └── { [tabId]: { content, timestamp } }
│
└── "theme" ────────────────── "light" | "dark"
```

## 4. Storage Operations

### 4.1 Read Operations
- Get settings: `chrome.storage.local.get('settings')`
- Get all conversations: `chrome.storage.local.get('conversations')`
- Get single conversation: Filter from conversations array
- Get page cache: `chrome.storage.local.get('pageCache')`

### 4.2 Write Operations
- Save settings: `chrome.storage.local.set({ settings })`
- Add conversation: Append to conversations array
- Update conversation: Find by ID, update fields
- Delete conversation: Filter from conversations array
- Clear cache: Remove pageCache key

### 4.3 Cleanup Strategy

```
When adding new conversation:
  1. Check total count against maxConversations
  2. If over limit, remove oldest non-archived conversation
  3. Compact conversations by removing messages over 200

Periodic cleanup (on service worker start):
  1. Remove pageCache entries older than 10 minutes
  2. Archive conversations older than 30 days (optional)
  3. Check storage quota usage
```

## 5. API Key Encryption

### 5.1 Storage Format

```typescript
interface EncryptedApiKey {
  iv: string;     // Initialization vector (base64)
  data: string;   // Encrypted key (base64)
  salt: string;   // Salt for key derivation (base64)
}
```

### 5.2 Encryption Process
1. Generate random 12-byte IV
2. Derive encryption key from device fingerprint + salt
3. Encrypt API key using AES-256-GCM
4. Store iv + encrypted data + salt

### 5.3 Decryption Process
1. Read stored encryption data
2. Derive key using same method
3. Decrypt API key
4. Return plaintext for API calls only

## 6. Quota Management

| Data Type | Avg Size | Max Count | Total |
|-----------|----------|-----------|-------|
| Settings | 1KB | 1 | 1KB |
| Conversation | 50KB | 50 | 2.5MB |
| Messages (total) | varies | 10,000 | ~2MB |
| Page Cache | 100KB | 10 | 1MB |
| **Total** | | | **~5.5MB** |

**Mitigation:**
- Truncate page content to 50KB per conversation
- Limit messages to 200 per conversation
- Auto-cleanup of old cache entries
- Aggressive text compression in storage

## 7. Migration Strategy

```typescript
interface StorageVersion {
  version: number;
  migratedAt?: number;
}

// Current version: 1
// On upgrade:
// 1. Read current version
// 2. Apply migrations in order
// 3. Update version number
```

## 8. Export/Import (Future)

```typescript
interface ExportData {
  version: number;
  exportedAt: number;
  settings: Settings;          // Without API key
  conversations: Conversation[];
}
```
