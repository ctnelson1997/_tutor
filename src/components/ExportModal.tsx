import { useEffect, useMemo, useState } from 'react';
import { Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useStore } from '../store/useStore';
import { runCode } from '../engine/executor';
import { branding } from '../config/branding';
import {
  buildExportHtml,
  downloadHtml,
  fetchViewerTemplate,
  ExportTemplateError,
  slugifyFilename,
} from '../utils/exportHtml';

const LARGE_EXPORT_THRESHOLD_BYTES = 5_000_000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  show: boolean;
  onHide: () => void;
}

export default function ExportModal({ show, onHide }: Props) {
  const code = useStore((s) => s.code);
  const language = useStore((s) => s.language);
  const snapshots = useStore((s) => s.snapshots);
  const stdin = useStore((s) => s.stdin);

  const [title, setTitle] = useState('Visualization');
  const [filename, setFilename] = useState('visualization');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const [actualSizeBytes, setActualSizeBytes] = useState<number | null>(null);

  const snapshotBytes = useMemo(
    () => (snapshots.length === 0 ? 0 : new Blob([JSON.stringify(snapshots)]).size),
    [snapshots],
  );

  useEffect(() => {
    if (show) {
      setError(null);
      setDoneAt(null);
      setActualSizeBytes(null);
    }
  }, [show]);

  const handleTitleChange = (next: string) => {
    setTitle(next);
    const slug = slugifyFilename(next);
    if (slug) setFilename(slug);
  };

  const handleExport = async () => {
    setBusy(true);
    setError(null);
    setDoneAt(null);
    try {
      let snaps = snapshots;
      if (snaps.length === 0) {
        await runCode(code);
        snaps = useStore.getState().snapshots;
        if (snaps.length === 0) {
          const storeError = useStore.getState().error;
          throw new Error(storeError?.message ?? 'Could not generate snapshots for the current code.');
        }
      }

      const template = await fetchViewerTemplate(language);
      const html = buildExportHtml(template, {
        title: title.trim() || 'Visualization',
        slug: slugifyFilename(title),
        language,
        code,
        snapshots: snaps,
        stdin,
      });
      downloadHtml(html, filename.trim() || 'visualization');
      setActualSizeBytes(new Blob([html]).size);
      setDoneAt(Date.now());
    } catch (err) {
      const message = err instanceof ExportTemplateError
        ? err.message
        : err instanceof Error
        ? err.message
        : String(err);
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1rem' }}>Export as standalone HTML</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted mb-3" style={{ fontSize: '0.875rem' }}>
          Download a single HTML file that contains the editor, visualization, and console — no
          backend required. Drop it into your own website. To combine multiple visualizations
          into one file, paste their <code>__EXAMPLES__</code> entries together.
        </p>
        <Form.Group className="mb-2">
          <Form.Label style={{ fontSize: '0.85rem' }}>Title</Form.Label>
          <Form.Control
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Recursive Factorial"
          />
        </Form.Group>
        <Form.Group className="mb-2">
          <Form.Label style={{ fontSize: '0.85rem' }}>Filename</Form.Label>
          <div className="input-group">
            <Form.Control
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
            />
            <span className="input-group-text">.html</span>
          </div>
        </Form.Group>

        <div className="text-muted mb-2" style={{ fontSize: '0.8rem' }}>
          {snapshots.length === 0 ? (
            <>No snapshots yet — clicking Download will run your code first.</>
          ) : (
            <>≈ {formatBytes(snapshotBytes)} payload · {snapshots.length} snapshot{snapshots.length === 1 ? '' : 's'} (plus the viewer template, ~1.3 MB)</>
          )}
        </div>

        {snapshotBytes > LARGE_EXPORT_THRESHOLD_BYTES && (
          <div className="alert alert-warning py-2 mb-2" style={{ fontSize: '0.8rem' }}>
            <strong>Large export.</strong> Recipients on slow connections may have a long initial load. Consider reducing your input size.
          </div>
        )}

        {error && (
          <div className="alert alert-danger py-2" style={{ fontSize: '0.85rem' }}>
            {error}
          </div>
        )}
        {doneAt !== null && !error && (
          <div className="alert alert-success py-2" style={{ fontSize: '0.85rem' }}>
            Download started ({actualSizeBytes !== null ? formatBytes(actualSizeBytes) : 'computing size…'}). Open the file in any browser — or paste it onto your website.
          </div>
        )}

        <div className="d-flex justify-content-end gap-2">
          <Button variant="outline-secondary" size="sm" onClick={onHide} disabled={busy}>
            Close
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleExport}
            disabled={busy || !code.trim()}
            style={{ minWidth: 110 }}
          >
            {busy ? (
              <>
                <Spinner animation="border" size="sm" className="me-1" aria-hidden="true" />
                Building...
              </>
            ) : (
              `Download ${branding.appName} HTML`
            )}
          </Button>
        </div>
      </Modal.Body>
    </Modal>
  );
}
