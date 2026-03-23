import { Link } from 'react-router-dom';
import AppNavbar from '../components/AppNavbar';
import { branding } from '../config/branding';

export default function AboutPage() {
  return (
    <>
      <AppNavbar />
      <div className="container py-5" style={{ maxWidth: '760px' }}>
        <h1 className="fw-bold mb-1">
          <span style={{ color: branding.brandColor }}>{branding.brandPrefix}</span>{branding.brandSuffix}
        </h1>
        <p className="text-muted mb-4">Authored by <a target='_blank' href='https://coletnelson.us'>Cole Nelson</a> of the <a target='_blank' href='https://www.cs.wisc.edu/'>University of Wisconsin-Madison</a></p>

        <section className="mb-4">
          <h2>What is {branding.appName}?</h2>
          <p>
            {branding.appName} is a browser-based tool that helps you understand how {branding.languageDisplayName} code executes
            step by step. Write a snippet of {branding.languageDisplayName}, press <strong>Visualize</strong> (or{' '}
            <kbd>Shift+Enter</kbd>), and then step through each line to see exactly what happens to
            the call stack, local variables, heap objects, and console output at every moment in
            time.
          </p>
          <p>
            It's designed for students learning programming, developers debugging tricky code, and
            anyone who wants a clearer mental model of how {branding.languageDisplayName} actually works under the hood.
          </p>
        </section>

        <section className="mb-4">
          <h2 className="mb-3">How to Use It</h2>
          <div className="d-flex flex-column gap-3">
            {[
              {
                n: 1,
                title: 'Write or load code',
                body: <>Type {branding.languageDisplayName} in the editor, or pick an example from the <strong>Examples</strong> menu in the navbar.</>,
              },
              {
                n: 2,
                title: 'Visualize',
                body: <>Click <strong>Visualize</strong> in the toolbar or press <kbd>Shift+Enter</kbd> from anywhere on the page.</>,
              },
              {
                n: 3,
                title: 'Step through execution',
                body: <>Use <strong>Previous</strong> / <strong>Next</strong> in the toolbar, or press <kbd>←</kbd> / <kbd>→</kbd> to move one step at a time.</>,
              },
              {
                n: 4,
                title: 'Inspect the visualization',
                body: (
                  <>
                    The panels update at every step:
                    <div className="d-flex flex-wrap gap-2 mt-2">
                      {[
                        { label: 'Call Stack', desc: 'active frames & block scopes with live variable values' },
                        { label: 'Heap', desc: 'objects & arrays in memory, with pointer arrows' },
                        { label: 'Console', desc: 'output from print calls' },
                      ].map(({ label, desc }) => (
                        <div key={label} className="border rounded px-3 py-2 flex-fill" style={{ minWidth: '180px', background: '#f8f9fa' }}>
                          <div className="fw-semibold" style={{ fontSize: '0.85rem' }}>{label}</div>
                          <div className="text-muted" style={{ fontSize: '0.8rem' }}>{desc}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ),
              },
              {
                n: 5,
                title: 'Share',
                body: <>Click <strong>Share</strong> to copy a link that encodes your code in the URL — no account required.</>,
              },
            ].map(({ n, title, body }) => (
              <div key={n} className="d-flex gap-3 align-items-start">
                <div
                  className="fw-bold text-white rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{ width: 32, height: 32, background: branding.brandColor, fontSize: '0.9rem', marginTop: 2 }}
                >
                  {n}
                </div>
                <div>
                  <div className="fw-semibold">{title}</div>
                  <div className="text-muted" style={{ fontSize: '0.92rem' }}>{body}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-4">
          <h2 className="mb-3">Tips</h2>
          <div className="d-flex flex-wrap gap-2">
            {[
              { icon: '↔', text: <>Drag the divider between panels to resize the editor and visualization.</> },
              { icon: '✦', text: <>Changed variable values <strong>flash yellow</strong> so you can spot what just updated.</> },
              { icon: '◆', text: <><code>if</code>/<code>else</code> conditions show a <strong>true</strong> or <strong>false</strong> badge in the editor at the relevant line.</> },
              { icon: '⬡', text: <>The <strong>Sandbox</strong> is a blank editor — great for experimenting with any snippet of your own.</> },
            ].map(({ icon, text }, i) => (
              <div
                key={i}
                className="border rounded px-3 py-2 d-flex align-items-start gap-2"
                style={{ background: '#f8f9fa', fontSize: '0.9rem', flex: '1 1 260px' }}
              >
                <span style={{ color: branding.brandColor, fontSize: '1rem', lineHeight: 1.6, flexShrink: 0 }}>{icon}</span>
                <span className="text-muted">{text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-4">
          <h2 className="mb-3">Technical Notes</h2>
          <div
            className="border rounded px-4 py-3 mb-3 d-flex align-items-start gap-3"
            style={{ background: '#f8f9fa' }}
          >
            <span style={{ fontSize: '1.4rem', lineHeight: 1, marginTop: 2 }}>🔒</span>
            <span className="text-muted" style={{ fontSize: '0.92rem' }}>
              Runs entirely in your browser — no account, no server, no data collection.
              Code executes inside a sandboxed <strong>Web Worker</strong> and never leaves your machine.
            </span>
          </div>
          <p className="fw-semibold mb-2" style={{ fontSize: '0.9rem' }}>Built with</p>
          <div className="d-flex flex-wrap gap-2">
            {[
              { href: 'https://react.dev', label: 'React', desc: 'UI framework' },
              { href: 'https://www.typescriptlang.org', label: 'TypeScript', desc: 'type-safe JS' },
              { href: 'https://vite.dev', label: 'Vite', desc: 'build tooling' },
              { href: 'https://react-bootstrap.github.io', label: 'React Bootstrap', desc: 'UI components' },
              { href: 'https://codemirror.net', label: 'CodeMirror 6', desc: 'code editor' },
              { href: 'https://zustand.docs.pmnd.rs', label: 'Zustand', desc: 'state management' },
              { href: 'https://reactrouter.com', label: 'React Router', desc: 'client-side routing' },
              { href: 'https://github.com/pieroxy/lz-string', label: 'lz-string', desc: 'URL compression' },
            ].map(({ href, label, desc }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="border rounded px-3 py-2 text-decoration-none"
                style={{ background: '#f8f9fa', flex: '0 0 auto' }}
              >
                <span className="fw-semibold" style={{ fontSize: '0.85rem', color: branding.brandColor }}>{label}</span>
                <span className="text-muted ms-2" style={{ fontSize: '0.8rem' }}>{desc}</span>
              </a>
            ))}
          </div>
        </section>

        <div className="text-muted" style={{ fontSize: '0.875rem' }}>
          <Link to="/">← Back to Sandbox</Link>
        </div>
      </div>
    </>
  );
}
