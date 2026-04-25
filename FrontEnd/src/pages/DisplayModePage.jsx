import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { getComposites, getScrapbooks } from '../api/composites.js';
import HomepageDisplayMode from '../components/DisplayMode/HomepageDisplayMode.jsx';
import CompositesPage from './CompositesPage.jsx';
import HistoryPage from './HistoryPage.jsx';
import OralHistories from './OralHistories.jsx';
import { exitFullscreenIfActive, isFullscreenActive, requestFullscreenForElement } from '../utils/fullscreen.js';
import './DisplayModePage.css';

const ROTATE_MS = 6500;
const IDLE_TO_SLIDESHOW_MS = 5 * 60 * 1000;
const CONTROLS_HIDE_MS = 2500;
const PRELOAD_AHEAD_COUNT = 5;
const RENDER_TRAILING_COUNT = 1;
const RENDER_AHEAD_COUNT = 1;
const DISPLAY_MODE_REFERENCE_WIDTH = 3840;
const DISPLAY_MODE_REFERENCE_HEIGHT = 2160;
const SCRAPBOOK_RIGHTS_URL = 'https://rightsstatements.org/page/InC-RUU/1.0/?language=en';
const SCRAPBOOK_RIGHTS_NOTICE = 'This Item is protected by copyright and/or related rights. However, for this Item, either (a) no rights-holder(s) have been identified or (b) one or more rights-holder(s) have been identified but none have been located. You are free to use this Item in any way that is permitted by the copyright and related rights legislation that applies to your use.';

