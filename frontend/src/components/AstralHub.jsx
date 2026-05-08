import { useEffect, useRef, useState } from "react";
import {
  Sparkles, X, Send, Shuffle, Clock, History, Wand2,
  ArrowRight, ArrowLeft, Loader2, RotateCw, Maximize2,
} from "lucide-react";
import { toast } from "sonner";
import AstralDrawer from "./AstralDrawer";
import MyToolsDrawer from "./MyToolsDrawer";
import AstralBot from "./AstralBot";
import SuggestionCard from "./SuggestionCard";
import { LockInModal } from "./Hangouts";
import { astralSuggest, astralDraftInvite } from "../lib/api";
import { copyToClipboard } from "../lib/clipboard";

/**
 * AstralHub — a sleek single-block menu for Planit's hangout concierge.
 *
 *   1. MENU mode (default)
 *      - Cute robot avatar + "what's the vibe?" input
 *      - Tile grid: remix · busy · history · toolkit
 *      - Keyboard hint: ⌘K / /
 *
 *   2. LOADING mode
 *      - Robot peeking + rotating quirky lowercase quotes
 *
 *   3. RESULTS mode
 *      - 3 compact SuggestionCards rendered IN the same block (no drawer)
 *      - Bottom bar: ← back · ↻ ask again · ⤢ open in drawer
 *      - Each card has full action buttons (maps, verify, draft, lock-in)
 *
 *   Heavier flows (remix, history, toolkit) still escalate to the existing
 *   drawers — but now the ask-and-see-results loop is fully self-contained
 *   inside the hub block.
 */
