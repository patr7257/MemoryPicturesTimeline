import { cn } from "@/lib/utils";

// The person's colour as a small round dot. Decorative: the name always sits
// next to it, so colour is never the only cue.
export function PersonDot({ hex, className }: { hex: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-3.5 shrink-0 rounded-full border border-black/10", className)}
      style={{ backgroundColor: hex }}
    />
  );
}
