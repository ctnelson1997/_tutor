import { useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { isLanguageId } from '../engines/registry';
import { useEngine } from '../engines/useEngine';
import App from '../App';

export default function ExamplePage() {
  const { slug, lang } = useParams<{ slug: string; lang?: string }>();
  const setCode = useStore((s) => s.setCode);
  const setLanguage = useStore((s) => s.setLanguage);
  const reset = useStore((s) => s.reset);

  // Apply language from URL param (default to current store language)
  const storeLanguage = useStore((s) => s.language);
  const language = lang && isLanguageId(lang) ? lang : storeLanguage;
  const engine = useEngine(language);

  const example = engine?.examples.find((e) => e.slug === slug);

  useEffect(() => {
    if (example) {
      reset();
      setLanguage(language);
      setCode(example.code);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, lang, example]);

  // Engine still loading — don't redirect yet
  if (!engine) return null;

  if (!example) return <Navigate to="/" replace />;

  return <App />;
}
