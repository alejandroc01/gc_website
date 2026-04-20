import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getComposites, getScrapbooks } from '../api/composites.js';
import './DisplayModePage.css';

const ROTATE_MS = 6500;
const CONTROLS_HIDE_MS = 2500;
const PRELOAD_AHEAD_COUNT = 5;
const RENDER_TRAILING_COUNT = 1;
const RENDER_AHEAD_COUNT = 1;
const SCRAPBOOK_RIGHTS_URL = 'https://rightsstatements.org/page/InC-RUU/1.0/?language=en';
const SCRAPBOOK_RIGHTS_NOTICE = 'This Item is protected by copyright and/or related rights. However, for this Item, either (a) no rights-holder(s) have been identified or (b) one or more rights-holder(s) have been identified but none have been located. You are free to use this Item in any way that is permitted by the copyright and related rights legislation that applies to your use.';

export default function DisplayModePage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [displayImages, setDisplayImages] = useState([]);
  const hideControlsTimeoutRef = useRef(null);
  const loadedImageUrlsRef = useRef(new Set());
  const preloadingImagePromisesRef = useRef(new Map());
  const navigate = useNavigate();

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

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (!hasImages) return undefined;

    const timerId = window.setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % imageCount);
    }, ROTATE_MS);

    return () => window.clearInterval(timerId);
  }, [hasImages, imageCount]);

  useEffect(() => {
    if (!hasImages) return;

    preloadImagesAroundIndex(displayImages, currentIndex, {
      loadedImageUrlsRef,
      preloadingImagePromisesRef,
    });
  }, [currentIndex, displayImages, hasImages]);

  useEffect(() => {
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
      if (event.key === 'Escape') {
        navigate('/');
      }
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
  }, [navigate]);

  if (!hasImages) {
    return (
      <section className="displayMode displayMode--empty">
        <div className="displayMode__emptyMessage">
          <h1>Display Mode</h1>
          <p>No display images are configured yet.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="displayMode" aria-label="Display mode slideshow">
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
        <button
          type="button"
          className="displayMode__exitButton"
          onClick={() => navigate('/')}
        >
          Exit display
        </button>
      </div>
    </section>
  );
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
