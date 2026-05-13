// Throwaway preview page used to screenshot Snapshot B of the
// Guest-vs-SignIn welcome flow (compact full-page screen with
// segmented toggle). Will be removed once the user picks a direction.
// Routed at /preview/auth-b.
import { useState } from "react";
import { Rocket, UserRound, ArrowRight, Sparkles } from "lucide-react";

export default function PreviewAuthB() {
  const [mode, setMode] = useState("signin"); // "signin" | "guest"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div
      className="min-h-screen grain flex items-center justify-center px-4 py-10"
      style={{
        background:
          "radial-gradient(1200px 600px at 20% -10%, rgba(167,243,208,.5), transparent 60%), radial-gradient(900px 500px at 100% 10%, rgba(196,181,253,.5), transparent 60%), var(--bg-base)",
      }}
    >
      <div className="w-full max-w-md">
        {/* Brand mark / mascot */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl border-2 border-slate-900 mb-3 shadow-[3px_3px_0_0_rgba(15,23,42,1)] astral-orb-mascot relative">
            <Sparkles className="w-7 h-7 text-slate-900" strokeWidth={2.5} />
          </div>
          <div className="label-caps mb-1">planit</div>
          <h1 className="font-heading font-black text-3xl leading-tight">
            Sync orbits with your crew
          </h1>
          <p className="text-sm mt-2" style={{ color: "var(--ink-soft)" }}>
            Pick how you want to start. You can change it later.
          </p>
        </div>

        {/* Segmented pill toggle */}
        <div
          className="grid grid-cols-2 gap-0 p-1 rounded-full border-2 border-slate-900 mb-4 shadow-[2px_2px_0_0_rgba(15,23,42,1)]"
          style={{ background: "var(--card)" }}
          role="tablist"
        >
          <button
            type="button"
            onClick={() => setMode("signin")}
            role="tab"
            aria-selected={mode === "signin"}
            className="px-3 py-2 rounded-full text-sm font-heading font-black transition flex items-center justify-center gap-1.5"
            style={{
              background: mode === "signin" ? "var(--ink)" : "transparent",
              color: mode === "signin" ? "#fff" : "var(--ink)",
            }}
          >
            <Rocket className="w-4 h-4" strokeWidth={2.5} /> Sign in
          </button>
          <button
            type="button"
            onClick={() => setMode("guest")}
            role="tab"
            aria-selected={mode === "guest"}
            className="px-3 py-2 rounded-full text-sm font-heading font-black transition flex items-center justify-center gap-1.5"
            style={{
              background: mode === "guest" ? "var(--ink)" : "transparent",
              color: mode === "guest" ? "#fff" : "var(--ink)",
            }}
          >
            <UserRound className="w-4 h-4" strokeWidth={2.5} /> Guest
          </button>
        </div>

        {/* Form card */}
        <div className="neo-card p-5 sm:p-6 bg-white">
          <div className="space-y-3">
            <div>
              <div className="label-caps mb-1">name</div>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="What should we call you?"
                className="w-full neo-input"
              />
            </div>

            {mode === "signin" && (
              <>
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
              </>
            )}
          </div>

          <button type="button" className="neo-btn w-full mt-4 justify-center">
            Continue <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
          </button>

          <div
            className="text-[11px] mt-3 text-center"
            style={{ color: "var(--ink-mute)" }}
          >
            {mode === "signin"
              ? "Mock auth — saved only to this device's localStorage."
              : "No account, just a name. Saved on this device only."}
          </div>
        </div>

        {/* Faux header pill preview */}
        <div className="mt-6 text-center">
          <div className="label-caps mb-2" style={{ color: "var(--ink-soft)" }}>
            after you continue, your header pill:
          </div>
          {mode === "signin" ? (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-slate-900 text-xs font-heading font-black shadow-[2px_2px_0_0_rgba(15,23,42,1)]"
              style={{ background: "var(--pastel-lavender, #ddd6fe)" }}
            >
              <Rocket className="w-3.5 h-3.5" strokeWidth={2.5} />
              Signed in · {name || "Rojer"}
            </div>
          ) : (
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-slate-900 bg-white text-xs font-heading font-black shadow-[2px_2px_0_0_rgba(15,23,42,1)]"
            >
              <UserRound className="w-3.5 h-3.5" strokeWidth={2.5} />
              Guest · {name || "Rojer"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
