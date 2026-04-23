import { useEffect, useMemo, useState } from 'react';

import ActionCards, { ACTION_CARDS } from '../ActionCards/ActionCards.jsx';
import SearchBar from '../SearchBar/SearchBar.jsx';

const HOMEPAGE_DISPLAY_REFERENCE_WIDTH = 3840;
const HOMEPAGE_DISPLAY_REFERENCE_HEIGHT = 2160;

export default function HomepageDisplayMode() {
  const [displayMetrics, setDisplayMetrics] = useState(getDisplayMetrics);

  const displaySurface = useMemo(
    () => getHomepageDisplaySurface(displayMetrics),
    [displayMetrics],
  );
  const displayCards = useMemo(
    () => ACTION_CARDS.map((card) => (
      card.key === 'composites'
        ? {
          ...card,
          to: '/display-mode?mode=display&page=composites',
        }
        : card
    )),
    [],
  );

  useEffect(() => {
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

    window.addEventListener('resize', updateDisplayMetrics);
    visualViewport?.addEventListener('resize', updateDisplayMetrics);

    return () => {
      window.removeEventListener('resize', updateDisplayMetrics);
      visualViewport?.removeEventListener('resize', updateDisplayMetrics);
    };
  }, []);

  return (
    <section className="displayMode displayMode--homepage" aria-label="Homepage display mode">
      <div className="displayModeHomepage__viewport">
        <div
          className="displayModeHomepage__canvas"
          style={{
            width: `${HOMEPAGE_DISPLAY_REFERENCE_WIDTH}px`,
            height: `${HOMEPAGE_DISPLAY_REFERENCE_HEIGHT}px`,
            transform: `translate(-50%, -50%) scale(${displaySurface.canvasScale})`,
          }}
        >
          <div className="displayModeHomepage__content">
            <SearchBar className="displayModeHomepage__search" />

            <ActionCards
              cards={displayCards}
              className="displayModeHomepage__cards"
              eyebrow="Explore the Archive"
              heading="Browse by Collection"
              description="Choose a collection below to start exploring composites, scrapbooks, oral histories, and club history."
            />
          </div>
        </div>
      </div>
    </section>
  );
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

function getHomepageDisplaySurface({ viewportWidth, viewportHeight, devicePixelRatio }) {
  const densityScale = Math.max(devicePixelRatio || 1, 1);
  const physicalViewportWidth = Math.round(viewportWidth * densityScale);
  const physicalViewportHeight = Math.round(viewportHeight * densityScale);
  const referenceScale = Math.min(
    physicalViewportWidth / HOMEPAGE_DISPLAY_REFERENCE_WIDTH,
    physicalViewportHeight / HOMEPAGE_DISPLAY_REFERENCE_HEIGHT,
    1,
  );

  return {
    canvasScale: Number((referenceScale / densityScale).toFixed(5)),
  };
}
