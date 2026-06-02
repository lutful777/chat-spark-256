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
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
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
      { title: "Ai Chat" },
      {
        name: "description",
        content:
          "Ai Chat — chat AI multi-provider dengan mode GitHub, Real Time Search, upload file, dan memory Supabase.",
      },
      { name: "author", content: "Ai Chat" },
      { name: "application-name", content: "Ai Chat" },
      { property: "og:title", content: "Ai Chat" },
      {
        property: "og:description",
        content: "Klien chat AI multi-provider dengan konfigurasi API sendiri.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Ai Chat" },
      { name: "twitter:description", content: "Chat AI multi-provider dengan GitHub mode dan Real Time Search." },
      { property: "og:image", content: "/icon-512x512.png?v=5" },
      { name: "twitter:image", content: "/icon-512x512.png?v=5" },
      { name: "theme-color", content: "#0f172a" },
      { name: "color-scheme", content: "dark" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Ai Chat" },
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "manifest", href: "/manifest.json?v=5" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192x192.png?v=5" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512x512.png?v=5" },
      { rel: "apple-touch-icon", sizes: "192x192", href: "/icon-192x192.png?v=5" },
      { rel: "apple-touch-icon", sizes: "512x512", href: "/icon-512x512.png?v=5" },
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
        navigator.serviceWorker.register("/sw.js").catch(() => undefined);
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
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ChatStoreProvider>
        <PwaBoot />
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </ChatStoreProvider>
    </QueryClientProvider>
  );
}
