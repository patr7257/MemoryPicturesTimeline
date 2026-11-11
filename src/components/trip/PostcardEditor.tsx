"use client";

// The plain, legible text box used for editing on a postcard (handwriting is
// for reading only). Autofocuses, scrolls itself into view so the on-screen
// keyboard never hides the field or its Save button, Ctrl/Cmd+Enter saves,
// Escape cancels (and stops there: it must not close the dialog).
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { charsLeft } from "@/lib/postcard";

export type PostcardEditorProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  placeholder: string;
  pending: boolean;
  error: string | null;
  saveLabel: string;
  // Save is blocked while this is true (for example an empty note).
  saveDisabled?: boolean;
  onSave: () => void;
  onCancel: () => void;
};

export function PostcardEditor({
  id,
  label,
  value,
  onChange,
  max,
  placeholder,
  pending,
  error,
  saveLabel,
  saveDisabled = false,
  onSave,
  onCancel,
}: PostcardEditorProps) {
  const box = useRef<HTMLTextAreaElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.setSelectionRange(el.value.length, el.value.length);
    // Wait for the keyboard animation, then keep box and buttons in view.
    const t = window.setTimeout(() => {
      wrap.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 250);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      ref={wrap}
      className="flex scroll-mb-4 flex-col gap-2 font-sans"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          if (!pending) onCancel();
        }
      }}
    >
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Textarea
        ref={box}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (!pending && !saveDisabled) onSave();
          }
        }}
        maxLength={max}
        rows={4}
        disabled={pending}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="min-h-28 bg-white text-base leading-relaxed text-neutral-900 md:text-base"
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-neutral-600" aria-live="polite">
          {value.length}/{max}
          <span className="sr-only"> characters, {charsLeft(value, max)} left</span>
        </span>
        <span className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 px-4 sm:min-h-9"
            onClick={onCancel}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="min-h-11 px-4 sm:min-h-9"
            onClick={onSave}
            disabled={pending || saveDisabled}
          >
            {pending ? "Saving..." : saveLabel}
          </Button>
        </span>
      </div>
    </div>
  );
}
