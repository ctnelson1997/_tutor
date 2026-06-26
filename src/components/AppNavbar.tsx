import { useEffect, useRef, useState } from 'react';
import { Navbar, Nav, NavDropdown } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { getEngine, getEngineSync, SUPPORTED_LANGUAGES } from '../engines/registry';
import { useEngine } from '../engines/useEngine';
import { branding } from '../config/branding';
import type { CodeExample, LanguageId } from '../types/engine';

type CategorySubMenuProps = {
  category: string;
  examples: CodeExample[];
  onSelect: (slug: string) => void;
};

function CategorySubMenu({ category, examples, onSelect }: CategorySubMenuProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  // Small delay before closing so users can move from the trigger
  // into the submenu without losing it.
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  useEffect(() => cancelClose, []);

  return (
    <div
      className="dropdown-submenu"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="dropdown-item dropdown-submenu-toggle"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((s) => !s)}
      >
        <span>{category}</span>
        <span className="dropdown-submenu-caret" aria-hidden="true">›</span>
      </button>
      {open && (
        <div className="dropdown-menu dropdown-submenu-menu show">
          {examples.map((ex) => (
            <button
              key={ex.slug}
              type="button"
              className="dropdown-item"
              onClick={() => onSelect(ex.slug)}
            >
              {ex.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppNavbar() {
  const navigate = useNavigate();
  const setCode = useStore((s) => s.setCode);
  const setLanguage = useStore((s) => s.setLanguage);
  const reset = useStore((s) => s.reset);
  const language = useStore((s) => s.language);
  const engine = useEngine(language);
  const [examplesOpen, setExamplesOpen] = useState(false);

  const examples = engine?.examples ?? [];
  const categories = [...new Set(examples.map((e) => e.category))];

  const handleSandbox = () => {
    reset();
    setCode(engine?.sandboxCode ?? '');
    navigate('/');
  };

  const handleLanguageSwitch = async (id: LanguageId) => {
    if (id === language) return;
    const newEngine = await getEngine(id);
    reset();
    setLanguage(id);
    setCode(newEngine.sandboxCode);
    navigate('/');
  };

  const handleSelectExample = (slug: string) => {
    setExamplesOpen(false);
    navigate(`/examples/${slug}`);
  };

  return (
    <Navbar bg="dark" variant="dark" expand="md" className="px-3">
      <Navbar.Brand as={Link} to="/" className="fw-bold">
        <span style={{ color: branding.brandColor }}>{branding.brandPrefix}</span>{branding.brandSuffix}
      </Navbar.Brand>
      <Navbar.Toggle aria-controls="navbar-nav" />
      <Navbar.Collapse id="navbar-nav">
        <Nav className="me-auto">
          <Nav.Link as="button" className="text-start" onClick={handleSandbox}>Sandbox</Nav.Link>
          <NavDropdown
            title="Examples"
            id="nav-examples"
            show={examplesOpen}
            onToggle={(next) => setExamplesOpen(next)}
            autoClose="outside"
          >
            {categories.map((cat) => (
              <CategorySubMenu
                key={cat}
                category={cat}
                examples={examples.filter((e) => e.category === cat)}
                onSelect={handleSelectExample}
              />
            ))}
          </NavDropdown>
          {SUPPORTED_LANGUAGES.length > 1 && (
            <NavDropdown title={engine?.displayName ?? language} id="nav-language">
              {SUPPORTED_LANGUAGES.map((id) => {
                const eng = getEngineSync(id);
                return (
                  <NavDropdown.Item
                    key={id}
                    active={id === language}
                    onClick={() => handleLanguageSwitch(id)}
                  >
                    {eng?.displayName ?? id}
                  </NavDropdown.Item>
                );
              })}
            </NavDropdown>
          )}
        </Nav>
        <Nav>
          <Nav.Link as={Link} to="/about">About</Nav.Link>
          <Nav.Link as={Link} to="/report-issue">Report an Issue</Nav.Link>
          <Nav.Link as={Link} to="/privacy-policy">Privacy Policy</Nav.Link>
        </Nav>
      </Navbar.Collapse>
    </Navbar>
  );
}
