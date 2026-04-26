import { Link } from 'react-router-dom';

import './Footer.css';

/**
 * Footer
 *
 * Matches the structure/content of the original vtgc.net footer (see footerexample.png).
 *
 * Notes:
 * - Uses external links to vtgc.net for the Manor/German Club navigation.
 * - The background uses a purple gradient and an optional grain texture image.
 */
export default function Footer() {
  return (
    <footer className="footer" aria-label="Site footer">
      <div className="container footer__grid">
        <div className="footer__col footer__left">
          <h3 className="footer__heading">Manor &amp; Events</h3>
          <div className="footer__rule" aria-hidden="true" />
          <ul className="footer__list">
            <li>
              <a className="footer__link" href="https://vtgc.net/manor">
                Manor
              </a>
            </li>
            <li>
              <a className="footer__link" href="https://vtgc.net/manor/weddings">
                Weddings
              </a>
            </li>
            <li>
              <a className="footer__link" href="https://vtgc.net/manor/banquets">
                Banquets
              </a>
            </li>
            <li>
              <a className="footer__link" href="https://vtgc.net/manor/business-meetings">
                Business Meetings
              </a>
            </li>
          </ul>
        </div>

        <div className="footer__col footer__center">
          <a href="https://vtgc.net/" aria-label="German Club main site">
            <img className="footer__logo" src="/images/logo.png" alt="German Club Logo" />
          </a>

          <div className="footer__address">
            <p>German Club Alumni Foundation</p>
            <p>711 Southgate Drive</p>
            <p>Blacksburg, VA 24060</p>
          </div>
        </div>

        <div className="footer__col footer__right">
          <h3 className="footer__heading">German Club &amp; Alumni</h3>
          <div className="footer__rule" aria-hidden="true" />
          <ul className="footer__list">
            <li>
              <a className="footer__link" href="https://vtgc.net/german-club">
                German Club
              </a>
            </li>
            <li>
              <a className="footer__link" href="https://vtgc.net/german-club/alumni">
                Alumni
              </a>
            </li>
            <li>
              <a className="footer__link" href="https://vtgc.net/german-club/alumni/guest-house">
                Guest House
              </a>
            </li>
            <li>
              <a className="footer__link" href="https://vtgc.net/german-club/recent-news">
                Latest News
              </a>
            </li>
            <li>
              <Link className="footer__link" to="/upload">
                Admin Tools
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="footer__copyright">
        <p>© 2026 German Club Alumni Foundation, Inc. All Rights Reserved.</p>
      </div>
    </footer>
  );
}
