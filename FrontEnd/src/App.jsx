import { Routes, Route } from 'react-router-dom';

import Navbar from './components/Navbar/Navbar.jsx';
import Footer from './components/Footer/Footer.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';

import HomePage from './pages/HomePage.jsx';
import PlaceholderPage from './pages/PlaceholderPage.jsx';
import MemberPage from './pages/MemberPage.jsx';
import UploadPage from './pages/UploadPage.jsx';

/**
 * App
 *
 * The top-level layout:
 * - Fixed navbar (auto-hides on scroll down, reveals on scroll up)
 * - Main router outlet (home + placeholder routes)
 * - Footer (matches vtgc.net styling)
 */
export default function App() {
  return (
    <>
      <Navbar />
      <ScrollToTop />

      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/composites" element={<PlaceholderPage title="Composites" />} />
          <Route path="/scrapbooks" element={<PlaceholderPage title="Scrapbooks" />} />
          <Route path="/oral-histories" element={<PlaceholderPage title="Oral Histories" />} />
          <Route path="/search" element={<PlaceholderPage title="Search" />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/upload/composites" element={<PlaceholderPage title="Composite Upload" />} />
          <Route path="/member" element={<MemberPage title="Member" />} />

          {/* Fallback */}
          <Route path="*" element={<PlaceholderPage title="Page Not Found" />} />
        </Routes>
      </main>

      <Footer />
    </>
  );
}
