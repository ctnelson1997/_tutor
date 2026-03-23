import 'bootstrap/dist/css/bootstrap.min.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { getEngine } from './engines/registry';
import { branding } from './config/branding';
import App from './App';
import ShareWarningPage from './pages/ShareWarningPage';
import ExamplePage from './pages/ExamplePage';
import EmbedPage from './pages/EmbedPage';
import AboutPage from './pages/AboutPage';
import PrivacyPage from './pages/PrivacyPage';
import NotFoundPage from './pages/NotFoundPage';
import ReportIssuePage from './pages/ReportIssuePage';
import AppFooter from './components/AppFooter';

// Eagerly load the target engine so getEngineSync() is available immediately
getEngine(branding.languageId);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/examples/:slug" element={<ExamplePage />} />
        <Route path="/examples/:lang/:slug" element={<ExamplePage />} />
        <Route path="/embed/:encoded" element={<EmbedPage />} />
        <Route path="/embed/:lang/:encoded" element={<EmbedPage />} />
        <Route path="/share/:encoded" element={<ShareWarningPage />} />
        <Route path="/share/:lang/:encoded" element={<ShareWarningPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/privacy-policy" element={<PrivacyPage />} />
        <Route path="/report-issue" element={<ReportIssuePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <AppFooter />
    </HashRouter>
  </StrictMode>,
);
