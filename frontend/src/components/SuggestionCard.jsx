import {
  Sparkles, MapPin, Star, ExternalLink, MessageSquare,
  Loader2, Quote, Tag, AlertTriangle, Lock,
} from "lucide-react";

// Tone → color mapping shared across surfaces.
export const TONE_COLOR = {
  love: "#22c55e",
  hype: "#f59e0b",
  "cult-favorite": "#a855f7",
  underrated: "#06b6d4",
  controversial: "#ef4444",
  mixed: "#94a3b8",
};

export function formatCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

/**
 * SuggestionCard — the canonical card for a single Astral pick. Used inside
 * the AstralDrawer (full surface) and the AstralHub (compact in-line surface).
 *
 * Props:
 *   card, idx          — the suggestion blob and its index in the result set
 *   drafting           — whether a draft is in-flight for this card
 *   draft              — drafted invite text (if any)
 *   onDraft, onLockIn  — action callbacks
 *   compact            — render the smaller variant (used by Hub)
 */
export default function SuggestionCard({
  card, idx, drafting, draft, onDraft, onLockIn, compact,
}) {
  const tone = card.buzz?.tone || "mixed";
  const toneColor = TONE_COLOR[tone] || "#94a3b8";

  // Compact: tighter spacing, smaller titles, no tag chips, fewer actions
  // (so the card fits a 320–460px panel).
  if (compact) {
    return (
      <article
        className="astral-card neo-card p-3.5 space-y-3"
        data-testid={`astral-card-${idx}`}
      >
        {/* Buzz mini */}
        {card.buzz?.quote && (
          <div
            className="rounded-xl border-2 border-slate-900 px-3 py-2.5 relative"
            style={{ background: "var(--pastel-yellow)" }}
          >
            <Quote className="absolute -top-2 -left-1.5 w-4 h-4" strokeWidth={2.5} />
            <p className="text-xs leading-snug font-medium pl-2.5 lowercase">
              {card.buzz.quote}
            </p>
            <div className="flex items-center gap-1.5 mt-1.5 pl-2.5">
              <span
                className="text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-full text-white"
                style={{ background: toneColor }}
              >
                {tone}
              </span>
              <span className="text-[9px] opacity-70 lowercase">the buzz</span>
            </div>
          </div>
        )}

        {/* Title row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-heading font-black text-base leading-tight truncate">
              {card.venue}
            </h3>
            <div className="text-[10px] opacity-75 lowercase mt-0.5 truncate">
              {card.category}
              {card.neighborhood && ` · ${card.neighborhood}`}
              {card.price_level && ` · ${card.price_level}`}
            </div>
          </div>
          {card.rating ? (
            <div className="shrink-0 text-right">
              <div className="flex items-center gap-1 justify-end font-bold text-sm">
                <Star className="w-3 h-3 fill-current" />
                {Number(card.rating).toFixed(1)}
              </div>
              {card.review_count_approx ? (
                <div className="text-[9px] opacity-60 lowercase">
                  ~{formatCount(card.review_count_approx)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Astral take, one line */}
        {card.astral_take && (
          <p className="text-[11px] leading-snug opacity-80 lowercase line-clamp-3">
            <span className="label-caps text-[9px] mr-1 opacity-70">astral:</span>
            {card.astral_take}
          </p>
        )}

        {/* Drafted invite preview */}
        {draft && (
          <div
            className="rounded-lg border-2 border-dashed border-slate-900 p-2 bg-[var(--pastel-yellow)] text-[11px] whitespace-pre-wrap leading-snug"
            data-testid={`astral-draft-preview-${idx}`}
          >
            <div className="label-caps text-[9px] mb-0.5">draft (copied)</div>
            {draft}
          </div>
        )}

        {/* Compact actions: 4 in a row */}
        <div className="grid grid-cols-4 gap-1.5">
          <a
            href={card.verify_links?.google_maps}
            target="_blank"
            rel="noreferrer"
            className="neo-btn ghost !py-1.5 !px-1 flex items-center justify-center"
            data-testid={`astral-maps-${idx}`}
            title="Open in Google Maps"
          >
            <MapPin className="w-3 h-3" />
          </a>
          <a
            href={card.verify_links?.google_search}
            target="_blank"
            rel="noreferrer"
            className="neo-btn ghost !py-1.5 !px-1 flex items-center justify-center"
            data-testid={`astral-verify-${idx}`}
            title="Verify on Google"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
          <button
            type="button"
            onClick={onDraft}
            disabled={drafting}
            className="neo-btn ghost !py-1.5 !px-1 flex items-center justify-center"
            data-testid={`astral-draft-btn-${idx}`}
            title="Draft invite"
          >
            {drafting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <MessageSquare className="w-3 h-3" />
            )}
          </button>
          <button
            type="button"
            onClick={onLockIn}
            className="neo-btn !py-1.5 !px-1 flex items-center justify-center gap-1 text-[10px] font-extrabold"
            data-testid={`astral-lockin-${idx}`}
            title="Lock it in"
          >
            <Lock className="w-3 h-3" />
            lock
          </button>
        </div>
      </article>
    );
  }

  // ── Full (drawer) variant — original design ──
  return (
    <article className="astral-card neo-card p-5 space-y-4" data-testid={`astral-card-${idx}`}>
      {/* Buzz quote — front and center */}
      {card.buzz?.quote && (
        <div className="astral-buzz">
          <Quote className="astral-buzz-mark w-7 h-7" strokeWidth={2.5} />
          <p className="astral-buzz-quote">{card.buzz.quote}</p>
          <div className="astral-buzz-meta">
            <span
              className="astral-tone-pill"
              style={{ background: toneColor }}
            >
              {tone}
            </span>
            <span className="opacity-70 lowercase">
              the buzz across the web
            </span>
          </div>
        </div>
      )}

      {/* Header: venue + meta */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading font-black text-2xl leading-tight">
            {card.venue}
          </h3>
          <div className="text-sm opacity-80 lowercase mt-0.5">
            {card.category}
            {card.neighborhood && ` · ${card.neighborhood}`}
            {card.price_level && ` · ${card.price_level}`}
          </div>
        </div>
        {card.rating ? (
          <div className="shrink-0 text-right">
            <div className="flex items-center gap-1 justify-end font-bold">
              <Star className="w-4 h-4 fill-current" />
              {Number(card.rating).toFixed(1)}
            </div>
            {card.review_count_approx ? (
              <div className="text-[0.65rem] opacity-60 lowercase">
                ~{formatCount(card.review_count_approx)} reviews
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Vibe tags */}
      {card.vibe_tags && card.vibe_tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {card.vibe_tags.map((t, i) => (
            <span
              key={i}
              className="text-[0.65rem] font-bold uppercase tracking-wider px-2 py-1 rounded-full border-2 border-slate-900 bg-[var(--pastel-mint)]"
            >
              <Tag className="w-2.5 h-2.5 inline mr-1 -mt-0.5" />
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Astral's take */}
      {card.astral_take && (
        <div className="astral-take">
          <div className="label-caps text-[0.6rem] mb-1 opacity-70">astral says</div>
          <p className="lowercase leading-relaxed">{card.astral_take}</p>
        </div>
      )}

      {/* What to order */}
      {card.what_to_order && (
        <div className="text-sm">
          <span className="label-caps text-[0.6rem] mr-2 opacity-70">order:</span>
          <span className="font-bold lowercase">{card.what_to_order}</span>
        </div>
      )}

      {/* Warnings */}
      {card.warnings && card.warnings.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {card.warnings.map((w, i) => (
            <span
              key={i}
              className="text-[0.65rem] font-bold uppercase tracking-wider px-2 py-1 rounded-md border-2 border-slate-900 bg-[var(--pastel-peach)] flex items-center gap-1"
            >
              <AlertTriangle className="w-2.5 h-2.5" />
              {w}
            </span>
          ))}
        </div>
      )}

      {/* Drafted invite preview */}
      {draft && (
        <div
          className="rounded-xl border-2 border-dashed border-slate-900 p-3 bg-[var(--pastel-yellow)] text-sm whitespace-pre-wrap"
          data-testid={`astral-draft-preview-${idx}`}
        >
          <div className="label-caps text-[0.6rem] mb-1">draft (copied)</div>
          {draft}
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <a
          href={card.verify_links?.google_search}
          target="_blank"
          rel="noreferrer"
          className="neo-btn ghost text-[0.7rem] !py-2 !px-2 flex items-center justify-center gap-1"
          data-testid={`astral-verify-${idx}`}
        >
          <ExternalLink className="w-3 h-3" /> verify
        </a>
        <a
          href={card.verify_links?.google_maps}
          target="_blank"
          rel="noreferrer"
          className="neo-btn ghost text-[0.7rem] !py-2 !px-2 flex items-center justify-center gap-1"
          data-testid={`astral-maps-${idx}`}
        >
          <MapPin className="w-3 h-3" /> maps
        </a>
        <button
          type="button"
          className="neo-btn ghost text-[0.7rem] !py-2 !px-2 flex items-center justify-center gap-1"
          onClick={onDraft}
          disabled={drafting}
          data-testid={`astral-draft-btn-${idx}`}
        >
          {drafting ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <MessageSquare className="w-3 h-3" />
          )}
          {drafting ? "drafting…" : draft ? "redraft" : "draft pitch"}
        </button>
        <button
          type="button"
          className="neo-btn text-[0.7rem] !py-2 !px-2 flex items-center justify-center gap-1"
          onClick={onLockIn}
          data-testid={`astral-lockin-${idx}`}
        >
          <Lock className="w-3 h-3" />
          lock it in
        </button>
      </div>
    </article>
  );
}

// Keep Sparkles export for any consumers that imported it from here historically.
export { Sparkles };
