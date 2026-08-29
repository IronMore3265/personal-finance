import tailwindcss from '@tailwindcss/vite';

// Vite owns the build now; www/ is the source root and index.html the entry, so
// no import specifier in www/js had to change to adopt it.
//
// The APK is served from dist/, not www/ - see webDir in capacitor.config.json.
// scripts/check.mjs still walks www/js, because an unresolvable import is worth
// catching in a second rather than in a bundle.

export default {
  plugins: [tailwindcss()],
  root: 'www',
  // www/public/assets holds the brand SVGs, which brands.js requests by a URL
  // it builds at runtime ('assets/brands/' + key). Vite cannot see through a
  // string like that, so those files have to be copied verbatim rather than
  // resolved as imports - which is exactly what publicDir is for.
  publicDir: 'public',
  build: {
    outDir: '../dist',
    emptyOutDir: true
  },
  server: {
    // The Playwright baseURL is pinned to this, so a port already in use has to
    // fail loudly rather than quietly moving to 5174.
    port: 5173,
    strictPort: true
  }
};