export default function AstralHub({
  open,
  onClose,
  anchor,
  group,
  memberId,
  code,
  onGroupRefresh,
}) {
  const [mode, setMode] = useState("menu"); // "menu" | "loading" | "results"
  const [windowBlurb, setWindowBlurb] = useState("");
  const [result, setResult] = useState(null);
  const [errMsg, setErrMsg] = useState(null);
  const [drafting, setDrafting] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [lockInCard, setLockInCard] = useState(null);

  const [astralOpen, setAstralOpen] = useState(false);
  const [astralIntent, setAstralIntent] = useState(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsIntent, setToolsIntent] = useState(null);

  const inputRef = useRef(null);
  const blockRef = useRef(null);

  // Reset when closed.
  useEffect(() => {
    if (!open) {
      setAstralIntent(null);
      setToolsIntent(null);
    } else if (mode === "menu") {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open, mode]);

  // Outside-click closes the hub (but not while drawers are open).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (blockRef.current?.contains(e.target)) return;
      if (astralOpen || toolsOpen) return;
      const fab = document.querySelector('[data-testid="fab-toggle"]');
      if (fab && fab.contains(e.target)) return;
      onClose && onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open, onClose, astralOpen, toolsOpen]);

  // ESC closes the hub.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !astralOpen && !toolsOpen) {
        if (mode !== "menu") {
          // ESC steps back from results → menu first
          setMode("menu");
          setResult(null);
          setErrMsg(null);
        } else {
          onClose && onClose();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, astralOpen, toolsOpen, mode]);

  // ── Anchor positioning. Wider in results mode for legibility. ──
  const blockStyle = (() => {
    const a = anchor || { side: "right", offset: 0.5 };
    const PAD = 16;
    const ORB = 64;
    const W = mode === "results" ? 460 : 360;
    const H = mode === "results" ? 560 : 380;
    if (typeof window === "undefined") {
      return { right: ORB + PAD, top: "50%", transform: "translateY(-50%)" };
    }
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    if (winW < 640) {
      return {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: `min(${W}px, calc(100vw - 24px))`,
        maxHeight: "calc(100vh - 32px)",
      };
    }
    if (a.side === "right") {
      const top = clamp(a.offset * winH - H / 2, PAD, winH - H - PAD);
      return { right: ORB + PAD, top, width: W, maxHeight: `calc(100vh - ${PAD * 2}px)` };
    }
    if (a.side === "left") {
      const top = clamp(a.offset * winH - H / 2, PAD, winH - H - PAD);
      return { left: ORB + PAD, top, width: W, maxHeight: `calc(100vh - ${PAD * 2}px)` };
    }
    if (a.side === "top") {
      const left = clamp(a.offset * winW - W / 2, PAD, winW - W - PAD);
      return { top: ORB + PAD, left, width: W, maxHeight: `calc(100vh - ${PAD * 2}px)` };
    }
    const left = clamp(a.offset * winW - W / 2, PAD, winW - W - PAD);
    return { bottom: ORB + PAD, left, width: W, maxHeight: `calc(100vh - ${PAD * 2}px)` };
  })();

  if (!open && !astralOpen && !toolsOpen) return null;

  // ── ASK — fetch suggestions inline. ──
  const submitAsk = async () => {
    if (!windowBlurb.trim() || !group?.code) return;
    setMode("loading");
    setErrMsg(null);
    setResult(null);
    setDrafts({});
    try {
      const data = await astralSuggest(group.code, {
        window_blurb: windowBlurb.trim(),
        max_options: 3,
        creativity: 0.7,
        // Hub doesn't expose history-blurb / overrides — drawer is for that.
      });
      setResult({
        intro: data?.intro || "",
        cards: data?.suggestions || data?.cards || [],
        used_location: data?.used_location || null,
        was_remix: !!data?.was_remix,
        round_id: data?.round_id || null,
      });
      setMode("results");
    } catch (err) {
      console.error(err);
      setErrMsg(
        err?.response?.data?.detail ||
          "astral got cosmic interference. try again or open the full drawer."
      );
      setMode("menu");
    }
  };

  const onDraft = async (card) => {
    setDrafting(card.id);
    try {
      const { message } = await astralDraftInvite(group.code, card, windowBlurb.trim());
      setDrafts((d) => ({ ...d, [card.id]: message }));
      const ok = await copyToClipboard(message);
      toast[ok ? "success" : "error"](
        ok ? "invite copied — paste anywhere" : "drafted, but copy failed"
      );
    } catch (err) {
      console.error(err);
      toast.error("astral fumbled the draft. try again?");
    } finally {
      setDrafting(null);
    }
  };

  const tile = ({ icon: Icon, title, hint, onClick, accent, testId }) => (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="hub-tile group/tile relative overflow-hidden text-left rounded-2xl border-2 border-slate-900 px-3 py-3 transition transform hover:-translate-y-0.5 active:translate-y-0"
      style={{
        background: accent || "var(--card)",
        boxShadow: "3px 3px 0 0 var(--ink)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-full grid place-items-center border-2 border-slate-900 shrink-0"
          style={{ background: "var(--card)" }}
        >
          <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
        </span>
        <span className="font-heading font-black text-sm leading-none">{title}</span>
      </div>
      <div
        className="text-[11px] mt-1.5 leading-snug"
        style={{ color: "var(--ink-soft)" }}
      >
        {hint}
      </div>
    </button>
  );

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <>
      {/* Mobile-only backdrop. Desktop hub is anchored beside the orb. */}
      {open && (
        <div
          className="fixed inset-0 z-[55] sm:bg-transparent bg-slate-900/40"
          aria-hidden="true"
          onClick={onClose}
        />
      )}

      {open && (
        <div
          ref={blockRef}
          className="fixed z-[60] hub-block flex flex-col"
          style={blockStyle}
          data-testid="astral-hub"
          data-mode={mode}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="rounded-3xl border-2 border-slate-900 overflow-hidden flex flex-col flex-1 min-h-0"
            style={{
              background:
                "linear-gradient(160deg, var(--card) 0%, var(--card-soft) 100%)",
              boxShadow: "6px 6px 0 0 var(--ink)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b-2 border-slate-900 shrink-0"
              style={{
                background:
                  "linear-gradient(100deg, var(--pastel-lavender) 0%, var(--pastel-mint) 100%)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-9 h-9 rounded-2xl grid place-items-center border-2 border-slate-900 shrink-0"
                  style={{ background: "var(--card)" }}
                >
                  <AstralBot size={26} waving />
                </span>
                <div className="flex flex-col leading-none">
                  <span className="font-heading font-black text-base lowercase tracking-tight">
                    astral
                  </span>
                  <span
                    className="hidden sm:inline text-[10px] uppercase tracking-wider font-bold mt-0.5"
                    style={{ color: "var(--ink-mute)" }}
                  >
                    hangout concierge
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-full border-2 border-slate-900 grid place-items-center bg-white hover:bg-[var(--pastel-yellow)] transition"
                aria-label="Close"
                data-testid="hub-close"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2.5} />
              </button>
            </div>

            {/* Body — switches by mode */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {mode === "menu" && (
                <MenuBody
                  inputRef={inputRef}
                  windowBlurb={windowBlurb}
                  setWindowBlurb={setWindowBlurb}
                  submitAsk={submitAsk}
                  errMsg={errMsg}
                  isMac={isMac}
                  tile={tile}
                  openDrawer={(intent) => {
                    setAstralIntent(intent);
                    setAstralOpen(true);
                    onClose && onClose();
                  }}
                  openTools={(intent) => {
                    setToolsIntent(intent);
                    setToolsOpen(true);
                    onClose && onClose();
                  }}
                />
              )}

              {mode === "loading" && <LoadingBody />}

              {mode === "results" && result && (
                <ResultsBody
                  windowBlurb={windowBlurb}
                  result={result}
                  drafts={drafts}
                  drafting={drafting}
                  onDraft={onDraft}
                  onLockIn={(c) => setLockInCard(c)}
                  onBack={() => {
                    setMode("menu");
                    setResult(null);
                    setErrMsg(null);
                  }}
                  onAskAgain={() => {
                    setMode("menu");
                    setResult(null);
                    setTimeout(() => inputRef.current?.focus(), 50);
                  }}
                  openInDrawer={() => {
                    setAstralIntent("remix");
                    setAstralOpen(true);
                    onClose && onClose();
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Heavy-lift drawers — full feature surfaces. */}
      <AstralDrawer
        open={astralOpen}
        onClose={() => {
          setAstralOpen(false);
          setAstralIntent(null);
        }}
        group={group}
        memberId={memberId}
        suggestedWindow={astralIntent === "suggest" ? windowBlurb : ""}
        autoSubmit={astralIntent === "suggest"}
        focusSection={
          astralIntent === "history"
            ? "history"
            : astralIntent === "remix"
            ? "remix"
            : null
        }
        onGroupUpdate={(g) => {
          if (!onGroupRefresh) return;
          onGroupRefresh((prev) => ({ ...(prev || {}), ...(g || {}) }));
        }}
      />
      <MyToolsDrawer
        open={toolsOpen}
        onClose={() => {
          setToolsOpen(false);
          setToolsIntent(null);
        }}
        group={group}
        memberId={memberId}
        focusSection={toolsIntent}
        onMemberUpdate={() => onGroupRefresh && onGroupRefresh((p) => p)}
      />

      {/* Lock-in modal */}
      <LockInModal
        open={!!lockInCard}
        onClose={() => setLockInCard(null)}
        group={group}
        memberId={memberId}
        suggestion={lockInCard}
        defaultWindow={windowBlurb}
      />
    </>
  );
}

// ── Subviews ──────────────────────────────────────────────────────────────

function MenuBody({
  inputRef, windowBlurb, setWindowBlurb, submitAsk, errMsg,
  isMac, tile, openDrawer, openTools,
}) {
  return (
    <div className="px-4 pt-4 pb-4 space-y-4">
      {/* Primary ask input */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label
            className="label-caps text-[10px]"
            style={{ color: "var(--ink-mute)" }}
          >
            what's the vibe?
          </label>
          <span
            className="hub-kbd"
            title="Toggle Astral Hub"
          >
            {isMac ? "⌘" : "Ctrl"}K
          </span>
        </div>
        <div className="flex items-stretch gap-2">
          <input
            ref={inputRef}
            type="text"
            value={windowBlurb}
            onChange={(e) => setWindowBlurb(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && windowBlurb.trim()) submitAsk();
            }}
            placeholder="sat night 7-11pm…"
            className="neo-input flex-1 text-sm"
            data-testid="hub-window-input"
          />
          <button
            type="button"
            onClick={submitAsk}
            disabled={!windowBlurb.trim()}
            className="neo-btn pastel flex items-center gap-1.5 px-3 text-sm font-heading font-extrabold disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="hub-ask-btn"
            title="Ask Astral"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">ask</span>
          </button>
        </div>
        <div
          className="text-[10px] mt-1.5 leading-snug"
          style={{ color: "var(--ink-mute)" }}
        >
          free-form — astral handles "tonight", "this fri after 8", etc.
        </div>
        {errMsg && (
          <div className="mt-2 text-[11px] px-2 py-1.5 rounded-lg border-2 border-slate-900 bg-[var(--pastel-peach)] font-medium">
            {errMsg}
          </div>
        )}
      </div>

      {/* Tile grid */}
      <div className="grid grid-cols-2 gap-2">
        {tile({
          icon: Shuffle,
          title: "remix",
          hint: "redirect picks: cheaper, fancier, diff. vibe…",
          accent: "var(--pastel-lavender)",
          testId: "hub-tile-remix",
          onClick: () => openDrawer("remix"),
        })}
        {tile({
          icon: Clock,
          title: "i'm busy…",
          hint: "natural-language → busy slots auto-merged",
          accent: "var(--pastel-peach)",
          testId: "hub-tile-busy",
          onClick: () => openTools("busy"),
        })}
        {tile({
          icon: History,
          title: "history",
          hint: "every round astral picked for the crew",
          accent: "var(--pastel-mint)",
          testId: "hub-tile-history",
          onClick: () => openDrawer("history"),
        })}
        {tile({
          icon: Wand2,
          title: "toolkit",
          hint: "location, calendar sync, group prefs",
          accent: "var(--pastel-yellow)",
          testId: "hub-tile-tools",
          onClick: () => openTools(null),
        })}
      </div>

      {/* Footer hint */}
      <div
        className="flex items-center justify-center gap-1 text-[10px] font-medium"
        style={{ color: "var(--ink-mute)" }}
      >
        <span>powered by gemini 2.5 pro</span>
        <ArrowRight className="w-2.5 h-2.5" />
        <span>real venues only</span>
      </div>
    </div>
  );
}

function LoadingBody() {
  // Quirky lowercase loader copy that rotates — keeps the wait feeling alive.
  const QUOTES = [
    "scanning the city's pulse…",
    "asking the locals…",
    "checking which spots are actually open…",
    "filtering out the tourist traps…",
    "reading the room…",
    "matching your vibe…",
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => (x + 1) % QUOTES.length), 1400);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="px-4 py-10 flex flex-col items-center text-center gap-3">
      <div
        className="w-16 h-16 rounded-full grid place-items-center border-2 border-slate-900"
        style={{
          background:
            "linear-gradient(135deg, var(--pastel-mint) 0%, var(--pastel-lavender) 50%, var(--pastel-yellow) 100%)",
          boxShadow: "3px 3px 0 0 var(--ink)",
        }}
      >
        <AstralBot size={42} waving />
      </div>
      <div className="font-heading font-black text-base lowercase">
        astral is plotting…
      </div>
      <div
        className="text-xs lowercase italic max-w-[260px]"
        style={{ color: "var(--ink-mute)" }}
      >
        {QUOTES[i]}
      </div>
      <Loader2 className="w-4 h-4 animate-spin opacity-50" />
    </div>
  );
}

function ResultsBody({
  windowBlurb, result, drafts, drafting,
  onDraft, onLockIn, onBack, onAskAgain, openInDrawer,
}) {
  return (
    <div className="flex flex-col">
      {/* Top strip with the prompt that was asked */}
      <div className="px-4 pt-3 pb-2 border-b-2 border-slate-900/15 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="w-7 h-7 rounded-full border-2 border-slate-900 grid place-items-center bg-white hover:bg-[var(--pastel-yellow)] transition shrink-0"
          aria-label="Back to menu"
          data-testid="hub-results-back"
        >
          <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="label-caps text-[9px]" style={{ color: "var(--ink-mute)" }}>
            you asked
          </div>
          <div className="font-heading font-black text-sm leading-tight truncate lowercase">
            {windowBlurb || "(no window)"}
          </div>
        </div>
        {result.used_location && (
          <span
            className="text-[9px] uppercase tracking-wider font-extrabold px-2 py-1 rounded-full border-2 border-slate-900 bg-[var(--pastel-mint)] shrink-0 max-w-[120px] truncate"
            title={result.used_location}
          >
            {result.used_location.split(",")[0]}
          </span>
        )}
      </div>

      {/* Intro */}
      {result.intro && (
        <p className="px-4 pt-3 font-heading text-xs lowercase italic opacity-90">
          {result.intro}
        </p>
      )}

      {/* Cards */}
      <div className="px-4 py-3 space-y-3">
        {(result.cards || []).map((card, idx) => (
          <SuggestionCard
            key={card.id || idx}
            card={card}
            idx={idx}
            drafting={drafting === card.id}
            draft={drafts[card.id]}
            onDraft={() => onDraft(card)}
            onLockIn={() => onLockIn(card)}
            compact
          />
        ))}
        {(!result.cards || result.cards.length === 0) && (
          <div
            className="rounded-xl border-2 border-dashed border-slate-900 p-4 text-center text-xs lowercase"
            style={{ color: "var(--ink-mute)" }}
          >
            astral didn't surface anything. try a different vibe?
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="px-4 py-3 border-t-2 border-slate-900/15 grid grid-cols-2 gap-2 sticky bottom-0 bg-[var(--card)]">
        <button
          type="button"
          onClick={onAskAgain}
          className="neo-btn ghost flex items-center justify-center gap-1.5 text-xs"
          data-testid="hub-results-ask-again"
        >
          <RotateCw className="w-3.5 h-3.5" />
          ask again
        </button>
        <button
          type="button"
          onClick={openInDrawer}
          className="neo-btn pastel flex items-center justify-center gap-1.5 text-xs font-heading font-extrabold"
          data-testid="hub-results-remix"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          remix in drawer
        </button>
      </div>

      {/* Tiny note */}
      <p
        className="px-4 pb-3 text-[9px] text-center lowercase"
        style={{ color: "var(--ink-mute)" }}
      >
        buzz reflects common reviewer sentiment. always verify on google.
      </p>
    </div>
  );
}

// ── helpers ──
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Re-export for any external consumer that wants the spark icon shorthand.
export { Sparkles };
