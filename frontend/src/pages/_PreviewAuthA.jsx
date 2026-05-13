// Throwaway preview page used to screenshot Snapshot A of the
// Guest-vs-SignIn welcome modal. Will be removed once the user picks
// a direction. Routed at /preview/auth-a.
import { useState } from "react";
import { Rocket, UserRound, ArrowRight, X } from "lucide-react";

export default function PreviewAuthA() {
  // step: "choose" | "guest" | "signin"
  const [step, setStep] = useState("choose");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div
      className="min-h-screen grain"
      style={{
        background:
          "radial-gradient(1200px 600px at 20% -10%, rgba(167,243,208,.5), transparent 60%), radial-gradient(900px 500px at 100% 10%, rgba(196,181,253,.5), transparent 60%), var(--bg-base)",
      }}
    >
      {/* Faux landing page underneath the modal — gives a real-world
          backdrop so the modal proportions read accurately. */}
      <div className="max-w-3xl mx-auto px-6 py-10 opacity-50 pointer-events-none">
        <div className="label-caps mb-2">planit · 2025</div>
        <h1 className="font-heading font-black text-5xl leading-none mb-3">
          Sync orbits with your crew.
        </h1>
        <p className="text-slate-600 max-w-md">
          Spin up a group, drop in your free time, and we'll surface when
          everyone's actually available.
        </p>
        <div className="grid grid-cols-2 gap-3 mt-6 max-w-md">
          <div className="neo-card p-5 h-24 bg-white" />
          <div className="neo-card p-5 h-24" style={{ background: "var(--pastel-mint)" }} />
        </div>
      </div>

      {/* Modal */}
      <div className="fixed inset-0 grid place-items-center p-4 z-50">
        <div
          className="absolute inset-0"
          style={{ background: "rgba(15,23,42,.45)", backdropFilter: "blur(2px)" }}
        />
        <div
          className="relative neo-card p-6 sm:p-8 w-full max-w-xl bg-white"
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

          {step === "choose" && (
            <>
              <div className="label-caps mb-2">welcome</div>
              <h2 className="font-heading font-black text-3xl sm:text-4xl leading-tight">
                How do you want to <br />sync your orbits?
              </h2>
              <p className="text-sm mt-2" style={{ color: "var(--ink-soft)" }}>
                Pick one — you can change it later from the header pill.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                {/* Guest card */}
                <button
                  type="button"
                  onClick={() => setStep("guest")}
                  className="neo-card p-5 text-left hover:translate-y-[-2px] transition relative"
                  style={{ background: "var(--pastel-mint)" }}
                >
                  <div className="w-12 h-12 rounded-2xl border-2 border-slate-900 grid place-items-center bg-white mb-3 shadow-[2px_2px_0_0_rgba(15,23,42,1)]">
                    <UserRound className="w-6 h-6" strokeWidth={2.5} />
                  </div>
                  <div className="label-caps mb-1">guest</div>
                  <div className="font-heading font-black text-xl leading-tight mb-2">
                    Continue as Guest
                  </div>
                  <ul className="text-xs space-y-1" style={{ color: "var(--ink-soft)" }}>
                    <li>• Just your name</li>
                    <li>• Nothing saved to a profile</li>
                    <li>• Fastest path in</li>
                  </ul>
                  <div className="mt-4 inline-flex items-center gap-1 text-xs font-bold">
                    Start <ArrowRight className="w-3 h-3" strokeWidth={2.5} />
                  </div>
                </button>

                {/* Sign in card */}
                <button
                  type="button"
                  onClick={() => setStep("signin")}
                  className="neo-card p-5 text-left hover:translate-y-[-2px] transition relative"
                  style={{ background: "var(--pastel-lavender, #ddd6fe)" }}
                >
                  <div className="w-12 h-12 rounded-2xl border-2 border-slate-900 grid place-items-center bg-white mb-3 shadow-[2px_2px_0_0_rgba(15,23,42,1)]">
                    <Rocket className="w-6 h-6" strokeWidth={2.5} />
                  </div>
                  <div className="label-caps mb-1">account</div>
                  <div className="font-heading font-black text-xl leading-tight mb-2">
                    Sign in
                  </div>
                  <ul className="text-xs space-y-1" style={{ color: "var(--ink-soft)" }}>
                    <li>• Save your name</li>
                    <li>• Email + password</li>
                    <li>• Mock auth (this device only)</li>
                  </ul>
                  <div className="mt-4 inline-flex items-center gap-1 text-xs font-bold">
                    Sign in <ArrowRight className="w-3 h-3" strokeWidth={2.5} />
                  </div>
                </button>
              </div>

              <div className="text-[11px] mt-5 text-center" style={{ color: "var(--ink-mute)" }}>
                Already chose? Tap the pill in the top-right header to switch.
              </div>
            </>
          )}

          {step === "guest" && (
            <>
              <button
                type="button"
                onClick={() => setStep("choose")}
                className="text-xs font-bold underline mb-3"
                style={{ color: "var(--ink-soft)" }}
              >
                ← back
              </button>
              <div className="label-caps mb-2">guest</div>
              <h2 className="font-heading font-black text-3xl leading-tight">
                What should we call you?
              </h2>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Rojer"
                className="mt-4 w-full neo-input"
              />
              <button type="button" className="neo-btn w-full mt-4 justify-center">
                Start as guest <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </>
          )}

          {step === "signin" && (
            <>
              <button
                type="button"
                onClick={() => setStep("choose")}
                className="text-xs font-bold underline mb-3"
                style={{ color: "var(--ink-soft)" }}
              >
                ← back
              </button>
              <div className="label-caps mb-2">account</div>
              <h2 className="font-heading font-black text-3xl leading-tight">Sign in</h2>
              <p className="text-xs mt-1" style={{ color: "var(--ink-mute)" }}>
                Mock auth — saved only to this device's localStorage.
              </p>
              <div className="space-y-3 mt-4">
                <div>
                  <div className="label-caps mb-1">name</div>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Rojer"
                    className="w-full neo-input"
                  />
                </div>
                <div>
                  <div className="label-caps mb-1">email</div>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="rojer@example.com"
                    type="email"
                    className="w-full neo-input"
                  />
                </div>
                <div>
                  <div className="label-caps mb-1">password</div>
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    type="password"
                    className="w-full neo-input"
                  />
                </div>
              </div>
              <button type="button" className="neo-btn w-full mt-4 justify-center">
                Create account <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Faux identity-pill examples in the corner so user sees post-choice UX */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-3 z-40">
        <div
          className="px-3 py-1.5 rounded-full border-2 border-slate-900 bg-white text-xs font-heading font-black flex items-center gap-1.5 shadow-[2px_2px_0_0_rgba(15,23,42,1)]"
          title="Header pill after Guest"
        >
          <UserRound className="w-3.5 h-3.5" strokeWidth={2.5} /> Guest · Rojer
        </div>
        <div
          className="px-3 py-1.5 rounded-full border-2 border-slate-900 text-xs font-heading font-black flex items-center gap-1.5 shadow-[2px_2px_0_0_rgba(15,23,42,1)]"
          style={{ background: "var(--pastel-lavender, #ddd6fe)" }}
          title="Header pill after Sign in"
        >
          <Rocket className="w-3.5 h-3.5" strokeWidth={2.5} /> Signed in · Rojer
        </div>
      </div>
    </div>
  );
}
