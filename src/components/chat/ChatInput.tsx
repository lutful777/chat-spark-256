import {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Send, Square } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface ChatInputHandle {
  setText: (text: string) => void;
}

interface ChatInputProps {
  onSend: (text: string) => void;
  onStop?: () => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput({ onSend, onStop, loading, disabled, placeholder }, handleRef) {
    const [value, setValue] = useState("");
    const ref = useRef<HTMLTextAreaElement>(null);

    const resize = () => {
      const el = ref.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    };

    useImperativeHandle(handleRef, () => ({
      setText: (text: string) => {
        setValue(text);
        requestAnimationFrame(() => {
          ref.current?.focus();
          resize();
        });
      },
    }));

    const submit = () => {
      const text = value.trim();
      if (!text || loading || disabled) return;
      onSend(text);
      setValue("");
      requestAnimationFrame(() => {
        if (ref.current) ref.current.style.height = "auto";
      });
    };

    const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    };

    return (
      <div className="border-t border-border bg-background/80 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
          <Textarea
            ref={ref}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              resize();
            }}
            onKeyDown={onKeyDown}
            rows={1}
            disabled={disabled}
            placeholder={placeholder ?? "Ketik pesan…"}
            className="max-h-40 min-h-[44px] flex-1 resize-none rounded-2xl bg-card"
          />
          {loading ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={onStop}
              className="size-11 shrink-0 rounded-2xl"
              aria-label="Hentikan"
            >
              <Square className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              onClick={submit}
              disabled={disabled || !value.trim()}
              className="size-11 shrink-0 rounded-2xl"
              aria-label="Kirim"
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>
    );
  },
);
