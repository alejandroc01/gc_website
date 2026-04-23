import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getHistories } from '../api/composites.js';
import './HistoryPage.css';

const PDF_VIEWER_OPTIONS = '#toolbar=0&navpanes=0&scrollbar=0';

export default function HistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeDocument, setActiveDocument] = useState(null);
  const [historyDocuments, setHistoryDocuments] = useState([]);
  const [isLoadingHistories, setIsLoadingHistories] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');

  useEffect(() => {
    setSearchQuery(searchParams.get('q') || '');
  }, [searchParams]);

  useEffect(() => {
    let isActive = true;

    const loadHistoryDocuments = async () => {
      setIsLoadingHistories(true);
      setLoadError('');

      try {
        const loadedHistories = await getHistories();

        if (!isActive) {
          return;
        }

        setHistoryDocuments(normalizeHistories(loadedHistories));
      } catch (error) {
        if (isActive) {
          setLoadError(error.message);
        }
      } finally {
        if (isActive) {
          setIsLoadingHistories(false);
        }
      }
    };

    loadHistoryDocuments();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!activeDocument) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setActiveDocument(null);
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeDocument]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredHistoryDocuments = useMemo(() => {
    if (!normalizedSearchQuery) {
      return historyDocuments;
    }

    return historyDocuments.filter((document) =>
      document.title.toLowerCase().includes(normalizedSearchQuery));
  }, [historyDocuments, normalizedSearchQuery]);

  const handleSearchChange = (event) => {
    const nextQuery = event.target.value;
    setSearchQuery(nextQuery);

    const trimmedQuery = nextQuery.trim();
    if (trimmedQuery) {
      setSearchParams({ q: trimmedQuery }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  return (
    <div className="historyPage">
      <section className="historyPage__hero section">
        <div className="container historyPage__heroGrid">
          <div className="historyPage__intro">
            <p className="historyPage__eyebrow">German Club Alumni Archives</p>
            <h1 className="historyPage__title">History of the German Club</h1>
            <p className="historyPage__lede">
              Browse primary documents, anniversary writeups, and archival histories in a card-based
              collection.
            </p>
          </div>
          <aside className="historyPage__details" aria-label="History collection details">
            <div className="historyPage__detailCard">
              <span className="historyPage__detailLabel">Collection status</span>
              <strong className="historyPage__detailValue">
                {isLoadingHistories
                  ? 'Loading...'
                  : historyDocuments.length === 0
                    ? 'Ready for files'
                    : `${historyDocuments.length} document${historyDocuments.length === 1 ? '' : 's'}`}
              </strong>
            </div>
          </aside>
        </div>
      </section>

      <section className="historyPage__library section">
        <div className="container">
          <div className="historyPage__libraryPanel">
            <div className="historyPage__sectionHeader">
              <div>
                <div>
                  <h2 className="historyPage__sectionTitle">Historical Document Library</h2>
                </div>
              </div>
              <label className="historyPage__search" htmlFor="history-document-search">
                <span className="sr-only">Search written histories</span>
                <input
                  id="history-document-search"
                  className="historyPage__searchInput"
                  type="search"
                  placeholder="Search by history name"
                  value={searchQuery}
                  onChange={handleSearchChange}
                />
              </label>
            </div>

            <div className="historyPage__libraryContent">
              {loadError ? (
                <div className="historyPage__emptyState">
                  <p className="historyPage__emptyTitle">Unable to load history PDFs.</p>
                  <p className="historyPage__emptyCopy">{loadError}</p>
                </div>
              ) : isLoadingHistories ? (
                <div className="historyPage__emptyState">
                  <p className="historyPage__emptyTitle">Loading history PDFs...</p>
                </div>
              ) : filteredHistoryDocuments.length > 0 ? (
                <div className="historyPage__grid" aria-label="History document cards">
                  {filteredHistoryDocuments.map((document) => (
                    <article key={document.historyId || document.key} className="historyPage__card">
                      <div className="historyPage__cardBody">
                        <h3 className="historyPage__cardTitle">{document.title}</h3>
                        <p className="historyPage__cardDescription">{document.description}</p>
                        <br />
                        <button
                          type="button"
                          className="button historyPage__cardButton"
                          onClick={() => setActiveDocument(document)}
                        >
                          Open History
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : historyDocuments.length > 0 && normalizedSearchQuery ? (
                <div className="historyPage__emptyState">
                  <p className="historyPage__emptyTitle">No matching history PDFs.</p>
                  <p className="historyPage__emptyCopy">Try a different history name.</p>
                </div>
              ) : (
                <div className="historyPage__emptyState">
                  <p className="historyPage__emptyTitle">No history PDFs added yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {activeDocument ? (
        <div
          className="historyPage__modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-document-title"
        >
          <button
            type="button"
            className="historyPage__modalOverlay"
            aria-label="Close history document viewer"
            onClick={() => setActiveDocument(null)}
          />

          <div className="historyPage__modalPanel">
            <div className="historyPage__modalHeader">
              <div>
                <p className="historyPage__modalLabel">History Viewer</p>
                <h2 id="history-document-title" className="historyPage__modalTitle">
                  {activeDocument.title}
                </h2>
              </div>

              <button
                type="button"
                className="historyPage__modalClose"
                aria-label="Close history document viewer"
                onClick={() => setActiveDocument(null)}
              >
                Close
              </button>
            </div>

            <div className="historyPage__viewerFrame">
              <iframe
                className="historyPage__viewer"
                src={`${activeDocument.pdfUrl}${PDF_VIEWER_OPTIONS}`}
                title={activeDocument.title}
                tabIndex={-1}
              />
              <div
                className="historyPage__viewerShield"
                aria-hidden="true"
                onContextMenu={(event) => event.preventDefault()}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeHistories(histories) {
  return (Array.isArray(histories) ? histories : [])
    .map((history) => ({
      historyId: String(history?.historyId || ''),
      key: String(history?.key || ''),
      title: String(history?.title || ''),
      description: String(history?.description || ''),
      pdfUrl: String(history?.pdfUrl || ''),
      uploadTimestamp: String(history?.uploadTimestamp || ''),
    }))
    .filter((history) => history.pdfUrl)
    .sort((leftHistory, rightHistory) => {
      const leftTimestamp = new Date(leftHistory.uploadTimestamp || 0).getTime();
      const rightTimestamp = new Date(rightHistory.uploadTimestamp || 0).getTime();
      return rightTimestamp - leftTimestamp;
    });
}
