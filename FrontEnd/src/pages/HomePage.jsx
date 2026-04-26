import { useEffect, useState } from 'react';

import Hero from '../components/Hero/Hero.jsx';
import SearchBar from '../components/SearchBar/SearchBar.jsx';
import ActionCards from '../components/ActionCards/ActionCards.jsx';
import CompositeCopyrightNotice from '../components/Composite/CompositeCopyrightNotice.jsx';
import { getHomepageContent } from '../api/composites.js';
import {
  loadStoredHomepageContent,
  normalizeHomepageContent,
  persistHomepageContent,
} from '../constants/homepageContent.js';

/**
 * HomePage ("Archive Home")
 *
 * This is the landing page for the Alumni Archives.
 *
 * Sections:
 * 1) Hero (image left, headline + description right)
 * 2) Search input (UI only, no functionality yet)
 * 3) Action cards (Composites, Scrapbooks, Oral Histories)
 */
export default function HomePage() {
  const [homepageContent, setHomepageContent] = useState(() => loadStoredHomepageContent());

  useEffect(() => {
    let isActive = true;

    const loadHomepageContent = async () => {
      try {
        const loadedHomepageContent = normalizeHomepageContent(await getHomepageContent());

        if (!isActive) {
          return;
        }

        setHomepageContent(loadedHomepageContent);
        persistHomepageContent(loadedHomepageContent);
      } catch (error) {
        if (!isActive) {
          return;
        }

        console.error('Unable to load homepage content.', error);
        setHomepageContent((currentHomepageContent) => currentHomepageContent || normalizeHomepageContent(null));
      }
    };

    loadHomepageContent();

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <>
      {homepageContent ? (
        <Hero
          imageSrc={homepageContent.imageUrl}
          imageAlt={homepageContent.imageAlt}
          eyebrow={homepageContent.eyebrow}
          title={homepageContent.title}
          description={homepageContent.description}
          textStyles={homepageContent.textStyles}
        />
      ) : (
        <section className="hero section" aria-hidden="true">
          <div className="container">
            <div className="hero__grid">
              <div
                className="hero__media"
                style={{
                  aspectRatio: '4 / 3',
                  border: '1px solid var(--border)',
                  background: 'var(--surface-muted)',
                }}
              />
              <div style={{ minHeight: '240px' }} />
            </div>
          </div>
        </section>
      )}

      <SearchBar />

      <ActionCards
        eyebrow="Explore the Archive"
        heading="Browse by Collection"
        description="Choose a collection below to start exploring composites, scrapbooks, oral histories, and club history."
      />

      <section className="section compositeCopyrightNoticeSection">
        <div className="container">
          <CompositeCopyrightNotice className="compositeCopyrightNotice--pageFooter" />
        </div>
      </section>
    </>
  );
}
