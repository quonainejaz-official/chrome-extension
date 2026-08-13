import type { AgentAction, AgentStep } from './actions';

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

/** Kick off an agent run: the model drives the page until the goal is met. */
export interface RunAgentRequest {
  type: 'RUN_AGENT';
  payload: {
    goal: string;
    conversationId?: string;
  };
}

/** The user answered a confirmation card in the side panel. */
export interface AgentConfirmDecisionRequest {
  type: 'AGENT_CONFIRM_DECISION';
  payload: {
    id: string;
    approved: boolean;
  };
}

export interface CancelAgentRequest {
  type: 'CANCEL_AGENT';
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

/** Broadcast as each agent step starts and finishes. */
export interface AgentStepEvent {
  type: 'AGENT_STEP';
  payload: {
    runId: string;
    step: AgentStep;
  };
}

/**
 * What the agent is doing between actions. Without this the panel shows
 * nothing at all during the seconds spent reading the page and waiting on the
 * model, which is most of a run.
 */
export interface AgentStatusEvent {
  type: 'AGENT_STATUS';
  payload: {
    runId: string;
    kind: 'reading' | 'thinking' | 'waiting' | 'acting';
    text: string;
  };
}

/** Broadcast when a consequential action needs the user's go-ahead. */
export interface AgentConfirmRequestEvent {
  type: 'AGENT_CONFIRM_REQUEST';
  payload: {
    runId: string;
    id: string;
    title: string;
    detail: string;
    url: string;
    action: AgentAction;
  };
}

export interface AgentFinishedResponse {
  type: 'AGENT_FINISHED';
  payload: {
    runId: string;
    conversationId: string;
    messageId: string;
    content: string;
    steps: AgentStep[];
    /** True when the run stopped early (cancelled, blocked, step limit). */
    incomplete: boolean;
  };
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
  | TogglePanelRequest
  | RunAgentRequest
  | AgentConfirmDecisionRequest
  | CancelAgentRequest;

export type FromBackgroundMessage =
  | AIResponseChunk
  | PageContextResponse
  | ConversationsResponse
  | ConversationResponse
  | SettingsResponse
  | SettingsSavedResponse
  | ErrorResponse
  | PanelToggledResponse
  | AgentStepEvent
  | AgentStatusEvent
  | AgentConfirmRequestEvent
  | AgentFinishedResponse;

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
    /** Present when this reply came from an agent run. */
    steps?: AgentStep[];
    agent?: boolean;
  };
}

/**
 * Details the agent may type into forms on the user's behalf.
 *
 * Deliberately has no fields for passwords, card numbers, CVV codes or
 * government IDs — those stay out of the extension entirely and the DOM
 * executor refuses to fill them even if a page asks.
 */
export interface UserProfile {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  jobTitle: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  website: string;
  /** Free-form extras, e.g. "GitHub" → "github.com/me". */
  custom: { id: string; label: string; value: string }[];
}

export const EMPTY_PROFILE: UserProfile = {
  fullName: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  company: '',
  jobTitle: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  website: '',
  custom: [],
};

/**
 * When the agent must stop and ask before doing something consequential
 * (submitting, sending, navigating away).
 *
 * - `always` — confirm every consequential action.
 * - `smart`  — proceed when the user's own message clearly asked for it,
 *              otherwise confirm. High-risk actions still always confirm.
 * - `never`  — never confirm. High-risk actions still always confirm.
 */
export type ConfirmMode = 'always' | 'smart' | 'never';

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

  // ── Agent mode ────────────────────────────────────────────────
  /**
   * Master switch. Off means read-only: the assistant answers questions about
   * the page but never clicks, types or submits.
   */
  agentEnabled: boolean;
  confirmMode: ConfirmMode;
  /** Model round-trips per run — the planning budget. */
  maxAgentSteps: number;
  /** Total actions per run, so one long form isn't cut off mid-way. */
  maxAgentActions: number;
  profile: UserProfile;
}
