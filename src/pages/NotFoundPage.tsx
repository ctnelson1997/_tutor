import { Link } from 'react-router-dom';
import AppNavbar from '../components/AppNavbar';
import { branding } from '../config/branding';

export default function NotFoundPage() {
  return (
    <>
      <AppNavbar />
      <div className="container py-5 text-center" style={{ maxWidth: '480px' }}>
        <p style={{ fontSize: '4rem', lineHeight: 1 }} aria-hidden="true">404</p>
        <h1 className="h3 fw-bold mb-2">Page not found</h1>
        <p className="text-muted mb-4">
          The page you're looking for doesn't exist or may have been moved.
        </p>
        <Link to="/" className="btn btn-dark">← Back to {branding.appName}</Link>
      </div>
    </>
  );
}
