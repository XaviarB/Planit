// IdentityPill — small header pill that shows the user's current mock
// identity (guest vs signed-in) and exposes a popover menu for sign-out
// or "activate clearance". Listens to identity changes so it updates
// instantly across the app without prop drilling.
import { useEffect, useRef, useState } from "react";
import {
  Rocket,
  UserRound,
  ShieldCheck,
  LogOut,
  ChevronDown,
  Lock,
} from "lucide-react";
import {
  getIdentity,
  subscribeIdentity,
  clearIdentity,
  requestOpenAuthModal,
} from "../lib/identity";

export default function IdentityPill({ className = "" }) {
  const [identity, setLocalIdentity] = useState(() => getIdentity());
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // Live updates whenever someone calls setIdentity/clearIdentity (in
  // this tab or any other tab via the `storage` event).
  useEffect(() => subscribeIdentity(setLocalIdentity), []);

  // Close popover on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const signedIn = identity?.kind === "signed_in";
  const isGuest = identity?.kind === "guest";
  // If no identity at all (never prompted yet), don't render the pill —
  // we don't want a "Guest" label appearing on the very first landing
  // visit before the user has done anything.
  if (!signedIn && !isGuest) return null;

  const label = signedIn
    ? identity?.email || "Signed in"
    : identity?.name
    ? `Guest · ${identity.name}`
    : "Guest";

  const pillBg = signedIn ? "var(--pastel-lavender, #ddd6fe)" : "#ffffff";
  const Icon = signedIn ? Rocket : UserRound;

  return (
    <div
      ref={rootRef}
      className={`relative ${className}`}
      data-testid="identity-pill-root"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 max-w-[200px] sm:max-w-[260px] px-3 py-1.5 rounded-full border-2 border-slate-900 text-xs font-heading font-black shadow-[2px_2px_0_0_rgba(15,23,42,1)] hover:translate-y-[-1px] transition"
        style={{ background: pillBg }}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="identity-pill"
      >
        <Icon className="w-3.5 h-3.5 flex-none" strokeWidth={2.5} />
        <span className="truncate">{label}</span>
        <ChevronDown
          className={`w-3 h-3 flex-none transition-transform ${
            open ? "rotate-180" : ""
          }`}
          strokeWidth={2.5}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-60 neo-card p-2 bg-white z-50"
          style={{ borderWidth: "var(--stroke-width)" }}
          data-testid="identity-pill-menu"
        >
          <div className="px-3 py-2">
            <div className="label-caps mb-0.5">
              {signedIn ? "signed in as" : "currently"}
            </div>
            <div className="font-heading font-black text-sm truncate">
              {signedIn ? identity?.email : "Guest"}
            </div>
            {signedIn && identity?.name && (
              <div
                className="text-[11px] mt-0.5"
                style={{ color: "var(--ink-soft)" }}
              >
                {identity.name}
              </div>
            )}
          </div>

          <div className="h-px my-1" style={{ background: "var(--ink-mute)" }} />

          {signedIn ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                clearIdentity();
              }}
              className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100 transition"
              data-testid="identity-pill-signout"
            >
              <LogOut className="w-4 h-4" strokeWidth={2.5} />
              <span className="font-heading font-black text-sm">Sign out</span>
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                requestOpenAuthModal();
              }}
              className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100 transition"
              data-testid="identity-pill-activate"
            >
              <ShieldCheck className="w-4 h-4" strokeWidth={2.5} />
              <span className="font-heading font-black text-sm">
                Activate Clearance
              </span>
            </button>
          )}

          {!signedIn && (
            <div
              className="px-3 py-2 mt-1 flex items-start gap-2 rounded-xl"
              style={{ background: "var(--pastel-mint)" }}
            >
              <Lock className="w-3.5 h-3.5 mt-0.5" strokeWidth={2.5} />
              <span
                className="text-[11px] leading-snug"
                style={{ color: "var(--ink-soft)" }}
              >
                Some features (like Customize) need clearance.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
