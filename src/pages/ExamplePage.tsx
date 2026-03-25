import { useEffect } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { useEngine } from '../engines/useEngine';
import App from '../App';

export default function ExamplePage() {
  const { slug } = useParams<{ slug: string }>();
  const setCode = useStore((s) => s.setCode);
  const reset = useStore((s) => s.reset);

  const language = useStore((s) => s.language);
  const engine = useEngine(language);

  const example = engine?.examples.find((e) => e.slug === slug);

  useEffect(() => {
    if (example) {
      reset();
      setCode(example.code);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, example]);

  // Engine still loading — don't redirect yet
  if (!engine) return null;

  if (!example) return <Navigate to="/" replace />;

  return <App />;
}
