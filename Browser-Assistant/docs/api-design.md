# API Design — AI Chrome Extension

## 1. External API — OpenCode Zen

### 1.1 Chat Completions

```
POST https://api.opencodezen.com/chat/completions
Authorization: Bearer {API_KEY}
Content-Type: application/json
```

**Request Body:**

```typescript
interface ChatCompletionRequest {
  model: 'big-pickle';
  messages: ChatMessage[];
  stream?: boolean;           // Default: true
  temperature?: number;       // Default: 0.7, Range: 0-2
  max_tokens?: number;        // Default: 4096
  top_p?: number;            // Default: 1
  frequency_penalty?: number; // Default: 0
  presence_penalty?: number;  // Default: 0
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

**Streaming Response (SSE):**

```
data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"},"index":0}]}

data: {"id":"chatcmpl-xxx","object":"chat.completion.chunk","choices":[{"delta":{"content":" world"},"index":0}]}

data: [DONE]
```

**Non-Streaming Response:**

```typescript
interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: ChatMessage;
    finish_reason: 'stop' | 'length' | null;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

### 1.2 Error Responses

```typescript
interface ApiError {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}
```

| Status Code | Type | Action |
|------------|------|--------|
| 400 | invalid_request_error | Show error message |
| 401 | authentication_error | Prompt for API key |
| 403 | permission_error | Show error message |
| 429 | rate_limit_error | Retry with backoff |
| 500 | server_error | Retry with backoff |
| 503 | overloaded_error | Retry with longer backoff |

## 2. Internal APIs — Chrome Extension

### 2.1 Message Protocol

All internal communication uses Chrome's runtime messaging with typed messages.

### 2.2 Side Panel → Background Messages

```typescript
// Send a chat message
interface SendMessageRequest {
  type: 'SEND_MESSAGE';
  payload: {
    content: string;
    conversationId?: string;    // null for new conversation
    includePageContext: boolean;
  };
}

// Get current page context
interface GetPageContextRequest {
  type: 'GET_PAGE_CONTEXT';
}

// List all conversations
interface GetConversationsRequest {
  type: 'GET_CONVERSATIONS';
}

// Get single conversation
interface GetConversationRequest {
  type: 'GET_CONVERSATION';
  payload: { id: string };
}

// Delete conversation
interface DeleteConversationRequest {
  type: 'DELETE_CONVERSATION';
  payload: { id: string };
}

// Update settings
interface SaveSettingsRequest {
  type: 'SAVE_SETTINGS';
  payload: Partial<Settings>;
}

// Get settings
interface GetSettingsRequest {
  type: 'GET_SETTINGS';
}
```

### 2.3 Background → Side Panel Messages

```typescript
// Streaming AI response chunk
interface AIResponseChunk {
  type: 'AI_RESPONSE_CHUNK';
  payload: {
    conversationId: string;
    messageId: string;
    content: string;
    done: boolean;
    usage?: TokenUsage;
  };
}

// Page context data
interface PageContextResponse {
  type: 'PAGE_CONTEXT';
  payload: PageContext;
}

// Error response
interface ErrorResponse {
  type: 'ERROR';
  payload: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

// Settings updated confirmation
interface SettingsSaved {
  type: 'SETTINGS_SAVED';
  payload: Settings;
}
```

### 2.4 Background → Content Script Messages

```typescript
// Request content extraction
interface ExtractContentRequest {
  type: 'EXTRACT_CONTENT';
}

// Request selected text
interface GetSelectionRequest {
  type: 'GET_SELECTION';
}
```

### 2.5 Content Script → Background Messages

```typescript
// Extracted page content
interface ContentExtractedResponse {
  type: 'CONTENT_EXTRACTED';
  payload: {
    url: string;
    title: string;
    content: string;
    language: string;
    pageType: 'webpage' | 'pdf' | 'unknown';
    metadata: PageMetadata;
  };
}

// Captured text selection
interface SelectionCapturedResponse {
  type: 'SELECTION_CAPTURED';
  payload: {
    text: string;
    startOffset: number;
    endOffset: number;
  };
}

interface PageMetadata {
  description?: string;
  author?: string;
  publishDate?: string;
  wordCount: number;
  readingTime: number;
}
```

## 3. System Prompts

### 3.1 Base System Prompt

```
You are an AI assistant embedded in a Chrome browser extension. You help users
understand and interact with web content. You have access to the current page's
content and can help with:

- Summarizing content
- Answering questions about the page
- Translating text
- Explaining complex concepts
- Extracting key information

Current page context:
- URL: {url}
- Title: {title}
- Page Type: {pageType}

{pageContent}

When the user asks about the page, refer to the provided context. If the context
is insufficient, let the user know. Always be helpful, accurate, and concise.
```

### 3.2 Translation Prompt Addition

```
The user wants to translate content. Translate the specified text or the entire
page context into {targetLanguage}. Maintain the original meaning and tone.
Provide the translation directly without explanations unless asked.
```

### 3.3 Summary Prompt Addition

```
The user wants a summary. Provide a {length} summary of the page content.
- Brief: 2-3 sentences
- Standard: 1 paragraph
- Detailed: Multiple paragraphs with key points
```

## 4. Content Processing Pipeline

### 4.1 Input Processing

```
User Input
    │
    ├── Trim whitespace
    ├── Validate non-empty
    ├── Sanitize (remove control characters)
    └── Check length (< 10,000 chars)
```

### 4.2 Context Assembly

```
System Prompt
    │
    ├── Base instructions
    ├── Page context (truncated to 40,000 chars)
    ├── Selected text (if any)
    └── Conversation history (last 10 messages)
    │
    ▼
User Message
    │
    └── User's actual input
    │
    ▼
API Request Assembly
    │
    └── Combine into messages array
```

### 4.3 Response Processing

```
API Response (streaming)
    │
    ├── Parse SSE chunks
    ├── Extract content deltas
    ├── Buffer for display
    ├── Update message in real-time
    └── Store complete response
```

## 5. Rate Limiting

### 5.1 Client-Side Limits

```typescript
const RATE_LIMITS = {
  messagesPerMinute: 20,
  messagesPerHour: 200,
  tokensPerRequest: 8000,      // input limit
  maxResponseTokens: 4096,     // output limit
  requestsPerSecond: 2,
};
```

### 5.2 Backoff Strategy

```
Attempt 1: Immediate
Attempt 2: Wait 1s
Attempt 3: Wait 4s
Attempt 4: Wait 16s
Attempt 5: Give up, show error
```
