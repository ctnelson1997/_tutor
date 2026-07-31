import { useState } from 'react';
import { Alert, Navbar, Nav } from 'react-bootstrap';
import App from '../App';
import { branding } from '../config/branding';
import ExamplePicker from './ExamplePicker';
import type { ViewerExample } from '../types/viewer';

interface ViewerAppProps {
  examples: ViewerExample[];
  schemaMismatch?: boolean;
}

export default function ViewerApp({ examples, schemaMismatch = false }: ViewerAppProps) {
  const [warningDismissed, setWarningDismissed] = useState(false);
  if (examples.length === 0) {
    return (
      <div style={{ padding: '2rem', maxWidth: 640, margin: '4rem auto', fontFamily: 'sans-serif', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '1rem' }}>{branding.appName} Viewer</h2>
        <p style={{ color: '#666' }}>
          This is the empty viewer template. To create a populated export, use the Export button in {branding.appName}.
        </p>
        <p>
          <a href={`https://${branding.domain}`}>{branding.domain}</a>
        </p>
      </div>
    );
  }

  const engineVersion = window.__TUTOR_ENGINE_VERSION__;

  return (
    <>
      {schemaMismatch && !warningDismissed && (
        <Alert
          variant="warning"
          dismissible
          onClose={() => setWarningDismissed(true)}
          className="mb-0 rounded-0 py-2"
          style={{ fontSize: '0.85rem' }}
        >
          <strong>Schema mismatch:</strong>{' '}
          One or more examples in this file were produced by a newer engine version than the one
          currently running ({engineVersion ? `v${engineVersion}` : 'unknown'}). The visualization may
          render incorrectly. To fix, swap in a newer engine block — see the comment above the
          <code> &lt;script data-tutor-engine&gt; </code> tag in this file.
        </Alert>
      )}
      <Navbar bg="dark" variant="dark" expand="md" className="px-3">
        <Navbar.Brand className="fw-bold">
          <span style={{ color: branding.brandColor }}>{branding.brandPrefix}</span>
          {branding.brandSuffix}
        </Navbar.Brand>
        {examples.length > 1 && (
          <>
            <Navbar.Toggle aria-controls="viewer-nav" />
            <Navbar.Collapse id="viewer-nav">
              <Nav className="me-auto">
                <ExamplePicker examples={examples} />
              </Nav>
            </Navbar.Collapse>
          </>
        )}
        {engineVersion && (
          <span
            className="text-muted ms-auto"
            style={{ fontSize: '0.7rem', fontFamily: 'monospace' }}
            title="Engine version (data-tutor-engine). Replace the <script data-tutor-engine> block in this file to upgrade."
          >
            engine v{engineVersion}
          </span>
        )}
      </Navbar>
      <App embed viewer />
    </>
  );
}
