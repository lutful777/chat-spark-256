import { Link, useRouterState } from "@tanstack/react-router";
import { MessageSquare, Settings, SlidersHorizontal } from "lucide-react";

function navClass(active: boolean): string {
  return [
    "inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors sm:flex-none sm:text-sm",
    active
      ? "bg-primary text-primary-foreground shadow-sm"
      : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  ].join(" ");
}

export function AppRouteNav({ className = "" }: { className?: string }) {
  const routerState = useRouterState();
  const pathname = routerState.location.pathname;

  return (
    <nav
      aria-label="Navigasi utama"
      className={`flex w-full min-w-0 gap-2 overflow-x-auto rounded-2xl border border-border bg-background/80 p-1 ${className}`}
    >
      <Link to="/" className={navClass(pathname === "/")}>
        <MessageSquare className="size-4 shrink-0" />
        <span className="truncate">Chat</span>
      </Link>
      <Link to="/settings" className={navClass(pathname === "/settings")}>
        <Settings className="size-4 shrink-0" />
        <span className="truncate">Settings</span>
      </Link>
      <Link to="/settings/advanced" className={navClass(pathname.startsWith("/settings/advanced"))}>
        <SlidersHorizontal className="size-4 shrink-0" />
        <span className="truncate">Advanced</span>
      </Link>
    </nav>
  );
}
