import React, { useState, useEffect } from 'react';
import { Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { runCode } from '../engine/executor';
import { encodeShareCode } from '../utils/share';
import { branding } from '../config/branding';

const iconStyle = { width: 14, height: 14, fill: 'currentColor', verticalAlign: '-2px' } as const;

function IconSkipStart(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style={iconStyle} {...props}>
      <path d="M4 4a.5.5 0 0 1 1 0v3.248l6.267-3.636A.5.5 0 0 1 12 4.118v7.764a.5.5 0 0 1-.733.443L5 8.752V12a.5.5 0 0 1-1 0V4z" />
    </svg>
  );
}

function IconStepBack(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style={iconStyle} {...props}>
      <path d="M3.86 8.753l5.482 4.796c.646.566 1.658.106 1.658-.753V3.204a1 1 0 0 0-1.659-.753l-5.48 4.796a1 1 0 0 0 0 1.506z" />
    </svg>
  );
}

function IconStepForward(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style={iconStyle} {...props}>
      <path d="M12.14 8.753l-5.482 4.796c-.646.566-1.658.106-1.658-.753V3.204a1 1 0 0 1 1.659-.753l5.48 4.796a1 1 0 0 1 0 1.506z" />
    </svg>
  );
}

function IconSkipEnd(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style={iconStyle} {...props}>
      <path d="M12 4a.5.5 0 0 0-1 0v3.248L4.733 3.612A.5.5 0 0 0 4 4.118v7.764a.5.5 0 0 0 .733.443L11 8.752V12a.5.5 0 0 0 1 0V4z" />
    </svg>
  );
}

