/**
 * Client-side Microsoft (Outlook) OAuth via MSAL — Microsoft Identity Platform.
 *
 * Everything runs in the browser using the Authorization Code + PKCE flow for
 * a public SPA client. No client secret is required and no email/password is
 * ever handled by this app — the user authenticates directly with Microsoft
 * and explicitly consents. The Azure App Registration "Client ID" is a public
 * identifier (safe to keep in localStorage), provided by the user.
 */
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AccountInfo,
  type Configuration,
} from "@azure/msal-browser";

const OUTLOOK_KEY = "aiapichat:outlook";

/** Delegated Microsoft Graph scopes requested from the user. */
export const OUTLOOK_SCOPES = [
  "User.Read",
  "Mail.Read",
  "Mail.Send",
  "Calendars.Read",
  "offline_access",
];

export interface OutlookConfig {
  /** Azure App Registration (SPA) Application/Client ID. */
  clientId: string;
  /** Tenant: "common", "organizations", "consumers", or a tenant GUID. */
  tenant: string;
  /** Cached email of the last connected account, for quick display. */
  email?: string;
}

export interface OutlookProfile {
  displayName?: string;
  mail?: string;
  userPrincipalName?: string;
  id?: string;
  jobTitle?: string;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function loadOutlookConfig(): OutlookConfig {
  if (!isBrowser()) return { clientId: "", tenant: "common" };
  try {
    const raw = localStorage.getItem(OUTLOOK_KEY);
    if (!raw) return { clientId: "", tenant: "common" };
    const parsed = JSON.parse(raw) as Partial<OutlookConfig>;
    return {
      clientId: parsed.clientId ?? "",
      tenant: parsed.tenant?.trim() || "common",
      email: parsed.email,
    };
  } catch {
    return { clientId: "", tenant: "common" };
  }
}

export function saveOutlookConfig(config: OutlookConfig): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(OUTLOOK_KEY, JSON.stringify(config));
  } catch {
    /* ignore quota errors */
  }
}

let instance: PublicClientApplication | null = null;
let instanceClientId: string | null = null;
let instanceTenant: string | null = null;

/** Get (or lazily create + initialize) a PublicClientApplication for the config. */
async function getInstance(config: OutlookConfig): Promise<PublicClientApplication> {
  if (!config.clientId.trim()) {
    throw new Error("Client ID Microsoft belum diisi.");
  }
  const tenant = config.tenant?.trim() || "common";
  // Recreate when the client id / tenant changes.
  if (instance && instanceClientId === config.clientId && instanceTenant === tenant) {
    return instance;
  }
  const msalConfig: Configuration = {
    auth: {
      clientId: config.clientId.trim(),
      authority: `https://login.microsoftonline.com/${tenant}`,
      redirectUri: window.location.origin,
    },
    cache: {
      cacheLocation: "localStorage",
      storeAuthStateInCookie: false,
    },
  };
  const inst = new PublicClientApplication(msalConfig);
  await inst.initialize();
  instance = inst;
  instanceClientId = config.clientId;
  instanceTenant = tenant;
  return inst;
}

/** Return the currently signed-in account (if any) without prompting. */
export async function getActiveAccount(
  config: OutlookConfig,
): Promise<AccountInfo | null> {
  if (!config.clientId.trim()) return null;
  const inst = await getInstance(config);
  const accounts = inst.getAllAccounts();
  return accounts[0] ?? null;
}

/**
 * Interactive sign-in. Shows the Microsoft account picker so the user can
 * choose an already-signed-in account or add a new one. Requires explicit
 * user consent — never reads an account silently.
 */
export async function connectOutlook(config: OutlookConfig): Promise<AccountInfo> {
  const inst = await getInstance(config);
  const result = await inst.loginPopup({
    scopes: OUTLOOK_SCOPES,
    prompt: "select_account",
  });
  if (!result.account) {
    throw new Error("Tidak ada akun yang dipilih.");
  }
  inst.setActiveAccount(result.account);
  return result.account;
}

/** Acquire a Graph access token, silently when possible, else interactively. */
export async function getAccessToken(config: OutlookConfig): Promise<string> {
  const inst = await getInstance(config);
  const account = inst.getActiveAccount() ?? inst.getAllAccounts()[0];
  if (!account) {
    throw new Error("Belum terhubung ke akun Microsoft.");
  }
  try {
    const res = await inst.acquireTokenSilent({ scopes: OUTLOOK_SCOPES, account });
    return res.accessToken;
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      const res = await inst.acquireTokenPopup({ scopes: OUTLOOK_SCOPES, account });
      return res.accessToken;
    }
    throw err;
  }
}

/** Test helper: fetch the signed-in user's profile from Microsoft Graph. */
export async function fetchOutlookProfile(
  config: OutlookConfig,
): Promise<OutlookProfile> {
  const token = await getAccessToken(config);
  const res = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Microsoft Graph error ${res.status}: ${body.slice(0, 200) || res.statusText}`,
    );
  }
  return (await res.json()) as OutlookProfile;
}

/** Sign out the active account (clears the local MSAL cache for it). */
export async function disconnectOutlook(config: OutlookConfig): Promise<void> {
  const inst = await getInstance(config);
  const account = inst.getActiveAccount() ?? inst.getAllAccounts()[0];
  if (account) {
    await inst.clearCache({ account });
  }
  inst.setActiveAccount(null);
}