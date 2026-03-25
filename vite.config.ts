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
          const domainMap: Record<string, string> = { js: 'jstutor.org', py: 'pytutor.org', java: 'javatutor.org' };
          const nameMap: Record<string, string> = { js: 'JSTutor', py: 'PyTutor', java: 'JavaTutor' };
          const displayMap: Record<string, string> = { js: 'JavaScript', py: 'Python', java: 'Java' };
          const domain = domainMap[lang];
          const appName = nameMap[lang];
          const langDisplay = displayMap[lang];
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
            fileName: 'README.md',
            source: `# ${appName}\n\nBuild output for [${domain}](https://${domain}) — a free, browser-based ${langDisplay} execution visualizer.\n\nSource code: [github.com/ctnelson1997/_tutor](https://github.com/ctnelson1997/_tutor)\n`,
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
      outDir: 'docs'
    },
    test: {
      // SWC's native binary has a race condition on Windows when multiple
      // worker processes initialize it simultaneously, causing intermittent
      // "Cannot read properties of undefined (reading 'config')" errors.
      // Disabling file parallelism ensures only one file is processed at a
      // time, eliminating the race entirely.
      pool: 'forks',
      fileParallelism: false,
    },
  };
})