export default function ControlBar({ embed = false }: { embed?: boolean }) {
  const location = useLocation();
  const openInJSTutorUrl = embed
    ? `${window.location.origin}${window.location.pathname}#${location.pathname.replace('/embed/', '/share/')}`
    : '';
  const code = useStore((s) => s.code);
  const snapshots = useStore((s) => s.snapshots);
  const currentStep = useStore((s) => s.currentStep);
  const isRunning = useStore((s) => s.isRunning);
  const setCurrentStep = useStore((s) => s.setCurrentStep);
  const stepForward = useStore((s) => s.stepForward);
  const stepBackward = useStore((s) => s.stepBackward);
  const stepFirst = useStore((s) => s.stepFirst);
  const stepLast = useStore((s) => s.stepLast);
  const reset = useStore((s) => s.reset);

  const [shareUrl, setShareUrl] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const [embedSnippet, setEmbedSnippet] = useState('');
  const [showEmbedModal, setShowEmbedModal] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);

  const total = snapshots.length;
  const hasSteps = total > 0;

  const handleVisualize = async () => {
    if (hasSteps) {
      // Stop visualization — clear snapshots
      reset();
    } else {
      await runCode(code);
    }
  };

  const hideFunctions = useStore((s) => s.hideFunctions);

  const language = useStore((s) => s.language);

  const handleShare = () => {
    const encoded = encodeShareCode(code);
    const opts = hideFunctions ? '?hf=1' : '';
    const url = `${window.location.origin}${window.location.pathname}#/share/${language}/${encoded}${opts}`;
    setShareUrl(url);
    setCopied(false);
    setShowShareModal(true);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleShare();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.getElementById('share-url-input') as HTMLInputElement | null;
      input?.select();
    }
  };

  const handleEmbed = () => {
    const encoded = encodeShareCode(code);
    const opts = hideFunctions ? '?hf=1' : '';
    const embedUrl = `${window.location.origin}${window.location.pathname}#/embed/${language}/${encoded}${opts}`;
    const lines = code.split('\n').length;
    const height = Math.min(900, Math.max(400, lines * 22 + 280));
    const maxWidth = Math.min(1200, height * 2);
    const snippet = `<div style="resize: both; overflow: auto; width: min(100%, ${maxWidth}px); height: ${height}px;">\n  <iframe\n    src="${embedUrl}"\n    style="width: 100%; height: 100%; border: 1px solid #dee2e6; border-radius: 4px; display: block;"\n  ></iframe>\n</div>`;
    setEmbedSnippet(snippet);
    setEmbedCopied(false);
    setShowEmbedModal(true);
  };

  const handleEmbedCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedSnippet);
      setEmbedCopied(true);
      setTimeout(() => setEmbedCopied(false), 2000);
    } catch {
      const ta = document.getElementById('embed-snippet-input') as HTMLTextAreaElement | null;
      ta?.select();
    }
  };

  return (
    <div className="control-bar px-2">
      <div className="d-flex align-items-center gap-2 mb-1">
        <Button
          variant={hasSteps ? 'danger' : 'success'}
          size="sm"
          onClick={handleVisualize}
          disabled={isRunning || !code.trim()}
        >
          {isRunning ? (
            <>
              <Spinner animation="border" size="sm" className="me-1" aria-hidden="true" />
              Running...
            </>
          ) : hasSteps ? (
            'Stop Visualization'
          ) : (
            'Visualize'
          )}
        </Button>
        {hasSteps && (
          <>
            <div className="vr" />
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={stepFirst}
              disabled={currentStep === 0}
              aria-label="First step"
            >
              <IconSkipStart aria-hidden="true" />
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={stepBackward}
              disabled={currentStep === 0}
              aria-label="Previous step (left arrow key)"
            >
              <IconStepBack aria-hidden="true" />
            </Button>
            <span className="text-muted" style={{ fontSize: '0.85rem', minWidth: '100px', textAlign: 'center' }} aria-live="polite" aria-atomic="true">
              Step {currentStep + 1} of {total}
            </span>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={stepForward}
              disabled={currentStep === total - 1}
              aria-label="Next step (right arrow key)"
            >
              <IconStepForward aria-hidden="true" />
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={stepLast}
              disabled={currentStep === total - 1}
              aria-label="Last step"
            >
              <IconSkipEnd aria-hidden="true" />
            </Button>
          </>
        )}
        <div className="vr" />
        {embed ? (
          <a
            href={openInJSTutorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-outline-primary"
          >
            Edit in {branding.appName} ↗
          </a>
        ) : (
          <>
            <Button variant="outline-secondary" size="sm" onClick={handleShare} title="Copy share link">
              Share
            </Button>
            <Button variant="outline-secondary" size="sm" onClick={handleEmbed} title="Embed this snippet">
              Embed
            </Button>
          </>
        )}
      </div>
      {hasSteps && (
        <Form.Range
          className="step-slider"
          min={0}
          max={total - 1}
          value={currentStep}
          onChange={(e) => setCurrentStep(Number(e.target.value))}
          aria-label="Execution step"
          aria-valuetext={`Step ${currentStep + 1} of ${total}`}
        />
      )}

      <Modal show={showShareModal} onHide={() => setShowShareModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem' }}>Share this snippet</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted mb-3" style={{ fontSize: '0.875rem' }}>
            Anyone with this link can view and step through your code. Paste it into a browser to open it in {branding.appName}.
          </p>
          <div className="d-flex gap-2">
            <Form.Control
              id="share-url-input"
              type="text"
              readOnly
              value={shareUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}
            />
            <Button
              variant={copied ? 'success' : 'outline-primary'}
              size="sm"
              onClick={handleCopy}
              style={{ whiteSpace: 'nowrap', minWidth: '80px' }}
            >
              {copied ? 'Copied!' : 'Copy link'}
            </Button>
          </div>
        </Modal.Body>
      </Modal>

      <Modal show={showEmbedModal} onHide={() => setShowEmbedModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: '1rem' }}>Embed this snippet</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted mb-2" style={{ fontSize: '0.875rem' }}>
            Paste this HTML into any webpage to embed an interactive visualization of your code.
            Viewers will see the editor and can step through execution — no sign-in required.
          </p>
          <Form.Control
            id="embed-snippet-input"
            as="textarea"
            readOnly
            rows={5}
            value={embedSnippet}
            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            style={{ fontSize: '0.78rem', fontFamily: 'monospace', resize: 'none' }}
          />
          <div className="d-flex justify-content-end mt-2">
            <Button
              variant={embedCopied ? 'success' : 'outline-primary'}
              size="sm"
              onClick={handleEmbedCopy}
              style={{ minWidth: '100px' }}
            >
              {embedCopied ? 'Copied!' : 'Copy snippet'}
            </Button>
          </div>
        </Modal.Body>
      </Modal>
    </div>
  );
}
