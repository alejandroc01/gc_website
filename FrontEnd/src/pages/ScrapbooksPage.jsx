import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getScrapbooks } from '../api/composites.js';
import ScrapbookCopyrightNotice from '../components/Scrapbook/ScrapbookCopyrightNotice.jsx';
import './ScrapbooksPage.css';

export default function ScrapbooksPage() {
  const [searchParams] = useSearchParams();
  const [activeBook, setActiveBook] = useState(null);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [isPageImageReady, setIsPageImageReady] = useState(false);
  const [uploadedScrapbooks, setUploadedScrapbooks] = useState([]);
  const [searchYear, setSearchYear] = useState(() => String(searchParams.get('year') || '').trim());
  const [searchMessage, setSearchMessage] = useState('');
  const [hasHandledLinkedYear, setHasHandledLinkedYear] = useState(false);
  const pageImageRef = useRef(null);
  const requestedYear = String(searchParams.get('year') || '').trim();
  const requestedPage = String(searchParams.get('page') || '').trim();

  useEffect(() => {
    let isActive = true;

    const loadScrapbooks = async () => {
      try {
        const scrapbookRecords = await getScrapbooks();

        if (!isActive) {
          return;
        }

        const sortedScrapbooks = scrapbookRecords
          .filter((scrapbook) => Array.isArray(scrapbook.pageImageUrls) && scrapbook.pageImageUrls.length > 0)
          .map((scrapbook) => ({
            id: scrapbook.scrapbookId,
            year: String(scrapbook.scrapbookYear || ''),
            title: scrapbook.title || `${scrapbook.scrapbookYear} Scrapbook`,
            pages: scrapbook.pageImageUrls,
            pageCount: scrapbook.pageCount || scrapbook.pageImageUrls.length,
            pdfUrl: scrapbook.pdfUrl || '',
            uploadTimestamp: scrapbook.uploadTimestamp || '',
          }))
          .sort(compareScrapbooks)
          .map((scrapbook, index) => ({
            ...scrapbook,
            tone: deriveScrapbookTone(index),
          }));

        setUploadedScrapbooks(sortedScrapbooks);
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

  const scrapbookCollections = uploadedScrapbooks;

  useEffect(() => {
    if (hasHandledLinkedYear) {
      return;
    }

    if (!requestedYear) {
      setHasHandledLinkedYear(true);
      return;
    }

    if (scrapbookCollections.length === 0) {
      return;
    }

    setHasHandledLinkedYear(true);

    if (!/^\d{4}$/.test(requestedYear)) {
      setSearchMessage('Enter a four-digit year to open a scrapbook.');
      return;
    }

    const matchingBook = scrapbookCollections.find((book) => String(book.year) === requestedYear);

    if (!matchingBook) {
      setSearchMessage(`There is no scrapbook for ${requestedYear}.`);
      return;
    }

    setSearchMessage('');
    openBook(matchingBook, getRequestedPageIndex(requestedPage, matchingBook.pages.length));
  }, [hasHandledLinkedYear, requestedPage, requestedYear, scrapbookCollections]);

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
    if (!activeBook) {
      setIsPageImageReady(false);
      return undefined;
    }

    setIsPageImageReady(false);

    const imageElement = pageImageRef.current;
    if (!imageElement) {
      return undefined;
    }

    let isCancelled = false;

    const finalizeImageReady = () => {
      if (isCancelled) {
        return;
      }

      window.requestAnimationFrame(() => {
        if (!isCancelled) {
          setIsPageImageReady(true);
        }
      });
    };

    if (imageElement.complete && imageElement.naturalWidth > 0) {
      if (typeof imageElement.decode === 'function') {
        imageElement.decode().catch(() => {}).finally(finalizeImageReady);
      } else {
        finalizeImageReady();
      }
    }

    return () => {
      isCancelled = true;
    };
  }, [activeBook, activePageIndex]);

  useEffect(() => {
    if (!activeBook) return undefined;

    const { overflow } = document.body.style;
    document.body.classList.add('scrapbookViewerOpen');
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.classList.remove('scrapbookViewerOpen');
      document.body.style.overflow = overflow;
    };
  }, [activeBook]);

  const openBook = (book, pageIndex = 0) => {
    setActiveBook(book);
    setActivePageIndex(getBoundedPageIndex(pageIndex, book.pages.length));
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

  const attemptYearSearch = (nextYear) => {
    const normalizedYear = nextYear.trim();

    if (!/^\d{4}$/.test(normalizedYear)) {
      setSearchMessage('Enter a four-digit year to open a scrapbook.');
      return;
    }

    const matchingBook = scrapbookCollections.find((book) => String(book.year) === normalizedYear);

    if (!matchingBook) {
      setSearchMessage(`There is no scrapbook for ${normalizedYear}.`);
      return;
    }

    setSearchMessage('');
    openBook(matchingBook);
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const normalizedYear = searchYear.trim();
    attemptYearSearch(normalizedYear);
  };

  const handlePageImageLoad = () => {
    window.requestAnimationFrame(() => {
      setIsPageImageReady(true);
    });
  };

  const handlePageImageError = () => {
    setIsPageImageReady(true);
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
                  <strong className="scrapbooksPage__bookYear">German Club {book.year}</strong>
                </span>
                <span className="scrapbooksPage__bookFace">
                  <span className="scrapbooksPage__bookFaceYear">{book.year}</span>
                  <span className="scrapbooksPage__bookFaceTitle">{book.title}</span>
                </span>
              </button>
            ))}
          </div>

          <form className="scrapbooksPage__search" onSubmit={handleSearchSubmit}>
            <label className="scrapbooksPage__searchField" htmlFor="scrapbookYearSearch">
              <span className="scrapbooksPage__searchLabel">Search scrapbooks by year</span>
              <input
                id="scrapbookYearSearch"
                className="scrapbooksPage__searchInput"
                type="search"
                inputMode="numeric"
                placeholder="Enter a four-digit year"
                maxLength={4}
                value={searchYear}
                onChange={(event) => {
                  const nextYear = event.target.value.replace(/[^\d]/g, '').slice(0, 4);
                  setSearchYear(nextYear);
                  setSearchMessage('');
                }}
              />
            </label>
          </form>

          <ScrapbookCopyrightNotice className="scrapbooksPage__copyrightNotice" />

          {searchMessage ? (
            <p className="scrapbooksPage__searchMessage" role="status" aria-live="polite">
              {searchMessage}
            </p>
          ) : null}
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
                    ref={pageImageRef}
                    className={[
                      'scrapbooksPage__pageImage',
                      isPageImageReady ? 'scrapbooksPage__pageImage--ready' : 'scrapbooksPage__pageImage--loading',
                    ].join(' ')}
                    src={activeBook.pages[activePageIndex]}
                    alt={`${activeBook.title} page ${activePageIndex + 1}`}
                    onLoad={handlePageImageLoad}
                    onError={handlePageImageError}
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
    return leftYear - rightYear;
  }

  return String(leftValue.title || '').localeCompare(String(rightValue.title || ''));
}

function deriveScrapbookTone(shelfIndex) {
  return shelfIndex % 2 === 0 ? 'gold' : 'purple';
}

function getRequestedPageIndex(requestedPage, pageCount) {
  const pageNumber = Number(requestedPage || 1);

  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return 0;
  }

  return getBoundedPageIndex(pageNumber - 1, pageCount);
}

function getBoundedPageIndex(pageIndex, pageCount) {
  const normalizedPageIndex = Number(pageIndex || 0);
  const normalizedPageCount = Number(pageCount || 0);

  if (!Number.isFinite(normalizedPageIndex) || normalizedPageIndex < 0 || normalizedPageCount <= 0) {
    return 0;
  }

  return Math.min(normalizedPageIndex, normalizedPageCount - 1);
}
