// Single source of truth for the Kanopi version. Shown in Settings > About and used to name the offline cache.
// To release: change `version` and `released` here, add an entry to CHANGELOG.md, then deploy.
// Bumping the version also gives phones a fresh offline cache, so they pick up the new files.
(function (root) {
  root.KANOPI_VERSION = { version: '1.1.0', released: '2026-11-22' };
})(typeof window !== 'undefined' ? window : self);
