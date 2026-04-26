import { Link } from 'react-router-dom';

import ProfileImportPanel from '../components/ProfileImportPanel/ProfileImportPanel.jsx';
import '../styles/composites.css';

export default function ProfileUploadPage() {
  return (
    <section className="section compositeAdmin">
      <div className="container">
        <div className="compositePageHeader">
          <p className="compositePageHeader__eyebrow">Admin Upload Flow</p>
          <h1 className="compositePageHeader__title">Manage Member Profiles</h1>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <Link className="button compositeButton" to="/upload">
            Back to Admin Tools
          </Link>
        </div>

        <ProfileImportPanel />
      </div>
    </section>
  );
}
