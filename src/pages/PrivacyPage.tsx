import { Link } from 'react-router-dom';
import AppNavbar from '../components/AppNavbar';
import { branding } from '../config/branding';

const BRAND = branding.brandColor;

export default function PrivacyPage() {
  return (
    <>
      <AppNavbar />
      <div className="container py-5" style={{ maxWidth: '760px' }}>
        <h1 className="fw-bold mb-1">Privacy Policy</h1>
        <p className="text-muted mb-4" style={{ fontSize: '0.875rem' }}>Last updated: March 19, 2026</p>

        <section className="mb-4">
          <div
            className="border rounded px-4 py-4 d-flex align-items-start gap-3"
            style={{ background: '#f8f9fa' }}
          >
            <span style={{ fontSize: '1.4rem', lineHeight: 1, marginTop: 2 }}>🔒</span>
            <div>
              <div className="fw-semibold mb-1">The short version</div>
              <div className="text-muted" style={{ fontSize: '0.92rem' }}>
                <span style={{ color: BRAND, fontWeight: 600 }}>{branding.brandPrefix}</span>{branding.brandSuffix} runs entirely in your
                browser. Your code never leaves your device, we don't require an account, and we
                don't sell or share any data.
              </div>
            </div>
          </div>
        </section>

        <section className="mb-4">
          <h2 className="mb-3">What We Collect (and Don't)</h2>
          <div className="d-flex flex-column gap-3">
            {[
              {
                icon: '✦',
                label: 'Personal information',
                desc: `None. ${branding.appName} does not collect, store, or transmit any personal information.`,
              },
              {
                icon: '◆',
                label: 'Your code',
                desc: 'Never sent to a server. Code is executed locally inside a sandboxed Web Worker and stays on your device.',
              },
              {
                icon: '↔',
                label: 'Cookies & local storage',
                desc: (
                  <>
                    Only <code>localStorage</code> for a small number of preferences (such as dismissing
                    notices). No tracking cookies or third-party cookies are used.
                  </>
                ),
              },
              {
                icon: '⬡',
                label: 'Analytics',
                desc: `${branding.appName} may use a third-party analytics service to collect anonymous, aggregate usage data such as page views and general traffic patterns. No personally identifiable information is intentionally collected. You can opt out via your browser's privacy settings or an ad blocker.`,
              },
            ].map(({ icon, label, desc }) => (
              <div key={label} className="d-flex gap-3 align-items-start">
                <span
                  className="d-flex align-items-center justify-content-center flex-shrink-0 fw-bold rounded-circle"
                  style={{ width: 32, height: 32, background: BRAND, color: '#fff', fontSize: '0.85rem', marginTop: 2 }}
                >
                  {icon}
                </span>
                <div>
                  <div className="fw-semibold">{label}</div>
                  <div className="text-muted" style={{ fontSize: '0.92rem' }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-4">
          <h2 className="mb-3">Sharing & Links</h2>
          <div
            className="border rounded px-4 py-3 d-flex align-items-start gap-3"
            style={{ background: '#f8f9fa' }}
          >
            <span style={{ color: BRAND, fontSize: '1rem', lineHeight: 1.6, flexShrink: 0 }}>🔗</span>
            <span className="text-muted" style={{ fontSize: '0.92rem' }}>
              When you use the <strong>Share</strong> feature, your code is compressed and embedded
              directly in the URL. No server stores this data. Anyone with the link can view and run
              the encoded code, so only share links you are comfortable making accessible.
            </span>
          </div>
        </section>

        <section className="mb-4">
          <h2 className="mb-3">Third-Party Services</h2>
          <div className="d-flex flex-wrap gap-2">
            {[
              {
                label: 'GitHub Pages',
                desc: 'Hosts the site — your browser interacts with GitHub\'s infrastructure when loading the page.',
                href: 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement',
                linkText: 'GitHub Privacy Statement',
              },
              {
                label: 'cdnjs / npm CDNs',
                desc: 'May serve third-party libraries. These CDN providers may log standard request data (IP, user agent).',
              },
            ].map(({ label, desc, href, linkText }) => (
              <div
                key={label}
                className="border rounded px-3 py-2 d-flex flex-column"
                style={{ background: '#f8f9fa', fontSize: '0.9rem', flex: '1 1 280px' }}
              >
                <span className="fw-semibold" style={{ color: BRAND }}>{label}</span>
                <span className="text-muted">
                  {desc}
                  {href && (
                    <>
                      {' '}See{' '}
                      <a href={href} target="_blank" rel="noreferrer">{linkText}</a>.
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-4">
          <h2 className="mb-3">Contact</h2>
          <p className="text-muted" style={{ fontSize: '0.92rem' }}>
            Questions about this policy? Reach the developer at{' '}
            <a href="https://coletnelson.us" target="_blank" rel="noreferrer">coletnelson.us</a>.
          </p>
        </section>

        <div className="text-muted" style={{ fontSize: '0.875rem' }}>
          <Link to="/">← Back to Sandbox</Link>
        </div>
      </div>
    </>
  );
}
