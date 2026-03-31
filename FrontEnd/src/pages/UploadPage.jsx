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
    title: 'Manage Member Profiles',
    description: 'Import the DA membership CSV, create member records, and manage profiles before matching them to composites.',
    buttonText: 'Open Member Profiles',
    to: '/upload/profiles',
  },
  {
    key: 'upload-history',
    imageSrc: '/images/homepageimage.jpg',
    imageAlt: 'History document upload preview',
    title: 'Upload History PDF',
    description: 'Prepare a history document PDF with its key, name, and description for future archive storage.',
    buttonText: 'Open History Upload',
    to: '/upload/history',
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
