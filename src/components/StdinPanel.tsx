import { useState } from 'react';
import { useStore } from '../store/useStore';

/**
 * Standard-input panel (Java only). The text entered here is fed to
 * `new Scanner(System.in)` when the program runs — the client-side analog of
 * typing into a console. Collapsed by default; auto-expands when input exists.
 */
export default function StdinPanel() {
  const stdin = useStore((s) => s.stdin);
  const setStdin = useStore((s) => s.setStdin);
  const [open, setOpen] = useState(() => stdin.length > 0);

  return (
    <div className="stdin-panel border-top" style={{ flexShrink: 0 }}>
      <button
        type="button"
        className="btn btn-sm w-100 text-start d-flex align-items-center justify-content-between px-2 py-1"
        style={{ borderRadius: 0, fontSize: '0.8rem', color: '#555' }}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>{open ? '▾' : '▸'} Input (stdin) — read by <code>Scanner</code></span>
        {!open && stdin.length > 0 && (
          <span className="badge bg-secondary" style={{ fontSize: '0.65rem' }}>
            {stdin.split('\n').length} line{stdin.split('\n').length === 1 ? '' : 's'}
          </span>
        )}
      </button>
      {open && (
        <textarea
          className="form-control"
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          placeholder="Type input here — each nextInt()/next()/nextLine() reads from this, like typing into a terminal."
          spellCheck={false}
          rows={3}
          style={{
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            borderRadius: 0,
            border: 'none',
            borderTop: '1px solid #eee',
            resize: 'vertical',
          }}
        />
      )}
    </div>
  );
}
