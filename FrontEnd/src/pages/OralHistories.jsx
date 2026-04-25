import { useEffect, useMemo, useRef, useState } from 'react';

import { getOralHistories } from '../api/composites.js';
import fullscreenIconUrl from '../assets/icons/oral-history-fullscreen.svg';
import muteIconUrl from '../assets/icons/oral-history-mute.svg';
import volumeIconUrl from '../assets/icons/oral-history-volume.svg';
import './OralHistories.css';

const preferredIntervieweeOrder = ['doug petty', 'randy minix', 'tom dalzell'];
const defaultOralHistoryCategories = [
  'Why Virginia Tech?',
  'German Club Life',
  'Traditions & Values',
  'Athletics & Student Life',
  'Alumni, Giving & GCAF',
  'Military, Career & Personal Stories',
];
const DISPLAY_VIDEO_CONTROLS_HIDE_MS = 2800;

/**
 * OralHistories
 *
 * Landing page for oral history interviews.
 * The page now loads uploaded oral history videos from backend storage.
 */
export default function OralHistories({ displayMode = false, onBack = null }) {
  const [episodes, setEpisodes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeInterviewee, setActiveInterviewee] = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [activeOralHistoryId, setActiveOralHistoryId] = useState('');
  const [openDisplayDropdown, setOpenDisplayDropdown] = useState('');
  const [areDisplayVideoControlsVisible, setAreDisplayVideoControlsVisible] = useState(true);
  const [isDisplayVideoFullscreen, setIsDisplayVideoFullscreen] = useState(false);
  const [displayPlaybackState, setDisplayPlaybackState] = useState({
    currentTime: 0,
    duration: 0,
    isMuted: false,
    isPlaying: false,
  });
  const displayFiltersRef = useRef(null);
  const displayVideoRef = useRef(null);
  const displayVideoControlsTimeoutRef = useRef(null);
  const pendingDisplayAutoplayIdRef = useRef('');

  useEffect(() => {
    let isActive = true;

    const loadEpisodes = async () => {
      setIsLoading(true);
      setLoadError('');

      try {
        const loadedEpisodes = await getOralHistories();

        if (!isActive) {
          return;
        }

        const normalizedEpisodes = [...(Array.isArray(loadedEpisodes) ? loadedEpisodes : [])]
          .map((episode) => normalizeOralHistory(episode))
          .sort(compareOralHistories);

        setEpisodes(normalizedEpisodes);

        if (normalizedEpisodes.length > 0) {
          setActiveOralHistoryId(String(normalizedEpisodes[0].oralHistoryId || ''));
        }
      } catch (error) {
        if (isActive) {
          setLoadError(error.message);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadEpisodes();

    return () => {
      isActive = false;
    };
  }, []);

  const interviewees = useMemo(() => getIntervieweeOptions(episodes), [episodes]);
  const categories = useMemo(() => getCategoryOptions(episodes), [episodes]);

  const intervieweeEpisodes = useMemo(() => {
    if (!activeInterviewee) {
      return episodes;
    }

    return episodes.filter(
      (episode) => normalizeIntervieweeName(episode.interviewee) === normalizeIntervieweeName(activeInterviewee),
    );
  }, [activeInterviewee, episodes]);

  const visibleEpisodes = useMemo(() => {
    if (!activeCategory) {
      return intervieweeEpisodes;
    }

    return intervieweeEpisodes.filter(
      (episode) =>
        !episode.isFullLength
        && normalizeCategoryName(episode.category).toLowerCase() === normalizeCategoryName(activeCategory).toLowerCase(),
    );
  }, [activeCategory, intervieweeEpisodes]);

  useEffect(() => {
    if (!interviewees.length || !activeInterviewee) {
      setActiveInterviewee('');
      return;
    }

    if (!findMatchingIntervieweeName(interviewees, activeInterviewee)) {
      setActiveInterviewee(interviewees[0]);
    }
  }, [activeInterviewee, interviewees]);

  useEffect(() => {
    if (!activeCategory) {
      return;
    }

    if (!findMatchingCategoryName(categories, activeCategory)) {
      setActiveCategory('');
    }
  }, [activeCategory, categories]);

  useEffect(() => {
    if (!displayMode || !openDisplayDropdown) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      const target = event.target;

      if (displayFiltersRef.current && target && !displayFiltersRef.current.contains(target)) {
        setOpenDisplayDropdown('');
      }
    };

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') {
        return;
      }

      event.preventDefault();
      setOpenDisplayDropdown('');
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [displayMode, openDisplayDropdown]);

  useEffect(() => {
    if (visibleEpisodes.length === 0) {
      setActiveOralHistoryId('');
      return;
    }

    const hasActiveEpisode = visibleEpisodes.some(
      (episode) => String(episode?.oralHistoryId || '') === String(activeOralHistoryId),
    );

    if (!hasActiveEpisode) {
      setActiveOralHistoryId(String(visibleEpisodes[0].oralHistoryId || ''));
    }
  }, [activeOralHistoryId, visibleEpisodes]);

  const activeEpisode = useMemo(() => (
    visibleEpisodes.find((episode) => String(episode?.oralHistoryId || '') === String(activeOralHistoryId))
    || visibleEpisodes[0]
    || null
  ), [activeOralHistoryId, visibleEpisodes]);

  const playlistEpisodes = useMemo(
    () => buildPlaylistEpisodes(visibleEpisodes, {
      includePlaceholders: Boolean(activeInterviewee && !activeCategory),
    }),
    [activeCategory, activeInterviewee, visibleEpisodes],
  );
  const activePoster = useOralHistoryPoster(activeEpisode, activeInterviewee || activeEpisode?.interviewee);
  const activeIntervieweeLabel = activeInterviewee || activeEpisode?.interviewee || 'No interview selected';
  const activeCategoryLabel = getActiveCategoryLabel(activeEpisode, activeInterviewee);
  const displayIntervieweeOptions = useMemo(
    () => [
      { value: '', label: 'All Interviews' },
      ...interviewees.map((interviewee) => ({ value: interviewee, label: interviewee })),
    ],
    [interviewees],
  );
  const displayCategoryOptions = useMemo(
    () => [
      { value: '', label: 'All Categories' },
      ...categories.map((category) => ({ value: category, label: category })),
    ],
    [categories],
  );

  const showDisplayVideoControls = () => {
    if (!displayMode) {
      return;
    }

    setAreDisplayVideoControlsVisible(true);

    if (displayVideoControlsTimeoutRef.current) {
      window.clearTimeout(displayVideoControlsTimeoutRef.current);
    }

    displayVideoControlsTimeoutRef.current = window.setTimeout(() => {
      setAreDisplayVideoControlsVisible(false);
    }, DISPLAY_VIDEO_CONTROLS_HIDE_MS);
  };

  const updateDisplayPlaybackState = () => {
    const videoElement = displayVideoRef.current;

    if (!videoElement) {
      return;
    }

    const duration = Number.isFinite(videoElement.duration) ? videoElement.duration : 0;

    setDisplayPlaybackState({
      currentTime: Number.isFinite(videoElement.currentTime) ? videoElement.currentTime : 0,
      duration,
      isMuted: videoElement.muted || videoElement.volume === 0,
      isPlaying: !videoElement.paused && !videoElement.ended,
    });
  };

  useEffect(() => {
    if (!displayMode) {
      return undefined;
    }

    const pendingEpisodeId = pendingDisplayAutoplayIdRef.current;
    const activeEpisodeId = String(activeEpisode?.oralHistoryId || '');

    if (!pendingEpisodeId || pendingEpisodeId !== activeEpisodeId) {
      return undefined;
    }

    const videoElement = displayVideoRef.current;

    if (!videoElement) {
      return undefined;
    }

    let isCancelled = false;
    const playPendingVideo = () => {
      if (isCancelled || pendingDisplayAutoplayIdRef.current !== activeEpisodeId) {
        return;
      }

      pendingDisplayAutoplayIdRef.current = '';
      void videoElement.play().catch(() => {});
    };

    if (videoElement.readyState >= 2) {
      playPendingVideo();
      return undefined;
    }

    videoElement.addEventListener('loadeddata', playPendingVideo, { once: true });
    videoElement.addEventListener('canplay', playPendingVideo, { once: true });

    return () => {
      isCancelled = true;
      videoElement.removeEventListener('loadeddata', playPendingVideo);
      videoElement.removeEventListener('canplay', playPendingVideo);
    };
  }, [activeEpisode?.oralHistoryId, displayMode]);

  useEffect(() => {
    if (!displayMode) {
      return undefined;
    }

    showDisplayVideoControls();

    return () => {
      if (displayVideoControlsTimeoutRef.current) {
        window.clearTimeout(displayVideoControlsTimeoutRef.current);
      }
    };
  }, [displayMode, activeEpisode?.oralHistoryId]);

  useEffect(() => {
    if (!displayMode) {
      return;
    }

    setDisplayPlaybackState((currentState) => ({
      ...currentState,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
    }));
  }, [activeEpisode?.oralHistoryId, displayMode]);

  const handleDisplayEpisodeSelect = (episode) => {
    const nextEpisodeId = String(episode?.oralHistoryId || '');

    if (!episode?.videoUrl || !nextEpisodeId) {
      return;
    }

    pendingDisplayAutoplayIdRef.current = nextEpisodeId;
    setActiveOralHistoryId(nextEpisodeId);

    if (nextEpisodeId === String(activeEpisode?.oralHistoryId || '')) {
      window.requestAnimationFrame(() => {
        pendingDisplayAutoplayIdRef.current = '';
        void displayVideoRef.current?.play().catch(() => {});
      });
    }
  };

  const toggleDisplayPlayback = () => {
    const videoElement = displayVideoRef.current;

    if (!videoElement || !activeEpisode?.videoUrl) {
      return;
    }

    if (videoElement.paused || videoElement.ended) {
      showDisplayVideoControls();
      void videoElement.play().catch(() => {});
      return;
    }

    videoElement.pause();
    showDisplayVideoControls();
  };

  const handleDisplaySeek = (event) => {
    const videoElement = displayVideoRef.current;
    const nextTime = Number(event.target.value);

    if (!videoElement || !Number.isFinite(nextTime)) {
      return;
    }

    videoElement.currentTime = nextTime;
    updateDisplayPlaybackState();
    showDisplayVideoControls();
  };

  const toggleDisplayMute = () => {
    const videoElement = displayVideoRef.current;

    if (!videoElement) {
      return;
    }

    videoElement.muted = !videoElement.muted;
    updateDisplayPlaybackState();
    showDisplayVideoControls();
  };

  const toggleDisplayVideoFullscreen = () => {
    setIsDisplayVideoFullscreen((currentValue) => !currentValue);
    showDisplayVideoControls();
  };

  const renderDisplayDropdown = ({ dropdownId, label, onChange, options, value }) => {
    const selectedOption = options.find((option) => option.value === value) || options[0];
    const isOpen = openDisplayDropdown === dropdownId;

    return (
      <div className={`oralHistories__displayDropdown${isOpen ? ' oralHistories__displayDropdown--open' : ''}`}>
        <button
          type="button"
          className="oralHistories__displayDropdownButton"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          onClick={() => {
            setOpenDisplayDropdown((currentDropdown) => (
              currentDropdown === dropdownId ? '' : dropdownId
            ));
          }}
        >
          <span className="oralHistories__displayDropdownLabel">
            {selectedOption?.label || label}
          </span>
          <span className="oralHistories__displayDropdownArrow" aria-hidden="true" />
        </button>

        {isOpen ? (
          <div className="oralHistories__displayDropdownMenu" role="listbox" aria-label={label}>
            {options.map((option) => {
              const isSelected = option.value === value;

              return (
                <button
                  key={option.value || `${dropdownId}-all`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`oralHistories__displayDropdownOption${
                    isSelected ? ' oralHistories__displayDropdownOption--selected' : ''
                  }`}
                  onClick={() => {
                    onChange(option.value);
                    setOpenDisplayDropdown('');
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  const renderVideoPlayer = (className, options = {}) => (
    <video
      ref={options.videoRef}
      className={className}
      controls={options.controls !== false}
      preload="metadata"
      poster={activePoster}
      aria-label="Featured oral history video player"
      key={activeEpisode?.oralHistoryId || 'oral-history-placeholder'}
      playsInline
      onClick={options.onClick}
      onDurationChange={options.onDurationChange}
      onEnded={options.onEnded}
      onLoadedMetadata={options.onLoadedMetadata}
      onPause={options.onPause}
      onPlay={options.onPlay}
      onTimeUpdate={options.onTimeUpdate}
      onVolumeChange={options.onVolumeChange}
    >
      {activeEpisode?.videoUrl ? (
        <source src={activeEpisode.videoUrl} type={activeEpisode.mimeType || 'video/mp4'} />
      ) : null}
      Your browser does not support the video tag.
    </video>
  );

  if (displayMode) {
    return (
      <div
        className={[
          'oralHistories oralHistories--displayMode',
          isDisplayVideoFullscreen ? 'oralHistories--displayVideoFullscreen' : '',
        ].filter(Boolean).join(' ')}
      >
        <div className="oralHistories__displayGrid">
          <section className="oralHistories__displayStage" aria-label="Featured oral history">
            <div className="oralHistories__displayIntro">
              <p className="oralHistories__displayEyebrow">German Club Digital Archives</p>
              <h1 className="oralHistories__displayTitle">Oral Histories</h1>
              <p className="oralHistories__displayLede">
                Hear German Club alumni reflect on the friendships, traditions, service, and campus life
                that shaped their time at Virginia Tech.
              </p>
            </div>

            <div
              className={[
                'oralHistories__displayMediaFrame',
                areDisplayVideoControlsVisible ? 'oralHistories__displayMediaFrame--controlsVisible' : '',
              ].filter(Boolean).join(' ')}
              onFocus={showDisplayVideoControls}
              onMouseMove={showDisplayVideoControls}
              onPointerDown={showDisplayVideoControls}
            >
              {renderVideoPlayer('oralHistories__displayVideo', {
                controls: false,
                onClick: () => {
                  showDisplayVideoControls();
                  toggleDisplayPlayback();
                },
                onDurationChange: updateDisplayPlaybackState,
                onEnded: updateDisplayPlaybackState,
                onLoadedMetadata: updateDisplayPlaybackState,
                onPause: updateDisplayPlaybackState,
                onPlay: updateDisplayPlaybackState,
                onTimeUpdate: updateDisplayPlaybackState,
                onVolumeChange: updateDisplayPlaybackState,
                videoRef: displayVideoRef,
              })}
              <div className="oralHistories__displayVideoControls">
                <button
                  type="button"
                  className="oralHistories__displayVideoButton oralHistories__displayVideoButton--play"
                  onClick={toggleDisplayPlayback}
                  disabled={!activeEpisode?.videoUrl}
                  aria-label={displayPlaybackState.isPlaying ? 'Pause video' : 'Play video'}
                >
                  <span
                    className={`oralHistories__displayVideoButtonGlyph${
                      displayPlaybackState.isPlaying
                        ? ' oralHistories__displayVideoButtonGlyph--pause'
                        : ' oralHistories__displayVideoButtonGlyph--play'
                    }`}
                    aria-hidden="true"
                  />
                </button>
                <span className="oralHistories__displayVideoTime">
                  {formatPlaybackTime(displayPlaybackState.currentTime)}
                </span>
                <input
                  className="oralHistories__displayVideoRange"
                  type="range"
                  min="0"
                  max={Math.max(displayPlaybackState.duration, 0)}
                  step="0.1"
                  value={Math.min(
                    displayPlaybackState.currentTime,
                    displayPlaybackState.duration || displayPlaybackState.currentTime,
                  )}
                  onChange={handleDisplaySeek}
                  disabled={!displayPlaybackState.duration}
                  aria-label="Video playback position"
                  style={{
                    '--oral-history-display-progress': `${getPlaybackProgress(displayPlaybackState)}%`,
                  }}
                />
                <span className="oralHistories__displayVideoTime">
                  {formatPlaybackTime(displayPlaybackState.duration)}
                </span>
                <button
                  type="button"
                  className="oralHistories__displayVideoButton oralHistories__displayVideoButton--icon"
                  onClick={toggleDisplayMute}
                  disabled={!activeEpisode?.videoUrl}
                  aria-label={displayPlaybackState.isMuted ? 'Unmute video' : 'Mute video'}
                >
                  <img
                    className="oralHistories__displayVideoIcon"
                    src={displayPlaybackState.isMuted ? muteIconUrl : volumeIconUrl}
                    alt=""
                  />
                </button>
                <button
                  type="button"
                  className="oralHistories__displayVideoButton oralHistories__displayVideoButton--icon"
                  onClick={toggleDisplayVideoFullscreen}
                  aria-label={isDisplayVideoFullscreen ? 'Exit fullscreen video' : 'Enter fullscreen video'}
                >
                  <img
                    className="oralHistories__displayVideoIcon"
                    src={fullscreenIconUrl}
                    alt=""
                  />
                </button>
              </div>
            </div>

            <div className="oralHistories__displayFooter">
              <div className="oralHistories__displayPrompt">
                <span className="oralHistories__displayPromptLine" />
                <span className="oralHistories__displayPromptText">Tap an Episode to Begin</span>
                <span className="oralHistories__displayPromptLine" />
              </div>

              {onBack ? (
                <button
                  type="button"
                  className="oralHistories__displayHomeButton"
                  onClick={onBack}
                >
                  Return to Home
                </button>
              ) : null}
            </div>
          </section>

          <aside className="oralHistories__displayPanel" aria-label="Oral history controls">
            <div className="oralHistories__displaySummary">
              <div className="oralHistories__displaySummaryRow">
                <span className="oralHistories__displaySummaryLabel">Featured Interview</span>
                <strong className="oralHistories__displaySummaryValue">{activeIntervieweeLabel}</strong>
              </div>
              <div className="oralHistories__displaySummaryRow">
                <span className="oralHistories__displaySummaryLabel">Category</span>
                <strong className="oralHistories__displaySummaryValue">{activeCategoryLabel}</strong>
              </div>
            </div>

            <div className="oralHistories__displayFilters" ref={displayFiltersRef}>
              {interviewees.length > 0 ? (
                renderDisplayDropdown({
                  dropdownId: 'interviewee',
                  label: 'Interviewee',
                  onChange: setActiveInterviewee,
                  options: displayIntervieweeOptions,
                  value: activeInterviewee,
                })
              ) : null}

              {categories.length > 0 ? (
                renderDisplayDropdown({
                  dropdownId: 'category',
                  label: 'Category',
                  onChange: setActiveCategory,
                  options: displayCategoryOptions,
                  value: activeCategory,
                })
              ) : null}
            </div>

            <div className="oralHistories__displayPlaylistHeader">
              <h2 className="oralHistories__displayPlaylistTitle">Episode Playlist</h2>
            </div>

            {isLoading ? <p className="oralHistories__displayMessage">Loading episodes...</p> : null}
            {loadError ? <p className="oralHistories__displayMessage">{loadError}</p> : null}

            {!isLoading && !loadError && playlistEpisodes.length === 0 ? (
              <p className="oralHistories__displayMessage">
                Oral history recordings will appear here as they are added to the archive.
              </p>
            ) : null}

            {playlistEpisodes.length > 0 ? (
              <div className="oralHistories__displayPlaylistList">
                {playlistEpisodes.map((episode) => (
                  <button
                    key={episode.oralHistoryId || `display-placeholder-${episode.episodeNumber}`}
                    type="button"
                    className={`oralHistories__displayPlaylistItem${
                      String(episode.oralHistoryId || '') === String(activeEpisode?.oralHistoryId || '')
                        ? ' oralHistories__displayPlaylistItem--active'
                        : ''
                    }`}
                    onClick={() => handleDisplayEpisodeSelect(episode)}
                    disabled={!episode.videoUrl}
                  >
                    <span
                      className={`oralHistories__displayPlaylistNumber${
                        episode.isFullLength ? ' oralHistories__displayPlaylistNumber--full' : ''
                      }`}
                    >
                      {episode.isFullLength ? 'Full' : String(episode.episodeNumber).padStart(2, '0')}
                    </span>
                    <span className="oralHistories__displayPlaylistText">
                      {formatEpisodeLabel(episode)}
                      <span className="oralHistories__displayPlaylistSubtitle">
                        {episode.videoUrl
                          ? formatEpisodeTitle(episode.title)
                          : getPlaceholderTitle(episode.episodeNumber)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="oralHistories">
      <section className="oralHistories__hero section">
        <div className="container oralHistories__heroGrid">
          <div className="oralHistories__intro">
            <p className="oralHistories__eyebrow">German Club Digital Archives</p>
            <h1 className="oralHistories__title">Oral Histories</h1>
            <p className="oralHistories__lede oralHistories__lede--wide">
              Hear German Club alumni reflect on the friendships, traditions, service, and campus moments
              that shaped their time at Virginia Tech.
            </p>
            <p className="oralHistories__copy">
              {activeEpisode
                ? 'Explore the episodes by selecting a featured interviewee, filtering by category, and choosing a recording from the playlist.'
                : activeCategory
                  ? `No uploaded episodes are currently categorized under ${activeCategory}.`
                  : activeInterviewee
                  ? `No uploaded episodes for ${activeInterviewee} yet.`
                  : 'Oral history recordings will appear here as they are added to the archive.'}
            </p>
          </div>

          <aside className="oralHistories__details" aria-label="Collection overview">
            <div className="oralHistories__detailCard">
              <span className="oralHistories__detailLabel">Featured interview</span>
              <strong className="oralHistories__detailValue">
                {activeInterviewee || activeEpisode?.interviewee || 'No interview selected'}
              </strong>
            </div>
            <div className="oralHistories__detailCard">
              <span className="oralHistories__detailLabel">Category</span>
              <strong className="oralHistories__detailValue">
                {activeEpisode
                  ? activeEpisode.isFullLength
                    ? 'Full interview'
                    : activeEpisode.category
                  : activeInterviewee
                    ? 'No category selected'
                    : 'No episodes loaded'}
              </strong>
            </div>
          </aside>
        </div>
      </section>

      <section className="oralHistories__feature section">
        <div className="container">
          <div className="oralHistories__panel">
            <div className="oralHistories__panelHeader">
              <div>
                <p className="oralHistories__sectionLabel">Featured Recording</p>
                <h2 className="oralHistories__sectionTitle">
                  {activeEpisode ? formatEpisodeTitle(activeEpisode.title) : 'Episode 1 will appear here after upload'}
                </h2>
              </div>
              <div className="oralHistories__panelControls">
                {interviewees.length > 0 ? (
                  <label className="oralHistories__selector">
                    <span className="oralHistories__selectorLabel">Interviewee</span>
                    <select
                      className="oralHistories__selectorInput"
                      value={activeInterviewee}
                      onChange={(event) => setActiveInterviewee(event.target.value)}
                    >
                      <option value="">All interviewees</option>
                      {interviewees.map((interviewee) => (
                        <option key={interviewee} value={interviewee}>
                          {interviewee}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {categories.length > 0 ? (
                  <label className="oralHistories__selector">
                    <span className="oralHistories__selectorLabel">Category</span>
                    <select
                      className="oralHistories__selectorInput"
                      value={activeCategory}
                      onChange={(event) => setActiveCategory(event.target.value)}
                    >
                      <option value="">All categories</option>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {isLoading ? <p className="oralHistories__panelNote">Loading episodes...</p> : null}
              </div>
            </div>

            <div className="oralHistories__contentGrid">
              <div className="oralHistories__mediaFrame">
                {renderVideoPlayer('oralHistories__video')}
              </div>

              <aside className="oralHistories__playlist" aria-label="Episode playlist">
                <div className="oralHistories__playlistHeader">
                  <h3 className="oralHistories__playlistTitle">Episode Playlist</h3>
                </div>

                <div className="oralHistories__playlistList">
                  {playlistEpisodes.map((episode) => (
                    <button
                      key={episode.oralHistoryId || `placeholder-${episode.episodeNumber}`}
                      type="button"
                      className={`oralHistories__playlistItem${
                        String(episode.oralHistoryId || '') === String(activeEpisode?.oralHistoryId || '')
                          ? ' oralHistories__playlistItem--active'
                          : ''
                      }`}
                      onClick={() => {
                        if (episode.videoUrl) {
                          setActiveOralHistoryId(String(episode.oralHistoryId || ''));
                        }
                      }}
                      disabled={!episode.videoUrl}
                    >
                      <span className="oralHistories__playlistNumber">
                        {episode.isFullLength ? 'Full' : String(episode.episodeNumber).padStart(2, '0')}
                      </span>
                      <span className="oralHistories__playlistText">
                        {formatEpisodeLabel(episode)}
                        <span className="oralHistories__playlistSubtitle">
                          {episode.videoUrl
                            ? formatEpisodeTitle(episode.title)
                            : getPlaceholderTitle(episode.episodeNumber)}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </aside>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function getActiveCategoryLabel(activeEpisode, activeInterviewee) {
  if (activeEpisode) {
    return activeEpisode.isFullLength ? 'Full Interview' : activeEpisode.category;
  }

  if (activeInterviewee) {
    return 'No category selected';
  }

  return 'No episodes loaded';
}

function getPlaybackProgress({ currentTime, duration }) {
  const normalizedDuration = Number(duration || 0);

  if (normalizedDuration <= 0) {
    return 0;
  }

  return Math.min(100, Math.max(0, (Number(currentTime || 0) / normalizedDuration) * 100));
}

function formatPlaybackTime(value) {
  const totalSeconds = Math.max(0, Math.floor(Number(value || 0)));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function useOralHistoryPoster(activeEpisode, intervieweeName) {
  const [generatedPoster, setGeneratedPoster] = useState('');
  const videoUrl = activeEpisode?.videoUrl || '';
  const staticPoster = getStaticOralHistoryPoster(intervieweeName);

  useEffect(() => {
    setGeneratedPoster('');

    if (staticPoster || !videoUrl || typeof document === 'undefined') {
      return undefined;
    }

    let isActive = true;
    let hasRequestedSeek = false;
    const previewVideo = document.createElement('video');

    previewVideo.crossOrigin = 'anonymous';
    previewVideo.muted = true;
    previewVideo.playsInline = true;
    previewVideo.preload = 'metadata';

    const capturePreviewFrame = () => {
      if (!isActive || previewVideo.videoWidth <= 0 || previewVideo.videoHeight <= 0) {
        return;
      }

      try {
        const canvas = document.createElement('canvas');
        canvas.width = previewVideo.videoWidth;
        canvas.height = previewVideo.videoHeight;

        const context = canvas.getContext('2d');

        if (!context) {
          return;
        }

        context.drawImage(previewVideo, 0, 0, canvas.width, canvas.height);
        setGeneratedPoster(canvas.toDataURL('image/jpeg', 0.82));
      } catch {
        setGeneratedPoster('');
      }
    };

    const seekToPreviewFrame = () => {
      if (hasRequestedSeek) {
        return;
      }

      hasRequestedSeek = true;
      const duration = Number(previewVideo.duration);
      const previewTime = Number.isFinite(duration) && duration > 1
        ? Math.min(Math.max(duration * 0.08, 0.5), 5)
        : 0;

      if (previewTime > 0) {
        try {
          previewVideo.currentTime = previewTime;
          return;
        } catch {
          // Fall through and capture the first available frame.
        }
      }

      capturePreviewFrame();
    };

    previewVideo.addEventListener('loadedmetadata', seekToPreviewFrame);
    previewVideo.addEventListener('loadeddata', seekToPreviewFrame);
    previewVideo.addEventListener('seeked', capturePreviewFrame);
    previewVideo.src = videoUrl;
    previewVideo.load();

    return () => {
      isActive = false;
      previewVideo.removeAttribute('src');
      previewVideo.load();
    };
  }, [staticPoster, videoUrl]);

  return staticPoster || generatedPoster || '/images/homepageimage.jpg';
}

function buildPlaylistEpisodes(episodes, options = {}) {
  const { includePlaceholders = false } = options;
  const uploadedEpisodes = [...episodes].sort(compareOralHistories);

  if (!includePlaceholders) {
    return uploadedEpisodes;
  }

  const numberedEpisodes = uploadedEpisodes.filter((episode) => !episode.isFullLength);
  const fullLengthEpisodes = uploadedEpisodes.filter((episode) => episode.isFullLength);
  const totalEpisodeCount = Math.max(
    1,
    ...numberedEpisodes.map((episode) => Number(episode?.episodeNumber || 0)),
  );
  const episodesByNumber = new Map(
    numberedEpisodes.map((episode) => [Number(episode?.episodeNumber || 0), episode]),
  );

  const placeholderEpisodes = Array.from({ length: totalEpisodeCount }, (_, index) => {
    const episodeNumber = index + 1;
    return episodesByNumber.get(episodeNumber) || {
      oralHistoryId: '',
      isFullLength: false,
      episodeNumber,
      title: '',
      videoUrl: '',
    };
  });

  return [...fullLengthEpisodes, ...placeholderEpisodes];
}

function normalizeOralHistory(oralHistory) {
  const isFullLength = Boolean(oralHistory?.isFullLength);

  return {
    ...oralHistory,
    oralHistoryId: String(oralHistory?.oralHistoryId || ''),
    category: isFullLength
      ? normalizeCategoryName(oralHistory?.category)
      : normalizeCategoryName(oralHistory?.category || getCategoryForTitle(oralHistory?.title)),
    isFullLength,
    episodeNumber: isFullLength ? null : Number(oralHistory?.episodeNumber || 0),
  };
}

function compareOralHistories(leftEpisode, rightEpisode) {
  const intervieweeDifference = compareIntervieweeNames(leftEpisode.interviewee, rightEpisode.interviewee);

  if (intervieweeDifference !== 0) {
    return intervieweeDifference;
  }

  if (Boolean(leftEpisode.isFullLength) !== Boolean(rightEpisode.isFullLength)) {
    return leftEpisode.isFullLength ? -1 : 1;
  }

  const episodeNumberDifference = Number(leftEpisode.episodeNumber || 0) - Number(rightEpisode.episodeNumber || 0);

  if (episodeNumberDifference !== 0) {
    return episodeNumberDifference;
  }

  return formatEpisodeTitle(leftEpisode.title).localeCompare(formatEpisodeTitle(rightEpisode.title));
}

function getIntervieweeOptions(episodes) {
  const names = new Map();

  episodes.forEach((episode) => {
    const intervieweeName = normalizeIntervieweeName(episode?.interviewee);

    if (!intervieweeName || names.has(intervieweeName.toLowerCase())) {
      return;
    }

    names.set(intervieweeName.toLowerCase(), intervieweeName);
  });

  return [...names.values()].sort(compareIntervieweeNames);
}

function compareIntervieweeNames(leftName, rightName) {
  const leftOrder = getPreferredIntervieweeOrder(leftName);
  const rightOrder = getPreferredIntervieweeOrder(rightName);

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return normalizeIntervieweeName(leftName).localeCompare(normalizeIntervieweeName(rightName));
}

function getPreferredIntervieweeOrder(intervieweeName) {
  const normalizedInterviewee = normalizeIntervieweeName(intervieweeName).toLowerCase();
  const preferredIndex = preferredIntervieweeOrder.indexOf(normalizedInterviewee);

  return preferredIndex === -1 ? preferredIntervieweeOrder.length : preferredIndex;
}

function findMatchingIntervieweeName(names, targetName) {
  const normalizedTargetName = normalizeIntervieweeName(targetName).toLowerCase();

  return names.find((name) => normalizeIntervieweeName(name).toLowerCase() === normalizedTargetName) || '';
}

function findMatchingCategoryName(names, targetName) {
  const normalizedTargetName = normalizeCategoryName(targetName).toLowerCase();

  return names.find((name) => normalizeCategoryName(name).toLowerCase() === normalizedTargetName) || '';
}

function normalizeIntervieweeName(value) {
  return String(value || '').trim();
}

function normalizeCategoryName(value) {
  return String(value || '').trim();
}

function getCategoryOptions(episodes) {
  const categories = new Map();

  [
    ...defaultOralHistoryCategories,
    ...episodes
      .filter((episode) => !episode.isFullLength)
      .map((episode) => episode.category),
  ]
    .map((category) => normalizeCategoryName(category))
    .filter(Boolean)
    .forEach((category) => {
      const normalizedKey = category.toLowerCase();

      if (!categories.has(normalizedKey)) {
        categories.set(normalizedKey, category);
      }
    });

  return [...categories.values()];
}

function getCategoryForTitle(title) {
  const normalizedTitle = String(title || '').trim().toLowerCase();

  if (/why.*tech|come to tech|love of va tech|special memory of tech/.test(normalizedTitle)) {
    return 'Why Virginia Tech?';
  }

  if (/joining|club like|club member|life as a gc member|get involved with the gc/.test(normalizedTitle)) {
    return 'German Club Life';
  }

  if (/ritual|gentleman|independent|special door|message.*club members/.test(normalizedTitle)) {
    return 'Traditions & Values';
  }

  if (/football|athlete|dances|cotillion|entertainment|dumb jock/.test(normalizedTitle)) {
    return 'Athletics & Student Life';
  }

  if (/alumni|gcaf|foundation|manor|give|generously|pamplin/.test(normalizedTitle)) {
    return 'Alumni, Giving & GCAF';
  }

  return 'Military, Career & Personal Stories';
}

function getStaticOralHistoryPoster(intervieweeName) {
  const normalizedInterviewee = normalizeIntervieweeName(intervieweeName).toLowerCase();

  if (normalizedInterviewee === 'doug petty') {
    return '/images/doug_oral_history_thumbnail.png';
  }

  if (normalizedInterviewee === 'randy minix') {
    return '/images/randy_minix.png';
  }

  if (normalizedInterviewee === 'tom dalzell') {
    return '/images/tom_dalzell.png';
  }

  return '';
}

function formatEpisodeTitle(title) {
  const normalizedTitle = String(title || '').trim();

  if (!normalizedTitle) {
    return '';
  }

  return normalizedTitle.replace(/^episode\s+\d+\s*(?:-|:|\u2013|\u2014)\s*/i, '').trim();
}

function formatEpisodeLabel(episode) {
  return episode?.isFullLength ? 'Full Interview' : `Episode ${episode?.episodeNumber}`;
}

function getPlaceholderTitle(episodeNumber) {
  if (episodeNumber === 1) {
    return 'Upload Episode 1 from the admin page to test playback.';
  }

  return 'Episode placeholder';
}
