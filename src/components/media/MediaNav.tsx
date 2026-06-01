import { Link } from "@tanstack/react-router";
import { ImageIcon, MessageSquare, Video } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", label: "Chat", icon: MessageSquare, exact: true },
  { to: "/image", label: "Image", icon: ImageIcon, exact: false },
  { to: "/video", label: "Video", icon: Video, exact: false },
] as const;

export function MediaNav({ className }: { className?: string }) {
  return (
    <nav
      className={cn(
        "inline-flex items-center gap-1 rounded-2xl border border-border bg-card p-1",
        className,
      )}
    >
      {TABS.map((t) => {
        const Icon = t.icon;
        return (
          <Link
            key={t.to}
            to={t.to}
            activeOptions={{ exact: t.exact }}
            className="rounded-xl px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "bg-primary/15 text-primary" }}
          >
            <span className="flex items-center gap-1.5">
              <Icon className="size-4" />
              {t.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}