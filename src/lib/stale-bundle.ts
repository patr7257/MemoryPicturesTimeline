// The pure decisions behind the version gate's automatic reload, kept out of
// the hook so they are unit tested. The DOM probes take the root to search as
// an argument: a test hands them a stand-in, the hook hands them `document`.
// Ported from the app-shell block of zrm-fullstack-building-blocks; the React
// Query "in-flight mutations" check is replaced by the [data-unsaved-work]
// marker, which the upload form sets while photos are queued or sending.

export type AutoReloadState = {
  // The tab is not visible. A visible page is never reloaded under the person.
  hidden: boolean;
  // A dialog or alert dialog is open.
  modalOpen: boolean;
  // A text field holds input.
  dirtyInput: boolean;
  // Something marked itself as holding work a reload would lose.
  unsavedWork: boolean;
};

// Every condition must hold before the app reloads itself. Anything busy means
// "leave the banner up and let the person choose": the cost of not reloading
// is one tap, the cost of reloading wrongly is a lost upload queue.
export function isSafeToAutoReload(state: AutoReloadState): boolean {
  return state.hidden && !state.modalOpen && !state.dirtyInput && !state.unsavedWork;
}

// The slice of an element the probes read, so a test can stand one in.
export type ProbedElement = {
  closest(selector: string): unknown;
  type?: string;
  value?: string;
  readOnly?: boolean;
  disabled?: boolean;
};

// The slice of a document the probes read.
export type ProbeRoot = {
  querySelectorAll(selector: string): Iterable<ProbedElement>;
};

// Is a dialog open? A closed dialog that stays mounted must sit under
// aria-hidden="true"; one that does not makes the probe fail SAFE (reports
// open, so no automatic reload).
export function hasOpenModal(root: ProbeRoot): boolean {
  for (const el of root.querySelectorAll('[role="dialog"], [role="alertdialog"]')) {
    if (!el.closest('[aria-hidden="true"]')) return true;
  }
  return false;
}

// Input types that hold no typing.
const NOT_TYPED = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

// Has the person typed anything anywhere? Any non-empty text field counts
// (not value !== defaultValue: React sets defaultValue on controlled inputs).
// Read-only, disabled and aria-hidden fields are skipped.
export function hasDirtyInput(root: ProbeRoot): boolean {
  for (const el of root.querySelectorAll("input, textarea")) {
    if (el.type && NOT_TYPED.has(el.type)) continue;
    if (el.readOnly || el.disabled) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    if (el.value) return true;
  }
  return false;
}

// Is any element marked as holding work a reload would lose?
export function hasUnsavedWork(root: ProbeRoot): boolean {
  for (const _ of root.querySelectorAll("[data-unsaved-work]")) return true;
  return false;
}
