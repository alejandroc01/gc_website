import { Link, NavLink, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';

import { UPLOAD_CARDS } from '../../data/uploadCards.js';
import { requestFullscreenForElement } from '../../utils/fullscreen.js';
import './Navbar.css';

const UPLOAD_MENU_ITEMS = [
  {
    label: 'Upload Page',
    to: '/upload',
    end: true,
  },
  ...UPLOAD_CARDS.map(({ title, to, end }) => ({
    label: title,
    to,
    end,
  })),
];

const NAV_ITEMS = [
  {
    type: 'link',
    label: 'Archive Home',
    to: '/',
    end: true,
  },
  {
    type: 'link',
    label: 'Search',
    to: '/search',
    end: true,
  },
  {
    type: 'menu',
    key: 'collections',
    label: 'Collections',
    align: 'start',
    items: [
      { label: 'Composites', to: '/composites', end: true },
      { label: 'Scrapbooks', to: '/scrapbooks', end: true },
      { label: 'Oral Histories', to: '/oral-histories', end: true },
      { label: 'Written History', to: '/written-history', end: true },
    ],
  },
  {
    type: 'menu',
    key: 'display',
    label: 'Display',
    align: 'end',
    items: [
      {
        label: 'Slideshow Mode',
        to: '/display-mode?mode=slideshow',
        match: ({ pathname, search }) =>
          pathname === '/display-mode' && getDisplayMode(search) === 'slideshow',
      },
      {
        label: 'Display Mode',
        to: '/display-mode?mode=display',
        match: ({ pathname, search }) =>
          pathname === '/display-mode' && getDisplayMode(search) === 'display',
      },
    ],
  },
  {
    type: 'menu',
    key: 'upload',
    label: 'Upload',
    align: 'end',
    match: ({ pathname }) => pathname === '/upload' || pathname.startsWith('/upload/'),
    items: UPLOAD_MENU_ITEMS,
  },
];

/**
 * Navbar
 *
 * Requirements implemented:
 * - Left: logo image + title text "German Club of Virginia Tech"
 * - Right: navigation links with grouped collection/display/upload dropdowns
 * - Auto-hides when scrolling down and reveals when scrolling up
 * - When revealed (scrolling up), shows a thin gold line under the bar + subtle drop shadow
 * - When at the very top of the page, the bar blends into the page (no shadow/line)
 */
export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [atTop, setAtTop] = useState(true);
  const [openDesktopMenu, setOpenDesktopMenu] = useState(null);
  const [openMobileMenu, setOpenMobileMenu] = useState(null);

  const lastScrollY = useRef(0);
  const ticking = useRef(false);
  const navRef = useRef(null);

  const location = useLocation();

  // Close the mobile menu when navigating.
  useEffect(() => {
    setMobileOpen(false);
    setOpenDesktopMenu(null);
    setOpenMobileMenu(null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!openDesktopMenu) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (navRef.current?.contains(event.target)) {
        return;
      }

      setOpenDesktopMenu(null);
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setOpenDesktopMenu(null);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openDesktopMenu]);

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

  const handleToggleDesktopMenu = (menuKey) => {
    setOpenDesktopMenu((currentMenu) => (currentMenu === menuKey ? null : menuKey));
  };

  const handleToggleMobileDrawer = () => {
    setMobileOpen((currentValue) => {
      const nextValue = !currentValue;

      if (!nextValue) {
        setOpenMobileMenu(null);
      }

      return nextValue;
    });
  };

  const handleCloseMobileDrawer = () => {
    setMobileOpen(false);
    setOpenMobileMenu(null);
  };

  const handleToggleMobileMenu = (menuKey) => {
    setOpenMobileMenu((currentMenu) => (currentMenu === menuKey ? null : menuKey));
  };

  const handleMenuItemClick = (menuKey, item) => {
    if (menuKey === 'display') {
      void requestFullscreenForElement(document.documentElement);
    }

    setOpenDesktopMenu(null);
    setOpenMobileMenu(null);
    setMobileOpen(false);
  };

  return (
    <header className={headerClassName}>
      <nav ref={navRef} className="navbar__inner container" aria-label="Primary">
        <Link to="/" className="navbar__brand" aria-label="German Club Alumni Archives Home">
          <img className="navbar__logo" src="/images/logo.png" alt="German Club logo" />
          <span className="navbar__title">
            German Club<br />of Virginia Tech
          </span>
        </Link>

        {/* Desktop links */}
        <ul className="navbar__links" role="menubar">
          {NAV_ITEMS.map((item) => {
            if (item.type === 'link') {
              return (
                <li key={item.label} role="none">
                  <NavLink
                    to={item.to}
                    end={item.end}
                    role="menuitem"
                    className={({ isActive }) =>
                      ['navbar__link', isActive ? 'navbar__link--active' : ''].join(' ')
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              );
            }

            const isOpen = openDesktopMenu === item.key;
            const isActive = matchesNavGroup(item, location);

            return (
              <li
                key={item.key}
                className={['navbar__menu', isOpen ? 'navbar__menu--open' : ''].join(' ')}
                role="none"
              >
                <button
                  type="button"
                  className={[
                    'navbar__link',
                    'navbar__menuTrigger',
                    isActive ? 'navbar__link--active' : '',
                  ].join(' ')}
                  aria-haspopup="menu"
                  aria-expanded={isOpen ? 'true' : 'false'}
                  role="menuitem"
                  onClick={() => handleToggleDesktopMenu(item.key)}
                >
                  <span>{item.label}</span>
                  <ChevronIcon className="navbar__menuChevron" />
                </button>

                <div
                  className={[
                    'navbar__dropdown',
                    item.align === 'end' ? 'navbar__dropdown--alignEnd' : '',
                    isOpen ? 'navbar__dropdown--open' : '',
                  ].join(' ')}
                  role="menu"
                  aria-label={item.label}
                >
                  {item.items.map((menuItem) => (
                    <Link
                      key={menuItem.to}
                      to={menuItem.to}
                      role="menuitem"
                      className={[
                        'navbar__dropdownLink',
                        matchesNavItem(menuItem, location) ? 'navbar__dropdownLink--active' : '',
                      ].join(' ')}
                      onClick={() => handleMenuItemClick(item.key, menuItem)}
                    >
                      {menuItem.label}
                    </Link>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>

        {/* Mobile hamburger */}
        <button
          type="button"
          className="navbar__hamburger"
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileOpen}
          onClick={handleToggleMobileDrawer}
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
            onClick={handleCloseMobileDrawer}
          />

          <div className="navbar__mobilePanel">
            <div className="navbar__mobileHeader">
              <span className="navbar__mobileTitle">Menu</span>
              <button
                type="button"
                className="navbar__mobileClose"
                aria-label="Close menu"
                onClick={handleCloseMobileDrawer}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <ul className="navbar__mobileLinks" role="menu">
              {NAV_ITEMS.map((item) => {
                if (item.type === 'link') {
                  return (
                    <li key={item.label} role="none">
                      <NavLink
                        to={item.to}
                        end={item.end}
                        role="menuitem"
                        className={({ isActive }) =>
                          ['navbar__mobileLink', isActive ? 'navbar__mobileLink--active' : ''].join(' ')
                        }
                      >
                        {item.label}
                      </NavLink>
                    </li>
                  );
                }

                const isOpen = openMobileMenu === item.key;
                const isActive = matchesNavGroup(item, location);

                return (
                  <li key={item.key} role="none" className="navbar__mobileSection">
                    <button
                      type="button"
                      className={[
                        'navbar__mobileLink',
                        'navbar__mobileToggle',
                        isActive ? 'navbar__mobileLink--active' : '',
                      ].join(' ')}
                      aria-expanded={isOpen ? 'true' : 'false'}
                      onClick={() => handleToggleMobileMenu(item.key)}
                    >
                      <span>{item.label}</span>
                      <ChevronIcon className="navbar__mobileChevron" />
                    </button>

                    <div
                      className={[
                        'navbar__mobileSubmenu',
                        isOpen ? 'navbar__mobileSubmenu--open' : '',
                      ].join(' ')}
                    >
                      {item.items.map((menuItem) => (
                        <Link
                          key={menuItem.to}
                          to={menuItem.to}
                          role="menuitem"
                          className={[
                            'navbar__mobileSubmenuLink',
                            matchesNavItem(menuItem, location) ? 'navbar__mobileSubmenuLink--active' : '',
                          ].join(' ')}
                          onClick={() => handleMenuItemClick(item.key, menuItem)}
                        >
                          {menuItem.label}
                        </Link>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </header>
  );
}

function matchesNavItem(item, location) {
  if (typeof item.match === 'function') {
    return item.match(location);
  }

  if (!item.to) {
    return false;
  }

  if (item.end === false) {
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
  }

  return location.pathname === item.to;
}

function matchesNavGroup(item, location) {
  if (typeof item.match === 'function') {
    return item.match(location);
  }

  if (!Array.isArray(item.items)) {
    return false;
  }

  return item.items.some((menuItem) => matchesNavItem(menuItem, location));
}

function getDisplayMode(search) {
  const params = new URLSearchParams(search);
  return params.get('mode') === 'display' ? 'display' : 'slideshow';
}

function ChevronIcon({ className }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        d="M3 5.25L7 9.25L11 5.25"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
