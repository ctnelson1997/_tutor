import { useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Card, Button, Alert } from 'react-bootstrap';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { decodeShareCode } from '../utils/share';
import { useStore } from '../store/useStore';
import { isLanguageId } from '../engines/registry';
import { useEngine } from '../engines/useEngine';
import { branding } from '../config/branding';
import type { CodeFlag } from '../types/engine';

export default function ShareWarningPage() {
  const { encoded, lang } = useParams<{ encoded: string; lang?: string }>();
  const navigate = useNavigate();
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

  const engine = useEngine(language);

  const flags: CodeFlag[] = useMemo(() => {
    if (!code) return [];
    return engine?.analyzeCode?.(code) ?? [];
  }, [code, engine]);

  const extensions = useMemo(
    () => [engine?.editorExtension() ?? [], EditorView.editable.of(false)],
    [engine],
  );

  const handleRunCode = useCallback(() => {
    if (code) {
      reset();
      setLanguage(language);
      setCode(code);
      const params = new URLSearchParams(location.search);
      if (params.get('hf') === '1') setHideFunctions(true);
      navigate('/');
    }
  }, [code, reset, setLanguage, language, setCode, setHideFunctions, location.search, navigate]);

  const handleCancel = useCallback(() => {
    navigate('/');
  }, [navigate]);

  if (!code) {
    return (
      <div className="warning-page p-4">
        <Alert variant="danger">
          <Alert.Heading>Invalid Share Link</Alert.Heading>
          <p>The shared code could not be decoded. The link may be corrupted.</p>
          <Button variant="primary" onClick={handleCancel}>
            Go to {branding.appName}
          </Button>
        </Alert>
      </div>
    );
  }

  return (
    <div className="warning-page p-4">
      <Card>
        <Card.Header className="bg-warning text-dark">
          <h5 className="mb-0">⚠ You're about to run someone else's code</h5>
        </Card.Header>
        <Card.Body>
          <p>
            This code will execute in your browser.{' '}
            <strong>Only run code from people you trust.</strong>
          </p>

          {/* Static analysis flags */}
          {flags.length > 0 ? (
            flags.map((flag, i) => (
              <Alert key={i} variant="warning" className="py-1 px-2 mb-1" style={{ fontSize: '0.85rem' }}>
                ⚠ {flag.message}
              </Alert>
            ))
          ) : (
            <></>
          )}

          {/* Read-only code preview */}
          <div className="border rounded my-3" style={{ maxHeight: '400px', overflow: 'auto' }}>
            <CodeMirror
              value={code}
              extensions={extensions}
              theme="light"
              readOnly={true}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLine: false,
                foldGutter: false,
              }}
            />
          </div>

          <div className="d-flex gap-2">
            <Button variant="success" onClick={handleRunCode}>
              View & Run Code
            </Button>
            <Button variant="outline-secondary" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}
