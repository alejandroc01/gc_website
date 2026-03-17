import ActionCards from '../components/ActionCards/ActionCards.jsx';
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
  {
    key: 'upload-profiles',
    imageSrc: '/images/person-icon.svg',
    imageAlt: 'Member profile upload icon',
    title: 'Member Profile Upload',
    description: 'Import the DA membership CSV on a dedicated page before matching members to composites.',
    buttonText: 'Open Member Upload',
    to: '/upload/profiles',
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
            Choose an upload flow below to begin adding new archive materials.
          </p>
        </div>
      </section>

      <ActionCards cards={UPLOAD_CARDS} ariaLabel="Upload actions" />
    </>
  );
}
