import { defineConfig } from 'astro/config';

export default defineConfig({
  // Served as a GitHub Pages project site at jslucascom.github.io/jslucas/.
  // If this ever moves to a custom domain or a github.io root repo, change
  // `base` back to '/' and revert the matching hardcoded "/jslucas/" asset
  // paths in layout.astro, js-laptop-3d.astro, js-intro-heading.astro,
  // svg-logo.astro, section-intro.astro and intro-heading.js.
  site: 'https://jslucascom.github.io',
  base: '/jslucas/',
  output: 'static',
  server: {
    open: true,
  },
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          // Use Dart Sass's modern API (silences the "legacy JS API" deprecation warning)
          api: 'modern',
          // Bootstrap 5's own SCSS source still uses constructs Dart Sass is deprecating
          // (@import, global colour/math functions, if()). These are vendored files we
          // don't maintain, so silence just those specific warnings rather than every
          // deprecation across the codebase.
          silenceDeprecations: ['import', 'global-builtin', 'color-functions', 'abs-percent', 'if-function'],
          quietDeps: true,
        },
      },
    },
  },
});
