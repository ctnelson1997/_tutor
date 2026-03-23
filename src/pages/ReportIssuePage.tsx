import { Link } from 'react-router-dom';
import AppNavbar from '../components/AppNavbar';
import { branding } from '../config/branding';

const BRAND = branding.brandColor;

export default function ReportIssuePage() {
  return (
    <>
      <AppNavbar />
      <div className="container py-5" style={{ maxWidth: '760px' }}>
        <h1 className="fw-bold mb-1">Report an Issue</h1>
        <p className="text-muted mb-4" style={{ fontSize: '0.92rem' }}>
          Help make <span style={{ color: BRAND, fontWeight: 600 }}>{branding.brandPrefix}</span>{branding.brandSuffix} better —
          bug reports and feature ideas are always welcome.
        </p>

        <section className="mb-4">
          <div
            className="border rounded px-4 py-4 d-flex flex-column align-items-center gap-3 text-center"
            style={{ background: '#f8f9fa' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 16 16" fill={BRAND}>
              <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
            </svg>
            <div>
              <div className="fw-semibold mb-1">All issues are tracked on GitHub</div>
              <div className="text-muted" style={{ fontSize: '0.85rem' }}>
                You'll need a free GitHub account to open a new issue.
              </div>
            </div>
            <a
              href="https://github.com/ctnelson1997/jstutor/issues"
              target="_blank"
              rel="noreferrer"
              className="btn btn-danger px-4"
            >
              Open an Issue on GitHub
            </a>
          </div>
        </section>

        <section className="mb-4">
          <h2 className="mb-3">What Makes a Great Bug Report</h2>
          <div className="d-flex flex-column gap-3">
            {[
              {
                n: 1,
                title: 'Use a clear, specific title',
                body: (
                  <>
                    Instead of <em>"It doesn't work"</em>, try{' '}
                    <em>"Stepping through a for-loop skips the last iteration"</em>.
                    Good titles help others find existing reports and avoid duplicates.
                  </>
                ),
              },
              {
                n: 2,
                title: 'Describe expected vs. actual behavior',
                body: 'What did you expect to happen? What happened instead? The contrast between the two is often the most useful thing you can tell us.',
              },
              {
                n: 3,
                title: 'Include the code you were running',
                body: (
                  <>
                    Paste the snippet from the editor, or click <strong>Share</strong> to
                    generate a link that encodes your code directly in the URL.
                  </>
                ),
              },
              {
                n: 4,
                title: 'List the steps to reproduce',
                body: 'For example: "1. Paste the code, 2. Click Visualize, 3. Step to frame 5 — the variable panel shows the wrong value."',
              },
              {
                n: 5,
                title: 'Note your browser and OS',
                body: 'Some issues only appear in specific browsers. Knowing your environment helps us narrow things down quickly.',
              },
            ].map(({ n, title, body }) => (
              <div key={n} className="d-flex gap-3 align-items-start">
                <div
                  className="fw-bold text-white rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{ width: 32, height: 32, background: BRAND, fontSize: '0.9rem', marginTop: 2 }}
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
          <h2 className="mb-3">Other Ways to Help</h2>
          <div className="d-flex flex-wrap gap-2">
            {[
              {
                icon: '✦',
                label: 'Feature requests',
                desc: 'Describe the behavior you\'d like and why it would be useful.',
              },
              {
                icon: '↔',
                label: 'UI / UX feedback',
                desc: 'Screenshots or screen recordings go a long way for visual issues.',
              },
              {
                icon: '◆',
                label: 'Documentation gaps',
                desc: 'If something was confusing or unclear, let us know what tripped you up.',
              },
            ].map(({ icon, label, desc }) => (
              <div
                key={label}
                className="border rounded px-3 py-2 d-flex align-items-start gap-2"
                style={{ background: '#f8f9fa', fontSize: '0.9rem', flex: '1 1 200px' }}
              >
                <span style={{ color: BRAND, fontSize: '1rem', lineHeight: 1.6, flexShrink: 0 }}>{icon}</span>
                <span className="text-muted"><strong>{label}</strong> — {desc}</span>
              </div>
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
