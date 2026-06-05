import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import settingsAndroidFixCss from "../settings-android-fix.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { ChatStoreProvider } from "@/lib/chat/store";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          AI Chat
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Halaman belum bisa dimuat. Coba buka ulang saat koneksi stabil.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Muat ulang
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Beranda
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=overlays-content" },
      { title: "AI Chat" },
      {
        name: "description",
        content:
          "AI Chat — chat AI multi-provider dengan mode GitHub, Real Time Search, upload file, dan memory Supabase.",
      },
      { name: "author", content: "AI Chat" },
      { name: "application-name", content: "AI Chat" },
      { property: "og:title", content: "AI Chat" },
      {
        property: "og:description",
        content: "Klien chat AI multi-provider dengan konfigurasi API sendiri.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "AI Chat" },
      { name: "twitter:description", content: "Chat AI multi-provider dengan GitHub mode dan Real Time Search." },
      { property: "og:image", content: "/ai-chat-icon.png?v=11" },
      { name: "twitter:image", content: "/ai-chat-icon.png?v=11" },
      { name: "theme-color", content: "#0f172a" },
      { name: "color-scheme", content: "dark" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "AI Chat" },
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "stylesheet",
        href: settingsAndroidFixCss,
      },
      { rel: "manifest", href: "/manifest.json?v=10" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/ai-chat-icon.png?v=11" },
      { rel: "shortcut icon", type: "image/png", href: "/ai-chat-icon.png?v=11" },
      { rel: "apple-touch-icon", sizes: "512x512", href: "/ai-chat-icon.png?v=11" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

type VirtualKeyboardLike = EventTarget & {
  overlaysContent?: boolean;
  boundingRect?: { height?: number };
  addEventListener: (type: "geometrychange", listener: () => void) => void;
  removeEventListener: (type: "geometrychange", listener: () => void) => void;
};

function PwaBoot() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    let stableHeight = window.innerHeight;
    const virtualKeyboard = (navigator as Navigator & { virtualKeyboard?: VirtualKeyboardLike }).virtualKeyboard;
    if (virtualKeyboard) virtualKeyboard.overlaysContent = true;

    const activeIsTextInput = () => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      return tag === "textarea" || tag === "input" || (el as HTMLElement).isContentEditable;
    };

    const updateViewportVars = () => {
      const viewport = window.visualViewport;
      const visualHeight = viewport?.height ?? window.innerHeight;
      const visualOffsetTop = viewport?.offsetTop ?? 0;
      const vkHeight = Math.round(virtualKeyboard?.boundingRect?.height ?? 0);
      const visualGap = viewport ? Math.round(Math.max(0, window.innerHeight - visualHeight - visualOffsetTop)) : 0;
      const resizeGap = Math.round(Math.max(0, stableHeight - window.innerHeight));
      const keyboardOffset = activeIsTextInput() ? Math.max(vkHeight, visualGap, resizeGap) : 0;
      const keyboardOpen = keyboardOffset > 60;

      if (!keyboardOpen) {
        stableHeight = window.innerHeight;
      }

      root.style.setProperty("--app-stable-height", `${Math.max(stableHeight, 480)}px`);
      root.style.setProperty("--keyboard-offset", `${keyboardOffset}px`);
      root.classList.toggle("keyboard-open", keyboardOpen);
    };

    updateViewportVars();
    window.addEventListener("resize", updateViewportVars);
    window.addEventListener("orientationchange", updateViewportVars);
    window.addEventListener("focusin", updateViewportVars);
    window.addEventListener("focusout", updateViewportVars);
    window.visualViewport?.addEventListener("resize", updateViewportVars);
    window.visualViewport?.addEventListener("scroll", updateViewportVars);
    virtualKeyboard?.addEventListener("geometrychange", updateViewportVars);

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js?v=10").catch(() => undefined);
      });
    }

    return () => {
      window.removeEventListener("resize", updateViewportVars);
      window.removeEventListener("orientationchange", updateViewportVars);
      window.removeEventListener("focusin", updateViewportVars);
      window.removeEventListener("focusout", updateViewportVars);
      window.visualViewport?.removeEventListener("resize", updateViewportVars);
      window.visualViewport?.removeEventListener("scroll", updateViewportVars);
      virtualKeyboard?.removeEventListener("geometrychange", updateViewportVars);
    };
  }, []);
  return null;
}

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="id" className="dark">
      <head>
        <HeadContent />
        <style>{`
          .min-h-\[55vh\] > .mt-5,
          .min-h-\[55vh\] > p {
            display: none !important;
          }
          .min-h-\[55vh\] > .mb-5 {
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          .min-h-\[55vh\] > .mb-5 svg {
            width: clamp(2.5rem, 12vw, 3.4rem) !important;
            height: clamp(2.5rem, 12vw, 3.4rem) !important;
          }
          .min-h-\[55vh\] {
            min-height: 66vh !important;
          }
          .min-h-\[55vh\] h1 {
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
            border-radius: 2rem;
            border: 1px solid rgba(96, 165, 250, 0.35);
            background: linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 64, 175, 0.45));
            box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
            color: #e5f2ff !important;
            font-size: clamp(3rem, 15vw, 5rem) !important;
            font-weight: 850 !important;
            letter-spacing: -0.07em;
            line-height: 1;
            padding: 1.15rem 1.65rem 1.25rem;
          }
          .flex.h-\[100dvh\].w-full.items-center.justify-center.bg-background.text-muted-foreground {
            flex-direction: column !important;
            gap: 0.85rem !important;
            color: #e5f2ff !important;
          }
          .flex.h-\[100dvh\].w-full.items-center.justify-center.bg-background.text-muted-foreground > svg {
            width: 3rem !important;
            height: 3rem !important;
            filter: drop-shadow(0 12px 32px rgba(96, 165, 250, 0.38));
          }
          .flex.h-\[100dvh\].w-full.items-center.justify-center.bg-background.text-muted-foreground::after {
            content: "AI Chat";
            display: block;
            font-size: clamp(2.2rem, 12vw, 4rem);
            font-weight: 850;
            letter-spacing: -0.06em;
            color: #e5f2ff;
            text-shadow: 0 24px 80px rgba(37, 99, 235, 0.32);
          }
        `}</style>
      </head>
      <body>
        {children}
        <Toaster richColors position="top-center" />
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <ChatStoreProvider>
        <PwaBoot />
        <Outlet />
      </ChatStoreProvider>
    </QueryClientProvider>
  );
}
