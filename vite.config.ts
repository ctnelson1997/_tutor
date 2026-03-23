/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Custom modes ('js', 'py', etc.) map to language targets.
  // Standard modes ('development', 'production', 'test') default to 'js'.
  const lang = mode && !['development', 'production', 'test'].includes(mode) ? mode : 'js';

  return {
    plugins: [
      react(),
      {
        name: 'generate-deploy-files',
        generateBundle() {
          const domain = lang === 'py' ? 'pytutor.org' : 'jstutor.org';
          this.emitFile({
            type: 'asset',
            fileName: 'CNAME',
            source: domain + '\n',
          });
          this.emitFile({
            type: 'asset',
            fileName: 'robots.txt',
            source: `User-agent: *\nAllow: /\n\nSitemap: https://${domain}/sitemap.xml\n`,
          });
          this.emitFile({
            type: 'asset',
            fileName: 'sitemap.xml',
            source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://${domain}/</loc>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>\n`,
          });
        },
      },
    ],
    base: '/',
    build: {
      outDir: lang === 'js' ? 'docs' : `docs-${lang}`,
    },
  };
})
