import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getComposites, getHistories, getScrapbooks } from '../api/composites.js';
import './HistoryPage.css';

const PDF_VIEWER_OPTIONS = '#toolbar=0&navpanes=0&scrollbar=0';
const PDF_DISPLAY_ZOOM = 'page-width';
const PDF_FULLSCREEN_DEFAULT_ZOOM = 100;
const PDF_FULLSCREEN_MIN_ZOOM = 50;
const PDF_FULLSCREEN_MAX_ZOOM = 250;
const PDF_FULLSCREEN_ZOOM_STEP = 25;

export default function HistoryPage({ displayMode = false, onBack = null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeDocument, setActiveDocument] = useState(null);
  const [historyDocuments, setHistoryDocuments] = useState([]);
  const [isLoadingHistories, setIsLoadingHistories] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('q') || '');
  const [relatedComposites, setRelatedComposites] = useState([]);
  const [relatedScrapbooks, setRelatedScrapbooks] = useState([]);
  const [isLoadingRelatedMedia, setIsLoadingRelatedMedia] = useState(displayMode);
  const [relatedMediaError, setRelatedMediaError] = useState('');
  const [yearInput, setYearInput] = useState('');
  const [yearError, setYearError] = useState('');
  const [isFullscreenViewerOpen, setIsFullscreenViewerOpen] = useState(false);
  const [fullscreenZoomPercent, setFullscreenZoomPercent] = useState(PDF_FULLSCREEN_DEFAULT_ZOOM);
  const [isRelatedMediaMenuOpen, setIsRelatedMediaMenuOpen] = useState(false);
  const [activeRelatedMedia, setActiveRelatedMedia] = useState(null);
  const [activeScrapbookPageIndex, setActiveScrapbookPageIndex] = useState(0);
  const [isScrapbookPageReady, setIsScrapbookPageReady] = useState(false);
  const [sliderDragState, setSliderDragState] = useState(null);
  const relatedMenuRef = useRef(null);
  const relatedScrapbookImageRef = useRef(null);
  const fullscreenViewerWrapRef = useRef(null);
  const previousSelectedYearIndexRef = useRef(-1);

  useEffect(() => {
    setSearchQuery(searchParams.get('q') || '');
  }, [searchParams]);

  const requestedHistoryKey = useMemo(
    () => String(searchParams.get('history') || '').trim().toLowerCase(),
    [searchParams],
  );
  const requestedDisplayYear = useMemo(
    () => String(searchParams.get('year') || '').trim(),
    [searchParams],
  );

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
    if (!displayMode) {
      return undefined;
    }

    let isActive = true;

    const loadRelatedMedia = async () => {
      setIsLoadingRelatedMedia(true);
      setRelatedMediaError('');

      const [compositesResult, scrapbooksResult] = await Promise.allSettled([
        getComposites(),
        getScrapbooks(),
      ]);

      if (!isActive) {
        return;
      }

      const nextComposites = compositesResult.status === 'fulfilled'
        ? normalizeRelatedComposites(compositesResult.value)
        : [];
      const nextScrapbooks = scrapbooksResult.status === 'fulfilled'
        ? normalizeRelatedScrapbooks(scrapbooksResult.value)
        : [];

      setRelatedComposites(nextComposites);
      setRelatedScrapbooks(nextScrapbooks);

      if (compositesResult.status === 'rejected' && scrapbooksResult.status === 'rejected') {
        setRelatedMediaError('Related media is unavailable right now.');
      } else if (compositesResult.status === 'rejected' || scrapbooksResult.status === 'rejected') {
        setRelatedMediaError('Some related media could not be loaded.');
      }

      setIsLoadingRelatedMedia(false);
    };

    loadRelatedMedia().catch(() => {
      if (isActive) {
        setRelatedComposites([]);
        setRelatedScrapbooks([]);
        setRelatedMediaError('Related media is unavailable right now.');
        setIsLoadingRelatedMedia(false);
      }
    });

    return () => {
      isActive = false;
    };
  }, [displayMode]);

  useEffect(() => {
    if (!requestedHistoryKey) {
      setActiveDocument(null);
      return;
    }

    if (isLoadingHistories) {
      return;
    }

    const requestedDocument = historyDocuments.find(
      (document) => document.key.toLowerCase() === requestedHistoryKey,
    );

    setActiveDocument(requestedDocument || null);
  }, [historyDocuments, isLoadingHistories, requestedHistoryKey]);

  const displayDocuments = useMemo(
    () => historyDocuments
      .filter((document) => document.primaryYear)
      .sort(compareHistoriesByYear),
    [historyDocuments],
  );
  const availableYears = useMemo(
    () => displayDocuments.map((document) => document.primaryYear),
    [displayDocuments],
  );
  const selectedDisplayDocument = useMemo(() => {
    if (displayDocuments.length === 0) {
      return null;
    }

    return displayDocuments.find((document) => document.primaryYear === requestedDisplayYear)
      || displayDocuments[displayDocuments.length - 1];
  }, [displayDocuments, requestedDisplayYear]);
  const selectedYear = selectedDisplayDocument?.primaryYear || '';
  const selectedYearIndex = availableYears.indexOf(selectedYear);
  const sliderProgress = availableYears.length > 1
    ? Math.max(selectedYearIndex, 0) / (availableYears.length - 1)
    : 0;
  const activeSliderProgress = sliderDragState ? sliderDragState.progress : sliderProgress;
  const activeSliderIndex = sliderDragState ? sliderDragState.index : selectedYearIndex;
  const sliderTravelDistance = previousSelectedYearIndexRef.current >= 0 && selectedYearIndex >= 0
    ? Math.abs(selectedYearIndex - previousSelectedYearIndexRef.current)
    : 0;
  const sliderAnimationMs = sliderDragState
    ? sliderDragState.durationMs ?? (sliderDragState.isSettling ? 120 : 0)
    : clamp(38 + (sliderTravelDistance * 16), 38, 260);

  useEffect(() => {
    previousSelectedYearIndexRef.current = selectedYearIndex;
  }, [selectedYearIndex]);

  useEffect(() => {
    if (!sliderDragState?.isSettling || sliderDragState.index !== selectedYearIndex) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSliderDragState(null);
    }, (sliderDragState.durationMs ?? 120) + 40);

    return () => window.clearTimeout(timeoutId);
  }, [selectedYearIndex, sliderDragState]);

  const matchingComposites = useMemo(
    () => relatedComposites.filter((composite) => composite.year === selectedYear),
    [relatedComposites, selectedYear],
  );
  const matchingScrapbooks = useMemo(
    () => relatedScrapbooks.filter((scrapbook) => scrapbook.year === selectedYear),
    [relatedScrapbooks, selectedYear],
  );
  const relatedMediaOptions = useMemo(
    () => [
      ...matchingComposites.map((composite) => ({
        optionId: `composite-${composite.id}`,
        type: 'composite',
        actionLabel: 'Show Composite',
        detail: composite.title,
        item: composite,
      })),
      ...matchingScrapbooks.map((scrapbook) => ({
        optionId: `scrapbook-${scrapbook.id}`,
        type: 'scrapbook',
        actionLabel: 'Show Scrapbook',
        detail: scrapbook.title,
        item: scrapbook,
      })),
    ],
    [matchingComposites, matchingScrapbooks],
  );

  useEffect(() => {
    if (!displayMode || !selectedYear || requestedDisplayYear === selectedYear) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('year', selectedYear);
    setSearchParams(nextSearchParams, { replace: true });
  }, [displayMode, requestedDisplayYear, searchParams, selectedYear, setSearchParams]);

  useEffect(() => {
    if (!isFullscreenViewerOpen) {
      return undefined;
    }

    const fullscreenViewerWrap = fullscreenViewerWrapRef.current;
    if (!fullscreenViewerWrap) {
      return undefined;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      fullscreenViewerWrap.scrollLeft = Math.max(
        0,
        (fullscreenViewerWrap.scrollWidth - fullscreenViewerWrap.clientWidth) / 2,
      );
    });

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [fullscreenZoomPercent, isFullscreenViewerOpen, selectedDisplayDocument?.historyId]);

  useEffect(() => {
    setYearInput(selectedYear);
    setYearError('');
    setIsRelatedMediaMenuOpen(false);
    setActiveRelatedMedia(null);
    setActiveScrapbookPageIndex(0);
    setIsScrapbookPageReady(false);
  }, [selectedYear]);

  useEffect(() => {
    if (!displayMode || !isRelatedMediaMenuOpen) {
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
  }, [displayMode, isRelatedMediaMenuOpen]);

  const handleCloseRelatedMedia = useCallback(() => {
    setActiveRelatedMedia(null);
    setActiveScrapbookPageIndex(0);
    setIsScrapbookPageReady(false);
  }, []);

  useEffect(() => {
    if (!displayMode || (!isFullscreenViewerOpen && !activeRelatedMedia && !isRelatedMediaMenuOpen)) {
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

      if (activeRelatedMedia) {
        handleCloseRelatedMedia();
        return;
      }

      if (isRelatedMediaMenuOpen) {
        setIsRelatedMediaMenuOpen(false);
        return;
      }

      setIsFullscreenViewerOpen(false);
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [
    activeRelatedMedia,
    displayMode,
    handleCloseRelatedMedia,
    isFullscreenViewerOpen,
    isRelatedMediaMenuOpen,
  ]);

  useEffect(() => {
    if (!displayMode || (!isFullscreenViewerOpen && !activeRelatedMedia)) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [activeRelatedMedia, displayMode, isFullscreenViewerOpen]);

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

    const nextSearchParams = new URLSearchParams(searchParams);
    const trimmedQuery = nextQuery.trim();

    if (trimmedQuery) {
      nextSearchParams.set('q', trimmedQuery);
    } else {
      nextSearchParams.delete('q');
    }

    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleOpenDocument = (document) => {
    setActiveDocument(document);

    if (!document?.key) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('history', document.key);
    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleCloseDocument = () => {
    setActiveDocument(null);

    if (!searchParams.get('history')) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('history');
    setSearchParams(nextSearchParams, { replace: true });
  };

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

  const getSliderStateForPointer = useCallback((event, sliderElement) => {
    const maxIndex = availableYears.length - 1;
    const rect = sliderElement.getBoundingClientRect();
    const progress = rect.width > 0
      ? clamp((event.clientX - rect.left) / rect.width, 0, 1)
      : 0;
    const index = clamp(Math.round(progress * maxIndex), 0, maxIndex);

    return {
      progress,
      index,
      isSettling: false,
    };
  }, [availableYears.length]);

  const handleSliderPointerDown = useCallback((event) => {
    if (availableYears.length <= 1) {
      return;
    }

    event.preventDefault();

    const sliderElement = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const dragThreshold = 4;
    let hasDragged = false;

    setYearError('');

    const handlePointerMove = (pointerEvent) => {
      const distanceX = Math.abs(pointerEvent.clientX - startX);
      const distanceY = Math.abs(pointerEvent.clientY - startY);

      if (!hasDragged && Math.max(distanceX, distanceY) < dragThreshold) {
        return;
      }

      hasDragged = true;
      setSliderDragState({
        ...getSliderStateForPointer(pointerEvent, sliderElement),
        durationMs: 0,
      });
    };

    const handlePointerUp = (pointerEvent) => {
      const nextSliderState = getSliderStateForPointer(pointerEvent, sliderElement);
      const snappedProgress = availableYears.length > 1
        ? nextSliderState.index / (availableYears.length - 1)
        : 0;
      const nextYear = availableYears[nextSliderState.index] || selectedYear;
      const durationMs = hasDragged ? 120 : 220;

      setSliderDragState({
        progress: snappedProgress,
        index: nextSliderState.index,
        isSettling: true,
        durationMs,
      });
      handleSelectYear(nextYear);

      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, [availableYears, getSliderStateForPointer, handleSelectYear, selectedYear]);

  const handleCommitYearInput = useCallback(() => {
    const normalizedYear = yearInput.trim();

    if (availableYears.includes(normalizedYear)) {
      handleSelectYear(normalizedYear);
      return;
    }

    if (!normalizedYear) {
      setYearError('Enter one of the uploaded history years.');
      return;
    }

    setYearError(`No club history document is available for ${normalizedYear}.`);
  }, [availableYears, handleSelectYear, yearInput]);

  const handleOpenRelatedMedia = useCallback((option) => {
    if (!option?.item) {
      return;
    }

    setIsRelatedMediaMenuOpen(false);
    setActiveRelatedMedia(option);
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

  useEffect(() => {
    if (!activeDocument) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        handleCloseDocument();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeDocument, handleCloseDocument]);

  if (displayMode) {
    return (
      <div className="historyPage historyPage--displayMode">
        <div className="historyPage__displayLayout">
          <aside className="historyPage__displaySidebar" aria-label="History display overview">
            <button
              type="button"
              className="button historyPage__displayBackButton"
              onClick={() => onBack?.()}
            >
              <BackIcon className="historyPage__displayBackIcon" />
              Return to Home
            </button>

            <div className="historyPage__displayIntro">
              <p className="historyPage__displayEyebrow">German Club Digital Archives</p>
              <h1 className="historyPage__displayTitle">Club History</h1>
              <p className="historyPage__displayLede">
                Browse club history documents by year and open archival PDFs for a full-screen reading view.
              </p>
            </div>

            <div className="historyPage__displayTips">
              <h2 className="historyPage__displayTipsTitle">Viewing Tips</h2>
              <div className="historyPage__displayTip">
                <span className="historyPage__displayTipIcon"><CalendarIcon /></span>
                <div>
                  <strong>Explore years</strong>
                  <span>Move the timeline or type a year under Selected Year.</span>
                </div>
              </div>
              <div className="historyPage__displayTip">
                <span className="historyPage__displayTipIcon"><ExpandIcon /></span>
                <div>
                  <strong>Fullscreen document</strong>
                  <span>Use the fullscreen button to enlarge the document to the full screen.</span>
                </div>
              </div>
              <div className="historyPage__displayTip">
                <span className="historyPage__displayTipIcon"><DocumentIcon /></span>
                <div>
                  <strong>Related media</strong>
                  <span>Use the document button to open composites and scrapbooks for the selected year.</span>
                </div>
              </div>
            </div>
          </aside>

          <main className="historyPage__displayMain">
            {loadError ? (
              <article className="historyPage__displayShell historyPage__displayShell--message">
                <p className="historyPage__displayMessage historyPage__displayMessage--error">{loadError}</p>
              </article>
            ) : null}

            {isLoadingHistories ? (
              <article className="historyPage__displayShell historyPage__displayShell--message">
                <p className="historyPage__displayMessage">Loading club history documents...</p>
              </article>
            ) : null}

            {!isLoadingHistories && !loadError && displayDocuments.length === 0 ? (
              <article className="historyPage__displayShell historyPage__displayShell--message">
                <p className="historyPage__displayMessage">No club history documents with years are available yet.</p>
              </article>
            ) : null}

            {!isLoadingHistories && !loadError && selectedDisplayDocument ? (
              <article className="historyPage__displayShell">
                <div className="historyPage__displayControlStrip">
                  <div className="historyPage__displayYearRow">
                    <span className="historyPage__displayYearBound historyPage__displayYearBound--start">
                      {availableYears[0]}
                    </span>

                    <label className="historyPage__displaySelectedYear">
                      <span className="historyPage__displaySelectedYearLabel">Selected year</span>
                      <input
                        className={[
                          'historyPage__displayYearInput',
                          yearError ? 'historyPage__displayYearInput--invalid' : '',
                        ].filter(Boolean).join(' ')}
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={sliderDragState ? availableYears[sliderDragState.index] || yearInput : yearInput}
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
                        aria-describedby={yearError ? 'history-display-year-error' : undefined}
                      />
                    </label>

                    <span className="historyPage__displayYearBound historyPage__displayYearBound--end">
                      {availableYears[availableYears.length - 1]}
                    </span>
                  </div>

                  <div
                    className="historyPage__displaySliderShell"
                    onPointerDown={handleSliderPointerDown}
                    style={{
                      '--slider-progress': `${activeSliderProgress * 100}%`,
                      '--slider-duration': `${sliderAnimationMs}ms`,
                    }}
                  >
                    <div className="historyPage__displaySliderVisual" aria-hidden="true">
                      <span className="historyPage__displaySliderTrack" />
                      <span className="historyPage__displaySliderFill" />
                      <span className="historyPage__displaySliderThumb" />
                    </div>

                    <input
                      className="historyPage__displaySliderInput"
                      type="range"
                      min="0"
                      max={Math.max(availableYears.length - 1, 0)}
                      step="1"
                      value={Math.max(activeSliderIndex, 0)}
                      disabled={availableYears.length <= 1}
                      onChange={(event) => handleSelectYear(availableYears[Number(event.target.value)] || selectedYear)}
                      aria-label="Select club history document year"
                    />
                  </div>

                  {yearError ? (
                    <p id="history-display-year-error" className="historyPage__displayMessage historyPage__displayMessage--error">
                      {yearError}
                    </p>
                  ) : null}
                </div>

                <div className="historyPage__displayDivider" aria-hidden="true" />

                <div className="historyPage__displayViewerBody">
                  <div className="historyPage__displayDocumentHeader">
                    <h2 className="historyPage__displayDocumentTitle">{selectedDisplayDocument.title}</h2>
                  </div>

                  <div className="historyPage__displayViewerStage">
                    <div
                      ref={relatedMenuRef}
                      className={[
                        'historyPage__displayRelatedMedia',
                        isRelatedMediaMenuOpen ? 'historyPage__displayRelatedMedia--open' : '',
                      ].join(' ')}
                    >
                      <button
                        type="button"
                        className="button historyPage__displayControlButton historyPage__displayRelatedButton"
                        onClick={() => setIsRelatedMediaMenuOpen((currentValue) => !currentValue)}
                        aria-haspopup="menu"
                        aria-expanded={isRelatedMediaMenuOpen ? 'true' : 'false'}
                        aria-label={`Show related media for ${selectedYear}`}
                      >
                        <DocumentIcon className="historyPage__displayRelatedIcon" />
                      </button>

                      <div
                        className={[
                          'historyPage__displayRelatedDropdown',
                          isRelatedMediaMenuOpen ? 'historyPage__displayRelatedDropdown--open' : '',
                        ].join(' ')}
                        role="menu"
                        aria-label={`Related media for ${selectedYear}`}
                      >
                        <div className="historyPage__displayRelatedDropdownHeader">
                          <p className="historyPage__displayRelatedDropdownEyebrow">Related Media</p>
                          <p className="historyPage__displayRelatedDropdownYear">{selectedYear}</p>
                        </div>

                        {isLoadingRelatedMedia ? (
                          <p className="historyPage__displayRelatedDropdownMessage">Checking related media...</p>
                        ) : relatedMediaOptions.length > 0 ? (
                          <div className="historyPage__displayRelatedDropdownList">
                            {relatedMediaOptions.map((option) => (
                              <button
                                key={option.optionId}
                                type="button"
                                className="historyPage__displayRelatedDropdownItem"
                                onClick={() => handleOpenRelatedMedia(option)}
                                role="menuitem"
                              >
                                <span className="historyPage__displayRelatedDropdownAction">{option.actionLabel}</span>
                                <span className="historyPage__displayRelatedDropdownDetail">{option.detail}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="historyPage__displayRelatedDropdownMessage">
                            {relatedMediaError || `No related media for ${selectedYear}.`}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="button historyPage__displayControlButton historyPage__displayExpandButton"
                      onClick={() => {
                        setFullscreenZoomPercent(PDF_FULLSCREEN_DEFAULT_ZOOM);
                        setIsFullscreenViewerOpen(true);
                      }}
                      aria-label={`Open ${selectedDisplayDocument.title} in the fullscreen viewer`}
                    >
                      <ExpandIcon className="historyPage__displayExpandIcon" />
                    </button>

                    <iframe
                      className="historyPage__displayViewer"
                      src={buildPdfViewerUrl(selectedDisplayDocument.pdfUrl, PDF_DISPLAY_ZOOM)}
                      title={selectedDisplayDocument.title}
                      tabIndex={-1}
                    />
                    <div
                      className="historyPage__displayViewerShield"
                      aria-hidden="true"
                      onContextMenu={(event) => event.preventDefault()}
                    />
                  </div>
                </div>
              </article>
            ) : null}
          </main>
        </div>

        {isFullscreenViewerOpen && selectedDisplayDocument ? (
          <div
            className="historyPage__displayFullscreenBackdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setIsFullscreenViewerOpen(false);
              }
            }}
          >
            <section
              className="historyPage__displayFullscreen"
              role="dialog"
              aria-modal="true"
              aria-label={`${selectedDisplayDocument.title} fullscreen viewer`}
            >
              <button
                type="button"
                className="button historyPage__displayControlButton historyPage__displayFullscreenClose"
                onClick={() => setIsFullscreenViewerOpen(false)}
                aria-label="Close fullscreen history viewer"
              >
                X
              </button>

              <div className="historyPage__displayFullscreenZoomControls" aria-label="Fullscreen document zoom controls">
                <button
                  type="button"
                  className="button historyPage__displayFullscreenZoomButton"
                  onClick={() => setFullscreenZoomPercent((currentZoom) => (
                    clamp(currentZoom - PDF_FULLSCREEN_ZOOM_STEP, PDF_FULLSCREEN_MIN_ZOOM, PDF_FULLSCREEN_MAX_ZOOM)
                  ))}
                  disabled={fullscreenZoomPercent <= PDF_FULLSCREEN_MIN_ZOOM}
                  aria-label="Zoom out"
                >
                  -
                </button>
                <span className="historyPage__displayFullscreenZoomValue">{fullscreenZoomPercent}%</span>
                <button
                  type="button"
                  className="button historyPage__displayFullscreenZoomButton"
                  onClick={() => setFullscreenZoomPercent((currentZoom) => (
                    clamp(currentZoom + PDF_FULLSCREEN_ZOOM_STEP, PDF_FULLSCREEN_MIN_ZOOM, PDF_FULLSCREEN_MAX_ZOOM)
                  ))}
                  disabled={fullscreenZoomPercent >= PDF_FULLSCREEN_MAX_ZOOM}
                  aria-label="Zoom in"
                >
                  +
                </button>
              </div>

              <div className="historyPage__displayFullscreenViewerWrap" ref={fullscreenViewerWrapRef}>
                <div
                  className="historyPage__displayFullscreenViewerCanvas"
                  style={{ '--history-fullscreen-document-width': `${fullscreenZoomPercent}%` }}
                >
                  <iframe
                    className="historyPage__displayFullscreenViewer"
                    src={buildPdfViewerUrl(selectedDisplayDocument.pdfUrl, PDF_DISPLAY_ZOOM)}
                    title={`${selectedDisplayDocument.title} fullscreen`}
                    tabIndex={-1}
                  />
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {activeRelatedMedia ? (
          <RelatedMediaModal
            activeRelatedMedia={activeRelatedMedia}
            activeScrapbookPageIndex={activeScrapbookPageIndex}
            isScrapbookPageReady={isScrapbookPageReady}
            relatedScrapbookImageRef={relatedScrapbookImageRef}
            onClose={handleCloseRelatedMedia}
            onPreviousScrapbookPage={handleShowPreviousScrapbookPage}
            onNextScrapbookPage={handleShowNextScrapbookPage}
            onScrapbookImageReady={() => setIsScrapbookPageReady(true)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="historyPage">
      <section className="historyPage__hero section">
        <div className="container historyPage__heroGrid">
          <div className="historyPage__intro">
            <p className="historyPage__eyebrow">German Club Alumni Archives</p>
            <h1 className="historyPage__title">Club History</h1>
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
                  <h2 className="historyPage__sectionTitle">Club History Library</h2>
                </div>
              </div>
              <label className="historyPage__search" htmlFor="history-document-search">
                <span className="sr-only">Search club history documents</span>
                <input
                  id="history-document-search"
                  className="historyPage__searchInput"
                  type="search"
                  placeholder="Search by club history name"
                  value={searchQuery}
                  onChange={handleSearchChange}
                />
              </label>
            </div>

            <div className="historyPage__libraryContent">
              {loadError ? (
                <div className="historyPage__emptyState">
                  <p className="historyPage__emptyTitle">Unable to load club history PDFs.</p>
                  <p className="historyPage__emptyCopy">{loadError}</p>
                </div>
              ) : isLoadingHistories ? (
                <div className="historyPage__emptyState">
                  <p className="historyPage__emptyTitle">Loading club history PDFs...</p>
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
                          onClick={() => handleOpenDocument(document)}
                        >
                          Open Club History
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : historyDocuments.length > 0 && normalizedSearchQuery ? (
                <div className="historyPage__emptyState">
                  <p className="historyPage__emptyTitle">No matching club history PDFs.</p>
                  <p className="historyPage__emptyCopy">Try a different club history name.</p>
                </div>
              ) : (
                <div className="historyPage__emptyState">
                  <p className="historyPage__emptyTitle">No club history PDFs added yet.</p>
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
            aria-label="Close club history document viewer"
            onClick={handleCloseDocument}
          />

          <div className="historyPage__modalPanel">
            <div className="historyPage__modalHeader">
              <div>
                <p className="historyPage__modalLabel">Club History Viewer</p>
                <h2 id="history-document-title" className="historyPage__modalTitle">
                  {activeDocument.title}
                </h2>
              </div>

              <button
                type="button"
                className="historyPage__modalClose"
                aria-label="Close club history document viewer"
                onClick={handleCloseDocument}
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

function RelatedMediaModal({
  activeRelatedMedia,
  activeScrapbookPageIndex,
  isScrapbookPageReady,
  relatedScrapbookImageRef,
  onClose,
  onPreviousScrapbookPage,
  onNextScrapbookPage,
  onScrapbookImageReady,
}) {
  const { item, type } = activeRelatedMedia;

  return (
    <div
      className="historyPage__relatedModalBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className={[
          'historyPage__relatedModal',
          `historyPage__relatedModal--${type}`,
        ].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
      >
        <div className="historyPage__relatedModalHeader">
          <button
            type="button"
            className="button historyPage__relatedBackButton"
            onClick={onClose}
          >
            <BackIcon className="historyPage__relatedBackIcon" />
            Back to History
          </button>

          <div className="historyPage__relatedModalTitleWrap">
            <p className="historyPage__relatedModalEyebrow">Related Media</p>
            <h2 className="historyPage__relatedModalTitle">{item.title}</h2>
          </div>
        </div>

        {type === 'composite' ? (
          <div className="historyPage__relatedCompositeFrame">
            <img
              className="historyPage__relatedCompositeImage"
              src={item.imageUrl}
              alt={item.title}
            />
          </div>
        ) : (
          <>
            <div className="historyPage__relatedScrapbookFrame">
              <div className="historyPage__relatedScrapbookMeta">
                <span className="historyPage__relatedScrapbookYear">{item.year}</span>
                <strong className="historyPage__relatedScrapbookLabel">Scrapbook</strong>
              </div>

              <div className="historyPage__relatedScrapbookStage">
                <button
                  type="button"
                  className="historyPage__relatedScrapbookArrow historyPage__relatedScrapbookArrow--left"
                  onClick={onPreviousScrapbookPage}
                  disabled={activeScrapbookPageIndex === 0}
                  aria-label="Go to previous scrapbook page"
                >
                  &#8249;
                </button>

                <div className="historyPage__relatedScrapbookImagePanel">
                  <img
                    ref={relatedScrapbookImageRef}
                    className={[
                      'historyPage__relatedScrapbookImage',
                      isScrapbookPageReady
                        ? 'historyPage__relatedScrapbookImage--ready'
                        : 'historyPage__relatedScrapbookImage--loading',
                    ].join(' ')}
                    src={item.pages[activeScrapbookPageIndex]}
                    alt={`${item.title} page ${activeScrapbookPageIndex + 1}`}
                    onLoad={onScrapbookImageReady}
                    onError={onScrapbookImageReady}
                  />
                </div>

                <button
                  type="button"
                  className="historyPage__relatedScrapbookArrow historyPage__relatedScrapbookArrow--right"
                  onClick={onNextScrapbookPage}
                  disabled={activeScrapbookPageIndex === item.pages.length - 1}
                  aria-label="Go to next scrapbook page"
                >
                  &#8250;
                </button>
              </div>
            </div>

            <div className="historyPage__relatedModalFooter">
              <p className="historyPage__relatedModalStatus">
                Page {activeScrapbookPageIndex + 1} of {item.pages.length}
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function normalizeHistories(histories) {
  return (Array.isArray(histories) ? histories : [])
    .map((history) => {
      const key = String(history?.key || '');
      const title = String(history?.title || '');
      const description = String(history?.description || '');
      const years = extractAssociatedYears([key, title, description]);

      return {
        historyId: String(history?.historyId || ''),
        key,
        title,
        description,
        pdfUrl: String(history?.pdfUrl || ''),
        uploadTimestamp: String(history?.uploadTimestamp || ''),
        years,
        primaryYear: years[years.length - 1] || '',
      };
    })
    .filter((history) => history.pdfUrl)
    .sort((leftHistory, rightHistory) => {
      const leftTimestamp = new Date(leftHistory.uploadTimestamp || 0).getTime();
      const rightTimestamp = new Date(rightHistory.uploadTimestamp || 0).getTime();
      return rightTimestamp - leftTimestamp;
    });
}

function normalizeRelatedComposites(composites) {
  return (Array.isArray(composites) ? composites : [])
    .map((composite) => ({
      id: String(composite?.compositeId || ''),
      year: String(composite?.compositeYear || '').trim(),
      title: `${String(composite?.compositeYear || '').trim()} Composite`,
      imageUrl: String(composite?.imageUrl || '').trim(),
    }))
    .filter((composite) => /^\d{4}$/.test(composite.year) && composite.imageUrl)
    .sort((leftComposite, rightComposite) => Number(leftComposite.year) - Number(rightComposite.year));
}

function normalizeRelatedScrapbooks(scrapbooks) {
  return (Array.isArray(scrapbooks) ? scrapbooks : [])
    .filter((scrapbook) => Array.isArray(scrapbook?.pageImageUrls) && scrapbook.pageImageUrls.length > 0)
    .map((scrapbook) => ({
      id: String(scrapbook.scrapbookId || ''),
      year: String(scrapbook.scrapbookYear || '').trim(),
      title: String(scrapbook.title || `${scrapbook.scrapbookYear} Scrapbook`).trim(),
      pages: scrapbook.pageImageUrls,
      pdfUrl: String(scrapbook.pdfUrl || '').trim(),
    }))
    .filter((scrapbook) => /^\d{4}$/.test(scrapbook.year))
    .sort((leftScrapbook, rightScrapbook) => Number(leftScrapbook.year) - Number(rightScrapbook.year));
}

function compareHistoriesByYear(leftHistory, rightHistory) {
  const yearDifference = Number(leftHistory.primaryYear || 0) - Number(rightHistory.primaryYear || 0);

  if (yearDifference !== 0) {
    return yearDifference;
  }

  return String(leftHistory.title || '').localeCompare(String(rightHistory.title || ''));
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildPdfViewerUrl(pdfUrl, zoom) {
  const normalizedZoom = String(zoom || PDF_DISPLAY_ZOOM);
  return `${pdfUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH&zoom=${encodeURIComponent(normalizedZoom)}`;
}

function DocumentIcon({ className = '' }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M11.5 4.5L6 10L11.5 15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.75 10H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ExpandIcon({ className = '' }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 9V4H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 4H20V9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 15V20H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 20H4V15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CalendarIcon({ className = '' }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3.5V6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M17 3.5V6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path
        d="M5.5 5.5H18.5C19.6046 5.5 20.5 6.39543 20.5 7.5V18.5C20.5 19.6046 19.6046 20.5 18.5 20.5H5.5C4.39543 20.5 3.5 19.6046 3.5 18.5V7.5C3.5 6.39543 4.39543 5.5 5.5 5.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M4 9.5H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 13H9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 13H13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 13H17.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 17H9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 17H13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
