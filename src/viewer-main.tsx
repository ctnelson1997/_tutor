import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getEngine } from './engines/registry';
import { branding } from './config/branding';
import { useStore } from './store/useStore';
import ViewerApp from './components/ViewerApp';
import { CURRENT_EXAMPLE_SCHEMA_VERSION } from './types/viewer';
import type { ViewerExample } from './types/viewer';

const examples: ViewerExample[] = Array.isArray(window.__EXAMPLES__) ? window.__EXAMPLES__ : [];
const initial = examples[0];

// True if any example was produced by a newer engine than the one currently
// running. ViewerApp uses this to render a soft warning banner; we still try
// to render the data on a best-effort basis.
const schemaMismatch = examples.some(
  (ex) => typeof ex.schemaVersion === 'number' && ex.schemaVersion > CURRENT_EXAMPLE_SCHEMA_VERSION,
);

getEngine(branding.languageId);

if (initial) {
  const store = useStore.getState();
  store.setLanguage(initial.language);
  store.setCode(initial.code);
  store.setStdin(initial.stdin ?? '');
  store.setSnapshots(initial.snapshots);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ViewerApp examples={examples} schemaMismatch={schemaMismatch} />
  </StrictMode>,
);
