import ActionCards from '../components/ActionCards/ActionCards.jsx';
import CompositeCopyrightNotice from '../components/Composite/CompositeCopyrightNotice.jsx';
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
    key: 'upload-homepage',
    imageSrc: '/images/edit-homepage-icon.svg',
    imageAlt: 'Homepage editor icon',
    title: 'Edit Homepage',
    description: 'Update the homepage hero image, header, and description, then store the image through the backend upload flow.',
    buttonText: 'Open Homepage Editor',
    to: '/upload/homepage',
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
  {
    key: 'upload-oral-histories',
    imageSrc: '/images/doug_oral_history_thumbnail.png',
    imageAlt: 'Oral history upload preview',
    title: 'Upload Oral Histories',
    description: 'Prepare oral history interview videos with archive metadata before backend storage is connected.',
    buttonText: 'Open Oral History Upload',
    to: '/upload/oral-histories',
  },
  {
    key: 'upload-scrapbooks',
    imageSrc: '/images/1983ScrapB-P26.jpg',
    imageAlt: 'Scrapbook upload preview',
    title: 'Scrapbook Upload',
    description: 'Upload a scrapbook PDF and let the backend convert it into page images for the public scrapbook viewer.',
    buttonText: 'Open Scrapbook Upload',
    to: '/upload/scrapbooks',
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

      <section className="section compositeCopyrightNoticeSection">
        <div className="container">
          <CompositeCopyrightNotice className="compositeCopyrightNotice--pageFooter" />
        </div>
      </section>
    </>
  );
}
