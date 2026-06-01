export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  /** present when this message failed to generate */
  error?: boolean;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  path: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  /** optional default instruction sent as the system message */
  systemPrompt?: string;
  /** request token-by-token streaming responses */
  stream?: boolean;
  /** call provider directly from the browser instead of via server proxy */
  directCall?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  providerId: string | null;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_PROVIDER: Omit<ProviderConfig, "id"> = {
  name: "Custom API",
  baseUrl: "",
  path: "",
  apiKey: "",
  model: "",
  temperature: 0.7,
  maxTokens: 1000,
  systemPrompt: "",
  stream: true,
  directCall: false,
};

export const PROVIDER_PRESETS: Array<Omit<ProviderConfig, "id">> = [
  { ...DEFAULT_PROVIDER },
  {
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    path: "/chat/completions",
    apiKey: "",
    model: "openai/gpt-4o-mini",
    temperature: 0.7,
    maxTokens: 1024,
    systemPrompt: "",
    stream: true,
    directCall: false,
  },
  {
    name: "BluesMinds",
    baseUrl: "https://api.bluesminds.com/v1",
    path: "/chat/completions",
    apiKey: "",
    model: "mistralai/mistral-large",
    temperature: 0.7,
    maxTokens: 1024,
    systemPrompt: "",
    stream: true,
    directCall: false,
  },
  {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    path: "/chat/completions",
    apiKey: "",
    model: "gpt-4o-mini",
    temperature: 0.7,
    maxTokens: 1024,
    systemPrompt: "",
    stream: true,
    directCall: false,
  },
];