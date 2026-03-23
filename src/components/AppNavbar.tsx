import { Navbar, Nav, NavDropdown } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { getEngine, getEngineSync, SUPPORTED_LANGUAGES } from '../engines/registry';
import { useEngine } from '../engines/useEngine';
import { branding } from '../config/branding';
import type { LanguageId } from '../types/engine';

export default function AppNavbar() {
  const navigate = useNavigate();
  const setCode = useStore((s) => s.setCode);
  const setLanguage = useStore((s) => s.setLanguage);
  const reset = useStore((s) => s.reset);
  const language = useStore((s) => s.language);
  const engine = useEngine(language);

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

  return (
    <Navbar bg="dark" variant="dark" expand="md" className="px-3">
      <Navbar.Brand as={Link} to="/" className="fw-bold">
        <span style={{ color: branding.brandColor }}>{branding.brandPrefix}</span>{branding.brandSuffix}
      </Navbar.Brand>
      <Navbar.Toggle aria-controls="navbar-nav" />
      <Navbar.Collapse id="navbar-nav">
        <Nav className="me-auto">
          <Nav.Link as="button" className="text-start" onClick={handleSandbox}>Sandbox</Nav.Link>
          <NavDropdown title="Examples" id="nav-examples">
            {categories.map((cat, i) => (
              <>
                {i > 0 && <NavDropdown.Divider key={`divider-${cat}`} />}
                <NavDropdown.Header key={`header-${cat}`}>{cat}</NavDropdown.Header>
                {examples.filter((e) => e.category === cat).map((ex) => (
                  <NavDropdown.Item
                    key={ex.slug}
                    onClick={() => navigate(`/examples/${language}/${ex.slug}`)}
                  >
                    {ex.title}
                  </NavDropdown.Item>
                ))}
              </>
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
