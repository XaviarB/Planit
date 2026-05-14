// SaveAccountModal — secondary popup shown right after a user creates or
// joins their first group. Offers an optional email + password upgrade
// so future "personalised customisation" features can be gated to
// signed-in users. Auth is mocked into localStorage for now (see
// ../lib/identity.js). The dismiss action is deliberately labelled
// "Deny Clearance" per product copy.
import { useEffect, useRef, useState } from "react";
import {
  Sparkles, // eslint-disable-line no-unused-vars
  ArrowRight,
  X,
  ShieldCheck,
  CheckCircle2,
  Mail,
  KeyRound,
} from "lucide-react";
import {
  setIdentity,
  markPrompted,
} from "../lib/identity";

export default function SaveAccountModal({
  open,
  onClose,
  defaultName = "",
  groupName = "",
  groupCode = "",
}) {
  // step: "prompt" | "success"
  const [step, setStep] = useState("prompt");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const emailInputRef = useRef(null);

  // Reset state every time the modal re-opens — important because the
  // component stays mounted between sessions in a SPA.
  useEffect(() => {
    if (open) {
      setStep("prompt");
      setEmail("");
      setPassword("");
      setError("");
      setSubmitting(false);
      // Give the modal a tick to mount, then focus the email field for
      // pointer-free flows.
      const t = setTimeout(() => {
        emailInputRef.current?.focus();
      }, 60);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Keyboard escape closes (counts as "Deny Clearance").
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") handleDeny();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const validate = () => {
    const e = email.trim();
    if (!e) return "Enter your email.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return "That email doesn't look right.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    return "";
  };

  const handleSave = (ev) => {
    ev?.preventDefault?.();
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setSubmitting(true);
    setError("");
    // Mock auth — persist locally; replace with real backend call later.
    try {
      setIdentity({
        kind: "signed_in",
        email: email.trim().toLowerCase(),
        name: defaultName || null,
        ts: new Date().toISOString(),
      });
      markPrompted();
    } catch (_) {
      /* localStorage might be unavailable; surface nothing — the user can still continue. */
    }
    // Brief simulated latency so the success state doesn't feel jarring.
    setTimeout(() => {
      setSubmitting(false);
      setStep("success");
    }, 320);
  };

  const handleDeny = () => {
    // User chose to stay a guest — remember the choice so we don't pester
    // them every time they bounce between groups.
    try {
      setIdentity({
        kind: "guest",
        email: null,
        name: defaultName || null,
        ts: new Date().toISOString(),
      });
      markPrompted();
    } catch (_) {}
    onClose?.();
  };

  const handleFinish = () => {
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 grid place-items-center p-4 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-account-title"
      data-testid="save-account-modal"
    >
      <div
        className="absolute inset-0"
        onClick={handleDeny}
        style={{ background: "rgba(15,23,42,.45)", backdropFilter: "blur(2px)" }}
      />
      <div
        className="relative neo-card p-6 sm:p-7 w-full max-w-md bg-white max-h-[92vh] overflow-y-auto"
        style={{ borderWidth: "var(--stroke-width)" }}
      >
        <button
          type="button"
          onClick={handleDeny}
          className="absolute top-3 right-3 w-9 h-9 rounded-2xl border-2 border-slate-900 grid place-items-center bg-white shadow-[2px_2px_0_0_rgba(15,23,42,1)] hover:translate-y-[-1px] transition"
          aria-label="Close"
          data-testid="save-account-close-btn"
        >
          <X className="w-4 h-4" strokeWidth={2.5} />
        </button>

        {step === "prompt" && (
          <form onSubmit={handleSave}>
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-3xl border-2 border-slate-900 mb-3 shadow-[3px_3px_0_0_rgba(15,23,42,1)]"
              style={{ background: "var(--pastel-lavender, #ddd6fe)" }}
            >
              <ShieldCheck className="w-7 h-7 text-slate-900" strokeWidth={2.5} />
            </div>
            <div className="label-caps mb-1">security protocol</div>
            <h2
              id="save-account-title"
              className="font-heading font-black text-2xl sm:text-3xl leading-tight"
            >
              Activate Clearance
            </h2>
            <p className="text-sm mt-2" style={{ color: "var(--ink-soft)" }}>
              We've logged your orbit on this device. Lock in your clearance
              with an email + password to{" "}
              <strong>sync access across devices</strong> and unlock
              personalised mission settings (saved themes, custom hours,
              default location, and more).
            </p>

            <ul
              className="mt-4 grid grid-cols-1 gap-2 text-xs"
              style={{ color: "var(--ink-soft)" }}
            >
              <li className="flex items-start gap-2">
                <CheckCircle2
                  className="w-4 h-4 mt-0.5 flex-none"
                  strokeWidth={2.5}
                  style={{ color: "#10b981" }}
                />
                Clearance syncs across all your devices — no rejoining
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2
                  className="w-4 h-4 mt-0.5 flex-none"
                  strokeWidth={2.5}
                  style={{ color: "#10b981" }}
                />
                Mission defaults persist (themes, hours, timezone)
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2
                  className="w-4 h-4 mt-0.5 flex-none"
                  strokeWidth={2.5}
                  style={{ color: "#10b981" }}
                />
                Restricted features unlock — like Customize
              </li>
            </ul>

            <div className="space-y-3 mt-5">
              <div>
                <div className="label-caps mb-1 flex items-center gap-1">
                  <Mail className="w-3 h-3" strokeWidth={2.5} /> email
                </div>
                <input
                  ref={emailInputRef}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  autoComplete="email"
                  className="w-full neo-input"
                  data-testid="save-account-email-input"
                />
              </div>
              <div>
                <div className="label-caps mb-1 flex items-center gap-1">
                  <KeyRound className="w-3 h-3" strokeWidth={2.5} /> password
                </div>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  type="password"
                  autoComplete="new-password"
                  className="w-full neo-input"
                  data-testid="save-account-password-input"
                />
              </div>
            </div>

            {error && (
              <div
                className="mt-3 text-xs font-bold"
                style={{ color: "#dc2626" }}
                role="alert"
              >
                {error}
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="neo-btn w-full justify-center disabled:opacity-60"
                data-testid="save-account-save-btn"
              >
                {submitting ? "Authorizing…" : "Authorize Clearance"}{" "}
                <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={handleDeny}
                className="w-full text-xs font-heading font-black underline tracking-wide"
                style={{ color: "var(--ink-soft)" }}
                data-testid="save-account-deny-btn"
              >
                Deny Clearance
              </button>
            </div>

            <div
              className="text-[11px] mt-3 text-center"
              style={{ color: "var(--ink-mute)" }}
            >
              Mock auth — stored only on this device's localStorage.
            </div>
          </form>
        )}

        {step === "success" && (
          <>
            <div
              className="inline-flex items-center justify-center w-14 h-14 rounded-3xl border-2 border-slate-900 mb-3 shadow-[3px_3px_0_0_rgba(15,23,42,1)]"
              style={{ background: "var(--pastel-mint)" }}
            >
              <CheckCircle2 className="w-7 h-7 text-slate-900" strokeWidth={2.5} />
            </div>
            <div className="label-caps mb-1">clearance granted</div>
            <h2 className="font-heading font-black text-2xl sm:text-3xl leading-tight">
              Protocol Activated 🛰️
            </h2>
            <p className="text-sm mt-2" style={{ color: "var(--ink-soft)" }}>
              Your orbits and preferences will now follow you across devices.
              Manage your clearance from the pill in the header.
            </p>
            <div
              className="mt-4 px-3 py-2 rounded-2xl border-2 border-slate-900 text-xs font-heading font-black flex items-center gap-2"
              style={{ background: "var(--pastel-mint)" }}
              data-testid="save-account-signedin-pill"
            >
              <ShieldCheck className="w-4 h-4" strokeWidth={2.5} />
              Signed in · {email}
            </div>
            <button
              type="button"
              onClick={handleFinish}
              className="neo-btn w-full mt-5 justify-center"
              data-testid="save-account-finish-btn"
            >
              {groupName ? `Back to ${groupName}` : "Continue"}{" "}
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
            </button>
          </>
        )}

        {/* Tiny footer with the just-joined group code for context. */}
        {groupCode && (
          <div
            className="text-[10px] mt-3 text-center label-caps"
            style={{ color: "var(--ink-mute)" }}
          >
            group · {groupCode}
          </div>
        )}
      </div>
    </div>
  );
}
