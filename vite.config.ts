import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // The published app lives at /PatternAtlas/ on GitHub Pages.
  base: command === 'serve' ? '/' : '/PatternAtlas/',
}));
