import { useEffect, useRef, useState } from "react";
import { X, Send, Loader2, Heart, Frown, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { submitFeedback } from "../lib/api";

/**
 * FeedbackModal — lightweight in-app feedback collector.
 *
 * Fields:
 *  - name      (optional, ≤ 80 chars)
 *  - liked     (what you liked)
 *  - disliked  (what you didn't like so much)
 *  - wished    (what you'd like to see added)
 *
 * At least ONE of liked/disliked/wished is required (server enforces this too).
 * Submits to POST /api/feedback. Calls onClose after success.
 */
export default function FeedbackModal({ open, onClose, groupCode }) {
  const [name, setName] = useState("");
  const [liked, setLiked] = useState("");
  const [disliked, setDisliked] = useState("");
  const [wished, setWished] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef(null);

  // Reset state every time the modal is freshly opened so users don't see
  // stale entries from a previous (cancelled) draft.
  useEffect(() => {
    if (open) {
      setName("");
      setLiked("");
      setDisliked("");
      setWished("");
      setSubmitting(false);
      // small delay so the focus ring doesn't fight the entry animation
      setTimeout(() => dialogRef.current?.querySelector("input,textarea")?.focus(), 80);
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape" && !submitting) onClose?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  if (!open) return null;

  const hasAny = (liked.trim() || disliked.trim() || wished.trim()).length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hasAny || submitting) return;
    setSubmitting(true);
    try {
      await submitFeedback({
        name: name.trim() || null,
        liked: liked.trim() || null,
        disliked: disliked.trim() || null,
        wished: wished.trim() || null,
        group_code: groupCode || null,
      });
      toast.success("Thanks for the feedback!");
      onClose?.();
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.message || "Couldn't send feedback";
      toast.error(typeof msg === "string" ? msg : "Couldn't send feedback");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-3 sm:px-6 py-6 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose?.();
      }}
      data-testid="feedback-modal"
    >
      <div
        ref={dialogRef}
        className="neo-card w-full max-w-lg max-h-[90vh] overflow-y-auto p-5 sm:p-7 relative animate-slide-up"
      >
        <button
          type="button"
          onClick={() => !submitting && onClose?.()}
          aria-label="Close feedback"
          className="absolute top-3 right-3 w-8 h-8 rounded-full border-2 border-slate-900 bg-white hover:bg-[var(--pastel-mint)] flex items-center justify-center transition"
          data-testid="feedback-close-btn"
        >
          <X className="w-4 h-4" strokeWidth={3} />
        </button>

        <div className="flex items-start gap-3 mb-1 pr-8">
          <div
            className="w-9 h-9 rounded-full border-2 border-slate-900 flex items-center justify-center shrink-0"
            style={{ background: "var(--pastel-mint)" }}
            aria-hidden="true"
          >
            <Heart className="w-4 h-4" strokeWidth={2.5} />
          </div>
          <div>
            <h2
              id="feedback-title"
              className="text-xl sm:text-2xl font-extrabold tracking-tight"
              style={{ color: "var(--ink)" }}
            >
              Send feedback
            </h2>
            <p className="text-xs sm:text-sm" style={{ color: "var(--ink-soft)" }}>
              Help us shape Planit. Even one line is gold.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="label-caps mb-1.5 block">Your name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="Anonymous is great too"
              className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-900 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-mint)]"
              data-testid="feedback-name-input"
              disabled={submitting}
            />
          </div>

          <FieldBlock
            icon={<Heart className="w-3.5 h-3.5" strokeWidth={2.8} />}
            label="What you liked"
            placeholder="Anything that worked well?"
            value={liked}
            onChange={setLiked}
            disabled={submitting}
            testId="feedback-liked-input"
          />
          <FieldBlock
            icon={<Frown className="w-3.5 h-3.5" strokeWidth={2.8} />}
            label="What you didn't like so much"
            placeholder="Anything confusing or frustrating?"
            value={disliked}
            onChange={setDisliked}
            disabled={submitting}
            testId="feedback-disliked-input"
          />
          <FieldBlock
            icon={<Lightbulb className="w-3.5 h-3.5" strokeWidth={2.8} />}
            label="What you'd like to see added"
            placeholder="A new feature, a tweak, anything…"
            value={wished}
            onChange={setWished}
            disabled={submitting}
            testId="feedback-wished-input"
          />

          <div className="flex items-center justify-between gap-3 pt-1">
            <span
              className={`text-xs ${hasAny ? "text-slate-500" : "text-slate-400"}`}
              aria-live="polite"
            >
              {hasAny
                ? "Ready when you are"
                : "Fill in at least one of the three fields above"}
            </span>
            <button
              type="submit"
              disabled={!hasAny || submitting}
              className="neo-btn pastel text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              data-testid="feedback-submit-btn"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" strokeWidth={2.5} />
              )}
              {submitting ? "Sending…" : "Send feedback"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldBlock({ icon, label, placeholder, value, onChange, disabled, testId }) {
  return (
    <div>
      <label className="label-caps mb-1.5 flex items-center gap-1.5">
        <span aria-hidden="true">{icon}</span>
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-900 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pastel-mint)] resize-none"
        data-testid={testId}
        disabled={disabled}
      />
    </div>
  );
}
