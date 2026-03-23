import type { LanguageId } from '../types/engine';

export const branding = {
  languageId: (import.meta.env.VITE_LANGUAGE || 'js') as LanguageId,
  appName: import.meta.env.VITE_APP_NAME || 'JSTutor',
  brandPrefix: import.meta.env.VITE_BRAND_PREFIX || 'JS',
  brandSuffix: import.meta.env.VITE_BRAND_SUFFIX || 'Tutor',
  tagline: import.meta.env.VITE_TAGLINE || 'JavaScript Memory Visualizer',
  brandColor: import.meta.env.VITE_BRAND_COLOR || '#DD030B',
  languageDisplayName: import.meta.env.VITE_LANG_DISPLAY || 'JavaScript',
  domain: import.meta.env.VITE_DOMAIN || 'jstutor.org',
};
