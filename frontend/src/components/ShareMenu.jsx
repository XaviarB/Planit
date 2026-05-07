import { useEffect, useRef, useState } from "react";
import { Share2, Copy, X, Search, Smartphone } from "lucide-react";
import { toast } from "sonner";

/**
 * ShareMenu — pre-filled invite link blast across every popular platform.
 *
 * Each target is one of:
 *   - URL share intent  → `urlBuilder({u,t,group})` returns a deep-link to open
 *   - Copy-only         → clipboard write + context toast (Discord, Slack, …)
 *
 * Brand icons come from cdn.simpleicons.org so we don't ship a giant SVG bundle.
 */

const buildText = (groupName) =>
  `Drop your busy hours into "${groupName}" on Planit so we can find a time that works:`;

// Each entry: id, name, slug (cdn.simpleicons.org), color (hex w/o #),
// build(u, t, group) → href OR null (= copy-only with custom toast).
const TARGETS = [
  { id: "whatsapp",   name: "WhatsApp",        slug: "whatsapp",        color: "25D366", build: ({ u, t }) => `https://wa.me/?text=${encodeURIComponent(t + " " + u)}` },
  { id: "imessage",   name: "iMessage / SMS",  slug: "imessage",        color: "007AFF", build: ({ u, t }) => `sms:?&body=${encodeURIComponent(t + " " + u)}` },
  { id: "telegram",   name: "Telegram",        slug: "telegram",        color: "26A5E4", build: ({ u, t }) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { id: "email",      name: "Email",           slug: "gmail",           color: "EA4335", build: ({ u, t, group }) => `mailto:?subject=${encodeURIComponent("Join " + group + " on Planit")}&body=${encodeURIComponent(t + "\n\n" + u)}` },
  { id: "x",          name: "X / Twitter",     slug: "x",               color: "000000", build: ({ u, t }) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { id: "facebook",   name: "Facebook",        slug: "facebook",        color: "1877F2", build: ({ u }) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}` },
  { id: "messenger",  name: "Messenger",       slug: "messenger",       color: "0084FF", build: ({ u }) => `https://www.facebook.com/dialog/send?app_id=140586622674265&link=${encodeURIComponent(u)}&redirect_uri=${encodeURIComponent(u)}` },
  { id: "linkedin",   name: "LinkedIn",        slug: "linkedin",        color: "0A66C2", build: ({ u }) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(u)}` },
  { id: "reddit",     name: "Reddit",          slug: "reddit",          color: "FF4500", build: ({ u, group }) => `https://www.reddit.com/submit?url=${encodeURIComponent(u)}&title=${encodeURIComponent("Join " + group + " on Planit")}` },
  { id: "discord",    name: "Discord",         slug: "discord",         color: "5865F2", build: null, copyHint: "Link copied — paste it in your Discord channel." },
  { id: "slack",      name: "Slack",           slug: "slack",           color: "4A154B", build: null, copyHint: "Link copied — paste it in any Slack channel." },
  { id: "teams",      name: "Microsoft Teams", slug: "microsoftteams",  color: "6264A7", build: ({ u, t }) => `https://teams.microsoft.com/share?href=${encodeURIComponent(u)}&msgText=${encodeURIComponent(t)}` },
  { id: "skype",      name: "Skype",           slug: "skype",           color: "00AFF0", build: ({ u, t }) => `https://web.skype.com/share?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { id: "viber",      name: "Viber",           slug: "viber",           color: "7360F2", build: ({ u, t }) => `viber://forward?text=${encodeURIComponent(t + " " + u)}` },
  { id: "line",       name: "LINE",            slug: "line",            color: "00C300", build: ({ u }) => `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(u)}` },
  { id: "kakao",      name: "KakaoTalk",       slug: "kakaotalk",       color: "FFCD00", build: null, copyHint: "Link copied — paste it in your KakaoTalk chat." },
  { id: "wechat",     name: "WeChat",          slug: "wechat",          color: "07C160", build: null, copyHint: "Link copied — open WeChat and paste it in a chat." },
  { id: "qq",         name: "QQ",              slug: "tencentqq",       color: "1EBAFC", build: ({ u, t }) => `https://connect.qq.com/widget/shareqq/index.html?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}` },
  { id: "snapchat",   name: "Snapchat",        slug: "snapchat",        color: "FFFC00", build: ({ u }) => `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(u)}`, fgInvert: true },
  { id: "instagram",  name: "Instagram DM",    slug: "instagram",       color: "E4405F", build: null, copyHint: "Link copied — paste it in an Instagram DM." },
  { id: "tiktok",     name: "TikTok DM",       slug: "tiktok",          color: "000000", build: null, copyHint: "Link copied — paste it in a TikTok DM." },
  { id: "threads",    name: "Threads",         slug: "threads",         color: "000000", build: ({ u, t }) => `https://www.threads.net/intent/post?text=${encodeURIComponent(t + " " + u)}` },
  { id: "bluesky",    name: "Bluesky",         slug: "bluesky",         color: "0285FF", build: ({ u, t }) => `https://bsky.app/intent/compose?text=${encodeURIComponent(t + " " + u)}` },
  { id: "mastodon",   name: "Mastodon",        slug: "mastodon",        color: "6364FF", build: ({ u, t }) => `https://mastodonshare.com/?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { id: "tumblr",     name: "Tumblr",          slug: "tumblr",          color: "36465D", build: ({ u, t }) => `https://www.tumblr.com/share/link?url=${encodeURIComponent(u)}&description=${encodeURIComponent(t)}` },
  { id: "pinterest",  name: "Pinterest",       slug: "pinterest",       color: "BD081C", build: ({ u, t }) => `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(u)}&description=${encodeURIComponent(t)}` },
  { id: "pocket",     name: "Pocket",          slug: "pocket",          color: "EF3F56", build: ({ u, t }) => `https://getpocket.com/save?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}` },
  { id: "hackernews", name: "Hacker News",     slug: "ycombinator",     color: "FF6600", build: ({ u, group }) => `https://news.ycombinator.com/submitlink?u=${encodeURIComponent(u)}&t=${encodeURIComponent("Planit — " + group)}` },
  { id: "vk",         name: "VK",              slug: "vk",              color: "0077FF", build: ({ u, t }) => `https://vk.com/share.php?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}` },
  { id: "weibo",      name: "Weibo",           slug: "sinaweibo",       color: "E6162D", build: ({ u, t }) => `https://service.weibo.com/share/share.php?url=${encodeURIComponent(u)}&title=${encodeURIComponent(t)}` },
  { id: "googlechat", name: "Google Chat",     slug: "googlechat",      color: "00AC47", build: null, copyHint: "Link copied — paste it in Google Chat." },
];

export default function ShareMenu({ url, groupName }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const popRef = useRef(null);

  const text = buildText(groupName || "our group");
  const ctx = { u: url, t: text, group: groupName || "our group" };
  const hasNative = typeof navigator !== "undefined" && !!navigator.share;

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const copyLink = (hint) => {
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success(hint || "Invite link copied!"))
      .catch(() => toast.error("Couldn't copy — long-press the link instead."));
  };

  const onTargetClick = (t) => {
    if (!t.build) {
      copyLink(t.copyHint || `Link copied — paste it in ${t.name}.`);
      return;
    }
    const href = t.build(ctx);
    // mailto:/sms:/viber: schemes navigate the current tab; everything web opens new tab.
    const isScheme = /^(mailto|sms|viber):/i.test(href);
    if (isScheme) {
      window.location.href = href;
    } else {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };

  const onNativeShare = async () => {
    try {
      await navigator.share({
        title: `Join ${groupName || "our group"} on Planit`,
        text,
        url,
      });
    } catch {
      // user cancelled — silently ignore
    }
  };

  const filtered = query.trim()
    ? TARGETS.filter((t) =>
        t.name.toLowerCase().includes(query.trim().toLowerCase())
      )
    : TARGETS;

  return (
    <div className="relative" ref={popRef} data-testid="share-menu-wrap">
      <button
        type="button"
        className="neo-btn pastel flex items-center justify-center gap-2 text-sm w-full"
        onClick={() => setOpen((v) => !v)}
        data-testid="share-menu-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Share2 className="w-4 h-4" /> Share link
      </button>

      {open && (
        <div
          className="absolute z-50 mt-2 left-0 right-0 sm:left-auto sm:right-0 sm:w-[360px] neo-card p-4 max-h-[70vh] overflow-y-auto"
          data-testid="share-menu-dropdown"
          role="dialog"
          aria-label="Share invite link"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="label-caps">Share invite</div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-7 h-7 rounded-full border-2 border-slate-900 grid place-items-center hover:bg-[var(--pastel-yellow)] bg-white"
              aria-label="Close"
              data-testid="share-menu-close"
            >
              <X className="w-3.5 h-3.5" strokeWidth={3} />
            </button>
          </div>

          {/* Link preview row */}
          <button
            type="button"
            onClick={() => copyLink()}
            className="w-full neo-input flex items-center gap-2 text-left mb-3 hover:bg-[var(--pastel-mint)] transition"
            data-testid="share-copy-link"
            title="Copy invite link"
          >
            <Copy className="w-4 h-4 shrink-0" />
            <span className="font-mono text-xs truncate flex-1" style={{ color: "var(--ink-soft)" }}>
              {url}
            </span>
            <span className="label-caps text-[10px] shrink-0">Copy</span>
          </button>

          {/* Native OS share sheet (mobile + supported browsers) */}
          {hasNative && (
            <button
              type="button"
              onClick={onNativeShare}
              className="w-full neo-btn ghost flex items-center justify-center gap-2 text-sm mb-3"
              data-testid="share-native"
            >
              <Smartphone className="w-4 h-4" /> Open device share sheet
            </button>
          )}

          {/* Search */}
          <div className="relative mb-3">
            <Search
              className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: "var(--ink-mute)" }}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search 30+ apps…"
              className="neo-input w-full pl-9 text-sm"
              data-testid="share-search"
            />
          </div>

          {/* Brand grid */}
          <div className="grid grid-cols-4 gap-2" data-testid="share-targets-grid">
            {filtered.map((t) => (
              <BrandTile key={t.id} target={t} onClick={() => onTargetClick(t)} />
            ))}
            {filtered.length === 0 && (
              <div className="col-span-4 text-center text-xs py-4" style={{ color: "var(--ink-mute)" }}>
                No matches — try "WhatsApp", "Email", "Discord"…
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BrandTile({ target, onClick }) {
  const iconUrl = `https://cdn.simpleicons.org/${target.slug}/${target.fgInvert ? "0f172a" : "ffffff"}`;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl border-2 border-slate-900 bg-white hover:scale-[1.04] transition shadow-[2px_2px_0_0_var(--ink)] hover:shadow-[3px_3px_0_0_var(--ink)]"
      data-testid={`share-target-${target.id}`}
      title={`Share via ${target.name}`}
    >
      <span
        className="w-10 h-10 rounded-lg grid place-items-center shrink-0"
        style={{
          background: `#${target.color}`,
          border: "2px solid var(--ink)",
        }}
      >
        <img
          src={iconUrl}
          alt={target.name}
          className="w-5 h-5"
          width="20"
          height="20"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </span>
      <span className="text-[10px] font-bold leading-tight text-center line-clamp-2" style={{ color: "var(--ink)" }}>
        {target.name}
      </span>
    </button>
  );
}
