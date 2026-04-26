import ActionCards from '../components/ActionCards/ActionCards.jsx';
import CompositeCopyrightNotice from '../components/Composite/CompositeCopyrightNotice.jsx';
import { UPLOAD_CARDS } from '../data/uploadCards.js';
import '../styles/composites.css';

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
            Admin Tools
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
