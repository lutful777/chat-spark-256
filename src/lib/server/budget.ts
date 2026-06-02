import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BUDGET_FILE = join(process.cwd(), ".xai-budget.json");

/** Daily budget in USD. Override with DAILY_XAI_BUDGET_USD env var. */
const DAILY_BUDGET_USD = Number(process.env.DAILY_XAI_BUDGET_USD ?? "5");

interface BudgetStore {
  date: string;
  totalUsed: number;
}

/** Returns today's date as YYYY-MM-DD (UTC). */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadStore(): BudgetStore {
  try {
    const raw = readFileSync(BUDGET_FILE, "utf-8");
    const data = JSON.parse(raw) as BudgetStore;
    if (data.date === todayKey()) return data;
  } catch {
    // File missing or parse error → start fresh.
  }
  return { date: todayKey(), totalUsed: 0 };
}

function saveStore(store: BudgetStore): void {
  try {
    writeFileSync(BUDGET_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (e) {
    console.warn("[budget] Could not persist budget store:", e);
  }
}

/**
 * Returns true when the baseUrl is an x.ai endpoint.
 * Only those requests count toward the budget.
 */
export function isXaiUrl(baseUrl: string): boolean {
  return baseUrl.includes("x.ai");
}

/**
 * Estimate the USD cost of an x.ai media request.
 *
 * Image: grok-2-image / grok-imagine-image-quality  → $0.05 per call
 * Video 480p (default)                              → duration * $0.05
 * Video 720p (model/resolution contains "720"/"hd") → duration * $0.07
 */
export function estimateCost(opts: {
  path: string;
  payload: unknown;
}): number {
  const { path, payload } = opts;
  const p = (typeof payload === "object" && payload !== null ? payload : {}) as Record<
    string,
    unknown
  >;

  const isVideo = path.includes("video");

  if (isVideo) {
    const duration = typeof p.duration === "number" ? p.duration : 5;
    const modelStr = typeof p.model === "string" ? p.model.toLowerCase() : "";
    const resStr =
      typeof p.resolution === "string" ? p.resolution.toLowerCase() : "";
    const is720p =
      resStr.includes("720") || modelStr.includes("720") || modelStr.includes("hd");
    return duration * (is720p ? 0.07 : 0.05);
  }

  // Image generation — flat rate
  return 0.05;
}

/** How much has been used today (for informational purposes). */
export function getTodayUsage(): number {
  return loadStore().totalUsed;
}

/**
 * Check whether `cost` fits within today's remaining budget.
 * Returns `{ allowed: true }` or `{ allowed: false, message }`.
 */
export function checkBudget(cost: number): { allowed: boolean; message?: string } {
  const store = loadStore();
  if (store.totalUsed + cost > DAILY_BUDGET_USD) {
    const remaining = Math.max(0, DAILY_BUDGET_USD - store.totalUsed);
    return {
      allowed: false,
      message: `Daily x.ai budget limit reached. Try again tomorrow. (Used $${store.totalUsed.toFixed(3)} / $${DAILY_BUDGET_USD}, this request needs ~$${cost.toFixed(3)}, remaining $${remaining.toFixed(3)})`,
    };
  }
  return { allowed: true };
}

/**
 * Debit `cost` from today's running total and persist.
 * Call this after confirming the request will be forwarded.
 */
export function debitBudget(cost: number): void {
  const store = loadStore();
  store.totalUsed = Math.round((store.totalUsed + cost) * 10_000) / 10_000;
  saveStore(store);
}
