import { useEffect, useMemo, useState } from 'react';

import { getOralHistories } from '../api/composites.js';
import './OralHistories.css';

/**
 * OralHistories
 *
 * Landing page for oral history interviews.
 * The page now loads uploaded oral history videos from backend storage.
 */
export default function OralHistories() {
  const [episodes, setEpisodes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeInterviewee, setActiveInterviewee] = useState('');
  const [activeOralHistoryId, setActiveOralHistoryId] = useState('');

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
          setActiveInterviewee(getIntervieweeOptions(normalizedEpisodes)[0] || '');
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

  const visibleEpisodes = useMemo(() => {
    if (!activeInterviewee) {
      return episodes;
    }

    return episodes.filter(
      (episode) => normalizeIntervieweeName(episode.interviewee) === normalizeIntervieweeName(activeInterviewee),
    );
  }, [activeInterviewee, episodes]);

  useEffect(() => {
    if (!interviewees.length) {
      setActiveInterviewee('');
      return;
    }

    if (!findMatchingIntervieweeName(interviewees, activeInterviewee)) {
      setActiveInterviewee(interviewees[0]);
    }
  }, [activeInterviewee, interviewees]);

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

  const playlistEpisodes = useMemo(() => buildPlaylistEpisodes(visibleEpisodes), [visibleEpisodes]);
  const activePoster = useOralHistoryPoster(activeEpisode, activeInterviewee || activeEpisode?.interviewee);

  return (
    <div className="oralHistories">
      <section className="oralHistories__hero section">
        <div className="container oralHistories__heroGrid">
          <div className="oralHistories__intro">
            <p className="oralHistories__eyebrow">German Club Alumni Archives</p>
            <h1 className="oralHistories__title">Oral Histories</h1>
            <p className="oralHistories__lede oralHistories__lede--wide">
              [ This collection will feature recorded interviews preserving the memories, voices, and
              experiences of German Club alumni across generations ]
            </p>
            <p className="oralHistories__copy">
              {activeEpisode
                ? 'Select an uploaded episode from the playlist to stream it in the player below.'
                : activeInterviewee
                  ? `No uploaded episodes for ${activeInterviewee} yet.`
                  : 'Upload oral history episodes from the admin page to begin testing playback here.'}
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
              <span className="oralHistories__detailLabel">Collection</span>
              <strong className="oralHistories__detailValue">
                {activeEpisode
                  ? formatEpisodeLabel(activeEpisode)
                  : activeInterviewee
                    ? 'Awaiting Episode 1'
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
                      {interviewees.map((interviewee) => (
                        <option key={interviewee} value={interviewee}>
                          {interviewee}
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
                <video
                  className="oralHistories__video"
                  controls
                  preload="metadata"
                  poster={activePoster}
                  aria-label="Featured oral history video player"
                  key={activeEpisode?.oralHistoryId || 'oral-history-placeholder'}
                >
                  {activeEpisode?.videoUrl ? (
                    <source src={activeEpisode.videoUrl} type={activeEpisode.mimeType || 'video/mp4'} />
                  ) : null}
                  Your browser does not support the video tag.
                </video>
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

function buildPlaylistEpisodes(episodes) {
  const uploadedEpisodes = [...episodes].sort(compareOralHistories);
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
    isFullLength,
    episodeNumber: isFullLength ? null : Number(oralHistory?.episodeNumber || 0),
  };
}

function compareOralHistories(leftEpisode, rightEpisode) {
  if (Boolean(leftEpisode.isFullLength) !== Boolean(rightEpisode.isFullLength)) {
    return leftEpisode.isFullLength ? -1 : 1;
  }

  return Number(leftEpisode.episodeNumber || 0) - Number(rightEpisode.episodeNumber || 0);
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

  return [...names.values()];
}

function findMatchingIntervieweeName(names, targetName) {
  const normalizedTargetName = normalizeIntervieweeName(targetName).toLowerCase();

  return names.find((name) => normalizeIntervieweeName(name).toLowerCase() === normalizedTargetName) || '';
}

function normalizeIntervieweeName(value) {
  return String(value || '').trim();
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