export default function DisplayModePage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [displayImages, setDisplayImages] = useState([]);
  const [displayMetrics, setDisplayMetrics] = useState(getDisplayMetrics);
  const hideControlsTimeoutRef = useRef(null);
  const idleTimeoutRef = useRef(null);
  const loadedImageUrlsRef = useRef(new Set());
  const preloadingImagePromisesRef = useRef(new Map());
  const displayModeRef = useRef(null);
  const didTriggerRouteTransitionRef = useRef(false);
  const location = useLocation();
  const navigate = useNavigate();
  const currentMode = useMemo(() => getDisplayMode(location.search), [location.search]);
  const currentDisplayPage = useMemo(() => getDisplayPage(location.search), [location.search]);
  const currentDisplaySource = useMemo(() => getDisplaySource(location.search), [location.search]);
  const isSlideshowMode = currentMode === 'slideshow';
  const isIdleSlideshowMode = isSlideshowMode && currentDisplaySource === 'idle';
  const isHomepageDisplayMode = currentMode === 'display' && currentDisplayPage === 'home';
  const isCompositesDisplayMode = currentMode === 'display' && currentDisplayPage === 'composites';
  const isHistoryDisplayMode = currentMode === 'display' && currentDisplayPage === 'history';
  const isOralHistoriesDisplayMode = currentMode === 'display' && currentDisplayPage === 'oral-histories';
  const isScaledContentDisplayMode = isCompositesDisplayMode || isHistoryDisplayMode || isOralHistoriesDisplayMode;
  const isFullscreenDisplayMode =
    isSlideshowMode || isHomepageDisplayMode || isScaledContentDisplayMode;
  const displaySurface = useMemo(
    () => getDisplaySurface(displayMetrics),
    [displayMetrics],
  );

  const imageCount = displayImages.length;
  const hasImages = imageCount > 0;
  const currentImage = hasImages ? displayImages[currentIndex] : null;
  const shouldShowScrapbookCopyright = currentImage?.sourceType === 'scrapbook';
  const renderedImages = useMemo(
    () => getRenderedImages(displayImages, currentIndex),
    [displayImages, currentIndex],
  );
  const imageAlt = useMemo(
    () => `Display slideshow image ${currentIndex + 1} of ${Math.max(imageCount, 1)}`,
    [currentIndex, imageCount],
  );
  const navigateFromDisplayMode = useCallback((target, options = undefined) => {
    if (didTriggerRouteTransitionRef.current) {
      return;
    }

    didTriggerRouteTransitionRef.current = true;
    navigate(target, options);
  }, [navigate]);

  const exitDisplayMode = useCallback(() => {
    navigateFromDisplayMode('/', { replace: true });
  }, [navigateFromDisplayMode]);

  const returnToDisplayHomepage = useCallback(() => {
    navigateFromDisplayMode('/display-mode?mode=display', { replace: true });
  }, [navigateFromDisplayMode]);

  useEffect(() => {
    if (!isSlideshowMode) {
      setDisplayImages([]);
      setCurrentIndex(0);
      loadedImageUrlsRef.current = new Set();
      preloadingImagePromisesRef.current = new Map();
      return undefined;
    }

    let isActive = true;

    const loadDisplayImages = async () => {
      try {
        const [composites, scrapbooks] = await Promise.all([
          getComposites(),
          getScrapbooks(),
        ]);

        if (!isActive) {
          return;
        }

        const nextImages = shuffleImages([
          ...tagImages(extractCompositeImages(composites), 'composite'),
          ...tagImages(extractScrapbookImages(scrapbooks), 'scrapbook'),
        ]);

        setDisplayImages(nextImages);
        setCurrentIndex(0);
        loadedImageUrlsRef.current = new Set();
        preloadingImagePromisesRef.current = new Map();
        preloadImagesAroundIndex(nextImages, 0, {
          loadedImageUrlsRef,
          preloadingImagePromisesRef,
        });
      } catch {
        if (isActive) {
          setDisplayImages([]);
          setCurrentIndex(0);
        }
      }
    };

    loadDisplayImages();

    return () => {
      isActive = false;
    };
  }, [isSlideshowMode]);

  useEffect(() => {
    didTriggerRouteTransitionRef.current = false;
  }, [location.key]);

  useEffect(() => {
    if (currentMode !== 'display') {
      if (idleTimeoutRef.current) {
        window.clearTimeout(idleTimeoutRef.current);
      }

      return undefined;
    }

    const resetIdleTimer = () => {
      if (idleTimeoutRef.current) {
        window.clearTimeout(idleTimeoutRef.current);
      }

      idleTimeoutRef.current = window.setTimeout(() => {
        navigateFromDisplayMode('/display-mode?mode=slideshow&source=idle', { replace: true });
      }, IDLE_TO_SLIDESHOW_MS);
    };

    resetIdleTimer();

    window.addEventListener('pointermove', resetIdleTimer, { passive: true });
    window.addEventListener('pointerdown', resetIdleTimer, { passive: true });
    window.addEventListener('wheel', resetIdleTimer, { passive: true });
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('touchstart', resetIdleTimer, { passive: true });

    return () => {
      window.removeEventListener('pointermove', resetIdleTimer);
      window.removeEventListener('pointerdown', resetIdleTimer);
      window.removeEventListener('wheel', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('touchstart', resetIdleTimer);

      if (idleTimeoutRef.current) {
        window.clearTimeout(idleTimeoutRef.current);
      }
    };
  }, [currentMode, navigateFromDisplayMode]);

  useEffect(() => {
    if (!isIdleSlideshowMode) {
      return undefined;
    }

    const handlePointerMove = () => {
      returnToDisplayHomepage();
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [isIdleSlideshowMode, returnToDisplayHomepage]);

  useEffect(() => {
    if (!isFullscreenDisplayMode) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      exitDisplayMode();
    };

    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [exitDisplayMode, isFullscreenDisplayMode]);

  useEffect(() => {
    if (!isScaledContentDisplayMode) {
      return undefined;
    }

    const visualViewport = window.visualViewport;

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

    updateDisplayMetrics();
    window.addEventListener('resize', updateDisplayMetrics);
    visualViewport?.addEventListener('resize', updateDisplayMetrics);

    return () => {
      window.removeEventListener('resize', updateDisplayMetrics);
      visualViewport?.removeEventListener('resize', updateDisplayMetrics);
    };
  }, [isScaledContentDisplayMode]);

  useEffect(() => {
    if (!isFullscreenDisplayMode) {
      return undefined;
    }

    let isMounted = true;

    const ensureFullscreen = async () => {
      if (isFullscreenActive()) {
        return;
      }

      await requestFullscreenForElement(displayModeRef.current || document.documentElement);
    };

    const handleFullscreenChange = () => {
      if (!isMounted || isFullscreenActive()) {
        return;
      }

      exitDisplayMode();
    };

    void ensureFullscreen();
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      isMounted = false;
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      void exitFullscreenIfActive();
    };
  }, [exitDisplayMode, isFullscreenDisplayMode]);

  useEffect(() => {
    if (!isSlideshowMode || !hasImages) return undefined;

    const timerId = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % imageCount);
    }, ROTATE_MS);

    return () => window.clearInterval(timerId);
  }, [hasImages, imageCount, isSlideshowMode]);

  useEffect(() => {
    if (!isSlideshowMode || !hasImages) return;

    preloadImagesAroundIndex(displayImages, currentIndex, {
      loadedImageUrlsRef,
      preloadingImagePromisesRef,
    });
  }, [currentIndex, displayImages, hasImages, isSlideshowMode]);

  useEffect(() => {
    if (!isSlideshowMode) {
      return undefined;
    }

    const showControls = () => {
      setControlsVisible(true);
      if (hideControlsTimeoutRef.current) {
        window.clearTimeout(hideControlsTimeoutRef.current);
      }
      hideControlsTimeoutRef.current = window.setTimeout(() => {
        setControlsVisible(false);
      }, CONTROLS_HIDE_MS);
    };

    const onKeyDown = (event) => {
      showControls();
    };

    showControls();
    window.addEventListener('mousemove', showControls, { passive: true });
    window.addEventListener('click', showControls, { passive: true });
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('mousemove', showControls);
      window.removeEventListener('click', showControls);
      window.removeEventListener('keydown', onKeyDown);
      if (hideControlsTimeoutRef.current) {
        window.clearTimeout(hideControlsTimeoutRef.current);
      }
    };
  }, [exitDisplayMode, isSlideshowMode]);

  if (isHomepageDisplayMode) {
    return <HomepageDisplayMode />;
  }

  if (isCompositesDisplayMode) {
    return (
      <section
        ref={displayModeRef}
        className="displayMode displayMode--composites"
        aria-label="Composite display mode"
      >
        <div className="displayModeComposites">
          <div
            className="displayModeComposites__canvas"
            style={{
              width: `${DISPLAY_MODE_REFERENCE_WIDTH}px`,
              height: `${DISPLAY_MODE_REFERENCE_HEIGHT}px`,
              transform: `translate(-50%, -50%) scale(${displaySurface.canvasScale})`,
            }}
          >
            <CompositesPage
              displayMode
              onBack={() => navigate('/display-mode?mode=display')}
            />
          </div>
        </div>
      </section>
    );
  }

  if (isOralHistoriesDisplayMode) {
    return (
      <section
        ref={displayModeRef}
        className="displayMode displayMode--oralHistories"
        aria-label="Oral histories display mode"
      >
        <div className="displayModeOralHistories">
          <div
            className="displayModeOralHistories__canvas"
            style={{
              width: `${DISPLAY_MODE_REFERENCE_WIDTH}px`,
              height: `${DISPLAY_MODE_REFERENCE_HEIGHT}px`,
              transform: `translate(-50%, -50%) scale(${displaySurface.canvasScale})`,
            }}
          >
            <OralHistories
              displayMode
              onBack={() => navigate('/display-mode?mode=display')}
            />
          </div>
        </div>
      </section>
    );
  }

  if (isHistoryDisplayMode) {
    return (
      <section
        ref={displayModeRef}
        className="displayMode displayMode--history"
        aria-label="History display mode"
      >
        <div className="displayModeHistory">
          <div
            className="displayModeHistory__canvas"
            style={{
              width: `${DISPLAY_MODE_REFERENCE_WIDTH}px`,
              height: `${DISPLAY_MODE_REFERENCE_HEIGHT}px`,
              transform: `translate(-50%, -50%) scale(${displaySurface.canvasScale})`,
            }}
          >
            <HistoryPage
              displayMode
              onBack={() => navigate('/display-mode?mode=display')}
            />
          </div>
        </div>
      </section>
    );
  }

  if (!hasImages) {
    return (
      <section ref={displayModeRef} className="displayMode displayMode--empty">
        <div className="displayMode__emptyMessage">
          <h1>Slideshow Mode</h1>
          <p>No display images are configured yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section ref={displayModeRef} className="displayMode" aria-label="Display mode slideshow">
      {renderedImages.map(({ imageSrc, index }) => (
        <img
          key={`${index}-${imageSrc}`}
          src={imageSrc}
          alt={imageAlt}
          className={['displayMode__image', index === currentIndex ? 'is-active' : ''].join(' ')}
        />
      ))}

      {shouldShowScrapbookCopyright ? (
        <p
          className={[
            'displayMode__scrapbookCopyright',
            controlsVisible ? 'is-controls-visible' : '',
          ].filter(Boolean).join(' ')}
          title="This scrapbook item is protected by copyright and/or related rights."
        >
          <span>{SCRAPBOOK_RIGHTS_NOTICE}</span>
          <a href={SCRAPBOOK_RIGHTS_URL} target="_blank" rel="noreferrer">
            Learn more
          </a>
        </p>
      ) : null}

      <div className={['displayMode__controls', controlsVisible ? 'is-visible' : ''].join(' ')}>
        <div className="displayMode__counter">
          {currentIndex + 1} / {imageCount}
        </div>
      </div>
    </section>
  );
}

