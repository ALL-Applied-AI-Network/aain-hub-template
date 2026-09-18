import { escapeAttr, escapeHtml } from "./lib/html";

const DASHBOARD_ORIGIN = "https://dashboard.all-ai-network.org";
const EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Query routes work on both chapter domains and static GitHub Pages forks. */
export function eventPageHref(eventId: string, pathname: string): string {
  return `${pathname}?event=${encodeURIComponent(eventId)}`;
}

export function eventFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get("event")?.trim() ?? "";
  return EVENT_ID.test(id) ? id.toLowerCase() : null;
}

export function flyerUrl(eventId: string, chapterSlug: string, embed = true): string {
  const url = new URL(`${embed ? "/embed/event" : "/e"}/${encodeURIComponent(eventId)}`, DASHBOARD_ORIGIN);
  url.searchParams.set("chapter", chapterSlug);
  return url.href;
}

/** A different tab/frame must never be able to resize this event's content. */
export function trustedFlyerHeight(
  message: Pick<MessageEvent, "origin" | "source" | "data">,
  frameWindow: Window | null,
  eventId: string,
): number | null {
  if (!frameWindow || message.origin !== DASHBOARD_ORIGIN || message.source !== frameWindow) return null;
  const data = message.data;
  if (
    !data || typeof data !== "object" ||
    data.type !== "all-event-flyer:resize" || data.eventId !== eventId ||
    typeof data.height !== "number" || !Number.isFinite(data.height) ||
    data.height < 1 || data.height > 100_000
  ) return null;
  return Math.max(320, Math.ceil(data.height));
}

/** Only this event's trusted frame can request a section jump. */
export function trustedFlyerTop(
  message: Pick<MessageEvent, "origin" | "source" | "data">,
  frameWindow: Window | null,
  eventId: string,
): number | null {
  if (!frameWindow || message.origin !== DASHBOARD_ORIGIN || message.source !== frameWindow) return null;
  const data = message.data;
  if (
    !data || typeof data !== "object" ||
    data.type !== "all-event-flyer:navigate" || data.eventId !== eventId ||
    typeof data.top !== "number" || !Number.isFinite(data.top) ||
    data.top < 0 || data.top > 100_000
  ) return null;
  return Math.ceil(data.top);
}

export function mountEventPage(opts: {
  eventId: string;
  chapterSlug: string;
  chapterName: string;
  title?: string;
}): void {
  const { eventId, chapterSlug, chapterName } = opts;
  document.body.classList.add("is-event-page");
  document.title = `${opts.title || "Event"} — ${chapterName}`;
  document.querySelectorAll<HTMLElement>("[data-page]").forEach((element) => {
    element.hidden = true;
  });
  const pageHeader = document.getElementById("page-header");
  if (pageHeader) pageHeader.hidden = true;

  // The event has its own URL; chapter tabs return to their normal home
  // routes instead of changing a hash underneath the embedded event.
  document.querySelectorAll<HTMLAnchorElement>("[data-page-tab]").forEach((link) => {
    link.href = `${window.location.pathname}#${link.dataset.pageTab}`;
    link.classList.remove("nav__tab--active");
    link.removeAttribute("aria-selected");
    link.removeAttribute("role");
  });
  document.getElementById("nav-links")?.removeAttribute("role");
  const brand = document.querySelector<HTMLAnchorElement>(".nav__brand");
  if (brand) brand.href = `${window.location.pathname}#home`;

  const root = document.createElement("main");
  root.className = "event-page";
  root.innerHTML = `
    <div class="event-page__toolbar">
      <a class="event-page__back" href="${escapeAttr(window.location.pathname)}#events">
        <span aria-hidden="true">←</span> Back to ${escapeHtml(chapterName)}
      </a>
      <div class="event-page__actions">
        <button class="event-page__copy" type="button">Copy event link</button>
        <a class="event-page__standalone" href="${escapeAttr(flyerUrl(eventId, chapterSlug, false))}" target="_blank" rel="noopener noreferrer">Open in a new tab ↗</a>
      </div>
    </div>
    <p class="event-page__loading" role="status">Loading event details…</p>
  `;
  const copyButton = root.querySelector<HTMLButtonElement>(".event-page__copy")!;
  copyButton.addEventListener("click", async () => {
    try {
      const link = new URL(eventPageHref(eventId, window.location.pathname), window.location.origin);
      await navigator.clipboard.writeText(link.href);
      copyButton.textContent = "Link copied";
    } catch {
      copyButton.textContent = "Copy the address from your browser";
    }
  });
  const frame = document.createElement("iframe");
  frame.className = "event-page__frame";
  frame.title = opts.title ? `${opts.title} — event details` : "Event details";
  frame.referrerPolicy = "strict-origin-when-cross-origin";
  const hideLoading = () => root.querySelector(".event-page__loading")?.remove();
  const onMessage = (message: MessageEvent) => {
    const height = trustedFlyerHeight(message, frame.contentWindow, eventId);
    if (height !== null) {
      frame.style.height = `${height}px`;
      hideLoading();
      return;
    }
    const top = trustedFlyerTop(message, frame.contentWindow, eventId);
    if (top === null) return;
    const nav = document.getElementById("nav");
    const navPosition = nav ? getComputedStyle(nav).position : "";
    const stickyHeight = nav && (navPosition === "sticky" || navPosition === "fixed")
      ? nav.getBoundingClientRect().height : 0;
    window.scrollTo({
      top: Math.max(0, window.scrollY + frame.getBoundingClientRect().top + top - stickyHeight - 24),
      behavior: "instant" as ScrollBehavior,
    });
  };
  window.addEventListener("message", onMessage);
  frame.addEventListener("load", hideLoading);
  frame.src = flyerUrl(eventId, chapterSlug);
  root.appendChild(frame);
  document.getElementById("nav")?.insertAdjacentElement("afterend", root);
}
