import '@testing-library/jest-dom/vitest';

// jsdom 30's HTMLDialogElement is a bare stub (extends HTMLElement with no
// overrides) — `showModal`/`close` are simply undefined, not "not
// implemented" stubs. Verified empirically against this repo's jsdom
// version: node_modules/jsdom/lib/jsdom/living/nodes/HTMLDialogElement-impl.js
// has no method overrides at all. Minimal polyfill so components built on
// the native <dialog> element (design.md Decision 4, ConfirmDialog) are
// testable under RTL. Only toggles the reflected `open` attribute — jsdom
// does not need to simulate real focus-trap/modality for component tests.
if (typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}
