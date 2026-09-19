/* Capture mode.

   `?still=1` forces every scroll reveal and every boot/arrival animation
   to its settled state, so a screenshot is the finished page rather than
   whichever frame the capture happened to land on. Without it there is no
   honest way to compare two renders of these sites.

   Ungated on purpose. The sites being compared are the live ones
   (msoe-ai-club, roar, ntua-ai-club), so this cannot sit behind
   isDashboardPreview. It reads no data, fetches nothing and reveals
   nothing a visitor could not already see — it only turns animation off.

   Composes with every other param by construction: it is one independent
   read of `still` from the query string, so `?preview=1`, `?slug=`,
   `?event=`, `?primary=`/`?accent=`/`?logo=`/`?off=`/`?edit=1` all keep
   their own meaning alongside it.

   The two classes are alternatives, never both:
     html.is-still → CSS pins every reveal to its end state.
     html.js-rv    → CSS is allowed to start reveals hidden.
   The stylesheet's default (neither class) is fully visible, so a JS
   failure and reduced motion both land on a readable page. */

/** True when this load was asked to render its settled state. */
export function isCaptureStill(search = window.location.search): boolean {
  return new URLSearchParams(search).get("still") === "1";
}

/** Set the reveal mode on <html>. Call before first paint — after it, the
 *  browser has already had a frame to animate. Returns whether capture
 *  mode is on, so callers can skip work that only exists for motion. */
export function applyCaptureMode(root: HTMLElement, search?: string): boolean {
  const still = isCaptureStill(search);
  root.classList.add(still ? "is-still" : "js-rv");
  return still;
}
