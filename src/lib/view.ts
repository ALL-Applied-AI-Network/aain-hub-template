/* The view contract.

   One destination = one view = one function that fills the markup
   already in index.html. A view is called at most once, the first time
   its tab is entered — with `?events=all` the archive is 59 rows, the
   projects grid 41 cards and the badges grid 27 tiles, and putting all
   of that in the DOM before first paint is a phone's whole frame budget
   spent on four tabs nobody opened.

   Home is expected NOT to be in the registry — it renders at init(),
   because it is what a visitor lands on. Registering it is not an error;
   its "first entry" is simply boot.
*/

import type { Bundle } from "./bundle";

export type ViewCtx = {
  bundle: Bundle;
  slug: string;
  pathname: string;
  el: (id: string) => HTMLElement | null;
};

export type View = (ctx: ViewCtx) => void;

/** Page key → the view that fills it. A key with no entry is a page
 *  whose markup is already complete, which is not an error. */
export const MOUNT: Record<string, View | undefined> = Object.create(null);

/** Register a view for a page key. Last registration wins, so a view
 *  module is safe to import twice. */
export function registerView(pageKey: string, view: View): void {
  MOUNT[pageKey] = view;
}

/** Build the context handed to every view. `el` is `getElementById`
 *  behind a name, so a view never reaches for `document` directly and a
 *  test can hand it a fixture. */
export function viewContext(bundle: Bundle, slug: string, pathname: string): ViewCtx {
  return {
    bundle,
    slug,
    pathname,
    el: (id: string) => document.getElementById(id),
  };
}
