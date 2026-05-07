import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { createGroup, getGroup, joinGroup, setLocalMemberId, addVisitedGroup } from "../lib/api";
import { Users, ArrowRight, Sparkles, Calendar, ChevronDown, Zap, Rocket, Share2, Clock3, Plus } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";

const STEPS = [
  {
    n: "01",
    t: "Create or Join Your Orbit",
    d: "Create or join a group and share your 6-character code with friends, roommates, classmates, coworkers, or your crew.",
  },
  {
    n: "02",
    t: "Mark your Availability",
    d: "Tap your busy hours and label them with fully customizable labels for your schedule's so everyone stays aligned.",
  },
  {
    n: "03",
    t: "Find the Perfect Overlap",
    d: "Planit's heatmap instantly reveals the best times to make plans together.",
  },
];

export default function Landing() {
  const nav = useNavigate();
  const [groupName, setGroupName] = useState("");
  const [creatorName, setCreatorName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const howRef = useRef(null);

  // Close "How it works" dropdown when clicking outside
  useEffect(() => {
    function onClickOutside(e) {
      if (howRef.current && !howRef.current.contains(e.target)) {
        setHowOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const onCreate = async (e) => {
    e.preventDefault();
    if (!groupName.trim() || !creatorName.trim()) {
      toast.error("Please enter a group name and your name.");
      return;
    }
    setCreating(true);
    try {
      const { group, member_id } = await createGroup(groupName.trim(), creatorName.trim());
      setLocalMemberId(group.code, member_id);
      addVisitedGroup({ code: group.code, name: group.name });
      toast.success(`Group "${group.name}" created!`);
      nav(`/g/${group.code}`);
    } catch (err) {
      toast.error("Could not create group. Try again.");
    } finally {
      setCreating(false);
    }
  };

  const onJoin = async (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code || !joinName.trim()) {
      toast.error("Enter the group code and your name.");
      return;
    }
    setJoining(true);
    try {
      const g = await getGroup(code);
      const res = await joinGroup(code, joinName.trim());
      setLocalMemberId(code, res.member_id);
      addVisitedGroup({ code, name: g.name });
      toast.success("Joined the group!");
      nav(`/g/${code}`);
    } catch (err) {
      toast.error("Group not found. Check the code.");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen grain" data-testid="landing-page">
      {/* Top nav */}
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3 planet-logo-wrap" data-testid="brand-logo">
          <div className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-2xl border-[3px] border-slate-900 bg-[var(--pastel-mint)] grid place-items-center overflow-visible shadow-[5px_5px_0_0_var(--ink)]">
            <PlanetIcon />
          </div>
          <span className="font-heading font-black text-3xl sm:text-4xl tracking-tight">Planit</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative" ref={howRef}>
            <button
              type="button"
              onClick={() => setHowOpen((v) => !v)}
              className="label-caps hidden sm:flex items-center gap-1 px-3 py-2 rounded-full border-2 border-transparent hover:border-slate-900 transition"
              data-testid="landing-how-link"
              aria-expanded={howOpen}
            >
              How it works
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${howOpen ? "rotate-180" : ""}`}
              />
            </button>
            {howOpen && (
              <div
                className="absolute right-0 mt-2 w-80 sm:w-96 z-30 neo-card p-4 space-y-3"
                data-testid="how-it-works-dropdown"
              >
                {STEPS.map((s) => (
                  <div key={s.n} className="flex gap-3 items-start">
                    <div className="shrink-0 w-9 h-9 rounded-lg border-2 border-slate-900 bg-[var(--pastel-yellow)] grid place-items-center font-heading font-black text-sm">
                      {s.n}
                    </div>
                    <div>
                      <div className="font-heading font-black text-base leading-tight">{s.t}</div>
                      <p className="text-sm text-slate-700 leading-snug mt-0.5">{s.d}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <ThemeToggle />
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-10 pb-20 grid lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 pop-in">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--pastel-yellow)] border-2 border-slate-900 mb-6"
            data-testid="landing-badge"
          >
            <Sparkles className="w-4 h-4" />
            <span className="label-caps">No account needed</span>
          </div>
          <h1 className="font-heading font-black text-5xl sm:text-6xl lg:text-7xl leading-[0.95] tracking-tighter">
            Time your{" "}
            <span className="font-orbit bg-[var(--pastel-mint)] px-3 rounded-xl border-2 border-slate-900 inline-block text-4xl sm:text-5xl lg:text-6xl align-middle">
              Space
            </span>
          </h1>
          <p className="mt-6 text-lg text-slate-700 max-w-xl leading-relaxed">
            Drop in your schedule, share a link with your crew, and see every
            hour where everyone's free to launch into the next adventure.
          </p>

          {/* Dual CTA */}
          <div className="mt-10 grid md:grid-cols-2 gap-6">
            {/* Create */}
            <form onSubmit={onCreate} className="neo-card p-6" data-testid="create-group-form">
              <div className="label-caps mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" /> Start a group
              </div>
              <input
                className="neo-input w-full mb-3"
                placeholder="Group name (e.g. Weekend Warriors)"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                data-testid="create-group-name-input"
              />
              <input
                className="neo-input w-full mb-4"
                placeholder="Your display name"
                value={creatorName}
                onChange={(e) => setCreatorName(e.target.value)}
                data-testid="create-creator-name-input"
              />
              <button
                type="submit"
                className="neo-btn w-full flex items-center justify-center gap-2"
                disabled={creating}
                data-testid="create-group-submit-btn"
              >
                {creating ? "Creating..." : "Create group"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Join */}
            <form onSubmit={onJoin} className="neo-card p-6 bg-[var(--pastel-lavender)]" data-testid="join-group-form">
              <div className="label-caps mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Join via code
              </div>
              <input
                className="neo-input w-full mb-3 uppercase tracking-[0.2em] font-bold"
                placeholder="6-char code"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                data-testid="join-code-input"
              />
              <input
                className="neo-input w-full mb-4"
                placeholder="Your display name"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                data-testid="join-name-input"
              />
              <button
                type="submit"
                className="neo-btn ghost w-full flex items-center justify-center gap-2"
                disabled={joining}
                data-testid="join-group-submit-btn"
              >
                {joining ? "Joining..." : "Join group"}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Slogan under the create/join forms */}
          <div className="mt-8 text-center" data-testid="slogan">
            <p className="font-orbit text-xl sm:text-2xl text-slate-900">
              Plan less. Planit.
            </p>
            <p className="mt-2 text-sm sm:text-base text-slate-600 leading-relaxed">
              Find your crew's common orbit — in seconds, not group-chat threads.
            </p>
          </div>
        </div>

        {/* Right bento */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-5 pop-in" style={{ animationDelay: "0.15s" }}>
          <div className="neo-card p-5 col-span-2 bg-[var(--pastel-mint)]">
            <div className="flex items-center justify-between mb-3">
              <div className="label-caps">Live heatmap preview</div>
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-slate-600 hidden sm:block">
                Click & drag to color
              </div>
            </div>
            <MiniHeatmap />
          </div>
          <div className="neo-card p-5">
            <div className="label-caps mb-2">Member schedules</div>
            <MemberSchedulesMini />
          </div>
          <div className="neo-card p-5 bg-[var(--pastel-peach)]">
            <div className="label-caps mb-2">Customize busy labels</div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="px-2 py-1 text-xs font-bold rounded-full border-2 border-slate-900 bg-[#7FB3D5] text-white">
                Work
              </span>
              <span className="px-2 py-1 text-xs font-bold rounded-full border-2 border-slate-900 bg-[#C39BD3] text-white">
                Class
              </span>
              <span className="px-2 py-1 text-xs font-bold rounded-full border-2 border-slate-900 bg-[#F1948A] text-white">
                Gym
              </span>
              <span className="px-2 py-1 text-xs font-bold rounded-full border-2 border-slate-900 bg-[#5D6D7E] text-white">
                Sleep
              </span>
              <span className="px-2 py-1 text-xs font-bold rounded-full border-2 border-slate-900 bg-[#48C9B0] text-white">
                Travel
              </span>
              <button
                type="button"
                aria-label="Add custom label"
                className="w-7 h-7 rounded-full border-2 border-slate-900 bg-white grid place-items-center hover:bg-[var(--pastel-yellow)] transition"
                data-testid="customize-label-circle"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Filler section (replaces "Three steps, zero friction" — now lives inside HOW IT WORKS dropdown) */}
      <section id="how" className="max-w-6xl mx-auto px-6 pb-24">
        <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <div className="label-caps text-slate-500 mb-2">Built for spontaneous plans</div>
            <h2 className="font-heading font-black text-3xl sm:text-4xl tracking-tight">
              Stop the group-chat ping pong.
            </h2>
          </div>
          <p className="text-slate-700 max-w-md leading-relaxed">
            Planit replaces the back-and-forth with one shared canvas. Everyone
            paints when they're busy — the empty hours speak for themselves.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="neo-card p-6 bg-[var(--pastel-yellow)]">
            <div className="w-10 h-10 rounded-xl border-2 border-slate-900 bg-white grid place-items-center mb-3">
              <Zap className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div className="font-heading font-black text-xl mb-1">10-second start</div>
            <p className="text-slate-700 leading-snug text-sm">
              No signups, no email confirmations. A six-character code is the
              only thing your friends ever need.
            </p>
          </div>
          <div className="neo-card p-6 bg-[var(--pastel-lavender)]">
            <div
              className="rocket-wrap w-10 h-10 rounded-xl border-2 border-slate-900 bg-white grid place-items-center mb-3"
              data-testid="rocket-hover"
            >
              <Rocket className="rocket-icon w-5 h-5" strokeWidth={2.5} />
              <span className="rocket-flame" />
              <span className="rocket-flame small" />
            </div>
            <div className="font-heading font-black text-xl mb-1">Built for crews</div>
            <p className="text-slate-700 leading-snug text-sm">
              Roommates, study groups, weekend warriors. The heatmap scales
              from two friends to twenty.
            </p>
          </div>
          <div className="neo-card p-6 bg-[var(--pastel-peach)]">
            <div className="w-10 h-10 rounded-xl border-2 border-slate-900 bg-white grid place-items-center mb-3">
              <Share2 className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div className="font-heading font-black text-xl mb-1">One-link share</div>
            <p className="text-slate-700 leading-snug text-sm">
              Copy. Paste. Done. Drop the link anywhere DMs, group chats,
              calendars, sticky notes.
            </p>
          </div>
        </div>

        <div className="mt-10 neo-card p-6 flex flex-col items-center justify-center gap-3 bg-white text-center">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Clock3 className="w-5 h-5" strokeWidth={2.5} />
            <span className="font-heading font-black">Curious how it works?</span>
            <span className="text-slate-700 text-sm">
              Tap "How it works" up top for the three-step rundown.
            </span>
          </div>
          <span className="label-caps text-slate-500">No account · No tracking · Just 10sec</span>
        </div>
      </section>
    </div>
  );
}

// --- Planet logo: ring is static, globe spins around its Y axis ON HOVER,
//     stars are tucked close to the globe and only twinkle on hover ---
function PlanetIcon() {
  // 24 dots evenly distributed on a circle (then tilted via CSS rotateX into an ellipse).
  // The ring no longer spins — it sits as a static halo around the globe.
  const RING_DOT_COUNT = 24;
  const RING_RADIUS = 9.6;
  const ringDots = Array.from({ length: RING_DOT_COUNT }, (_, i) => {
    const a = (i / RING_DOT_COUNT) * Math.PI * 2;
    return {
      cx: 16 + RING_RADIUS * Math.cos(a),
      cy: 16 + RING_RADIUS * Math.sin(a),
      r: 1.05 + (i % 3 === 0 ? 0.15 : 0),
    };
  });

  // Stars now hug the globe: a tight band ~7-12 from center, hand-placed for
  // an unsymmetric, non-grid feel. They are dim by default and only twinkle
  // when the user hovers the logo.
  const stars = [
    { cx: 8.0,  cy: 8.5,  r: 0.65, d: "0s",    dur: "1.8s" },
    { cx: 24.0, cy: 7.6,  r: 0.55, d: "0.6s",  dur: "2.4s" },
    { cx: 25.6, cy: 14.5, r: 0.5,  d: "1.2s",  dur: "2.1s" },
    { cx: 6.4,  cy: 14.0, r: 0.6,  d: "0.3s",  dur: "2.7s" },
    { cx: 8.5,  cy: 23.4, r: 0.55, d: "1.5s",  dur: "1.9s" },
    { cx: 23.6, cy: 23.6, r: 0.6,  d: "0.9s",  dur: "2.3s" },
    { cx: 16.0, cy: 5.4,  r: 0.45, d: "1.8s",  dur: "2.0s" },
    { cx: 26.0, cy: 19.4, r: 0.5,  d: "0.45s", dur: "2.6s" },
    { cx: 5.8,  cy: 19.6, r: 0.55, d: "1.1s",  dur: "1.7s" },
    { cx: 16.0, cy: 26.6, r: 0.5,  d: "0.15s", dur: "2.5s" },
    { cx: 11.2, cy: 5.8,  r: 0.4,  d: "1.35s", dur: "2.2s" },
    { cx: 20.6, cy: 26.4, r: 0.5,  d: "0.75s", dur: "1.85s" },
  ];

  return (
    <svg
      viewBox="0 0 32 32"
      className="w-12 h-12 sm:w-14 sm:h-14"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="planet-shade" cx="35%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#fff7c2" />
          <stop offset="35%" stopColor="#3ed1aa" />
          <stop offset="75%" stopColor="#1ABC9C" />
          <stop offset="100%" stopColor="#0e6b58" />
        </radialGradient>
        <clipPath id="planet-clip">
          <circle cx="16" cy="16" r="6" />
        </clipPath>
      </defs>

      {/* Random sparkly stars (continuous, non-symmetric) */}
      <g className="planet-stars">
        {stars.map((s, i) => (
          <circle
            key={i}
            cx={s.cx}
            cy={s.cy}
            r={s.r}
            style={{ animationDelay: s.d, animationDuration: s.dur }}
          />
        ))}
      </g>

      {/* Static globe (sphere body + meridians + highlight — no animation) */}
      <g className="planet-globe">
        <circle
          cx="16"
          cy="16"
          r="6"
          fill="url(#planet-shade)"
          stroke="#0f172a"
          strokeWidth="1.5"
        />
        <g
          clipPath="url(#planet-clip)"
          stroke="#0f172a"
          strokeWidth="0.7"
          strokeOpacity="0.55"
          fill="none"
          strokeLinecap="round"
        >
          <ellipse cx="16" cy="16" rx="2.2" ry="6" />
          <ellipse cx="16" cy="16" rx="4.5" ry="6" />
          <path d="M10.2 14.2 Q 16 12.6 21.8 14.2" />
          <path d="M10.2 17.8 Q 16 19.4 21.8 17.8" />
        </g>
        <ellipse
          cx="13.4"
          cy="13.6"
          rx="1.8"
          ry="1.1"
          fill="#ffffff"
          fillOpacity="0.55"
          transform="rotate(-25 13.4 13.6)"
        />
      </g>

      {/* Orbiting dot-ring — rendered AFTER globe so dots stay visible all around */}
      <g className="ring-orbit">
        <g className="ring-spin">
          {ringDots.map((d, i) => (
            <circle key={i} cx={d.cx} cy={d.cy} r={d.r} />
          ))}
        </g>
      </g>
    </svg>
  );
}

// --- Member schedules mini (replaces "Soft colors" — minimalistic) ---
function MemberSchedulesMini() {
  const members = [
    { name: "Alex", color: "#1ABC9C", row: [1, 0, 2, 1, 0, 0] },
    { name: "Mia",  color: "#7FB3D5", row: [0, 1, 1, 0, 2, 0] },
    { name: "Jay",  color: "#F1948A", row: [2, 0, 0, 1, 0, 1] },
  ];
  const tone = (v, base) => {
    if (v === 0) return "var(--heat-0)";
    if (v === 1) return base + "55";
    return base;
  };
  return (
    <div className="space-y-1.5">
      {members.map((m) => (
        <div key={m.name} className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full border border-slate-900 shrink-0"
            style={{ background: m.color }}
          />
          <span className="text-[0.7rem] font-bold w-8 truncate">{m.name}</span>
          <div className="flex gap-0.5 flex-1">
            {m.row.map((v, i) => (
              <div
                key={i}
                className="flex-1 h-3 rounded-sm border border-slate-900"
                style={{ background: tone(v, m.color) }}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniHeatmap() {
  // Interactive drag-to-color heatmap. Each cell cycles through 5 levels.
  // Levels map to: heat-0 (empty) → heat-1 → heat-2 → heat-3 → heat-all (gold).
  const COLS = 7;
  const ROWS = 6;
  const TOTAL = COLS * ROWS;
  const HEAT_VARS = [
    "var(--heat-0)",
    "var(--heat-1)",
    "var(--heat-2)",
    "var(--heat-3)",
    "var(--heat-all)",
  ];

  // Seed with a soft random pattern so the preview looks alive on load
  const seed = (k) => {
    const i = Math.floor(k / COLS);
    const j = k % COLS;
    const v = Math.abs(Math.sin((i + 1) * (j + 2) * 13.37)) % 1;
    if (v < 0.3) return 0;
    if (v < 0.55) return 1;
    if (v < 0.78) return 2;
    if (v < 0.93) return 3;
    return 4;
  };
  const [levels, setLevels] = useState(() =>
    Array.from({ length: TOTAL }, (_, k) => seed(k))
  );
  const [isDragging, setIsDragging] = useState(false);
  const paintedRef = useRef(new Set());

  // Bump a single cell up by 1 (wraps from 4 → 0)
  const bump = (idx) => {
    if (paintedRef.current.has(idx)) return; // only once per drag stroke
    paintedRef.current.add(idx);
    setLevels((prev) => {
      const next = prev.slice();
      next[idx] = (next[idx] + 1) % HEAT_VARS.length;
      return next;
    });
  };

  // Global mouse-up listener so dragging ends even if released outside the grid
  useEffect(() => {
    const stop = () => {
      setIsDragging(false);
      paintedRef.current = new Set();
    };
    window.addEventListener("mouseup", stop);
    window.addEventListener("touchend", stop);
    return () => {
      window.removeEventListener("mouseup", stop);
      window.removeEventListener("touchend", stop);
    };
  }, []);

  const handleStart = (idx) => {
    setIsDragging(true);
    paintedRef.current = new Set();
    bump(idx);
  };
  const handleEnter = (idx) => {
    if (isDragging) bump(idx);
  };

  // Touch support: figure out which cell the finger is over
  const handleTouchMove = (e) => {
    if (!isDragging) return;
    const t = e.touches[0];
    if (!t) return;
    const el = document.elementFromPoint(t.clientX, t.clientY);
    if (el && el.dataset && el.dataset.cellIdx !== undefined) {
      bump(Number(el.dataset.cellIdx));
    }
  };

  return (
    <div
      className="grid grid-cols-7 gap-1 select-none touch-none"
      onMouseLeave={() => {
        // keep the stroke active across re-entry — just stop bumping outside
      }}
      onTouchMove={handleTouchMove}
      data-testid="mini-heatmap"
    >
      {levels.map((lvl, k) => (
        <div
          key={k}
          data-cell-idx={k}
          className="aspect-square rounded-md border-2 border-slate-900 cursor-pointer transition-transform hover:scale-105"
          style={{ background: HEAT_VARS[lvl] }}
          onMouseDown={(e) => {
            e.preventDefault();
            handleStart(k);
          }}
          onMouseEnter={() => handleEnter(k)}
          onTouchStart={(e) => {
            e.preventDefault();
            handleStart(k);
          }}
        />
      ))}
    </div>
  );
}
