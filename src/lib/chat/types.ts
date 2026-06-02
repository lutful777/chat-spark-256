export type ChatRole = "system" | "user" | "assistant";

export interface ChatAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
  text?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  attachments?: ChatAttachment[];
  /** present when this message failed to generate */
  error?: boolean;
}

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  path: string;
  apiKey: string;
  /** currently selected model used for chat */
  model: string;
  /** all models available under this provider/API key */
  models: string[];
  temperature: number;
  maxTokens: number;
  /** optional default instruction sent as the system message */
  systemPrompt?: string;
  /** request token-by-token streaming responses */
  stream?: boolean;
  /** call provider directly from the browser instead of via server proxy */
  directCall?: boolean;
  /* ---------- Media (image / video) settings ---------- */
  /** optional separate base URL for image endpoints; falls back to baseUrl */
  imageBaseUrl?: string;
  /** separate API key for image endpoints; falls back to apiKey */
  imageApiKey?: string;
  /** path for image generation, e.g. /images/generations */
  imagePath?: string;
  /** model used for image generation */
  imageModel?: string;
  /** path for image editing, e.g. /images/edits */
  imageEditPath?: string;
  /** model used for image editing */
  imageEditModel?: string;
  /** separate API key for video endpoints; falls back to apiKey */
  videoApiKey?: string;
  /** path for video generation, e.g. /videos/generations */
  videoPath?: string;
  /** optional separate base URL for video endpoints; falls back to baseUrl */
  videoBaseUrl?: string;
  /** model used for video generation */
  videoModel?: string;
  /** optional status/polling path; supports {request_id} placeholder */
  videoStatusPath?: string;
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
  models: [],
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
    models: ["openai/gpt-4o-mini"],
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
    models: ["mistralai/mistral-large"],
    temperature: 0.7,
    maxTokens: 1024,
    systemPrompt: "",
    stream: true,
    directCall: false,
  },
  {
    name: "x.ai (Grok)",
    baseUrl: "https://api.x.ai/v1",
    path: "/chat/completions",
    apiKey: "",
    model: "grok-4-latest",
    models: ["grok-4-latest", "grok-3-latest"],
    temperature: 0.7,
    maxTokens: 1024,
    systemPrompt: "",
    stream: true,
    directCall: false,
    imageBaseUrl: "https://api.x.ai/v1",
    imageApiKey: "",
    imagePath: "/images/generations",
    imageModel: "grok-imagine-image-quality",
    imageEditPath: "/images/edits",
    imageEditModel: "grok-imagine-image-quality",
    videoBaseUrl: "https://api.x.ai/v1",
    videoApiKey: "",
    videoPath: "/videos/generations",
    videoModel: "grok-imagine-video",
    videoStatusPath: "/videos/{request_id}",
  },
  {
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    path: "/chat/completions",
    apiKey: "",
    model: "gpt-4o-mini",
    models: ["gpt-4o-mini"],
    temperature: 0.7,
    maxTokens: 1024,
    systemPrompt: "",
    stream: true,
    directCall: false,
  },
];
