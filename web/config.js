// ─────────────────────────────────────────────────────────────────────────────
// Anbani reference website — configuration
//
// apiBaseUrl  where BooksAPI runs. When this site is served by the API itself
//             (http://localhost:5080/app/) the same origin is used automatically.
// apiKey      the sandbox this website works in. The demo key has ready-made
//             accounts (admin@anbani.ge / reader@anbani.ge, password Anbani2026!).
// ─────────────────────────────────────────────────────────────────────────────
window.ANBANI_CONFIG = {
  apiBaseUrl: location.pathname.startsWith('/app') ? location.origin : 'http://localhost:5080',
  apiKey: 'anbani-demo-key',
  defaultLanguage: 'ka',
  showDevPanel: true,
};
