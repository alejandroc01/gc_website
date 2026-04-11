import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getComposites, getScrapbooks } from '../api/composites.js';
import './DisplayModePage.css';

const ROTATE_MS = 6500;
const CONTROLS_HIDE_MS = 2500;

export default function DisplayModePage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [displayImages, setDisplayImages] = useState([]);
  const hideControlsTimeoutRef = useRef(null);
  const navigate = useNavigate();

  const imageCount = displayImages.length;
  const hasImages = imageCount > 0;
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
      {displayImages.map((imageSrc, index) => (
        <img
          key={imageSrc}
          src={imageSrc}
          alt={imageAlt}
          className={['displayMode__image', index === currentIndex ? 'is-active' : ''].join(' ')}
        />
      ))}

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
        interleavedImages.push(nextImage.url);
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