function getDisplayMode(search) {
  const params = new URLSearchParams(search);
  return params.get('mode') === 'display' ? 'display' : 'slideshow';
}

function getDisplayPage(search) {
  const params = new URLSearchParams(search);
  const page = params.get('page');

  if (page === 'composites' || page === 'history' || page === 'oral-histories') {
    return page;
  }

  return 'home';
}

function getDisplaySource(search) {
  const params = new URLSearchParams(search);
  return params.get('source') === 'idle' ? 'idle' : 'manual';
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

function getDisplaySurface({ viewportWidth, viewportHeight, devicePixelRatio }) {
  const densityScale = Math.max(devicePixelRatio || 1, 1);
  const physicalViewportWidth = Math.round(viewportWidth * densityScale);
  const physicalViewportHeight = Math.round(viewportHeight * densityScale);
  const referenceScale = Math.min(
    physicalViewportWidth / DISPLAY_MODE_REFERENCE_WIDTH,
    physicalViewportHeight / DISPLAY_MODE_REFERENCE_HEIGHT,
    1,
  );

  return {
    canvasScale: Number((referenceScale / densityScale).toFixed(5)),
  };
}

function getRenderedImages(imageUrls, currentIndex) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return [];
  }

  const renderedIndexes = new Set([currentIndex]);

  for (let offset = 1; offset <= RENDER_TRAILING_COUNT; offset += 1) {
    renderedIndexes.add((currentIndex - offset + imageUrls.length) % imageUrls.length);
  }

  for (let offset = 1; offset <= RENDER_AHEAD_COUNT; offset += 1) {
    renderedIndexes.add((currentIndex + offset) % imageUrls.length);
  }

  return Array.from(renderedIndexes)
    .sort((leftIndex, rightIndex) => leftIndex - rightIndex)
    .map((index) => ({
      index,
      imageSrc: imageUrls[index]?.url,
    }))
    .filter((entry) => Boolean(entry.imageSrc));
}

