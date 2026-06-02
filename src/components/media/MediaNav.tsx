import { Link } from "@tanstack/react-router";
import { ImageIcon, Mail, MessageSquare, Video } from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", label: "Chat", icon: MessageSquare, exact: true },
  { to: "/image", label: "Image", icon: ImageIcon, exact: false },
  { to: "/video", label: "Video", icon: Video, exact: false },
  { to: "/outlook", label: "Outlook", icon: Mail, exact: false },
] as const;

export function MediaNav({ className }: { className?: string }) {
  return (
    <nav
      className={cn(
        "grid w-full grid-cols-4 gap-1 overflow-hidden rounded-2xl border border-border bg-card p-1",
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
            className="min-w-0 rounded-xl px-1 py-1.5 text-center text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "bg-primary/15 text-primary" }}
          >
            <span className="flex min-w-0 flex-col items-center justify-center gap-0.5 leading-none sm:flex-row sm:gap-1">
              <Icon className="size-4 shrink-0" />
              <span className="block max-w-full truncate">{t.label}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
