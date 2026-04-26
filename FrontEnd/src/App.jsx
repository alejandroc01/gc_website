import { Routes, Route } from 'react-router-dom';

import Navbar from './components/Navbar/Navbar.jsx';
import Footer from './components/Footer/Footer.jsx';
import ScrollToTop from './components/ScrollToTop.jsx';
import AdminAuthGate from './components/AdminAuth/AdminAuthGate.jsx';

import HomePage from './pages/HomePage.jsx';
import PlaceholderPage from './pages/PlaceholderPage.jsx';
import MemberPage from './pages/MemberPage.jsx';
import UploadPage from './pages/UploadPage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import CompositesPage from './pages/CompositesPage.jsx';
import CompositeUploadPage from './pages/CompositeUploadPage.jsx';
import CompositeEditorPage from './pages/CompositeEditorPage.jsx';
import ProfileUploadPage from './pages/ProfileUploadPage.jsx';
import DisplayModePage from './pages/DisplayModePage.jsx';
import OralHistories from './pages/OralHistories.jsx';
import OralHistoryUploadPage from './pages/OralHistoryUploadPage.jsx';
import HomepageUploadPage from './pages/HomepageUploadPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';
import HistoryUploadPage from './pages/HistoryUploadPage.jsx';
import ScrapbookUploadPage from './pages/ScrapbookUploadPage.jsx';
import ScrapbooksPage from './pages/ScrapbooksPage.jsx';
import AdminAccountsPage from './pages/AdminAccountsPage.jsx';

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
          <Route path="/composites" element={<CompositesPage />} />
          <Route path="/scrapbooks" element={<ScrapbooksPage />} />
          <Route path="/oral-histories" element={<OralHistories />} />
          <Route path="/written-history" element={<HistoryPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/display-mode" element={<DisplayModePage />} />
          <Route path="/upload" element={<AdminRoute><UploadPage /></AdminRoute>} />
          <Route path="/upload/admins" element={<AdminRoute><AdminAccountsPage /></AdminRoute>} />
          <Route path="/upload/composites" element={<AdminRoute><CompositeUploadPage /></AdminRoute>} />
          <Route path="/upload/profiles" element={<AdminRoute><ProfileUploadPage /></AdminRoute>} />
          <Route path="/upload/homepage" element={<AdminRoute><HomepageUploadPage /></AdminRoute>} />
          <Route path="/upload/oral-histories" element={<AdminRoute><OralHistoryUploadPage /></AdminRoute>} />
          <Route path="/upload/written-history" element={<AdminRoute><HistoryUploadPage /></AdminRoute>} />
          <Route path="/upload/scrapbooks" element={<AdminRoute><ScrapbookUploadPage /></AdminRoute>} />
          <Route path="/upload/composites/:compositeId" element={<AdminRoute><CompositeEditorPage /></AdminRoute>} />
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

function AdminRoute({ children }) {
  return <AdminAuthGate>{children}</AdminAuthGate>;
}
