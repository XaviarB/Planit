// Iframe-safe clipboard helper.
// The Emergent preview embeds the app inside an iframe, where the modern
// `navigator.clipboard.writeText` API is often blocked by permissions
// policy. We try the modern API first (because it's the future) and fall
// back to the trusty hidden-textarea + `document.execCommand("copy")`
// trick which works in nearly every browser/context.

export async function copyToClipboard(text) {
  // Modern API — only attempt when we're in a secure context. In an iframe
  // without the right `allow="clipboard-write"` permission this rejects.
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof window !== "undefined" &&
    window.isSecureContext
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }

  // Legacy fallback — works in iframes, older browsers, anywhere.
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "-9999px";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok === true;
  } catch {
    return false;
  }
}
