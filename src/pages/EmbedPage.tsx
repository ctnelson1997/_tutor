import { useEffect, useMemo } from 'react';
import { useParams, useLocation, Navigate } from 'react-router-dom';
import { decodeShareCode } from '../utils/share';
import { useStore } from '../store/useStore';
import { runCode } from '../engine/executor';
import { isLanguageId } from '../engines/registry';
import { branding } from '../config/branding';
import App from '../App';

export default function EmbedPage() {
  const { encoded, lang } = useParams<{ encoded: string; lang?: string }>();
  const location = useLocation();
  const setCode = useStore((s) => s.setCode);
  const setHideFunctions = useStore((s) => s.setHideFunctions);
  const setLanguage = useStore((s) => s.setLanguage);
  const reset = useStore((s) => s.reset);

  // Apply language from URL param (default to build target for legacy links)
  const language = lang && isLanguageId(lang) ? lang : branding.languageId;

  const code = useMemo(() => {
    if (!encoded) return null;
    return decodeShareCode(encoded);
  }, [encoded]);

  useEffect(() => {
    if (code) {
      reset();
      setLanguage(language);
      setCode(code);
      const params = new URLSearchParams(location.search);
      if (params.get('hf') === '1') setHideFunctions(true);
      runCode(code);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encoded, language]);

  if (!code) return <Navigate to="/" replace />;

  return <App embed />;
}
