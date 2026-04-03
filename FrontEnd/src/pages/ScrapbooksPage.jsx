import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { getScrapbooks } from '../api/composites.js';
import './ScrapbooksPage.css';

const legacyScrapbookCollections = [
  {
    id: 'legacy-1983',
    year: '1983',
    title: '1983 Scrapbook',
    tone: 'purple',
    accent: 'Club Purple',
    pages: [
      '/images/scrapbookImages/1983/1983ScrapB-P1.jpg',
      '/images/scrapbookImages/1983/1983ScrapB-P2 (1).jpg',
      '/images/scrapbookImages/1983/1983ScrapB-P3.jpg',
    ],
  },
  {
    id: 'legacy-1984',
    year: '1984',
    title: '1984 Scrapbook',
    tone: 'gold',
    accent: 'Club Gold',
    pages: [
      '/images/scrapbookImages/1984/1984ScrapB-P1.jpg',
      '/images/scrapbookImages/1984/1984ScrapB-P2.jpg',
      '/images/scrapbookImages/1984/1984ScrapB-P3.jpg',
    ],
  },
];

export default function ScrapbooksPage() {
  const [activeBook, setActiveBook] = useState(null);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [uploadedScrapbooks, setUploadedScrapbooks] = useState([]);

  useEffect(() => {
    let isActive = true;

    const loadScrapbooks = async () => {
      try {
        const scrapbookRecords = await getScrapbooks();

        if (!isActive) {
          return;
        }

        setUploadedScrapbooks(
          scrapbookRecords
            .filter((scrapbook) => Array.isArray(scrapbook.pageImageUrls) && scrapbook.pageImageUrls.length > 0)
            .map((scrapbook) => ({
              id: scrapbook.scrapbookId,
              year: String(scrapbook.scrapbookYear || ''),
              title: scrapbook.title || `${scrapbook.scrapbookYear} Scrapbook`,
              tone: deriveScrapbookTone(scrapbook.scrapbookYear),
              accent: deriveScrapbookAccent(scrapbook.scrapbookYear),
              pages: scrapbook.pageImageUrls,
              pageCount: scrapbook.pageCount || scrapbook.pageImageUrls.length,
              pdfUrl: scrapbook.pdfUrl || '',
              uploadTimestamp: scrapbook.uploadTimestamp || '',
            })),
        );
      } catch {
        if (isActive) {
          setUploadedScrapbooks([]);
        }
      }
    };

    loadScrapbooks();

    return () => {
      isActive = false;
    };
  }, []);

  const scrapbookCollections = useMemo(() => {
    const recordsByYear = new Map();

    uploadedScrapbooks.forEach((scrapbook) => {
      recordsByYear.set(String(scrapbook.year || scrapbook.id), scrapbook);
    });

    legacyScrapbookCollections.forEach((scrapbook) => {
      if (!recordsByYear.has(String(scrapbook.year || scrapbook.id))) {
        recordsByYear.set(String(scrapbook.year || scrapbook.id), scrapbook);
      }
    });

    return Array.from(recordsByYear.values()).sort(compareScrapbooks);
  }, [uploadedScrapbooks]);

  useEffect(() => {
    if (!activeBook) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setActiveBook(null);
        return;
      }

      if (event.key === 'ArrowRight') {
        setActivePageIndex((current) => Math.min(current + 1, activeBook.pages.length - 1));
      }

      if (event.key === 'ArrowLeft') {
        setActivePageIndex((current) => Math.max(current - 1, 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeBook]);

  useEffect(() => {
    if (!activeBook) return undefined;

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = overflow;
    };
  }, [activeBook]);

  const openBook = (book) => {
    setActiveBook(book);
    setActivePageIndex(0);
  };

  const closeBook = () => {
    setActiveBook(null);
    setActivePageIndex(0);
  };

  const showPreviousPage = () => {
    setActivePageIndex((current) => Math.max(current - 1, 0));
  };

  const showNextPage = () => {
    if (!activeBook) return;
    setActivePageIndex((current) => Math.min(current + 1, activeBook.pages.length - 1));
  };

  return (
    <div className="scrapbooksPage">
      <section className="scrapbooksPage__shelfSection section">
        <div className="container">
          <div className="scrapbooksPage__shelfIntro">
            <div>
              <p className="scrapbooksPage__sectionLabel">Available Volumes</p>
              <h2 className="scrapbooksPage__sectionTitle">Pick a scrapbook from the shelf</h2>
            </div>
          </div>

          <div className="scrapbooksPage__shelf" aria-label="Scrapbook shelf">
            {scrapbookCollections.map((book) => (
              <button
                key={book.id}
                type="button"
                className={`scrapbooksPage__book scrapbooksPage__book--${book.tone}`}
                onClick={() => openBook(book)}
                aria-label={`Open the ${book.title}`}
              >
                <span className="scrapbooksPage__bookShadow" aria-hidden="true" />
                <span className="scrapbooksPage__bookSpine">
                  <span className="scrapbooksPage__bookAccent">{book.accent}</span>
                  <strong className="scrapbooksPage__bookYear">{book.year}</strong>
                  <span className="scrapbooksPage__bookName">Scrapbook</span>
                </span>
                <span className="scrapbooksPage__bookFace">
                  <span className="scrapbooksPage__bookFaceYear">{book.year}</span>
                  <span className="scrapbooksPage__bookFaceTitle">{book.title}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="scrapbooksPage__uploadRow">
            <Link className="button scrapbooksPage__uploadButton" to="/upload/scrapbooks">
              Upload Scrapbook
            </Link>
          </div>
        </div>
      </section>

      {activeBook && (
        <div
          className="scrapbooksPage__viewerOverlay"
          role="presentation"
        >
          <section
            className="scrapbooksPage__viewer"
            aria-label={`${activeBook.title} viewer`}
            role="dialog"
            aria-modal="true"
          >
            <div className="scrapbooksPage__viewerTopbar">
              <div>
                <p className="scrapbooksPage__sectionLabel">Open Volume</p>
                <h2 className="scrapbooksPage__sectionTitle">{activeBook.title}</h2>
              </div>
              <button type="button" className="button scrapbooksPage__closeButton" onClick={closeBook}>
                Close Book
              </button>
            </div>

            <div className={`scrapbooksPage__viewerFrame scrapbooksPage__viewerFrame--${activeBook.tone}`}>
              <div className={`scrapbooksPage__viewerMeta scrapbooksPage__viewerMeta--${activeBook.tone}`} aria-hidden="true">
                <span className="scrapbooksPage__coverYear">{activeBook.year}</span>
                <strong className="scrapbooksPage__coverTitle">Scrapbook</strong>
              </div>

              <div className="scrapbooksPage__slideshow">
                <button
                  type="button"
                  className="scrapbooksPage__arrow scrapbooksPage__arrow--left"
                  onClick={showPreviousPage}
                  disabled={activePageIndex === 0}
                  aria-label="Go to previous page"
                >
                  &#8249;
                </button>

                <div className="scrapbooksPage__slidePanel">
                  <img
                    className="scrapbooksPage__pageImage"
                    src={activeBook.pages[activePageIndex]}
                    alt={`${activeBook.title} page ${activePageIndex + 1}`}
                  />
                </div>

                <button
                  type="button"
                  className="scrapbooksPage__arrow scrapbooksPage__arrow--right"
                  onClick={showNextPage}
                  disabled={activePageIndex === activeBook.pages.length - 1}
                  aria-label="Go to next page"
                >
                  &#8250;
                </button>
              </div>
            </div>

            <div className="scrapbooksPage__viewerControls">
              <p className="scrapbooksPage__pageStatus">
                Page {activePageIndex + 1} of {activeBook.pages.length}
              </p>
              {activeBook.pdfUrl ? (
                <a className="button scrapbooksPage__uploadButton" href={activeBook.pdfUrl} target="_blank" rel="noreferrer">
                  Open Original PDF
                </a>
              ) : null}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function compareScrapbooks(leftValue, rightValue) {
  const leftYear = Number(leftValue.year || 0);
  const rightYear = Number(rightValue.year || 0);

  if (leftYear !== rightYear) {
    return rightYear - leftYear;
  }

  return String(leftValue.title || '').localeCompare(String(rightValue.title || ''));
}

function deriveScrapbookTone(scrapbookYear) {
  return Number(scrapbookYear) % 2 === 0 ? 'gold' : 'purple';
}

function deriveScrapbookAccent(scrapbookYear) {
  return deriveScrapbookTone(scrapbookYear) === 'gold' ? 'Club Gold' : 'Club Purple';
}
