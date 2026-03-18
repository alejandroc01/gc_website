import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import './DisplayModePage.css';

// Only 4 images for now but will likely be linked to the scrapbook/group images when finalized
const DISPLAY_IMAGES = [
  '/images/1983ScrapB-P26.jpg',
  '/images/2025.jpg',
  '/images/2025.jpeg',
  '/images/homepageimage.jpg',
];

const ROTATE_MS = 5000;
const CONTROLS_HIDE_MS = 2500;

export default function DisplayModePage() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideControlsTimeoutRef = useRef(null);
  const navigate = useNavigate();

  const imageCount = DISPLAY_IMAGES.length;
  const hasImages = imageCount > 0;
  const imageAlt = useMemo(
    () => `Display slideshow image ${currentIndex + 1} of ${Math.max(imageCount, 1)}`,
    [currentIndex, imageCount],
  );

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
      {DISPLAY_IMAGES.map((imageSrc, index) => (
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
