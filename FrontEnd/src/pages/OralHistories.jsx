import { useEffect, useMemo, useState } from 'react';

import { getOralHistories } from '../api/composites.js';
import './OralHistories.css';

const totalEpisodeCount = 16;

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
  const [activeEpisodeNumber, setActiveEpisodeNumber] = useState(1);

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
          .sort((leftEpisode, rightEpisode) => Number(leftEpisode?.episodeNumber || 0) - Number(rightEpisode?.episodeNumber || 0));

        setEpisodes(normalizedEpisodes);

        if (normalizedEpisodes.length > 0) {
          setActiveEpisodeNumber(Number(normalizedEpisodes[0].episodeNumber || 1));
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

  const activeEpisode = useMemo(() => (
    episodes.find((episode) => Number(episode?.episodeNumber) === Number(activeEpisodeNumber))
    || episodes[0]
    || null
  ), [activeEpisodeNumber, episodes]);

  const playlistEpisodes = useMemo(() => buildPlaylistEpisodes(episodes), [episodes]);

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
                : 'Upload Episode 1 from the admin upload page to begin testing playback here.'}
            </p>
          </div>

          <aside className="oralHistories__details" aria-label="Collection overview">
            <div className="oralHistories__detailCard">
              <span className="oralHistories__detailLabel">Featured interview</span>
              <strong className="oralHistories__detailValue">
                {activeEpisode?.interviewee || 'No episode uploaded yet'}
              </strong>
            </div>
            <div className="oralHistories__detailCard">
              <span className="oralHistories__detailLabel">Collection</span>
              <strong className="oralHistories__detailValue">
                {activeEpisode ? `Episode ${activeEpisode.episodeNumber}` : 'Awaiting Episode 1'}
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
              {isLoading ? <p className="oralHistories__panelNote">Loading episodes...</p> : null}
            </div>

            <div className="oralHistories__contentGrid">
              <div className="oralHistories__mediaFrame">
                <video
                  className="oralHistories__video"
                  controls
                  preload="metadata"
                  poster="/images/doug_oral_history_thumbnail.png"
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
                        Number(episode.episodeNumber) === Number(activeEpisode?.episodeNumber)
                          ? ' oralHistories__playlistItem--active'
                          : ''
                      }`}
                      onClick={() => {
                        if (episode.videoUrl) {
                          setActiveEpisodeNumber(Number(episode.episodeNumber));
                        }
                      }}
                      disabled={!episode.videoUrl}
                    >
                      <span className="oralHistories__playlistNumber">
                        {String(episode.episodeNumber).padStart(2, '0')}
                      </span>
                      <span className="oralHistories__playlistText">
                        Episode {episode.episodeNumber}
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

function buildPlaylistEpisodes(episodes) {
  const episodesByNumber = new Map(
    episodes.map((episode) => [Number(episode?.episodeNumber || 0), episode]),
  );

  return Array.from({ length: totalEpisodeCount }, (_, index) => {
    const episodeNumber = index + 1;
    return episodesByNumber.get(episodeNumber) || {
      oralHistoryId: '',
      episodeNumber,
      title: '',
      videoUrl: '',
    };
  });
}

function formatEpisodeTitle(title) {
  const normalizedTitle = String(title || '').trim();

  if (!normalizedTitle) {
    return '';
  }

  return normalizedTitle.replace(/^episode\s+\d+\s*(?:-|:|\u2013|\u2014)\s*/i, '').trim();
}

function getPlaceholderTitle(episodeNumber) {
  if (episodeNumber === 1) {
    return 'Upload Episode 1 from the admin page to test playback.';
  }

  return 'Episode placeholder';
}
