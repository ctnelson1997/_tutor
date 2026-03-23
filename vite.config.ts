/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Custom modes ('js', 'py', etc.) map to language targets.
  // Standard modes ('development', 'production', 'test') default to 'js'.
  const lang = mode && !['development', 'production', 'test'].includes(mode) ? mode : 'js';

  return {
    plugins: [react()],
    base: '/',
    build: {
      outDir: 'docs',
    },
  };
})
