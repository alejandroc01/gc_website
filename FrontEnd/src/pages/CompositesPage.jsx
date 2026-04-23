import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import CompositeCopyrightNotice from '../components/Composite/CompositeCopyrightNotice.jsx';
import PublicCompositeStage from '../components/Composite/PublicCompositeStage.jsx';
import MemberProfileModal from '../components/MemberProfile/MemberProfileModal.jsx';
import { getComposites, getHistories, getScrapbooks } from '../api/composites.js';
import '../styles/composites.css';
import './CompositesPage.css';

const PDF_VIEWER_OPTIONS = '#toolbar=0&navpanes=0&scrollbar=0';

export default function CompositesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [composites, setComposites] = useState([]);
  const [relatedScrapbooks, setRelatedScrapbooks] = useState([]);
  const [relatedHistories, setRelatedHistories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRelatedMedia, setIsLoadingRelatedMedia] = useState(true);
  const [pageError, setPageError] = useState('');
  const [relatedMediaError, setRelatedMediaError] = useState('');
  const [displayMetrics, setDisplayMetrics] = useState(getDisplayMetrics);
  const [scaledContentHeight, setScaledContentHeight] = useState(null);
  const [yearInput, setYearInput] = useState('');
  const [yearError, setYearError] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRelatedMediaMenuOpen, setIsRelatedMediaMenuOpen] = useState(false);
  const [activeRelatedMedia, setActiveRelatedMedia] = useState(null);
  const [activeScrapbookPageIndex, setActiveScrapbookPageIndex] = useState(0);
  const [isScrapbookPageReady, setIsScrapbookPageReady] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState('');
  const scaledContentRef = useRef(null);
  const relatedMenuRef = useRef(null);
  const relatedScrapbookImageRef = useRef(null);

  useEffect(() => {
    let isActive = true;

    const loadComposites = async () => {
      setIsLoading(true);
      setPageError('');

      try {
        const loadedComposites = await getComposites();

        if (!isActive) {
          return;
        }

        setComposites(Array.isArray(loadedComposites) ? loadedComposites : []);
      } catch (error) {
        if (isActive) {
          setPageError(error.message);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadComposites();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadRelatedMedia = async () => {
      setIsLoadingRelatedMedia(true);
      setRelatedMediaError('');

      const [scrapbooksResult, historiesResult] = await Promise.allSettled([
        getScrapbooks(),
        getHistories(),
      ]);

      if (!isActive) {
        return;
      }

      const nextScrapbooks = scrapbooksResult.status === 'fulfilled'
        ? normalizeRelatedScrapbooks(scrapbooksResult.value)
        : [];
      const nextHistories = historiesResult.status === 'fulfilled'
        ? normalizeRelatedHistories(historiesResult.value)
        : [];

      setRelatedScrapbooks(nextScrapbooks);
      setRelatedHistories(nextHistories);

      if (scrapbooksResult.status === 'rejected' && historiesResult.status === 'rejected') {
        setRelatedMediaError('Related media is unavailable right now.');
      } else if (scrapbooksResult.status === 'rejected' || historiesResult.status === 'rejected') {
        setRelatedMediaError('Some related media could not be loaded.');
      }

      setIsLoadingRelatedMedia(false);
    };

    loadRelatedMedia().catch(() => {
      if (isActive) {
        setRelatedScrapbooks([]);
        setRelatedHistories([]);
        setRelatedMediaError('Related media is unavailable right now.');
        setIsLoadingRelatedMedia(false);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  const sortedComposites = useMemo(
    () => [...composites].sort(compareCompositesByYear),
    [composites],
  );
  const availableYears = useMemo(
    () => sortedComposites.map((composite) => String(composite.compositeYear || '')).filter(Boolean),
    [sortedComposites],
  );
  const requestedYear = searchParams.get('year') || '';
  const selectedComposite = useMemo(() => {
    if (sortedComposites.length === 0) {
      return null;
    }

    return sortedComposites.find(
      (composite) => String(composite.compositeYear || '') === requestedYear,
    ) || sortedComposites[sortedComposites.length - 1];
  }, [requestedYear, sortedComposites]);
  const selectedYear = selectedComposite?.compositeYear ? String(selectedComposite.compositeYear) : '';
  const selectedYearIndex = availableYears.indexOf(selectedYear);
  const sliderProgress = availableYears.length > 1
    ? Math.max(selectedYearIndex, 0) / (availableYears.length - 1)
    : 0;
  const sliderAnimationMs = clamp(420 - (sortedComposites.length * 4), 110, 260);
  const confirmedAnnotations = useMemo(
    () => (Array.isArray(selectedComposite?.annotations) ? selectedComposite.annotations : [])
      .filter((annotation) => Boolean(annotation.profileId)),
    [selectedComposite],
  );
  const oldestYear = availableYears[0] || '';
  const newestYear = availableYears[availableYears.length - 1] || '';
  const pageScaleConfig = useMemo(
    () => getCompositePageScaleConfig(displayMetrics),
    [displayMetrics],
  );
  const pageScaleStyle = useMemo(
    () => ({
      '--composites-page-scale': String(pageScaleConfig.scale),
      '--composites-page-layout-width': `${pageScaleConfig.layoutWidth}px`,
      '--composites-inline-viewer-height': `${pageScaleConfig.viewerHeight}px`,
      '--composites-page-scaled-height': scaledContentHeight
        ? `${Math.round(scaledContentHeight * pageScaleConfig.scale)}px`
        : 'auto',
    }),
    [pageScaleConfig, scaledContentHeight],
  );
  const matchingScrapbooks = useMemo(
    () => relatedScrapbooks.filter((scrapbook) => scrapbook.year === selectedYear),
    [relatedScrapbooks, selectedYear],
  );
  const matchingHistories = useMemo(
    () => relatedHistories.filter((history) => history.years.includes(selectedYear)),
    [relatedHistories, selectedYear],
  );
  const relatedMediaOptions = useMemo(
    () => [
      ...matchingScrapbooks.map((scrapbook) => ({
        optionId: `scrapbook-${scrapbook.id}`,
        type: 'scrapbook',
        actionLabel: 'Show Scrapbook',
        detail: scrapbook.title,
        item: scrapbook,
      })),
      ...matchingHistories.map((history) => ({
        optionId: `history-${history.historyId}`,
        type: 'history',
        actionLabel: 'Show Club History',
        detail: history.title,
        item: history,
      })),
    ],
    [matchingHistories, matchingScrapbooks],
  );

  useEffect(() => {
    if (!selectedYear || requestedYear === selectedYear) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('year', selectedYear);
    setSearchParams(nextSearchParams, { replace: true });
  }, [requestedYear, searchParams, selectedYear, setSearchParams]);

  useEffect(() => {
    setYearInput(selectedYear);
    setYearError('');
  }, [selectedYear]);

  useEffect(() => {
    setIsRelatedMediaMenuOpen(false);
    setActiveRelatedMedia(null);
    setActiveScrapbookPageIndex(0);
    setIsScrapbookPageReady(false);
  }, [selectedComposite?.compositeId]);

  useEffect(() => {
    if (!activeProfileId && !activeRelatedMedia && !isExpanded && !isRelatedMediaMenuOpen) {
      return undefined;
    }

    const handleWindowKeyDown = (event) => {
      if (activeRelatedMedia?.type === 'scrapbook' && event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveScrapbookPageIndex((currentPageIndex) => (
          Math.min(currentPageIndex + 1, activeRelatedMedia.item.pages.length - 1)
        ));
        return;
      }

      if (activeRelatedMedia?.type === 'scrapbook' && event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveScrapbookPageIndex((currentPageIndex) => Math.max(currentPageIndex - 1, 0));
        return;
      }

      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();

      if (activeProfileId) {
        setActiveProfileId('');
        return;
      }

      if (activeRelatedMedia) {
        setActiveRelatedMedia(null);
        setActiveScrapbookPageIndex(0);
        return;
      }

      if (isRelatedMediaMenuOpen) {
        setIsRelatedMediaMenuOpen(false);
        return;
      }

      setIsExpanded(false);
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [activeProfileId, activeRelatedMedia, isExpanded, isRelatedMediaMenuOpen]);

  useEffect(() => {
    if (!isExpanded && !activeRelatedMedia) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [activeRelatedMedia, isExpanded]);

  useEffect(() => {
    if (!isRelatedMediaMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (relatedMenuRef.current?.contains(event.target)) {
        return;
      }

      setIsRelatedMediaMenuOpen(false);
    };

    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [isRelatedMediaMenuOpen]);

  useEffect(() => {
    const updateDisplayMetrics = () => {
      setDisplayMetrics((currentMetrics) => {
        const nextMetrics = getDisplayMetrics();

        if (
          currentMetrics.viewportWidth === nextMetrics.viewportWidth
          && currentMetrics.viewportHeight === nextMetrics.viewportHeight
          && currentMetrics.devicePixelRatio === nextMetrics.devicePixelRatio
        ) {
          return currentMetrics;
        }

        return nextMetrics;
      });
    };

    const visualViewport = window.visualViewport;

    window.addEventListener('resize', updateDisplayMetrics);
    visualViewport?.addEventListener('resize', updateDisplayMetrics);

    return () => {
      window.removeEventListener('resize', updateDisplayMetrics);
      visualViewport?.removeEventListener('resize', updateDisplayMetrics);
    };
  }, []);

  useEffect(() => {
    if (activeRelatedMedia?.type !== 'scrapbook') {
      setIsScrapbookPageReady(false);
      return undefined;
    }

    setIsScrapbookPageReady(false);

    const imageElement = relatedScrapbookImageRef.current;

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
          setIsScrapbookPageReady(true);
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
  }, [activeRelatedMedia, activeScrapbookPageIndex]);

  useLayoutEffect(() => {
    const scaledContentElement = scaledContentRef.current;

    if (!scaledContentElement) {
      return undefined;
    }

    const updateScaledContentHeight = () => {
      const nextHeight = scaledContentElement.offsetHeight;

      setScaledContentHeight((currentHeight) => (
        currentHeight === nextHeight ? currentHeight : nextHeight
      ));
    };

    updateScaledContentHeight();

    const resizeObserver = new ResizeObserver(() => {
      updateScaledContentHeight();
    });

    resizeObserver.observe(scaledContentElement);
    window.addEventListener('resize', updateScaledContentHeight);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateScaledContentHeight);
    };
  }, [pageScaleConfig.layoutWidth, pageScaleConfig.viewerHeight]);

  const handleSelectYear = useCallback((nextYear) => {
    const normalizedYear = String(nextYear || '').trim();

    if (!normalizedYear) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('year', normalizedYear);
    setSearchParams(nextSearchParams, { replace: true });
    setYearInput(normalizedYear);
    setYearError('');
  }, [searchParams, setSearchParams]);

  const handleCommitYearInput = useCallback(() => {
    const normalizedYear = yearInput.trim();

    if (availableYears.includes(normalizedYear)) {
      handleSelectYear(normalizedYear);
      return;
    }

    if (!normalizedYear) {
      setYearError('Enter one of the uploaded composite years.');
      return;
    }

    setYearError(`No uploaded composite is available for ${normalizedYear}.`);
  }, [availableYears, handleSelectYear, yearInput]);

  const handleOpenProfile = useCallback((profileId) => {
    if (!profileId) {
      return;
    }

    setActiveProfileId(String(profileId));
  }, []);

  const handleToggleRelatedMediaMenu = useCallback(() => {
    setIsRelatedMediaMenuOpen((currentValue) => !currentValue);
  }, []);

  const handleOpenRelatedMedia = useCallback((option) => {
    if (!option?.item) {
      return;
    }

    setIsRelatedMediaMenuOpen(false);
    setActiveRelatedMedia(option);
    setActiveScrapbookPageIndex(0);
    setIsScrapbookPageReady(false);
  }, []);

  const handleCloseRelatedMedia = useCallback(() => {
    setActiveRelatedMedia(null);
    setActiveScrapbookPageIndex(0);
    setIsScrapbookPageReady(false);
  }, []);

  const handleShowPreviousScrapbookPage = useCallback(() => {
    setActiveScrapbookPageIndex((currentPageIndex) => Math.max(currentPageIndex - 1, 0));
  }, []);

  const handleShowNextScrapbookPage = useCallback(() => {
    setActiveScrapbookPageIndex((currentPageIndex) => {
      if (activeRelatedMedia?.type !== 'scrapbook') {
        return currentPageIndex;
      }

      return Math.min(currentPageIndex + 1, activeRelatedMedia.item.pages.length - 1);
    });
  }, [activeRelatedMedia]);

  return (
    <section className="section compositesPage" style={pageScaleStyle}>
      <div className="container">
        <div className="compositesPage__scaleViewport">
          <div ref={scaledContentRef} className="compositesPage__scaleCanvas">
            <header className="compositePageHeader compositesPage__header">
              <p className="compositePageHeader__eyebrow">German Club Alumni Archives</p>
              <h1 className="compositePageHeader__title">Composites</h1>
            </header>

            {pageError ? (
              <article className="compositePanel compositePanel--spacious">
                <p className="compositeMessage compositeMessage--error">{pageError}</p>
              </article>
            ) : null}

            {isLoading ? (
              <article className="compositePanel compositePanel--spacious">
                <p className="compositeMessage">Loading uploaded composites...</p>
              </article>
            ) : null}

            {!isLoading && !pageError && sortedComposites.length === 0 ? (
              <article className="compositePanel compositePanel--spacious">
                <div className="compositeEmptyState">
                  <h2 className="compositeEmptyState__title">No composites are available yet.</h2>
                  <p className="compositeEmptyState__description">
                    Upload and save an annotated composite first, then it will appear here for public browsing.
                  </p>
                </div>
              </article>
            ) : null}

            {!isLoading && !pageError && selectedComposite ? (
              <article className="compositePanel compositePanel--spacious compositesPage__shell">
                <div className="compositesPage__controlStrip">
                  <div className="compositesPage__yearRow">
                    <span className="compositesPage__yearBound compositesPage__yearBound--start">{oldestYear}</span>

                    <label className="compositesPage__selectedYear">
                      <span className="compositesPage__selectedYearLabel">Selected year</span>
                      <input
                        className={[
                          'compositesPage__selectedYearInput',
                          yearError ? 'compositesPage__selectedYearInput--invalid' : '',
                        ].filter(Boolean).join(' ')}
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={yearInput}
                        onChange={(event) => {
                          setYearInput(event.target.value.replace(/[^\d]/g, '').slice(0, 4));
                          setYearError('');
                        }}
                        onBlur={handleCommitYearInput}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleCommitYearInput();
                          }

                          if (event.key === 'Escape') {
                            event.preventDefault();
                            setYearInput(selectedYear);
                            setYearError('');
                          }
                        }}
                        aria-invalid={yearError ? 'true' : 'false'}
                        aria-describedby={yearError ? 'composites-year-error' : undefined}
                      />
                    </label>

                    <span className="compositesPage__yearBound compositesPage__yearBound--end">{newestYear}</span>
                  </div>

                  <div
                    className="compositesPage__sliderShell"
                    style={{
                      '--slider-progress': `${sliderProgress * 100}%`,
                      '--slider-duration': `${sliderAnimationMs}ms`,
                    }}
                  >
                    <div className="compositesPage__sliderVisual" aria-hidden="true">
                      <span className="compositesPage__sliderTrack" />
                      <span className="compositesPage__sliderFill" />
                      <span className="compositesPage__sliderThumb" />
                    </div>

                    <input
                      className="compositesPage__sliderInput"
                      type="range"
                      min="0"
                      max={Math.max(availableYears.length - 1, 0)}
                      step="1"
                      value={Math.max(selectedYearIndex, 0)}
                      disabled={availableYears.length <= 1}
                      onChange={(event) => handleSelectYear(availableYears[Number(event.target.value)] || selectedYear)}
                      aria-label="Select uploaded composite year"
                    />
                  </div>

                  {yearError ? (
                    <p id="composites-year-error" className="compositeMessage compositeMessage--error">
                      {yearError}
                    </p>
                  ) : null}
                </div>

                <div className="compositesPage__viewerDivider" aria-hidden="true" />

                <div className="compositesPage__viewerBody">
                  <div className="compositesPage__viewerStage">
                    <div
                      ref={relatedMenuRef}
                      className={[
                        'compositesPage__relatedMedia',
                        isRelatedMediaMenuOpen ? 'compositesPage__relatedMedia--open' : '',
                      ].join(' ')}
                    >
                      <button
                        type="button"
                        className="button compositesPage__controlButton compositesPage__relatedButton"
                        onClick={handleToggleRelatedMediaMenu}
                        aria-haspopup="menu"
                        aria-expanded={isRelatedMediaMenuOpen ? 'true' : 'false'}
                        aria-label={`Show related media for ${selectedYear}`}
                      >
                        <DocumentIcon className="compositesPage__relatedIcon" />
                      </button>

                      <div
                        className={[
                          'compositesPage__relatedDropdown',
                          isRelatedMediaMenuOpen ? 'compositesPage__relatedDropdown--open' : '',
                        ].join(' ')}
                        role="menu"
                        aria-label={`Related media for ${selectedYear}`}
                      >
                        <div className="compositesPage__relatedDropdownHeader">
                          <p className="compositesPage__relatedDropdownEyebrow">Related Media</p>
                          <p className="compositesPage__relatedDropdownYear">{selectedYear}</p>
                        </div>

                        {isLoadingRelatedMedia ? (
                          <p className="compositesPage__relatedDropdownMessage">Checking related media...</p>
                        ) : relatedMediaOptions.length > 0 ? (
                          <div className="compositesPage__relatedDropdownList">
                            {relatedMediaOptions.map((option) => (
                              <button
                                key={option.optionId}
                                type="button"
                                className="compositesPage__relatedDropdownItem"
                                onClick={() => handleOpenRelatedMedia(option)}
                                role="menuitem"
                              >
                                <span className="compositesPage__relatedDropdownAction">{option.actionLabel}</span>
                                <span className="compositesPage__relatedDropdownDetail">{option.detail}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="compositesPage__relatedDropdownMessage">
                            {relatedMediaError || `No related media for ${selectedYear}.`}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="button compositesPage__controlButton compositesPage__expandButton"
                      onClick={() => setIsExpanded(true)}
                      aria-label={`Open ${selectedYear} composite in the enlarged viewer`}
                    >
                      <ExpandIcon className="compositesPage__expandIcon" />
                    </button>

                    <PublicCompositeStage
                      composite={selectedComposite}
                      annotations={confirmedAnnotations}
                      onAnnotationSelect={handleOpenProfile}
                    />
                  </div>

                  <CompositeCopyrightNotice className="compositesPage__copyrightNotice" />
                </div>
              </article>
            ) : null}
          </div>
        </div>
      </div>

      {isExpanded && selectedComposite ? (
        <div
          className="compositesFullscreenBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsExpanded(false);
            }
          }}
        >
          <section className="compositesFullscreen" role="dialog" aria-modal="true" aria-label="Composite viewer">
            <button
              type="button"
              className="button compositesPage__controlButton compositesFullscreen__closeButton"
              onClick={() => setIsExpanded(false)}
              aria-label="Close enlarged composite viewer"
            >
              X
            </button>

            <PublicCompositeStage
              composite={selectedComposite}
              annotations={confirmedAnnotations}
              zoomEnabled
              variant="fullscreen"
              onAnnotationSelect={handleOpenProfile}
            />
          </section>
        </div>
      ) : null}

      {activeRelatedMedia ? (
        <div
          className="compositesPage__relatedModalBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              handleCloseRelatedMedia();
            }
          }}
        >
          <section
            className={[
              'compositesPage__relatedModal',
              `compositesPage__relatedModal--${activeRelatedMedia.type}`,
            ].join(' ')}
            role="dialog"
            aria-modal="true"
            aria-label={activeRelatedMedia.item.title}
          >
            <div className="compositesPage__relatedModalHeader">
              <button
                type="button"
                className="button compositesPage__relatedBackButton"
                onClick={handleCloseRelatedMedia}
              >
                <BackIcon className="compositesPage__relatedBackIcon" />
                Back to Composite
              </button>

              <div className="compositesPage__relatedModalTitleWrap">
                <p className="compositesPage__relatedModalEyebrow">Related Media</p>
                <h2 className="compositesPage__relatedModalTitle">{activeRelatedMedia.item.title}</h2>
              </div>
            </div>

            {activeRelatedMedia.type === 'scrapbook' ? (
              <>
                <div className="compositesPage__relatedScrapbookFrame">
                  <div className="compositesPage__relatedScrapbookMeta">
                    <span className="compositesPage__relatedScrapbookYear">{activeRelatedMedia.item.year}</span>
                    <strong className="compositesPage__relatedScrapbookLabel">Scrapbook</strong>
                  </div>

                  <div className="compositesPage__relatedScrapbookStage">
                    <button
                      type="button"
                      className="compositesPage__relatedScrapbookArrow compositesPage__relatedScrapbookArrow--left"
                      onClick={handleShowPreviousScrapbookPage}
                      disabled={activeScrapbookPageIndex === 0}
                      aria-label="Go to previous scrapbook page"
                    >
                      &#8249;
                    </button>

                    <div className="compositesPage__relatedScrapbookImagePanel">
                      <img
                        ref={relatedScrapbookImageRef}
                        className={[
                          'compositesPage__relatedScrapbookImage',
                          isScrapbookPageReady
                            ? 'compositesPage__relatedScrapbookImage--ready'
                            : 'compositesPage__relatedScrapbookImage--loading',
                        ].join(' ')}
                        src={activeRelatedMedia.item.pages[activeScrapbookPageIndex]}
                        alt={`${activeRelatedMedia.item.title} page ${activeScrapbookPageIndex + 1}`}
                        onLoad={() => setIsScrapbookPageReady(true)}
                        onError={() => setIsScrapbookPageReady(true)}
                      />
                    </div>

                    <button
                      type="button"
                      className="compositesPage__relatedScrapbookArrow compositesPage__relatedScrapbookArrow--right"
                      onClick={handleShowNextScrapbookPage}
                      disabled={activeScrapbookPageIndex === activeRelatedMedia.item.pages.length - 1}
                      aria-label="Go to next scrapbook page"
                    >
                      &#8250;
                    </button>
                  </div>
                </div>

                <div className="compositesPage__relatedModalFooter">
                  <p className="compositesPage__relatedModalStatus">
                    Page {activeScrapbookPageIndex + 1} of {activeRelatedMedia.item.pages.length}
                  </p>
                  {activeRelatedMedia.item.pdfUrl ? (
                    <a
                      className="button compositesPage__relatedModalAction"
                      href={activeRelatedMedia.item.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Original PDF
                    </a>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="compositesPage__relatedHistoryFrame">
                <iframe
                  className="compositesPage__relatedHistoryViewer"
                  src={`${activeRelatedMedia.item.pdfUrl}${PDF_VIEWER_OPTIONS}`}
                  title={activeRelatedMedia.item.title}
                  tabIndex={-1}
                />
                <div
                  className="compositesPage__relatedHistoryShield"
                  aria-hidden="true"
                  onContextMenu={(event) => event.preventDefault()}
                />
              </div>
            )}
          </section>
        </div>
      ) : null}

      {activeProfileId ? (
        <MemberProfileModal
          profileId={activeProfileId}
          onClose={() => setActiveProfileId('')}
          onArchiveNavigate={() => setActiveProfileId('')}
        />
      ) : null}
    </section>
  );
}

function compareCompositesByYear(leftComposite, rightComposite) {
  return Number(leftComposite.compositeYear || 0) - Number(rightComposite.compositeYear || 0);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getDisplayMetrics() {
  if (typeof window === 'undefined') {
    return {
      viewportWidth: 1440,
      viewportHeight: 900,
      devicePixelRatio: 1,
    };
  }

  const visualViewport = window.visualViewport;

  return {
    viewportWidth: Math.round(visualViewport?.width || window.innerWidth || 1440),
    viewportHeight: Math.round(visualViewport?.height || window.innerHeight || 900),
    devicePixelRatio: Number((window.devicePixelRatio || 1).toFixed(3)),
  };
}

function getCompositePageScaleConfig({ viewportWidth, viewportHeight, devicePixelRatio }) {
  const densityScale = clamp(devicePixelRatio || 1, 1, 2.25);
  const physicalViewportWidth = Math.round(viewportWidth * densityScale);
  const physicalViewportHeight = Math.round(viewportHeight * densityScale);
  const isCompactViewport = physicalViewportWidth <= 640;
  const isMediumViewport = physicalViewportWidth <= 960;
  const horizontalPadding = isCompactViewport ? 32 : 48;
  const verticalChrome = isCompactViewport ? 390 : isMediumViewport ? 340 : 300;
  const maxLayoutWidth = 1455 - horizontalPadding;

  return {
    scale: Number((1 / densityScale).toFixed(4)),
    layoutWidth: Math.round(clamp(physicalViewportWidth - horizontalPadding, 320, maxLayoutWidth)),
    viewerHeight: Math.round(clamp(physicalViewportHeight - verticalChrome, 240, 860)),
  };
}

function normalizeRelatedScrapbooks(scrapbooks) {
  return (Array.isArray(scrapbooks) ? scrapbooks : [])
    .filter((scrapbook) => Array.isArray(scrapbook?.pageImageUrls) && scrapbook.pageImageUrls.length > 0)
    .map((scrapbook, scrapbookIndex) => ({
      id: String(scrapbook.scrapbookId || ''),
      year: String(scrapbook.scrapbookYear || '').trim(),
      title: String(scrapbook.title || `${scrapbook.scrapbookYear} Scrapbook`).trim(),
      pages: scrapbook.pageImageUrls,
      pageCount: Number(scrapbook.pageCount || scrapbook.pageImageUrls.length || 0),
      pdfUrl: String(scrapbook.pdfUrl || '').trim(),
      uploadTimestamp: String(scrapbook.uploadTimestamp || ''),
      tone: scrapbookIndex % 2 === 0 ? 'gold' : 'purple',
    }))
    .filter((scrapbook) => /^\d{4}$/.test(scrapbook.year))
    .sort((leftScrapbook, rightScrapbook) => Number(leftScrapbook.year) - Number(rightScrapbook.year));
}

function normalizeRelatedHistories(histories) {
  return (Array.isArray(histories) ? histories : [])
    .map((history) => {
      const key = String(history?.key || '').trim();
      const title = String(history?.title || '').trim();
      const description = String(history?.description || '').trim();

      return {
        historyId: String(history?.historyId || ''),
        key,
        title: title || 'Club History',
        description,
        pdfUrl: String(history?.pdfUrl || '').trim(),
        uploadTimestamp: String(history?.uploadTimestamp || ''),
        years: extractAssociatedYears([key, title, description]),
      };
    })
    .filter((history) => history.pdfUrl)
    .sort((leftHistory, rightHistory) => {
      const leftTimestamp = new Date(leftHistory.uploadTimestamp || 0).getTime();
      const rightTimestamp = new Date(rightHistory.uploadTimestamp || 0).getTime();
      return rightTimestamp - leftTimestamp;
    });
}

function extractAssociatedYears(values) {
  const detectedYears = new Set();

  for (const value of values) {
    const matches = String(value || '').match(/\b(19|20)\d{2}\b/g) || [];

    for (const match of matches) {
      detectedYears.add(match);
    }
  }

  return Array.from(detectedYears).sort((leftYear, rightYear) => Number(leftYear) - Number(rightYear));
}

function DocumentIcon({ className = '' }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 3.75H13.75L18.25 8.25V18.75C18.25 19.5784 17.5784 20.25 16.75 20.25H8C7.17157 20.25 6.5 19.5784 6.5 18.75V5.25C6.5 4.42157 7.17157 3.75 8 3.75Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M13.5 3.75V8.5H18.25" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.5 12H15.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9.5 15.5H15.25" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function BackIcon({ className = '' }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path d="M11.5 4.5L6 10L11.5 15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.75 10H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ExpandIcon({ className = '' }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M4 9V4H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 4H20V9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 15V20H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 20H4V15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
