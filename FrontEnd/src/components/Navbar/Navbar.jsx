import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';

import './Navbar.css';

const NAV_ITEMS = [
  { label: 'Archive Home', to: '/' },
  { label: 'Composites', to: '/composites' },
  { label: 'Scrapbooks', to: '/scrapbooks' },
  { label: 'Oral Histories', to: '/oral-histories' },
  { label: 'Written History', to: '/written-history' },
  { label: 'Search', to: '/search' },
  { label: 'Upload', to: '/upload' },
  {label: 'Display', to: '/display-mode'},
];

/**
 * Navbar
 *
 * Requirements implemented:
 * - Left: logo image + title text "German Club of Virginia Tech"
 * - Right: navigation links (Archive Home, Composites, Scrapbooks, Oral Histories, Search)
 * - Auto-hides when scrolling down and reveals when scrolling up
 * - When revealed (scrolling up), shows a thin gold line under the bar + subtle drop shadow
 * - When at the very top of the page, the bar blends into the page (no shadow/line)
 */
export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [atTop, setAtTop] = useState(true);

  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  const location = useLocation();

  // Close the mobile menu when navigating.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY || window.pageYOffset || 0;

      if (ticking.current) return;
      ticking.current = true;

      window.requestAnimationFrame(() => {
        const prevY = lastScrollY.current;
        const delta = currentY - prevY;

        const isAtTop = currentY <= 2;
        setAtTop(isAtTop);

        // At the very top: always show the bar, no shadow/line.
        if (isAtTop) {
          setHidden(false);
          setPinned(false);
          lastScrollY.current = currentY;
          ticking.current = false;
          return;
        }

        // Add a small threshold so tiny scroll movements don't cause jitter.
        const THRESHOLD = 10;

        if (delta > THRESHOLD) {
          // Scrolling down: hide.
          setHidden(true);
          setPinned(false);
        } else if (delta < -THRESHOLD) {
          // Scrolling up: show + pinned styling (gold line + shadow).
          setHidden(false);
          setPinned(true);
        }

        lastScrollY.current = currentY;
        ticking.current = false;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const headerClassName = useMemo(() => {
    const classes = ['navbar'];
    if (hidden) classes.push('navbar--hidden');
    if (pinned) classes.push('navbar--pinned');
    if (atTop) classes.push('navbar--top');
    return classes.join(' ');
  }, [hidden, pinned, atTop]);

  return (
    <header className={headerClassName}>
      <nav className="navbar__inner container" aria-label="Primary">
        <Link to="/" className="navbar__brand" aria-label="German Club Alumni Archives Home">
          <img className="navbar__logo" src="/images/logo.png" alt="German Club logo" />
          <span className="navbar__title">
            German Club<br />of Virginia Tech
          </span>
        </Link>

        {/* Desktop links */}
        <ul className="navbar__links" role="menubar">
          {NAV_ITEMS.map((item) => (
            <li key={item.to} role="none">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                role="menuitem"
                className={({ isActive }) =>
                  ['navbar__link', isActive ? 'navbar__link--active' : ''].join(' ')
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="navbar__hamburger"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((v) => !v)}
        >
          <span className="sr-only">Menu</span>
          <svg width="28" height="18" viewBox="0 0 28 18" fill="currentColor" aria-hidden="true">
            <rect x="0" y="0" width="20" height="2" rx="1" />
            <rect x="0" y="8" width="28" height="2" rx="1" />
            <rect x="8" y="16" width="20" height="2" rx="1" />
          </svg>
        </button>
      </nav>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="navbar__mobile" role="dialog" aria-modal="true" aria-label="Mobile navigation">
          <button
            type="button"
            className="navbar__mobileOverlay"
            aria-label="Close menu overlay"
            onClick={() => setMobileOpen(false)}
          />

          <div className="navbar__mobilePanel">
            <div className="navbar__mobileHeader">
              <span className="navbar__mobileTitle">Menu</span>
              <button
                type="button"
                className="navbar__mobileClose"
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <ul className="navbar__mobileLinks" role="menu">
              {NAV_ITEMS.map((item) => (
                <li key={item.to} role="none">
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    role="menuitem"
                    className={({ isActive }) =>
                      ['navbar__mobileLink', isActive ? 'navbar__mobileLink--active' : ''].join(' ')
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </header>
  );
}
