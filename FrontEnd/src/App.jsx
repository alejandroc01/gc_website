import { Routes, Route } from 'react-router-dom';

import Navbar from './components/Navbar/Navbar.jsx';
import Footer from './components/Footer/Footer.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';

import HomePage from './pages/HomePage.jsx';
import PlaceholderPage from './pages/PlaceholderPage.jsx';
import MemberPage from './pages/MemberPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import CompositeUploadPage from './pages/CompositeUploadPage.jsx';
import CompositeEditorPage from './pages/CompositeEditorPage.jsx';
import ProfileUploadPage from './pages/ProfileUploadPage.jsx';
import DisplayModePage from './pages/DisplayModePage.jsx';
import OralHistories from './pages/OralHistories.jsx';
import ScrapbooksPage from './pages/ScrapbooksPage.jsx';

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
          <Route path="/scrapbooks" element={<ScrapbooksPage />} />
          <Route path="/oral-histories" element={<OralHistories />} />
          <Route path="/search" element={<PlaceholderPage title="Search" />} />
          <Route path="/display-mode" element={<DisplayModePage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/upload/composites" element={<CompositeUploadPage />} />
          <Route path="/upload/profiles" element={<ProfileUploadPage />} />
          <Route path="/upload/composites/:compositeId" element={<CompositeEditorPage />} />
          <Route path="/member" element={<MemberPage />} />
          <Route path="/member/:profileId" element={<MemberPage />} />

          {/* Fallback */}
          <Route path="*" element={<PlaceholderPage title="Page Not Found" />} />
        </Routes>
      </main>

      <Footer />
    </>
  );
}
