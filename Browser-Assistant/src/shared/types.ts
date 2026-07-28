// ── Side Panel → Background ──────────────────────────────────────

export interface SendMessageRequest {
  type: 'SEND_MESSAGE';
  payload: {
    content: string;
    conversationId?: string;
    includePageContext: boolean;
  };
}

export interface GetPageContextRequest {
  type: 'GET_PAGE_CONTEXT';
}

export interface GetConversationsRequest {
  type: 'GET_CONVERSATIONS';
}

export interface GetConversationRequest {
  type: 'GET_CONVERSATION';
  payload: { id: string };
}

export interface DeleteConversationRequest {
  type: 'DELETE_CONVERSATION';
  payload: { id: string };
}

export interface SaveSettingsRequest {
  type: 'SAVE_SETTINGS';
  payload: Partial<Settings>;
}

export interface GetSettingsRequest {
  type: 'GET_SETTINGS';
}

export interface TogglePanelRequest {
  type: 'TOGGLE_PANEL';
}

// ── Background → Side Panel ─────────────────────────────────────

export interface AIResponseChunk {
  type: 'AI_RESPONSE_CHUNK';
  payload: {
    conversationId: string;
    messageId: string;
    content: string;
    done: boolean;
    usage?: TokenUsage;
  };
}

export interface PageContextResponse {
  type: 'PAGE_CONTEXT';
  payload: PageContext;
}

export interface ConversationsResponse {
  type: 'CONVERSATIONS';
  payload: Conversation[];
}

export interface ConversationResponse {
  type: 'CONVERSATION';
  payload: Conversation;
}

export interface SettingsResponse {
  type: 'SETTINGS';
  payload: Settings;
}

export interface SettingsSavedResponse {
  type: 'SETTINGS_SAVED';
  payload: Settings;
}

export interface ErrorPayload {
  code: string;
  message: string;
  retryable: boolean;
}

export interface ErrorResponse {
  type: 'ERROR';
  payload: ErrorPayload;
}

export interface PanelToggledResponse {
  type: 'PANEL_TOGGLED';
}

// ── Background → Content Script ─────────────────────────────────

export interface ExtractContentRequest {
  type: 'EXTRACT_CONTENT';
}

export interface GetSelectionRequest {
  type: 'GET_SELECTION';
}

// ── Content Script → Background ─────────────────────────────────

export interface ContentExtractedResponse {
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

export interface SelectionCapturedResponse {
  type: 'SELECTION_CAPTURED';
  payload: {
    text: string;
  };
}

// ── Union Types ─────────────────────────────────────────────────

export type ToBackgroundMessage =
  | SendMessageRequest
  | GetPageContextRequest
  | GetConversationsRequest
  | GetConversationRequest
  | DeleteConversationRequest
  | SaveSettingsRequest
  | GetSettingsRequest
  | TogglePanelRequest;

export type FromBackgroundMessage =
  | AIResponseChunk
  | PageContextResponse
  | ConversationsResponse
  | ConversationResponse
  | SettingsResponse
  | SettingsSavedResponse
  | ErrorResponse
  | PanelToggledResponse;

export type ToContentMessage = ExtractContentRequest | GetSelectionRequest;

export type FromContentMessage = ContentExtractedResponse | SelectionCapturedResponse;

// ── Shared Data Types ───────────────────────────────────────────

export interface PageContext {
  url: string;
  title: string;
  content: string;
  selectedText?: string;
  language: string;
  pageType: 'webpage' | 'pdf' | 'unknown';
  extractedAt: number;
}

export interface PageMetadata {
  description?: string;
  author?: string;
  publishDate?: string;
  wordCount: number;
  readingTime: number;
}

export interface Conversation {
  id: string;
  title: string;
  tabUrl: string;
  tabTitle: string;
  pageContext?: PageContext;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  archived: boolean;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  metadata?: {
    tokensUsed?: number;
    model?: string;
    pageContextIncluded?: boolean;
  };
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// A user-defined model/provider. Endpoint may be a base URL (…/v1) or a full
// chat-completions URL. apiKey is optional — some self-hosted endpoints need none.
export interface CustomModel {
  id: string;        // stable local id
  label: string;     // display name, e.g. "My Ollama · llama3"
  provider: string;  // free-text provider name, e.g. "OpenAI", "Ollama"
  endpoint: string;  // base URL or full chat/completions URL
  model: string;     // model id sent to the API
  apiKey?: string;   // optional
}

// The resolved config the API client needs to make a request.
export interface ResolvedModel {
  endpoint: string;
  model: string;
  apiKey: string;
}

export interface Settings {
  // OpenCode Zen key. Empty string means "use the built-in default key".
  apiKey: string;
  apiKeyConfigured: boolean;
  // Currently selected model. Either a BUILTIN_MODELS id (OpenCode Zen)
  // or a CustomModel id (prefixed "custom:").
  selectedModel: string;
  customModels: CustomModel[];
  defaultLanguage: string;
  summaryLength: 'brief' | 'standard' | 'detailed';
  theme: 'light' | 'dark' | 'system';
  panelWidth: number;
  autoContext: boolean;
  maxConversations: number;
  streamingEnabled: boolean;
  fontSize: 'small' | 'medium' | 'large';
}
