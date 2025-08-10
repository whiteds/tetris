import { defineConfig } from 'vite';

// Multi-page build so that Vite emits multiple HTML entries
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        multi: 'multi/index.html',
        single: 'single/index.html',
        game: 'game/index.html',
      },
    },
  },
});
