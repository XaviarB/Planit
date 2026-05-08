/**
 * AstralBot — a friendly, on-brand AI robot character for Planit's Astral.
 *
 * The mascot ties Astral to our space theme: rounded head, antenna tipped
 * with a little star, glowing eyes, gentle smile. Designed to read clearly
 * at 32–48px on top of pastel gradients.
 *
 * Props:
 *   size       — render size in px (default 32)
 *   color      — outline / dark fill color (default ink)
 *   bg         — head/body fill (default white)
 *   eyeColor   — glowing eyes (default mint-leaning lime)
 *   waving     — if true, animates the antenna star bobbing
 *   className  — pass-through for layout tweaks
 */
export default function AstralBot({
  size = 32,
  color = "#0f172a",
  bg = "#ffffff",
  eyeColor = "#bef264",
  waving = false,
  className = "",
  style = {},
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      style={{ pointerEvents: "none", ...style }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="astralbot-eye-glow" cx="0.5" cy="0.4" r="0.6">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="60%" stopColor={eyeColor} stopOpacity="1" />
          <stop offset="100%" stopColor={eyeColor} stopOpacity="0.85" />
        </radialGradient>
      </defs>

      {/* Antenna stem */}
      <line
        x1="16" y1="4.5" x2="16" y2="8.5"
        stroke={color} strokeWidth="1.6" strokeLinecap="round"
      />
      {/* Antenna star (subtly bobs when waving) */}
      <g className={waving ? "astralbot-antenna" : ""}>
        <circle
          cx="16" cy="3.6" r="2"
          fill={bg} stroke={color} strokeWidth="1.5"
        />
        <path
          d="M16 2.2 L16.45 3.2 L17.45 3.45 L16.7 4.15 L16.85 5.1 L16 4.65 L15.15 5.1 L15.3 4.15 L14.55 3.45 L15.55 3.2 Z"
          fill={color}
        />
      </g>

      {/* Side dials / ears */}
      <rect x="2.5" y="14" width="3" height="5.5" rx="1.2" fill={color} />
      <rect x="26.5" y="14" width="3" height="5.5" rx="1.2" fill={color} />
      <rect x="3.5" y="15.4" width="1" height="2.7" rx="0.4" fill={bg} />
      <rect x="27.5" y="15.4" width="1" height="2.7" rx="0.4" fill={bg} />

      {/* Head/body — rounded squircle */}
      <rect
        x="6" y="9" width="20" height="18.5" rx="5.5"
        fill={bg} stroke={color} strokeWidth="1.8"
      />

      {/* Visor (dark band) */}
      <rect x="8.5" y="13" width="15" height="7.2" rx="3.6" fill={color} />

      {/* Inner visor sheen */}
      <rect x="8.8" y="13.2" width="14.4" height="2" rx="2"
        fill="#1e293b" />

      {/* Glowing eyes */}
      <circle cx="12.5" cy="16.6" r="1.55" fill="url(#astralbot-eye-glow)" />
      <circle cx="19.5" cy="16.6" r="1.55" fill="url(#astralbot-eye-glow)" />
      {/* Eye highlights — playful catchlights */}
      <circle cx="13.05" cy="16.0" r="0.45" fill="#fff" />
      <circle cx="20.05" cy="16.0" r="0.45" fill="#fff" />

      {/* Smile */}
      <path
        d="M11.8 22.6 Q16 25 20.2 22.6"
        stroke={color} strokeWidth="1.5"
        fill="none" strokeLinecap="round"
      />

      {/* Cheek blush — pastel mint dabs (subtle, lots of charm) */}
      <circle cx="9.6" cy="22.5" r="0.9" fill="#86efac" opacity="0.55" />
      <circle cx="22.4" cy="22.5" r="0.9" fill="#86efac" opacity="0.55" />

      {/* Chest sparkle */}
      <g transform="translate(16 26.4)">
        <path
          d="M0 -1.2 L0.4 -0.4 L1.2 0 L0.4 0.4 L0 1.2 L-0.4 0.4 L-1.2 0 L-0.4 -0.4 Z"
          fill={color}
        />
      </g>
    </svg>
  );
}
