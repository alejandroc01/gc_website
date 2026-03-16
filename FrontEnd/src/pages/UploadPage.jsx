import ActionCards from '../components/ActionCards/ActionCards.jsx';
import ProfileImportPanel from '../components/ProfileImportPanel/ProfileImportPanel.jsx';
import '../styles/composites.css';

const UPLOAD_CARDS = [
  {
    key: 'upload-composites',
    imageSrc: '/images/2025.jpeg',
    imageAlt: 'Composite upload preview',
    title: 'Composite Upload',
    description: 'Start the upload flow for new class composites and related archive materials.',
    buttonText: 'Open Composite Upload',
    to: '/upload/composites',
  },
];

export default function UploadPage() {
  return (
    <>
      <section className="section">
        <div className="container">
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(2rem, 3vw, 3rem)',
              margin: '0 0 12px',
            }}
          >
            Upload
          </h1>
          <p style={{ margin: 0, color: 'var(--muted)', maxWidth: 720 }}>
            Choose an archive type below to begin adding new materials.
          </p>

          <div style={{ marginTop: '28px' }}>
            <ProfileImportPanel />
          </div>
        </div>
      </section>

      <ActionCards cards={UPLOAD_CARDS} ariaLabel="Upload actions" />
    </>
  );
}