function preloadImagesAroundIndex(imageUrls, currentIndex, options) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    return;
  }

  const preloadCount = Math.min(PRELOAD_AHEAD_COUNT, imageUrls.length);

  for (let offset = 0; offset < preloadCount; offset += 1) {
    const imageIndex = (currentIndex + offset) % imageUrls.length;
    preloadImage(imageUrls[imageIndex]?.url, options);
  }
}

function preloadImage(imageSrc, { loadedImageUrlsRef, preloadingImagePromisesRef }) {
  const normalizedImageSrc = String(imageSrc || '').trim();

  if (!normalizedImageSrc || loadedImageUrlsRef.current.has(normalizedImageSrc)) {
    return Promise.resolve();
  }

  if (preloadingImagePromisesRef.current.has(normalizedImageSrc)) {
    return preloadingImagePromisesRef.current.get(normalizedImageSrc);
  }

  const preloadPromise = new Promise((resolve) => {
    const image = new Image();

    const markComplete = () => {
      preloadingImagePromisesRef.current.delete(normalizedImageSrc);
      loadedImageUrlsRef.current.add(normalizedImageSrc);
      resolve();
    };

    image.onload = markComplete;
    image.onerror = markComplete;
    image.src = normalizedImageSrc;
  });

  preloadingImagePromisesRef.current.set(normalizedImageSrc, preloadPromise);

  return preloadPromise;
}

