import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import CompositeCopyrightNotice from '../components/Composite/CompositeCopyrightNotice.jsx';
import PublicCompositeStage from '../components/Composite/PublicCompositeStage.jsx';
import MemberProfileModal from '../components/MemberProfile/MemberProfileModal.jsx';
import { getComposites } from '../api/composites.js';
import '../styles/composites.css';
import './CompositesPage.css'; 

export default function CompositesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [composites, setComposites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [yearInput, setYearInput] = useState('');
  const [yearError, setYearError] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeProfileId, setActiveProfileId] = useState('');

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
    if (!activeProfileId && !isExpanded) {
      return undefined;
    }

    const handleWindowKeyDown = (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();

      if (activeProfileId) {
        setActiveProfileId('');
        return;
      }

      setIsExpanded(false);
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [activeProfileId, isExpanded]);

  useEffect(() => {
    if (!isExpanded) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isExpanded]);

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

  return (
    <section className="section compositesPage">
      <div className="container">
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
