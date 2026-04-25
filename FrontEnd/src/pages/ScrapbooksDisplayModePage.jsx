import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getComposites, getHistories, getScrapbooks } from '../api/composites.js';
import './ScrapbooksDisplayModePage.css';

const PDF_VIEWER_OPTIONS = '#toolbar=0&navpanes=0&scrollbar=0&view=FitH&zoom=page-width';
const FULLSCREEN_MIN_ZOOM = 1;
const FULLSCREEN_MAX_ZOOM = 4;
const FULLSCREEN_WHEEL_ZOOM_STEP = 0.25;
const INLINE_IMAGE_SAFE_MARGIN_X = 42;
const INLINE_IMAGE_SAFE_MARGIN_Y = 42;

export default function ScrapbooksDisplayModePage({ onBack = null }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [scrapbooks, setScrapbooks] = useState([]);
  const [relatedComposites, setRelatedComposites] = useState([]);
  const [relatedHistories, setRelatedHistories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingRelatedMedia, setIsLoadingRelatedMedia] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [relatedMediaError, setRelatedMediaError] = useState('');
  const [yearInput, setYearInput] = useState('');
  const [yearError, setYearError] = useState('');
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [isRelatedMediaMenuOpen, setIsRelatedMediaMenuOpen] = useState(false);
  const [activeRelatedMedia, setActiveRelatedMedia] = useState(null);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);
  const [inlineImageNaturalSize, setInlineImageNaturalSize] = useState({ width: 0, height: 0 });
  const [inlineDisplaySize, setInlineDisplaySize] = useState({ width: 0, height: 0 });
  const [fullscreenZoomLevel, setFullscreenZoomLevel] = useState(FULLSCREEN_MIN_ZOOM);
  const [fullscreenImageNaturalSize, setFullscreenImageNaturalSize] = useState({ width: 0, height: 0 });
  const [fullscreenBaseSize, setFullscreenBaseSize] = useState({ width: 0, height: 0 });
  const [isFullscreenPanning, setIsFullscreenPanning] = useState(false);
  const [sliderDragState, setSliderDragState] = useState(null);
  const relatedMenuRef = useRef(null);
  const thumbnailRailRef = useRef(null);
  const inlineFitAreaRef = useRef(null);
  const fullscreenViewportRef = useRef(null);
  const fullscreenInteractionRef = useRef(null);
  const fullscreenListenersAttachedRef = useRef(false);
  const fullscreenPendingZoomFocusRef = useRef(null);
  const previousSelectedYearIndexRef = useRef(-1);
  const requestedYear = useMemo(
    () => String(searchParams.get('year') || '').trim(),
    [searchParams],
  );

  useEffect(() => {
    let isActive = true;

    const loadDisplayData = async () => {
      setIsLoading(true);
      setIsLoadingRelatedMedia(true);
      setLoadError('');
      setRelatedMediaError('');

      const [scrapbooksResult, compositesResult, historiesResult] = await Promise.allSettled([
        getScrapbooks(),
        getComposites(),
        getHistories(),
      ]);

      if (!isActive) {
        return;
      }

      if (scrapbooksResult.status === 'fulfilled') {
        setScrapbooks(normalizeScrapbooks(scrapbooksResult.value));
      } else {
        setScrapbooks([]);
        setLoadError('Scrapbooks are unavailable right now.');
      }

      setRelatedComposites(
        compositesResult.status === 'fulfilled'
          ? normalizeRelatedComposites(compositesResult.value)
          : [],
      );
      setRelatedHistories(
        historiesResult.status === 'fulfilled'
          ? normalizeRelatedHistories(historiesResult.value)
          : [],
      );

      if (compositesResult.status === 'rejected' && historiesResult.status === 'rejected') {
        setRelatedMediaError('Related media is unavailable right now.');
      } else if (compositesResult.status === 'rejected' || historiesResult.status === 'rejected') {
        setRelatedMediaError('Some related media could not be loaded.');
      }

      setIsLoading(false);
      setIsLoadingRelatedMedia(false);
    };

    loadDisplayData().catch(() => {
      if (isActive) {
        setScrapbooks([]);
        setRelatedComposites([]);
        setRelatedHistories([]);
        setLoadError('Scrapbooks are unavailable right now.');
        setRelatedMediaError('Related media is unavailable right now.');
        setIsLoading(false);
        setIsLoadingRelatedMedia(false);
      }
    });

    return () => {
      isActive = false;
    };
  }, []);

  const availableYears = useMemo(
    () => scrapbooks.map((scrapbook) => scrapbook.year),
    [scrapbooks],
  );
  const selectedBook = useMemo(() => {
    if (scrapbooks.length === 0) {
      return null;
    }

    return scrapbooks.find((scrapbook) => scrapbook.year === requestedYear)
      || scrapbooks[scrapbooks.length - 1];
  }, [requestedYear, scrapbooks]);
  const selectedYear = selectedBook?.year || '';
  const selectedYearIndex = availableYears.indexOf(selectedYear);
  const oldestYear = availableYears[0] || '';
  const newestYear = availableYears[availableYears.length - 1] || '';
  const selectedPages = selectedBook?.pages || [];
  const activePage = selectedPages[activePageIndex] || null;
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
  const matchingComposites = useMemo(
    () => relatedComposites.filter((composite) => composite.year === selectedYear),
    [relatedComposites, selectedYear],
  );
  const matchingHistories = useMemo(
    () => relatedHistories.filter((history) => history.years.includes(selectedYear)),
    [relatedHistories, selectedYear],
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
      ...matchingHistories.map((history) => ({
        optionId: `history-${history.historyId}`,
        type: 'history',
        actionLabel: 'Show Club History',
        detail: history.title,
        item: history,
      })),
    ],
    [matchingComposites, matchingHistories],
  );

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
    setActivePageIndex(0);
    setIsRelatedMediaMenuOpen(false);
    setActiveRelatedMedia(null);
    setIsFullscreenOpen(false);
  }, [selectedBook?.id, selectedYear]);

  useEffect(() => {
    setFullscreenZoomLevel(FULLSCREEN_MIN_ZOOM);
    setInlineImageNaturalSize({ width: 0, height: 0 });
    setInlineDisplaySize({ width: 0, height: 0 });
    setFullscreenImageNaturalSize({ width: 0, height: 0 });
    setFullscreenBaseSize({ width: 0, height: 0 });
    setIsFullscreenPanning(false);
    fullscreenInteractionRef.current = null;

    const viewportElement = fullscreenViewportRef.current;

    if (viewportElement) {
      viewportElement.scrollLeft = 0;
      viewportElement.scrollTop = 0;
    }
  }, [activePage?.imageUrl]);

  useEffect(() => {
    const activeThumbnail = thumbnailRailRef.current?.querySelector('[data-active="true"]');
    activeThumbnail?.scrollIntoView({
      block: 'nearest',
      inline: 'center',
      behavior: 'smooth',
    });
  }, [activePageIndex, selectedBook?.id]);

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

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isRelatedMediaMenuOpen]);

  const showPreviousPage = useCallback(() => {
    setActivePageIndex((currentPageIndex) => Math.max(currentPageIndex - 1, 0));
  }, []);

  const showNextPage = useCallback(() => {
    setActivePageIndex((currentPageIndex) => Math.min(currentPageIndex + 1, selectedPages.length - 1));
  }, [selectedPages.length]);

  const updateInlineDisplaySize = useCallback((naturalSizeOverride = null) => {
    const fitAreaElement = inlineFitAreaRef.current;
    const naturalSize = naturalSizeOverride || inlineImageNaturalSize;

    if (!fitAreaElement || naturalSize.width <= 0 || naturalSize.height <= 0) {
      return;
    }

    const fitAreaWidth = Math.max(1, fitAreaElement.clientWidth - (INLINE_IMAGE_SAFE_MARGIN_X * 2));
    const fitAreaHeight = Math.max(1, fitAreaElement.clientHeight - (INLINE_IMAGE_SAFE_MARGIN_Y * 2));
    const fitScale = Math.min(
      fitAreaWidth / naturalSize.width,
      fitAreaHeight / naturalSize.height,
    );

    setInlineDisplaySize({
      width: Math.max(1, Math.floor(naturalSize.width * fitScale)),
      height: Math.max(1, Math.floor(naturalSize.height * fitScale)),
    });
  }, [inlineImageNaturalSize]);

  const handleInlineImageLoad = useCallback((imageElement) => {
    const nextNaturalSize = {
      width: imageElement.naturalWidth || 0,
      height: imageElement.naturalHeight || 0,
    };

    setInlineImageNaturalSize(nextNaturalSize);
    updateInlineDisplaySize(nextNaturalSize);
  }, [updateInlineDisplaySize]);

  const updateFullscreenBaseSize = useCallback((naturalSizeOverride = null) => {
    const viewportElement = fullscreenViewportRef.current;
    const naturalSize = naturalSizeOverride || fullscreenImageNaturalSize;

    if (!viewportElement || naturalSize.width <= 0 || naturalSize.height <= 0) {
      return;
    }

    const viewportWidth = Math.max(1, viewportElement.clientWidth);
    const viewportHeight = Math.max(1, viewportElement.clientHeight);
    const fitScale = Math.min(
      viewportWidth / naturalSize.width,
      viewportHeight / naturalSize.height,
    );

    setFullscreenBaseSize({
      width: Math.max(1, Math.round(naturalSize.width * fitScale)),
      height: Math.max(1, Math.round(naturalSize.height * fitScale)),
    });
  }, [fullscreenImageNaturalSize]);

  const handleFullscreenImageLoad = useCallback((imageElement) => {
    const nextNaturalSize = {
      width: imageElement.naturalWidth || 0,
      height: imageElement.naturalHeight || 0,
    };

    setFullscreenImageNaturalSize(nextNaturalSize);
    updateFullscreenBaseSize(nextNaturalSize);
  }, [updateFullscreenBaseSize]);

  const handleFullscreenPointerMove = useCallback((event) => {
    const activeInteraction = fullscreenInteractionRef.current;

    if (!activeInteraction || activeInteraction.type !== 'pan') {
      return;
    }

    const viewportElement = fullscreenViewportRef.current;

    if (!viewportElement) {
      return;
    }

    viewportElement.scrollLeft = activeInteraction.startScrollLeft - (event.clientX - activeInteraction.startClientX);
    viewportElement.scrollTop = activeInteraction.startScrollTop - (event.clientY - activeInteraction.startClientY);
  }, []);

  const handleFullscreenPointerUp = useCallback(() => {
    if (fullscreenInteractionRef.current?.type === 'pan') {
      setIsFullscreenPanning(false);
    }

    fullscreenInteractionRef.current = null;
    detachWindowListeners(
      fullscreenListenersAttachedRef,
      handleFullscreenPointerMove,
      handleFullscreenPointerUp,
    );
  }, [handleFullscreenPointerMove]);

  useEffect(() => {
    if (!selectedBook) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (isFullscreenOpen) {
          setIsFullscreenOpen(false);
          return;
        }

        if (activeRelatedMedia) {
          setActiveRelatedMedia(null);
        }
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        showPreviousPage();
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        showNextPage();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeRelatedMedia, isFullscreenOpen, selectedBook, showNextPage, showPreviousPage]);

  useEffect(() => {
    const fitAreaElement = inlineFitAreaRef.current;

    if (!fitAreaElement) {
      return undefined;
    }

    updateInlineDisplaySize();

    const resizeObserver = new ResizeObserver(() => {
      updateInlineDisplaySize();
    });

    resizeObserver.observe(fitAreaElement);
    window.addEventListener('resize', updateInlineDisplaySize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateInlineDisplaySize);
    };
  }, [updateInlineDisplaySize]);


  useEffect(() => {
    if (!isFullscreenOpen) {
      return undefined;
    }

    const viewportElement = fullscreenViewportRef.current;

    if (!viewportElement) {
      return undefined;
    }

    updateFullscreenBaseSize();

    const resizeObserver = new ResizeObserver(() => {
      updateFullscreenBaseSize();
    });

    resizeObserver.observe(viewportElement);
    window.addEventListener('resize', updateFullscreenBaseSize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateFullscreenBaseSize);
    };
  }, [isFullscreenOpen, updateFullscreenBaseSize]);

  useEffect(() => {
    const pendingZoomFocus = fullscreenPendingZoomFocusRef.current;
    const viewportElement = fullscreenViewportRef.current;

    if (!pendingZoomFocus || !viewportElement) {
      return;
    }

    viewportElement.scrollLeft = Math.max(
      0,
      (pendingZoomFocus.imageX * fullscreenZoomLevel) - pendingZoomFocus.offsetX,
    );
    viewportElement.scrollTop = Math.max(
      0,
      (pendingZoomFocus.imageY * fullscreenZoomLevel) - pendingZoomFocus.offsetY,
    );
    fullscreenPendingZoomFocusRef.current = null;
  }, [fullscreenZoomLevel]);

  useEffect(() => {
    if (fullscreenZoomLevel !== FULLSCREEN_MIN_ZOOM) {
      return;
    }

    const viewportElement = fullscreenViewportRef.current;

    if (!viewportElement) {
      return;
    }

    viewportElement.scrollLeft = 0;
    viewportElement.scrollTop = 0;
  }, [fullscreenZoomLevel]);

  useEffect(() => () => {
    detachWindowListeners(
      fullscreenListenersAttachedRef,
      handleFullscreenPointerMove,
      handleFullscreenPointerUp,
    );
  }, [handleFullscreenPointerMove, handleFullscreenPointerUp]);

  useEffect(() => {
    if (!isFullscreenOpen) {
      return undefined;
    }

    const viewportElement = fullscreenViewportRef.current;

    if (!viewportElement) {
      return undefined;
    }

    const handleViewportWheel = (event) => {
      const viewportRect = viewportElement.getBoundingClientRect();

      event.preventDefault();
      event.stopPropagation();

      const zoomDirection = event.deltaY < 0 ? 1 : -1;
      const nextZoom = clampZoom(fullscreenZoomLevel + (zoomDirection * FULLSCREEN_WHEEL_ZOOM_STEP));

      if (nextZoom === fullscreenZoomLevel) {
        return;
      }

      fullscreenPendingZoomFocusRef.current = {
        imageX: (viewportElement.scrollLeft + (event.clientX - viewportRect.left)) / fullscreenZoomLevel,
        imageY: (viewportElement.scrollTop + (event.clientY - viewportRect.top)) / fullscreenZoomLevel,
        offsetX: event.clientX - viewportRect.left,
        offsetY: event.clientY - viewportRect.top,
      };
      setFullscreenZoomLevel(nextZoom);
    };

    const handleContextMenu = (event) => {
      if (!(event.target instanceof Node) || !viewportElement.contains(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    viewportElement.addEventListener('wheel', handleViewportWheel, { passive: false });
    window.addEventListener('contextmenu', handleContextMenu, true);

    return () => {
      viewportElement.removeEventListener('wheel', handleViewportWheel);
      window.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [fullscreenZoomLevel, isFullscreenOpen]);

  const handleFullscreenPointerDown = (event) => {
    if (event.button !== 2) {
      return;
    }

    const viewportElement = fullscreenViewportRef.current;

    if (!viewportElement) {
      return;
    }

    event.preventDefault();
    fullscreenInteractionRef.current = {
      type: 'pan',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: viewportElement.scrollLeft,
      startScrollTop: viewportElement.scrollTop,
    };
    setIsFullscreenPanning(true);
    attachWindowListeners(
      fullscreenListenersAttachedRef,
      handleFullscreenPointerMove,
      handleFullscreenPointerUp,
    );
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
      setYearError('Enter one of the uploaded scrapbook years.');
      return;
    }

    setYearError(`No uploaded scrapbook is available for ${normalizedYear}.`);
  }, [availableYears, handleSelectYear, yearInput]);

  const handleOpenRelatedMedia = useCallback((option) => {
    if (!option?.item) {
      return;
    }

    setIsRelatedMediaMenuOpen(false);
    setActiveRelatedMedia(option);
  }, []);

  const hasViewer = !isLoading && !loadError && Boolean(selectedBook);

  return (
    <div className="scrapbooksDisplay">
      <div className="scrapbooksDisplay__layout">
        <aside className="scrapbooksDisplay__sidebar" aria-label="Scrapbooks display overview">
          <button
            type="button"
            className="button scrapbooksDisplay__backButton"
            onClick={() => onBack?.()}
          >
            <BackIcon className="scrapbooksDisplay__backIcon" />
            Return to Home
          </button>

          <div className="scrapbooksDisplay__intro">
            <p className="scrapbooksDisplay__eyebrow">German Club Digital Archives</p>
            <h1 className="scrapbooksDisplay__title">Scrapbooks</h1>
            <p className="scrapbooksDisplay__lede">
              Browse scrapbook volumes by year and explore pages in an immersive reading view.
            </p>
          </div>

          <div className="scrapbooksDisplay__tips">
            <h2 className="scrapbooksDisplay__tipsTitle">Viewing Tips</h2>

            <div className="scrapbooksDisplay__tip">
              <span className="scrapbooksDisplay__tipIcon"><CalendarIcon /></span>
              <div>
                <strong>Explore years</strong>
                <span>Move the timeline or select a year to view that scrapbook volume.</span>
              </div>
            </div>

            <div className="scrapbooksDisplay__tip">
              <span className="scrapbooksDisplay__tipIcon"><DocumentIcon /></span>
              <div>
                <strong>Select pages</strong>
                <span>Use the thumbnails or arrows to browse through the scrapbook.</span>
              </div>
            </div>

            <div className="scrapbooksDisplay__tip">
              <span className="scrapbooksDisplay__tipIcon"><ExpandIcon /></span>
              <div>
                <strong>Fullscreen</strong>
                <span>Open fullscreen to focus on the current page.</span>
              </div>
            </div>

            <div className="scrapbooksDisplay__tip">
              <span className="scrapbooksDisplay__tipIcon"><DocumentIcon /></span>
              <div>
                <strong>Related media</strong>
                <span>Use the document button to open related composites and club history.</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="scrapbooksDisplay__main" aria-label="Scrapbook display viewer">
          {isLoading ? (
            <article className="scrapbooksDisplay__messagePanel">
              <p>Loading uploaded scrapbooks...</p>
            </article>
          ) : null}

          {!isLoading && loadError ? (
            <article className="scrapbooksDisplay__messagePanel scrapbooksDisplay__messagePanel--error">
              <p>{loadError}</p>
            </article>
          ) : null}

          {!isLoading && !loadError && scrapbooks.length === 0 ? (
            <article className="scrapbooksDisplay__messagePanel">
              <p>No scrapbook volumes are available yet.</p>
            </article>
          ) : null}

          {hasViewer ? (
            <article className="scrapbooksDisplay__shell">
              <div className="scrapbooksDisplay__controlStrip">
                <div className="scrapbooksDisplay__yearRow">
                  <span className="scrapbooksDisplay__yearBound scrapbooksDisplay__yearBound--start">{oldestYear}</span>

                  <label className="scrapbooksDisplay__selectedYear">
                    <span className="scrapbooksDisplay__selectedYearLabel">Selected Year</span>
                    <input
                      className={[
                        'scrapbooksDisplay__selectedYearInput',
                        yearError ? 'scrapbooksDisplay__selectedYearInput--invalid' : '',
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
                          event.currentTarget.blur();
                          handleCommitYearInput();
                        }
                      }}
                      aria-invalid={Boolean(yearError)}
                    />
                  </label>

                  <span className="scrapbooksDisplay__yearBound scrapbooksDisplay__yearBound--end">{newestYear}</span>
                </div>

                <div
                  className="scrapbooksDisplay__sliderShell"
                  onPointerDown={handleSliderPointerDown}
                  style={{
                    '--slider-progress': `${activeSliderProgress * 100}%`,
                    '--slider-duration': `${sliderAnimationMs}ms`,
                  }}
                >
                  <div className="scrapbooksDisplay__sliderVisual" aria-hidden="true">
                    <span className="scrapbooksDisplay__sliderTrack" />
                    <span className="scrapbooksDisplay__sliderFill" />
                    <span className="scrapbooksDisplay__sliderThumb" />
                  </div>
                  <input
                    className="scrapbooksDisplay__sliderInput"
                    type="range"
                    min="0"
                    max={Math.max(availableYears.length - 1, 0)}
                    step="1"
                    value={Math.max(activeSliderIndex, 0)}
                    disabled={availableYears.length <= 1}
                    onChange={(event) => handleSelectYear(availableYears[Number(event.target.value)] || selectedYear)}
                    aria-label="Select scrapbook year"
                  />
                </div>

                {yearError ? (
                  <p className="scrapbooksDisplay__yearError" role="status">{yearError}</p>
                ) : null}
              </div>

              <div className="scrapbooksDisplay__divider" />

              <div className="scrapbooksDisplay__viewerBody">
                <header className="scrapbooksDisplay__bookHeader">
                  <h2>{selectedBook.title}</h2>
                </header>

                <div className="scrapbooksDisplay__bookStage">
                  <div className="scrapbooksDisplay__relatedMedia" ref={relatedMenuRef}>
                    <button
                      type="button"
                      className="button scrapbooksDisplay__controlButton scrapbooksDisplay__relatedButton"
                      onClick={() => setIsRelatedMediaMenuOpen((currentValue) => !currentValue)}
                      aria-label={`Open related media for ${selectedYear}`}
                      aria-expanded={isRelatedMediaMenuOpen}
                    >
                      <DocumentIcon className="scrapbooksDisplay__controlIcon" />
                    </button>

                    <div
                      className={[
                        'scrapbooksDisplay__relatedDropdown',
                        isRelatedMediaMenuOpen ? 'scrapbooksDisplay__relatedDropdown--open' : '',
                      ].filter(Boolean).join(' ')}
                      role="menu"
                    >
                      <div className="scrapbooksDisplay__relatedDropdownHeader">
                        <p className="scrapbooksDisplay__relatedDropdownEyebrow">Related Media</p>
                        <p className="scrapbooksDisplay__relatedDropdownYear">{selectedYear}</p>
                      </div>

                      {isLoadingRelatedMedia ? (
                        <p className="scrapbooksDisplay__relatedDropdownMessage">Loading related media...</p>
                      ) : relatedMediaOptions.length > 0 ? (
                        <div className="scrapbooksDisplay__relatedDropdownList">
                          {relatedMediaOptions.map((option) => (
                            <button
                              key={option.optionId}
                              type="button"
                              className="scrapbooksDisplay__relatedDropdownItem"
                              onClick={() => handleOpenRelatedMedia(option)}
                              role="menuitem"
                            >
                              <span className="scrapbooksDisplay__relatedDropdownAction">{option.actionLabel}</span>
                              <span className="scrapbooksDisplay__relatedDropdownDetail">{option.detail}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="scrapbooksDisplay__relatedDropdownMessage">
                          {relatedMediaError || `No related media for ${selectedYear}.`}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="button scrapbooksDisplay__controlButton scrapbooksDisplay__fullscreenButton"
                    onClick={() => setIsFullscreenOpen(true)}
                    aria-label={`Open ${selectedBook.title} page ${activePageIndex + 1} fullscreen`}
                  >
                    <ExpandIcon className="scrapbooksDisplay__controlIcon" />
                  </button>

                  <button
                    type="button"
                    className="scrapbooksDisplay__pageArrow scrapbooksDisplay__pageArrow--left"
                    onClick={showPreviousPage}
                    disabled={activePageIndex === 0}
                    aria-label="Previous scrapbook page"
                  >
                    <span aria-hidden="true">&lsaquo;</span>
                  </button>

                  <div className="scrapbooksDisplay__bookCanvas">
                    <div className="scrapbooksDisplay__bookSpread" ref={inlineFitAreaRef}>
                      <div className="scrapbooksDisplay__bookPage">
                        {activePage ? (
                          <ScrapbookPageImage
                            page={activePage}
                            alt={`${selectedBook.title} page ${activePageIndex + 1}`}
                            variant="inline"
                            style={{
                              width: inlineDisplaySize.width || undefined,
                              height: inlineDisplaySize.height || undefined,
                              visibility: inlineDisplaySize.width > 0 && inlineDisplaySize.height > 0 ? 'visible' : 'hidden',
                            }}
                            onImageMeasure={handleInlineImageLoad}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="scrapbooksDisplay__pageArrow scrapbooksDisplay__pageArrow--right"
                    onClick={showNextPage}
                    disabled={activePageIndex >= selectedPages.length - 1}
                    aria-label="Next scrapbook page"
                  >
                    <span aria-hidden="true">&rsaquo;</span>
                  </button>
                </div>

                <div className="scrapbooksDisplay__thumbnailBrowser">
                  <button
                    type="button"
                    className="scrapbooksDisplay__thumbnailArrow"
                    onClick={showPreviousPage}
                    disabled={activePageIndex === 0}
                    aria-label="Previous scrapbook page"
                  >
                    <span aria-hidden="true">&lsaquo;</span>
                  </button>

                  <div className="scrapbooksDisplay__thumbnailRail" ref={thumbnailRailRef}>
                    {selectedPages.map((page, pageIndex) => (
                      <button
                        key={page.id}
                        type="button"
                        className={[
                          'scrapbooksDisplay__thumbnail',
                          pageIndex === activePageIndex ? 'scrapbooksDisplay__thumbnail--active' : '',
                        ].filter(Boolean).join(' ')}
                        data-active={pageIndex === activePageIndex ? 'true' : undefined}
                        onClick={() => setActivePageIndex(pageIndex)}
                        aria-label={`Open page ${pageIndex + 1}`}
                      >
                        <img
                          src={page.thumbnailUrl || page.imageUrl}
                          alt=""
                          loading="lazy"
                        />
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    className="scrapbooksDisplay__thumbnailArrow"
                    onClick={showNextPage}
                    disabled={activePageIndex >= selectedPages.length - 1}
                    aria-label="Next scrapbook page"
                  >
                    <span aria-hidden="true">&rsaquo;</span>
                  </button>
                </div>

                <p className="scrapbooksDisplay__pagePrompt">
                  <span aria-hidden="true" />
                  Tap a page or use arrows to browse
                  <span aria-hidden="true" />
                </p>
              </div>
            </article>
          ) : null}
        </main>
      </div>

      {isFullscreenOpen && activePage ? (
        <div className="scrapbooksDisplay__fullscreenBackdrop" role="presentation">
          <section className="scrapbooksDisplay__fullscreen" aria-label={`${selectedBook.title} page ${activePageIndex + 1} fullscreen`}>
            <button
              type="button"
              className="button scrapbooksDisplay__controlButton scrapbooksDisplay__fullscreenClose"
              onClick={() => setIsFullscreenOpen(false)}
              aria-label="Close fullscreen scrapbook page"
            >
              X
            </button>

            <button
              type="button"
              className="scrapbooksDisplay__fullscreenArrow scrapbooksDisplay__fullscreenArrow--left"
              onClick={showPreviousPage}
              disabled={activePageIndex === 0}
              aria-label="Previous scrapbook page"
            >
              <span aria-hidden="true">&lsaquo;</span>
            </button>

            <div
              ref={fullscreenViewportRef}
              className={[
                'scrapbooksDisplay__fullscreenViewport',
                isFullscreenPanning ? 'scrapbooksDisplay__fullscreenViewport--panning' : '',
              ].filter(Boolean).join(' ')}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={handleFullscreenPointerDown}
            >
              <div
                className="scrapbooksDisplay__fullscreenScaledCanvas"
                style={{
                  width: fullscreenBaseSize.width * fullscreenZoomLevel || undefined,
                  height: fullscreenBaseSize.height * fullscreenZoomLevel || undefined,
                }}
              >
                <div
                  className="scrapbooksDisplay__fullscreenFrame"
                  style={{
                    width: fullscreenBaseSize.width * fullscreenZoomLevel || undefined,
                    height: fullscreenBaseSize.height * fullscreenZoomLevel || undefined,
                    visibility: fullscreenBaseSize.width > 0 && fullscreenBaseSize.height > 0 ? 'visible' : 'hidden',
                  }}
                >
                  <ScrapbookPageImage
                    page={activePage}
                    alt={`${selectedBook.title} page ${activePageIndex + 1}`}
                    variant="fullscreen"
                    onImageMeasure={handleFullscreenImageLoad}
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              className="scrapbooksDisplay__fullscreenArrow scrapbooksDisplay__fullscreenArrow--right"
              onClick={showNextPage}
              disabled={activePageIndex >= selectedPages.length - 1}
              aria-label="Next scrapbook page"
            >
              <span aria-hidden="true">&rsaquo;</span>
            </button>
          </section>
        </div>
      ) : null}

      {activeRelatedMedia ? (
        <div
          className="scrapbooksDisplay__relatedModalBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setActiveRelatedMedia(null);
            }
          }}
        >
          <section
            className={[
              'scrapbooksDisplay__relatedModal',
              activeRelatedMedia.type === 'history' ? 'scrapbooksDisplay__relatedModal--history' : '',
            ].filter(Boolean).join(' ')}
            role="dialog"
            aria-modal="true"
            aria-label={activeRelatedMedia.detail}
          >
            <header className="scrapbooksDisplay__relatedModalHeader">
              <button
                type="button"
                className="button scrapbooksDisplay__relatedBackButton"
                onClick={() => setActiveRelatedMedia(null)}
              >
                <BackIcon className="scrapbooksDisplay__relatedBackIcon" />
                Back to Scrapbook
              </button>

              <div className="scrapbooksDisplay__relatedModalTitleWrap">
                <p className="scrapbooksDisplay__relatedModalEyebrow">Related Media</p>
                <h2 className="scrapbooksDisplay__relatedModalTitle">{activeRelatedMedia.detail}</h2>
              </div>
            </header>

            {activeRelatedMedia.type === 'composite' ? (
              <div className="scrapbooksDisplay__relatedCompositeFrame">
                <img
                  className="scrapbooksDisplay__relatedCompositeImage"
                  src={activeRelatedMedia.item.imageUrl}
                  alt={activeRelatedMedia.item.title}
                />
              </div>
            ) : (
              <div className="scrapbooksDisplay__relatedHistoryFrame">
                <iframe
                  className="scrapbooksDisplay__relatedHistoryViewer"
                  src={buildPdfViewerUrl(activeRelatedMedia.item.pdfUrl)}
                  title={activeRelatedMedia.item.title}
                  tabIndex={-1}
                />
                <div
                  className="scrapbooksDisplay__relatedHistoryShield"
                  aria-hidden="true"
                  onContextMenu={(event) => event.preventDefault()}
                />
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ScrapbookPageImage({
  page,
  alt,
  variant = 'inline',
  style = undefined,
  onImageMeasure = null,
  onFullImageLoad = null,
}) {
  const [isFullImageReady, setIsFullImageReady] = useState(false);
  const thumbnailSrc = page?.thumbnailUrl && page.thumbnailUrl !== page.imageUrl
    ? page.thumbnailUrl
    : '';

  useEffect(() => {
    setIsFullImageReady(false);
  }, [page?.imageUrl]);

  if (!page?.imageUrl) {
    return null;
  }

  const handlePreviewLoad = (event) => {
    onImageMeasure?.(event.currentTarget);
  };

  const handleFullImageLoad = (event) => {
    setIsFullImageReady(true);
    onImageMeasure?.(event.currentTarget);
    onFullImageLoad?.(event.currentTarget);
  };

  const handleFullImageError = () => {
    setIsFullImageReady(true);
  };

  return (
    <div
      className={[
        'scrapbooksDisplay__imageLayers',
        `scrapbooksDisplay__imageLayers--${variant}`,
      ].join(' ')}
      style={style}
      aria-busy={isFullImageReady ? 'false' : 'true'}
    >
      {thumbnailSrc ? (
        <img
          className={[
            'scrapbooksDisplay__imageLayer',
            'scrapbooksDisplay__imageLayer--thumbnail',
            isFullImageReady ? 'scrapbooksDisplay__imageLayer--thumbnailHidden' : '',
          ].filter(Boolean).join(' ')}
          src={thumbnailSrc}
          alt=""
          draggable="false"
          onLoad={handlePreviewLoad}
        />
      ) : null}

      <img
        className={[
          'scrapbooksDisplay__imageLayer',
          'scrapbooksDisplay__imageLayer--full',
          isFullImageReady
            ? 'scrapbooksDisplay__imageLayer--ready'
            : 'scrapbooksDisplay__imageLayer--loading',
        ].join(' ')}
        src={page.imageUrl}
        alt={alt}
        draggable="false"
        onLoad={handleFullImageLoad}
        onError={handleFullImageError}
      />
    </div>
  );
}

function buildPdfViewerUrl(pdfUrl) {
  return pdfUrl ? `${pdfUrl}${PDF_VIEWER_OPTIONS}` : '';
}

function normalizeScrapbooks(scrapbooks) {
  return (Array.isArray(scrapbooks) ? scrapbooks : [])
    .map((scrapbook) => {
      const rawPageEntries = Array.isArray(scrapbook?.pageEntries) && scrapbook.pageEntries.length > 0
        ? scrapbook.pageEntries
        : Array.isArray(scrapbook?.pageImageUrls)
          ? scrapbook.pageImageUrls.map((imageUrl, index) => ({
            pageId: `page-${index + 1}`,
            imageUrl,
            thumbnailUrl: '',
          }))
          : [];
      const year = String(scrapbook?.scrapbookYear || '').trim();
      const pages = rawPageEntries
        .map((pageEntry, index) => ({
          id: String(pageEntry?.pageId || `${scrapbook?.scrapbookId || year}-page-${index + 1}`),
          imageUrl: String(pageEntry?.imageUrl || scrapbook?.pageImageUrls?.[index] || '').trim(),
          thumbnailUrl: String(pageEntry?.thumbnailUrl || '').trim(),
          originalFilename: String(pageEntry?.originalFilename || '').trim(),
        }))
        .filter((page) => page.imageUrl);

      return {
        id: String(scrapbook?.scrapbookId || year),
        year,
        title: String(scrapbook?.title || `${year} Scrapbook`).trim(),
        pages,
        pageCount: Number(scrapbook?.pageCount || pages.length || 0),
        uploadTimestamp: String(scrapbook?.uploadTimestamp || ''),
      };
    })
    .filter((scrapbook) => /^\d{4}$/.test(scrapbook.year) && scrapbook.pages.length > 0)
    .sort(compareByYear);
}

function normalizeRelatedComposites(composites) {
  return (Array.isArray(composites) ? composites : [])
    .map((composite) => {
      const year = String(composite?.compositeYear || '').trim();

      return {
        id: String(composite?.compositeId || year),
        year,
        title: `${year} Composite`,
        imageUrl: String(composite?.imageUrl || '').trim(),
      };
    })
    .filter((composite) => /^\d{4}$/.test(composite.year) && composite.imageUrl)
    .sort(compareByYear);
}

function normalizeRelatedHistories(histories) {
  return (Array.isArray(histories) ? histories : [])
    .map((history) => {
      const key = String(history?.key || '').trim();
      const title = String(history?.title || '').trim();
      const description = String(history?.description || '').trim();

      return {
        historyId: String(history?.historyId || key),
        key,
        title: title || 'Club History',
        description,
        pdfUrl: String(history?.pdfUrl || '').trim(),
        years: extractAssociatedYears([key, title, description]),
        uploadTimestamp: String(history?.uploadTimestamp || ''),
      };
    })
    .filter((history) => history.pdfUrl)
    .sort((leftHistory, rightHistory) => {
      const leftTimestamp = new Date(leftHistory.uploadTimestamp || 0).getTime();
      const rightTimestamp = new Date(rightHistory.uploadTimestamp || 0).getTime();
      return rightTimestamp - leftTimestamp;
    });
}

function compareByYear(leftValue, rightValue) {
  const leftYear = Number(leftValue.year || 0);
  const rightYear = Number(rightValue.year || 0);

  if (leftYear !== rightYear) {
    return leftYear - rightYear;
  }

  return String(leftValue.title || '').localeCompare(String(rightValue.title || ''));
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

function clampZoom(value) {
  return clamp(Number(value.toFixed(2)), FULLSCREEN_MIN_ZOOM, FULLSCREEN_MAX_ZOOM);
}

function attachWindowListeners(listenersAttachedRef, onMove, onUp) {
  if (listenersAttachedRef.current) {
    return;
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  listenersAttachedRef.current = true;
}

function detachWindowListeners(listenersAttachedRef, onMove, onUp) {
  if (!listenersAttachedRef.current) {
    return;
  }

  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  listenersAttachedRef.current = false;
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
