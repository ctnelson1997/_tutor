export default function AppFooter() {
  return (
    <footer className="app-footer">
      <span>© 2026</span>
      <a href="https://coletnelson.us" target="_blank" rel="noreferrer" className="app-footer-link">
        Cole Nelson
      </a>
      <span className="app-footer-sep" aria-hidden="true">·</span>
      <a href="https://cs.wisc.edu" target="_blank" rel="noreferrer" className="app-footer-link">
        University of Wisconsin–Madison
      </a>
      <span className="app-footer-sep" aria-hidden="true">·</span>
      <span>GPL-3.0 License</span>
      <span className="app-footer-sep" aria-hidden="true">·</span>
      <span title="Engine version (from package.json)">v{__TUTOR_ENGINE_VERSION__}</span>
      <span className="app-footer-sep" aria-hidden="true">·</span>
      <span>July 31, 2026</span>
    </footer>
  );
}
