// Preview-only scaffold: shows what the "Save your account" secondary
// popup looks like AFTER a user has just created or joined a group.
// Renders a faux group-dashboard backdrop (dimmed) with the upgrade
// modal on top. Will be removed once the user picks a direction.
// Routed at /preview/save-account.
import { useState } from "react";
import {
  Sparkles,
  ArrowRight,
  X,
  ShieldCheck,
  CheckCircle2,
  Mail,
  KeyRound,
} from "lucide-react";

export default function PreviewSaveAccount() {
  // state: "prompt" | "success"
  const [state, setState] = useState("prompt");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div
      className="min-h-screen grain relative overflow-hidden"
      style={{
        background:
          "radial-gradient(1200px 600px at 20% -10%, rgba(167,243,208,.5), transparent 60%), radial-gradient(900px 500px at 100% 10%, rgba(196,181,253,.5), transparent 60%), var(--bg-base)",
      }}
    >
      {/* ─── Fake group dashboard backdrop ────────────────────── */}
      <div className="max-w-3xl mx-auto px-6 py-6 opacity-90 pointer-events-none">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="label-caps mb-1">your group</div>
            <h1 className="font-heading font-black text-3xl leading-tight">
              Friday Game Night
            </h1>
            <div
              className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border-2 border-slate-900 text-xs font-heading font-black"
              style={{ background: "var(--pastel-mint)" }}
            >
              <Sparkles className="w-3 h-3" strokeWidth={2.5} /> code · PLN8T2
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full border-2 border-slate-900 bg-white grid place-items-center font-heading font-black">
              R
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="neo-card p-4 bg-white">
            <div className="label-caps">members</div>
            <div className="font-heading font-black text-2xl">3</div>
          </div>
          <div
            className="neo-card p-4"
            style={{ background: "var(--pastel-mint)" }}
          >
            <div className="label-caps">free slots</div>
            <div className="font-heading font-black text-2xl">12</div>
          </div>
          <div className="neo-card p-4 bg-white">
            <div className="label-caps">next sync</div>
            <div className="font-heading font-black text-2xl">Fri 7pm</div>
          </div>
        </div>
        {/* Mini heatmap stub */}
        <div className="neo-card p-4 bg-white">
          <div className="label-caps mb-2">heatmap preview</div>
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: "repeat(7, 1fr)" }}
          >
            {Array.from({ length: 56 }).map((_, i) => {
              const tones = [
                "var(--heat-0)",
                "var(--heat-1)",
                "var(--heat-2)",
                "var(--heat-3)",
                "var(--heat-4)",
              ];
              const v = (i * 7 + 3) % 5;
              return (
                <div
                  key={i}
                  style={{ background: tones[v], minHeight: 14 }}
                  className="rounded-sm border border-slate-900/40"
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Faux success toast (top-center) ──────────────────── */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40">
        <div
          className="px-4 py-2 rounded-2xl border-2 border-slate-900 bg-white text-sm font-heading font-black flex items-center gap-2 shadow-[3px_3px_0_0_rgba(15,23,42,1)]"
          style={{ background: "var(--pastel-mint)" }}
        >
          <CheckCircle2 className="w-4 h-4" strokeWidth={2.5} />
          Group "Friday Game Night" created!
        </div>
      </div>

      {/* ─── The Save-Account secondary popup ────────────────── */}
      <div className="fixed inset-0 grid place-items-center p-4 z-50">
        <div
          className="absolute inset-0"
          style={{ background: "rgba(15,23,42,.45)", backdropFilter: "blur(2px)" }}
        />
        <div
          className="relative neo-card p-6 sm:p-7 w-full max-w-md bg-white"
          style={{ borderWidth: "var(--stroke-width)" }}
        >
          <button
            type="button"
            className="absolute top-3 right-3 w-9 h-9 rounded-2xl border-2 border-slate-900 grid place-items-center bg-white shadow-[2px_2px_0_0_rgba(15,23,42,1)] hover:translate-y-[-1px] transition"
            aria-label="Close"
            title="Close (preview only)"
          >
            <X className="w-4 h-4" strokeWidth={2.5} />
          </button>

          {state === "prompt" && (
            <>
              {/* Hero icon */}
              <div
                className="inline-flex items-center justify-center w-14 h-14 rounded-3xl border-2 border-slate-900 mb-3 shadow-[3px_3px_0_0_rgba(15,23,42,1)]"
                style={{ background: "var(--pastel-lavender, #ddd6fe)" }}
              >
                <ShieldCheck className="w-7 h-7 text-slate-900" strokeWidth={2.5} />
              </div>
              <div className="label-caps mb-1">one more thing</div>
              <h2 className="font-heading font-black text-2xl sm:text-3xl leading-tight">
                Save your account
              </h2>
              <p
                className="text-sm mt-2"
                style={{ color: "var(--ink-soft)" }}
              >
                We saved your info on this device. Add an email + password to
                <strong> keep your groups across devices</strong> and unlock
                personalised settings (saved themes, custom hours, default
                location, and more).
              </p>

              {/* Benefits row */}
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
                  Sync your groups on any device, no rejoining
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2
                    className="w-4 h-4 mt-0.5 flex-none"
                    strokeWidth={2.5}
                    style={{ color: "#10b981" }}
                  />
                  Customise themes, default hours, and timezone once
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2
                    className="w-4 h-4 mt-0.5 flex-none"
                    strokeWidth={2.5}
                    style={{ color: "#10b981" }}
                  />
                  Tailored heatmap defaults across all your crews
                </li>
              </ul>

              {/* Form */}
              <div className="space-y-3 mt-5">
                <div>
                  <div className="label-caps mb-1 flex items-center gap-1">
                    <Mail className="w-3 h-3" strokeWidth={2.5} /> email
                  </div>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="rojer@example.com"
                    type="email"
                    className="w-full neo-input"
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
                    className="w-full neo-input"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="mt-5 grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={() => setState("success")}
                  className="neo-btn w-full justify-center"
                >
                  Save my account <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  className="w-full text-xs font-heading font-black underline"
                  style={{ color: "var(--ink-soft)" }}
                >
                  Skip — continue as guest
                </button>
              </div>

              <div
                className="text-[11px] mt-3 text-center"
                style={{ color: "var(--ink-mute)" }}
              >
                Mock auth — stored only on this device's localStorage.
              </div>
            </>
          )}

          {state === "success" && (
            <>
              <div
                className="inline-flex items-center justify-center w-14 h-14 rounded-3xl border-2 border-slate-900 mb-3 shadow-[3px_3px_0_0_rgba(15,23,42,1)]"
                style={{ background: "var(--pastel-mint)" }}
              >
                <CheckCircle2 className="w-7 h-7 text-slate-900" strokeWidth={2.5} />
              </div>
              <div className="label-caps mb-1">all set</div>
              <h2 className="font-heading font-black text-2xl sm:text-3xl leading-tight">
                Account saved 🎉
              </h2>
              <p
                className="text-sm mt-2"
                style={{ color: "var(--ink-soft)" }}
              >
                Your groups and preferences will now follow you across devices.
                You can manage your account from the header pill.
              </p>
              <div
                className="mt-4 px-3 py-2 rounded-2xl border-2 border-slate-900 text-xs font-heading font-black flex items-center gap-2"
                style={{ background: "var(--pastel-mint)" }}
              >
                <ShieldCheck className="w-4 h-4" strokeWidth={2.5} />
                Signed in · {email || "rojer@example.com"}
              </div>
              <button
                type="button"
                className="neo-btn w-full mt-5 justify-center"
              >
                Back to Friday Game Night <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
