import { Link } from 'react-router-dom';

import ProfileImportPanel from '../components/ProfileImportPanel/ProfileImportPanel.jsx';
import '../styles/composites.css';

export default function ProfileUploadPage() {
  return (
    <section className="section compositeAdmin">
      <div className="container">
        <div className="compositePageHeader">
          <p className="compositePageHeader__eyebrow">Admin Upload Flow</p>
          <h1 className="compositePageHeader__title">Bulk Upload Member Profiles</h1>
          <p className="compositePageHeader__description">
            Import the DA membership CSV, create individual member records, and manage the
            searchable member directory used throughout composite annotation.
          </p>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <Link className="button compositeButton" to="/upload">
            Back to upload options
          </Link>
        </div>

        <ProfileImportPanel />
      </div>
    </section>
  );
}
