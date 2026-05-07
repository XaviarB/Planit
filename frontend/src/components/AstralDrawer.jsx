import { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import {
  Sparkles, X, Send, MapPin, Star, ExternalLink, MessageSquare,
  Loader2, Compass, Quote, ChevronDown, Tag, AlertTriangle, Lock,
  Shuffle,
} from "lucide-react";
import {
  astralSuggest,
  astralDraftInvite,
  updateGroup,
  updateMember,
} from "../lib/api";
import { copyToClipboard } from "../lib/clipboard";
import { LockInModal } from "./Hangouts";

// Remix presets — keys MUST match REMIX_PRESETS in backend/astral.py.
// Labels are the short chip captions shown in the drawer.
const REMIX_CHIPS = [
  { key: "cheaper",                label: "cheaper" },
  { key: "fancier",                label: "fancier" },
  { key: "different_neighborhood", label: "diff. nbhd" },
  { key: "different_vibe",         label: "diff. vibe" },
  { key: "more_chill",             label: "more chill" },
  { key: "more_lit",               label: "more lit" },
  { key: "with_food",              label: "with food" },
  { key: "no_drinks",              label: "no drinks" },
  { key: "earlier",                label: "earlier" },
  { key: "later",                  label: "later" },
  { key: "outdoorsy",              label: "outdoorsy" },
  { key: "indoorsy",               label: "indoorsy" },
];

/**
 * AstralDrawer
 * ------------
 * Right-side slide-in drawer hosting Planit's AI hangout concierge ("Astral").
 *
 * Astral's job: turn an open time window + a location into 3 concrete,
 * decision-ready hangout suggestions. Each card surfaces a "buzz" quote —
 * the gist of public sentiment — front and center, plus Astral's own dry,
 * mature take and one-tap actions ("draft invite", "verify on google").
 *
 * Buzz transparency:
 *   We do NOT fabricate quotes attributed to specific publications. The buzz
 *   line is intentionally a synthesis of common reviewer sentiment, and every
 *   card carries Verify-on-Google / Open-Maps buttons so the user can
 *   sanity-check anything before committing. UI labels reinforce this.
 *
 * Props:
 *   open           — whether the drawer is visible
 *   onClose        — callback to close
 *   group          — the full group document
 *   onGroupUpdate  — (g) => void; called after location is changed
 *   memberId       — the local user's member id (for per-user location override)
 *   suggestedWindow — optional: pre-fill the window blurb (e.g. when the user
 *                     opens Astral from a "best overlap" suggestion)
 */
export default function AstralDrawer({
  open,
  onClose,
  group,
  onGroupUpdate,
  memberId,
  suggestedWindow,
}) {
  const [windowBlurb, setWindowBlurb] = useState(suggestedWindow || "");
  const [locationOverride, setLocationOverride] = useState("");
  const [historyBlurb, setHistoryBlurb] = useState("");
  const [advanced, setAdvanced] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { intro, cards, used_location }
  const [errMsg, setErrMsg] = useState(null);

  const [drafting, setDrafting] = useState(null); // card.id while drafting
  const [drafts, setDrafts] = useState({}); // { cardId: messageString }

  // Remix mode — what's been shown (so Astral doesn't repeat venues), the
  // selected chip presets, and the optional free-text remix hint.
  const [shownCards, setShownCards] = useState([]);   // accumulated cards Astral has produced this session
  const [remixPresets, setRemixPresets] = useState([]); // ["cheaper", "different_neighborhood", ...]
  const [remixHint, setRemixHint] = useState("");
  const [remixing, setRemixing] = useState(false);

  // Lock-in flow — Phase 4 commitment ladder.
  const [lockInCard, setLockInCard] = useState(null);

  // Editable group base location.
  const [editingBaseLoc, setEditingBaseLoc] = useState(false);
  const [baseLocDraft, setBaseLocDraft] = useState("");
  const [savingBaseLoc, setSavingBaseLoc] = useState(false);

  // Editable per-user location override.
  const me = (group?.members || []).find((m) => m.id === memberId);
  const [editingMyLoc, setEditingMyLoc] = useState(false);
  const [myLocDraft, setMyLocDraft] = useState("");
  const [savingMyLoc, setSavingMyLoc] = useState(false);

  // Quirky loading copy that cycles while Gemini is thinking — Astral voice.
  const LOADING_LINES = useMemo(() => [
    "checking what's actually open tonight…",
    "filtering out the spots that died last year…",
    "reading reviews so you don't have to…",
    "ranking by vibes per dollar…",
    "considering who's flaky…",
    "cross-referencing with last weekend's bad decisions…",
  ], []);
  const [loadingIdx, setLoadingIdx] = useState(0);
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(
      () => setLoadingIdx((i) => (i + 1) % LOADING_LINES.length),
      2200
    );
    return () => clearInterval(t);
  }, [loading, LOADING_LINES.length]);

  // Reset transient state when re-opening.
  const lastOpenRef = useRef(false);
  useEffect(() => {
    if (open && !lastOpenRef.current) {
      setResult(null);
      setErrMsg(null);
      setDrafts({});
      setShownCards([]);
      setRemixPresets([]);
      setRemixHint("");
      if (suggestedWindow) setWindowBlurb(suggestedWindow);
    }
    lastOpenRef.current = open;
  }, [open, suggestedWindow]);

  if (!open) return null;

  const groupLocation = group?.location || "";
  const myLocation = me?.location || "";

  const onAsk = async (e) => {
    e?.preventDefault?.();
    if (!windowBlurb.trim()) {
      toast.error("tell astral when you're free first");
      return;
    }
    setLoading(true);
    setErrMsg(null);
    setResult(null);
    try {
      const out = await astralSuggest(group.code, {
        window_blurb: windowBlurb.trim(),
        location_override:
          (locationOverride || myLocation || "").trim() || null,
        history_blurb: (historyBlurb || "").trim() || null,
      });
      if (!out.cards || out.cards.length === 0) {
        setErrMsg(
          "astral came up empty. try a tighter window or add a location."
        );
      }
      setResult(out);
      // Reset accumulated history on a fresh ask — start a new "round".
      setShownCards(out.cards || []);
      setRemixPresets([]);
      setRemixHint("");
    } catch (err) {
      console.error(err);
      setErrMsg(
        "couldn't reach astral. check your connection or try again in a sec."
      );
    } finally {
      setLoading(false);
    }
  };

  // Remix — re-ask Astral with the prior cards and a chip/free-form
  // redirection. Astral switches into remix mode server-side and won't
  // repeat any venue we've shown so far this session.
  const onRemix = async (e) => {
    e?.preventDefault?.();
    if (!windowBlurb.trim()) {
      toast.error("tell astral when you're free first");
      return;
    }
    if (remixPresets.length === 0 && !remixHint.trim()) {
      toast.error("pick a remix vibe (or type a hint)");
      return;
    }
    setRemixing(true);
    setErrMsg(null);
    try {
      const out = await astralSuggest(group.code, {
        window_blurb: windowBlurb.trim(),
        location_override:
          (locationOverride || myLocation || "").trim() || null,
        history_blurb: (historyBlurb || "").trim() || null,
        previous_cards: shownCards,
        remix_presets: remixPresets,
        remix_hint: remixHint.trim() || null,
      });
      if (!out.cards || out.cards.length === 0) {
        setErrMsg("astral couldn't remix that one. tweak the hint and try again.");
      }
      setResult(out);
      // Append to shown so a follow-up remix won't repeat these either.
      setShownCards((prev) => [...prev, ...(out.cards || [])]);
      // Clear the hint so the chips are ready for a new round; keep presets
      // selected so a quick "remix again" honors the same vibe by default.
      setRemixHint("");
    } catch (err) {
      console.error(err);
      setErrMsg("couldn't remix. try again in a sec.");
    } finally {
      setRemixing(false);
    }
  };

  const togglePreset = (key) =>
    setRemixPresets((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  const onDraft = async (card) => {
    setDrafting(card.id);
    try {
      const { message } = await astralDraftInvite(
        group.code,
        card,
        windowBlurb.trim()
      );
      setDrafts((d) => ({ ...d, [card.id]: message }));
      const ok = await copyToClipboard(message);
      toast[ok ? "success" : "error"](
        ok ? "invite copied — paste anywhere" : "drafted, but copy failed"
      );
    } catch (err) {
      toast.error("astral fumbled the draft. try again?");
    } finally {
      setDrafting(null);
    }
  };

  const saveBaseLocation = async () => {
    setSavingBaseLoc(true);
    try {
      const g = await updateGroup(group.code, {
        location: baseLocDraft.trim() || "",
      });
      onGroupUpdate?.(g);
      setEditingBaseLoc(false);
      toast.success("group base updated");
    } catch (err) {
      toast.error("couldn't save location");
    } finally {
      setSavingBaseLoc(false);
    }
  };

  const saveMyLocation = async () => {
    if (!memberId) return;
    setSavingMyLoc(true);
    try {
      await updateMember(group.code, memberId, {
        location: myLocDraft.trim() || "",
      });
      onGroupUpdate?.({
        ...group,
        members: group.members.map((m) =>
          m.id === memberId
            ? { ...m, location: myLocDraft.trim() || null }
            : m
        ),
      });
      setEditingMyLoc(false);
      toast.success("your location updated");
    } catch (err) {
      toast.error("couldn't save your location");
    } finally {
      setSavingMyLoc(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex"
      data-testid="astral-drawer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm pointer-events-none" />

      {/* Panel */}
      <div
        className="relative ml-auto w-full sm:max-w-[520px] md:max-w-[600px] h-full overflow-y-auto astral-panel"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 astral-header px-5 py-4 border-b-2 border-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="astral-avatar w-11 h-11 rounded-2xl border-2 border-slate-900 grid place-items-center shrink-0">
              <Sparkles className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-heading font-black text-xl leading-tight">
                Astral
              </div>
              <div className="label-caps text-[0.62rem] opacity-80">
                hangout concierge · ai
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full border-2 border-slate-900 grid place-items-center hover:bg-[var(--pastel-yellow)] transition"
            aria-label="Close Astral"
            data-testid="astral-close-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Astral intro */}
          <div className="astral-quote-block">
            <p className="font-heading text-lg leading-snug">
              <span className="lowercase">
                give me a window and a vibe — i'll find the spot, dish out the
                buzz, and write the group-chat pitch.
              </span>
            </p>
            <p className="text-sm mt-2 opacity-80 lowercase">
              i suggest bars, dives, late-night food, shows. the group's grown.
              if a place doesn't have buzz behind it, i won't pretend.
            </p>
          </div>

          {/* Location strip */}
          <div className="grid grid-cols-1 gap-3">
            <LocationRow
              label="group base"
              value={groupLocation}
              editing={editingBaseLoc}
              draft={baseLocDraft}
              setDraft={setBaseLocDraft}
              setEditing={(v) => {
                setBaseLocDraft(groupLocation);
                setEditingBaseLoc(v);
              }}
              onSave={saveBaseLocation}
              saving={savingBaseLoc}
              placeholder="e.g. Brooklyn, NY"
              testid="astral-base-location"
              tone="mint"
            />
            {memberId && (
              <LocationRow
                label="your override"
                value={myLocation}
                editing={editingMyLoc}
                draft={myLocDraft}
                setDraft={setMyLocDraft}
                setEditing={(v) => {
                  setMyLocDraft(myLocation);
                  setEditingMyLoc(v);
                }}
                onSave={saveMyLocation}
                saving={savingMyLoc}
                placeholder="e.g. Bushwick, NY"
                testid="astral-my-location"
                tone="lavender"
              />
            )}
          </div>

          {/* Ask form */}
          <form onSubmit={onAsk} className="neo-card p-4 space-y-3" data-testid="astral-ask-form">
            <label className="label-caps text-[0.65rem] flex items-center gap-2">
              <Compass className="w-3.5 h-3.5" /> when are y'all free?
            </label>
            <input
              className="neo-input w-full"
              placeholder="e.g. Saturday 7-11pm"
              value={windowBlurb}
              onChange={(e) => setWindowBlurb(e.target.value)}
              data-testid="astral-window-input"
              autoFocus
            />

            <button
              type="button"
              className="text-xs font-bold uppercase tracking-wider opacity-70 hover:opacity-100 flex items-center gap-1 transition"
              onClick={() => setAdvanced((v) => !v)}
            >
              <ChevronDown
                className={`w-3 h-3 transition-transform ${advanced ? "rotate-180" : ""}`}
              />
              advanced
            </button>

            {advanced && (
              <div className="space-y-3 pt-1">
                <div>
                  <label className="label-caps text-[0.62rem] mb-1 block">
                    location for THIS plan (optional)
                  </label>
                  <input
                    className="neo-input w-full"
                    placeholder={`overrides base (${groupLocation || "no base set"})`}
                    value={locationOverride}
                    onChange={(e) => setLocationOverride(e.target.value)}
                    data-testid="astral-loc-override-input"
                  />
                </div>
                <div>
                  <label className="label-caps text-[0.62rem] mb-1 block">
                    inside-joke / context (optional)
                  </label>
                  <input
                    className="neo-input w-full"
                    placeholder="e.g. last time we tried tuesday and 2 of us flaked"
                    value={historyBlurb}
                    onChange={(e) => setHistoryBlurb(e.target.value)}
                    data-testid="astral-history-input"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="neo-btn w-full flex items-center justify-center gap-2"
              disabled={loading}
              data-testid="astral-submit-btn"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  thinking…
                </>
              ) : (
                <>
                  ask astral
                  <Send className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Loading */}
          {loading && (
            <div className="text-center text-sm opacity-80 lowercase italic" data-testid="astral-loading-line">
              {LOADING_LINES[loadingIdx]}
            </div>
          )}

          {/* Error */}
          {errMsg && !loading && (
            <div className="neo-card p-4 bg-[var(--pastel-peach)] flex items-start gap-3" data-testid="astral-error">
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
              <div className="text-sm lowercase">{errMsg}</div>
            </div>
          )}

          {/* Results */}
          {result && !loading && (
            <div className="space-y-4" data-testid="astral-results">
              {result.intro && (
                <p className="font-heading text-base lowercase italic opacity-90 px-1">
                  {result.intro}
                </p>
              )}
              {result.used_location && (
                <div className="text-[0.65rem] uppercase tracking-wider opacity-60 flex items-center gap-1.5 px-1">
                  <MapPin className="w-3 h-3" />
                  grounded in: {result.used_location}
                </div>
              )}
              {result.cards.map((card, idx) => (
                <SuggestionCard
                  key={card.id}
                  card={card}
                  idx={idx}
                  drafting={drafting === card.id}
                  draft={drafts[card.id]}
                  onDraft={() => onDraft(card)}
                  onLockIn={() => setLockInCard(card)}
                />
              ))}

              {/* Remix block — chat-style follow-ups. Lets the group redirect
                  Astral without re-typing the whole window. Pick chips, add
                  optional free-text hint, hit Remix → Astral re-runs with
                  "do not repeat any of these venues" + the new vibe. */}
              {result.cards.length > 0 && (
                <div
                  className="rounded-2xl border-2 border-slate-900 bg-[var(--pastel-lavender)] p-4 space-y-3"
                  data-testid="astral-remix"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Shuffle className="w-4 h-4" />
                      <div className="font-heading font-black text-sm">
                        Not feeling these? Remix.
                      </div>
                    </div>
                    {shownCards.length > 3 && (
                      <span className="text-[0.6rem] uppercase tracking-wider font-bold opacity-70">
                        round {Math.ceil(shownCards.length / 3)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5" data-testid="remix-chips">
                    {REMIX_CHIPS.map((c) => {
                      const active = remixPresets.includes(c.key);
                      return (
                        <button
                          key={c.key}
                          type="button"
                          onClick={() => togglePreset(c.key)}
                          data-testid={`remix-chip-${c.key}`}
                          className={`text-[0.65rem] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border-2 border-slate-900 transition ${
                            active
                              ? "bg-slate-900 text-white"
                              : "bg-white hover:bg-[var(--pastel-mint)]"
                          }`}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>

                  <input
                    type="text"
                    className="neo-input w-full text-sm"
                    placeholder="or type a vibe — 'we want tacos' / 'somewhere quiet' / 'no bars'"
                    value={remixHint}
                    onChange={(e) => setRemixHint(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !remixing) onRemix(e);
                    }}
                    data-testid="remix-hint-input"
                  />

                  <button
                    type="button"
                    onClick={onRemix}
                    disabled={remixing || (remixPresets.length === 0 && !remixHint.trim())}
                    className="neo-btn w-full flex items-center justify-center gap-2 text-sm"
                    data-testid="remix-submit-btn"
                  >
                    {remixing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> remixing…
                      </>
                    ) : (
                      <>
                        <Shuffle className="w-4 h-4" /> remix it
                      </>
                    )}
                  </button>
                </div>
              )}

              {result.cards.length > 0 && (
                <p className="text-[0.7rem] text-center opacity-60 lowercase pt-2">
                  buzz reflects common reviewer sentiment. always verify on
                  google before locking in.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lock-in modal — Phase 4 commitment ladder */}
      <LockInModal
        open={!!lockInCard}
        onClose={() => setLockInCard(null)}
        group={group}
        memberId={memberId}
        suggestion={lockInCard}
        defaultWindow={windowBlurb}
        onCreated={() => {
          // Tell the parent a hangout was created so it can refresh.
          onGroupUpdate?.({ ...group, _hangoutsBumped: Date.now() });
        }}
      />
    </div>
  );
}

// ---------- Inline subcomponents ----------

function LocationRow({
  label, value, editing, draft, setDraft, setEditing,
  onSave, saving, placeholder, testid, tone,
}) {
  const bg =
    tone === "mint"
      ? "var(--pastel-mint)"
      : tone === "lavender"
      ? "var(--pastel-lavender)"
      : "var(--card-soft)";
  return (
    <div
      className="rounded-xl border-2 border-slate-900 px-3 py-2.5 flex items-center gap-3"
      style={{ background: bg }}
      data-testid={testid}
    >
      <MapPin className="w-4 h-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="label-caps text-[0.6rem]">{label}</div>
        {editing ? (
          <input
            className="bg-transparent w-full font-bold text-sm focus:outline-none"
            placeholder={placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <div className="font-bold text-sm truncate">
            {value || (
              <span className="opacity-50 italic font-normal">not set</span>
            )}
          </div>
        )}
      </div>
      {editing ? (
        <>
          <button
            type="button"
            className="text-xs font-bold uppercase px-2 py-1 rounded-md border-2 border-slate-900 bg-white hover:bg-[var(--pastel-yellow)]"
            onClick={onSave}
            disabled={saving}
          >
            {saving ? "…" : "save"}
          </button>
          <button
            type="button"
            className="text-xs font-bold uppercase px-2 py-1 rounded-md border-2 border-slate-900 bg-white"
            onClick={() => setEditing(false)}
          >
            cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          className="text-xs font-bold uppercase px-2 py-1 rounded-md border-2 border-slate-900 bg-white hover:bg-[var(--pastel-yellow)]"
          onClick={() => setEditing(true)}
        >
          {value ? "edit" : "set"}
        </button>
      )}
    </div>
  );
}

function SuggestionCard({ card, idx, drafting, draft, onDraft, onLockIn }) {
  const tone = card.buzz?.tone || "mixed";
  const toneColor = {
    love: "#22c55e",
    hype: "#f59e0b",
    "cult-favorite": "#a855f7",
    underrated: "#06b6d4",
    controversial: "#ef4444",
    mixed: "#94a3b8",
  }[tone] || "#94a3b8";

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

function formatCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}
