import { useEffect, useState } from 'react';

import { getScrapbookMetadataPage } from '../../api/composites.js';
import './ScrapbookPageModal.css';

export default function ScrapbookPageModal({ identifier, onClose }) {
  const [page, setPage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [isFullImageLoaded, setIsFullImageLoaded] = useState(false);
  const [isImageExpanded, setIsImageExpanded] = useState(false);

  useEffect(() => {
    let isActive = true;

    const loadPage = async () => {
      setIsLoading(true);
      setPageError('');

      try {
        const pageRecord = await getScrapbookMetadataPage(identifier);

        if (!isActive) {
          return;
        }

        setPage(pageRecord);
      } catch (error) {
        if (isActive) {
          setPageError(error.message);
          setPage(null);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadPage();

    return () => {
      isActive = false;
    };
  }, [identifier]);

  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (isImageExpanded) {
          setIsImageExpanded(false);
          return;
        }

        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isImageExpanded, onClose]);

  useEffect(() => {
    setIsFullImageLoaded(false);
    setIsImageExpanded(false);
  }, [page?.imageUrl, page?.thumbnailUrl]);

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };
  const previewImageSrc = page?.thumbnailUrl || page?.imageUrl || '';
  const fullImageSrc = page?.imageUrl || page?.thumbnailUrl || '';
  const hasLayeredPreview = Boolean(page?.thumbnailUrl && page?.imageUrl && page.thumbnailUrl !== page.imageUrl);
  const pageLabel = page?.pageNumber ? `Scrapbook Page ${page.pageNumber}` : 'Scrapbook Page';

  return (
    <div
      className="scrapbookPageModal__backdrop"
      role="presentation"
      onMouseDown={handleBackdropClick}
    >
      <article
        className="scrapbookPageModal"
        role="dialog"
        aria-modal="true"
        aria-label={page?.title || 'Scrapbook page viewer'}
      >
        <button
          type="button"
          className="scrapbookPageModal__close"
          onClick={onClose}
          aria-label="Close scrapbook page viewer"
        >
          x
        </button>

        {isLoading ? (
          <div className="scrapbookPageModal__message">Loading scrapbook page...</div>
        ) : pageError || !page ? (
          <div className="scrapbookPageModal__message">
            {pageError || 'The requested scrapbook page could not be loaded.'}
          </div>
        ) : (
          <>
            <div className="scrapbookPageModal__imageWrap">
              {fullImageSrc ? (
                <button
                  type="button"
                  className="scrapbookPageModal__imageButton"
                  onClick={() => setIsImageExpanded(true)}
                  aria-label={`Enlarge ${page.title || pageLabel}`}
                >
                  <div className="scrapbookPageModal__imageStage">
                    {previewImageSrc ? (
                      <img
                        className={[
                          'scrapbookPageModal__image',
                          'scrapbookPageModal__image--preview',
                          isFullImageLoaded ? 'scrapbookPageModal__image--hidden' : '',
                        ].filter(Boolean).join(' ')}
                        src={previewImageSrc}
                        alt=""
                        aria-hidden="true"
                      />
                    ) : null}
                    <img
                      className={[
                        'scrapbookPageModal__image',
                        'scrapbookPageModal__image--full',
                        !isFullImageLoaded ? 'scrapbookPageModal__image--loading' : '',
                        hasLayeredPreview && !isFullImageLoaded ? 'scrapbookPageModal__image--pending' : '',
                      ].filter(Boolean).join(' ')}
                      src={fullImageSrc}
                      alt={page.title || pageLabel}
                      onLoad={() => setIsFullImageLoaded(true)}
                    />
                  </div>
                </button>
              ) : (
                <div className="scrapbookPageModal__missingImage">Image not uploaded</div>
              )}
            </div>

            <div className="scrapbookPageModal__details">
              <h2 className="scrapbookPageModal__title">{page.title || 'Untitled Scrapbook Page'}</h2>
              {page.year ? <p className="scrapbookPageModal__year">{page.year}</p> : null}
              <p className="scrapbookPageModal__page">{pageLabel}</p>

              {page.category ? (
                <p className="scrapbookPageModal__meta">
                  <span>Event/Category:</span> {page.category}
                </p>
              ) : null}

              {Array.isArray(page.members) && page.members.length > 0 ? (
                <p className="scrapbookPageModal__members">
                  <span>Members:</span> {page.members.join(', ')}
                </p>
              ) : null}
            </div>
          </>
        )}
      </article>

      {isImageExpanded && fullImageSrc ? (
        <button
          type="button"
          className="scrapbookPageModal__expandedBackdrop"
          onClick={() => setIsImageExpanded(false)}
          aria-label="Return to scrapbook page details"
        >
          <img
            className="scrapbookPageModal__expandedImage"
            src={fullImageSrc}
            alt={page?.title || pageLabel}
          />
        </button>
      ) : null}
    </div>
  );
}
