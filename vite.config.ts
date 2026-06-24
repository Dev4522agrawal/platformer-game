import { defineConfig } from 'vite';

// base: './' makes every emitted asset reference relative, so the built dist/
// works when served from any sub-path (e.g. /sector-runner/) inside the arcade
// host, not just from the domain root.
export default defineConfig({
  base: './',
});