function extractCompositeImages(composites) {
  return Array.isArray(composites)
    ? composites
      .map((composite) => String(composite?.imageUrl || '').trim())
      .filter(Boolean)
    : [];
}

function extractScrapbookImages(scrapbooks) {
  if (!Array.isArray(scrapbooks)) {
    return [];
  }

  return scrapbooks.flatMap((scrapbook) => {
    if (Array.isArray(scrapbook?.pageEntries) && scrapbook.pageEntries.length > 0) {
      return scrapbook.pageEntries
        .map((pageEntry) => String(pageEntry?.imageUrl || '').trim())
        .filter(Boolean);
    }

    return Array.isArray(scrapbook?.pageImageUrls)
      ? scrapbook.pageImageUrls
        .map((imageUrl) => String(imageUrl || '').trim())
        .filter(Boolean)
      : [];
  });
}

function shuffleImages(imageUrls) {
  const uniqueImages = dedupeTaggedImages(imageUrls);
  const groupedImages = groupImagesBySource(uniqueImages);
  const shuffledGroups = Object.fromEntries(
    Object.entries(groupedImages).map(([groupKey, entries]) => [groupKey, shuffleArray(entries)]),
  );
  const interleavedImages = [];
  const groupKeys = shuffleArray(Object.keys(shuffledGroups));

  while (groupKeys.some((groupKey) => shuffledGroups[groupKey].length > 0)) {
    for (const groupKey of groupKeys) {
        const nextImage = shuffledGroups[groupKey].shift();

      if (nextImage) {
        interleavedImages.push(nextImage);
      }
    }
  }

  return interleavedImages;
}

function tagImages(imageUrls, sourceType) {
  return imageUrls.map((imageUrl) => ({
    url: imageUrl,
    sourceType,
  }));
}

function dedupeTaggedImages(taggedImages) {
  const uniqueImages = new Map();

  taggedImages.forEach((entry) => {
    const normalizedUrl = String(entry?.url || '').trim();

    if (!normalizedUrl || uniqueImages.has(normalizedUrl)) {
      return;
    }

    uniqueImages.set(normalizedUrl, {
      url: normalizedUrl,
      sourceType: String(entry?.sourceType || 'other'),
    });
  });

  return Array.from(uniqueImages.values());
}

function groupImagesBySource(taggedImages) {
  return taggedImages.reduce((groups, entry) => {
    const groupKey = String(entry?.sourceType || 'other');

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }

    groups[groupKey].push(entry);
    return groups;
  }, {});
}

function shuffleArray(values) {
  const nextValues = [...values];

  for (let index = nextValues.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [nextValues[index], nextValues[swapIndex]] = [nextValues[swapIndex], nextValues[index]];
  }

  return nextValues;
}
