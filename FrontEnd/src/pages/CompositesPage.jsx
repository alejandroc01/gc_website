import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import CompositeCopyrightNotice from '../components/Composite/CompositeCopyrightNotice.jsx';
import PublicCompositeStage from '../components/Composite/PublicCompositeStage.jsx';
import MemberProfileModal from '../components/MemberProfile/MemberProfileModal.jsx';
import { getComposites, getHistories, getScrapbooks } from '../api/composites.js';
import '../styles/composites.css';
import './CompositesPage.css';

const PDF_VIEWER_OPTIONS = '#toolbar=0&navpanes=0&scrollbar=0&view=FitH&zoom=page-width';

export default function CompositesPage({ displayMode = false, onBack = null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [composites, setComposites] = useState([]);
  const [relatedScrapbooks, setRelatedScrapbooks] = useState([]);
  const [relatedHistories, setRelatedHistories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRelatedMedia, setIsLoadingRelatedMedia] = useState(true);
  const [pageError, setPageError] = useState('');
  const [relatedMediaError, setRelatedMediaError] = useState('');
  const [yearInput, setYearInput] = useState('');
  const [yearError, setYearError] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRelatedMediaMenuOpen, setIsRelatedMediaMenuOpen] = useState(false);
  const [activeRelatedMedia, setActiveRelatedMedia] = useState(null);
  const [activeScrapbookPageIndex, setActiveScrapbookPageIndex] = useState(0);
  const [isScrapbookPageReady, setIsScrapbookPageReady] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState('');
  const [sliderDragState, setSliderDragState] = useState(null);
  const relatedMenuRef = useRef(null);
  const relatedScrapbookImageRef = useRef(null);
  const previousSelectedYearIndexRef = useRef(-1);

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
  const activeSliderProgress = sliderDragState ? sliderDragState.progress : sliderProgress;
  const activeSliderIndex = sliderDragState ? sliderDragState.index : selectedYearIndex;
  const sliderTravelDistance = previousSelectedYearIndexRef.current >= 0 && selectedYearIndex >= 0
    ? Math.abs(selectedYearIndex - previousSelectedYearIndexRef.current)
    : 0;
  const sliderAnimationMs = sliderDragState
    ? sliderDragState.durationMs ?? (sliderDragState.isSettling ? 120 : 0)
    : clamp(38 + (sliderTravelDistance * 16), 38, 260);
  const confirmedAnnotations = useMemo(
    () => (Array.isArray(selectedComposite?.annotations) ? selectedComposite.annotations : [])
      .filter((annotation) => Boolean(annotation.profileId)),
    [selectedComposite],
  );
  const oldestYear = availableYears[0] || '';
  const newestYear = availableYears[availableYears.length - 1] || '';
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
  const hasCompositeViewer = !isLoading && !pageError && Boolean(selectedComposite);

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

  const compositeContent = (
    <>
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
                  aria-describedby={yearError ? 'composites-year-error' : undefined}
                />
              </label>

              <span className="compositesPage__yearBound compositesPage__yearBound--end">{newestYear}</span>
            </div>

            <div
              className="compositesPage__sliderShell"
              onPointerDown={handleSliderPointerDown}
              style={{
                '--slider-progress': `${activeSliderProgress * 100}%`,
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
                value={Math.max(activeSliderIndex, 0)}
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
    </>
  );

  return (
    <section
      className={[
        'section',
        'compositesPage',
        displayMode ? 'compositesPage--displayMode' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="container">
        <div className="compositesPage__scaleViewport">
          <div
            className={[
              'compositesPage__scaleCanvas',
              hasCompositeViewer ? 'compositesPage__scaleCanvas--hasViewer' : '',
            ].filter(Boolean).join(' ')}
          >
            {displayMode ? (
              <div className="compositesPage__displayLayout">
                <aside className="compositesPage__displaySidebar" aria-label="Composite display overview">
                  <button
                    type="button"
                    className="button compositesPage__displayBackButton"
                    onClick={() => onBack?.()}
                  >
                    <BackIcon className="compositesPage__displayBackIcon" />
                    Return to Home
                  </button>

                  <div className="compositesPage__displayIntro">
                    <p className="compositesPage__displayEyebrow">German Club Digital Archives</p>
                    <h1 className="compositesPage__displayTitle">Composites</h1>
                    <p className="compositesPage__displayLede">
                      These composites capture the members of the German Club for each academic year.
                      Use the timeline to explore different years.
                    </p>
                  </div>

                  <div className="compositesPage__displayTips">
                    <h2 className="compositesPage__displayTipsTitle">Viewing Tips</h2>
                    <div className="compositesPage__displayTip">
                      <span className="compositesPage__displayTipIcon"><CalendarIcon /></span>
                      <div>
                        <strong>Explore years</strong>
                        <span>Move the timeline or type a year under Selected Year.</span>
                      </div>
                    </div>
                    <div className="compositesPage__displayTip">
                      <span className="compositesPage__displayTipIcon"><MemberTipIcon /></span>
                      <div>
                        <strong>Open profiles</strong>
                        <span>Left click a portrait to view that member's archive profile.</span>
                      </div>
                    </div>
                    <div className="compositesPage__displayTip">
                      <span className="compositesPage__displayTipIcon"><ExpandIcon /></span>
                      <div>
                        <strong>Fullscreen, zoom and pan</strong>
                        <span>Open fullscreen, hold right click to pan, and use the scroll wheel to zoom.</span>
                      </div>
                    </div>
                    <div className="compositesPage__displayTip">
                      <span className="compositesPage__displayTipIcon"><DocumentIcon /></span>
                      <div>
                        <strong>Related media</strong>
                        <span>Use the document button to open scrapbooks and history for the selected year.</span>
                      </div>
                    </div>
                  </div>
                </aside>

                <div className="compositesPage__displayMain">
                  {compositeContent}
                </div>
              </div>
            ) : (
              <>
                <header className="compositePageHeader compositesPage__header">
                  <p className="compositePageHeader__eyebrow">German Club Digital Archives</p>
                  <h1 className="compositePageHeader__title">Composites</h1>
                </header>
                {compositeContent}
              </>
            )}

            {false && (
              <>
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
              </>
            )}
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
          archiveLinkBuilder={displayMode ? buildDisplayArchiveLink : null}
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

function buildDisplayArchiveLink({ kind, year, pageNumber, to }) {
  if (kind === 'composite') {
    return buildDisplayModeLink('composites', { year });
  }

  if (kind === 'scrapbookPage' || kind === 'scrapbook') {
    return buildDisplayModeLink('scrapbooks', {
      year,
      scrapbookPage: pageNumber,
    });
  }

  return to || '/display-mode?mode=display&page=composites';
}

function buildDisplayModeLink(page, params = {}) {
  const searchParams = new URLSearchParams({
    mode: 'display',
    page,
  });

  Object.entries(params).forEach(([key, value]) => {
    const normalizedValue = String(value ?? '').trim();

    if (normalizedValue) {
      searchParams.set(key, normalizedValue);
    }
  });

  return `/display-mode?${searchParams.toString()}`;
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

function CalendarIcon({ className = '' }) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
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

function MemberTipIcon({ className = '' }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 80.13 80.13" fill="currentColor" aria-hidden="true">
      <path d="M40.656,41.984c6.491,0,11.752-5.262,11.752-11.752s-5.262-11.751-11.752-11.751c-6.49,0-11.754,5.262-11.754,11.752S34.166,41.984,40.656,41.984z" />
      <path d="M45.641,42.785h-9.972c-8.297,0-15.047,6.751-15.047,15.048v12.195l0.031,0.191l0.84,0.263c7.918,2.474,14.797,3.299,20.459,3.299c11.059,0,17.469-3.153,17.864-3.354l0.785-0.397h0.084V57.833C60.688,49.536,53.938,42.785,45.641,42.785z" />
    </svg>
  );
}
