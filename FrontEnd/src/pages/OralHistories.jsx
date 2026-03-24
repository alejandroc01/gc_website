import './OralHistories.css';

/**
 * OralHistories
 *
 * Landing page for oral history interviews.
 * The player is intentionally empty for now and uses a poster thumbnail
 * until the first interview file is available.
 */
export default function OralHistories() {
  return (
    <div className="oralHistories">
      <section className="oralHistories__hero section">
        <div className="container oralHistories__heroGrid">
          <div className="oralHistories__intro">
            <p className="oralHistories__eyebrow">German Club Alumni Archives</p>
            <h1 className="oralHistories__title">Oral Histories</h1>
            <p className="oralHistories__lede">
              [ This collection will feature recorded interviews preserving the memories, voices, and
              experiences of German Club alumni across generations ]
            </p>
            <p className="oralHistories__copy">
              IN PROGRESS: The video player is set up below and ready for media. Until the video is
              added, the player displays a thumbnail preview for the featured oral history.
            </p>
          </div>

          <aside className="oralHistories__details" aria-label="Collection overview">
            <div className="oralHistories__detailCard">
              <span className="oralHistories__detailLabel">Featured interview</span>
              <strong className="oralHistories__detailValue">Doug C. Petty Jr.</strong>
            </div>
            <div className="oralHistories__detailCard">
              <span className="oralHistories__detailLabel">Collection</span>
              <strong className="oralHistories__detailValue">Episode 1</strong>
            </div>
          </aside>
        </div>
      </section>

      <section className="oralHistories__feature section">
        <div className="container">
          <div className="oralHistories__panel">
            <div className="oralHistories__panelHeader">
              <div>
                <p className="oralHistories__sectionLabel">Featured Recording</p>
                <h2 className="oralHistories__sectionTitle">E1 - Why Did You Come to Tech?</h2>
              </div>
              <p className="oralHistories__panelNote">Thumbnail only for now. Video file coming soon.</p>
            </div>

            <div className="oralHistories__mediaFrame">
              <video
                className="oralHistories__video"
                controls
                preload="none"
                poster="/images/doug_oral_history_thumbnail.png"
                aria-label="Featured oral history video player"
              >
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
