import { Link } from 'react-router-dom';

import ProfileImportPanel from '../components/ProfileImportPanel/ProfileImportPanel.jsx';
import '../styles/composites.css';

export default function ProfileUploadPage() {
  return (
    <section className="section compositeAdmin">
      <div className="container">
        <div className="compositePageHeader">
          <p className="compositePageHeader__eyebrow">Admin Upload Flow</p>
          <h1 className="compositePageHeader__title">Member Profile Upload</h1>
          <p className="compositePageHeader__description">
            Import the DA membership CSV on its own page, then return to composite annotation once
            the member list is ready.
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
