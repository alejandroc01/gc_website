import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { createOralHistory, deleteOralHistory, getOralHistories } from '../api/composites.js';
import '../styles/composites.css';

const acceptedVideoTypes = 'video/*,.mp4,.mov,.m4v,.webm';
const emptyForm = {
  key: '',
  episodeNumber: '1',
  name: '',
  interviewee: '',
  description: '',
};

export default function OralHistoryUploadPage() {
  const [formValues, setFormValues] = useState(emptyForm);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true);
  const [deletingOralHistoryId, setDeletingOralHistoryId] = useState('');
  const [statusError, setStatusError] = useState('');
  const [statusSummary, setStatusSummary] = useState('');
  const [storedEpisodes, setStoredEpisodes] = useState([]);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let isActive = true;

    const loadOralHistoryEntries = async () => {
      setIsLoadingDrafts(true);
      setStatusError('');

      try {
        const loadedOralHistories = await getOralHistories();

        if (!isActive) {
          return;
        }

        setStoredEpisodes(normalizeOralHistories(loadedOralHistories));
      } catch (error) {
        if (isActive) {
          setStatusError(error.message);
        }
      } finally {
        if (isActive) {
          setIsLoadingDrafts(false);
        }
      }
    };

    loadOralHistoryEntries();

    return () => {
      isActive = false;
    };
  }, []);

  const latestStoredEpisode = useMemo(
    () => (storedEpisodes.length > 0 ? storedEpisodes[storedEpisodes.length - 1] : null),
    [storedEpisodes],
  );

  const handleFieldChange = (event) => {
    const { name, value } = event.target;

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
    setStatusError('');
    setStatusSummary('');
  };

  const handleFileSelection = (nextFile) => {
    setSelectedFile(nextFile);
    setStatusError('');
    setStatusSummary('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setStatusError('');
    setStatusSummary('');
    setIsPreparing(true);

    try {
      const normalizedKey = validateOralHistoryKey(formValues.key);
      const normalizedEpisodeNumber = validateEpisodeNumber(formValues.episodeNumber);
      const normalizedName = validateRequiredField(formValues.name, 'Enter an oral history title.');
      const normalizedInterviewee = validateRequiredField(
        formValues.interviewee,
        'Enter the interviewee name.',
      );
      const normalizedDescription = validateRequiredField(
        formValues.description,
        'Enter a description for this oral history video.',
      );

      if (!selectedFile) {
        throw new Error('Choose a video file before uploading the oral history.');
      }

      await validateVideoFile(selectedFile);

      const payload = new FormData();
      payload.append('key', normalizedKey);
      payload.append('episodeNumber', String(normalizedEpisodeNumber));
      payload.append('title', normalizedName);
      payload.append('interviewee', normalizedInterviewee);
      payload.append('description', normalizedDescription);
      payload.append('video', selectedFile);

      const createdOralHistory = normalizeOralHistory(await createOralHistory(payload));

      setStoredEpisodes((currentEpisodes) => normalizeOralHistories([...currentEpisodes, createdOralHistory]));
      setStatusSummary(
        `Uploaded Episode ${createdOralHistory.episodeNumber}: ${createdOralHistory.title}.`,
      );
      setFormValues(emptyForm);
      setSelectedFile(null);
      setFileInputKey((currentValue) => currentValue + 1);
    } catch (error) {
      setStatusError(error.message);
    } finally {
      setIsPreparing(false);
    }
  };

  const handleDeleteEpisode = async (episode) => {
    const confirmed = window.confirm(
      `Delete Episode ${episode.episodeNumber}: ${episode.title}? This will remove the video from backend storage.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingOralHistoryId(episode.oralHistoryId);
    setStatusError('');
    setStatusSummary('');

    try {
      await deleteOralHistory(episode.oralHistoryId);
      setStoredEpisodes((currentEpisodes) => currentEpisodes.filter(
        (entry) => entry.oralHistoryId !== episode.oralHistoryId,
      ));
      setStatusSummary(`Deleted Episode ${episode.episodeNumber}: ${episode.title}.`);
    } catch (error) {
      setStatusError(error.message);
    } finally {
      setDeletingOralHistoryId('');
    }
  };

  return (
    <section className="section compositeAdmin">
      <div className="container">
        <div className="compositePageHeader">
          <p className="compositePageHeader__eyebrow">Admin Upload Flow</p>
          <h1 className="compositePageHeader__title">Upload Oral History Video</h1>
          <p className="compositePageHeader__description">
            Upload an oral history recording to backend storage by entering its key, episode number,
            title, interviewee, and description.
          </p>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <Link className="button compositeButton" to="/upload">
            Back to upload options
          </Link>
        </div>

        <article className="compositePanel compositePanel--spacious">
          <div className="compositePanel__header">
            <div>
              <h2 className="compositePanel__title">Upload a New Oral History Video</h2>
              <p className="compositePanel__description">
                This flow validates the selected video in the browser and then uploads the file and
                metadata to backend storage so it can be played on the oral histories page.
              </p>
            </div>
          </div>

          <form className="compositeUploadForm" onSubmit={handleSubmit}>
            <div className="profileManagerGrid">
              <label className="compositeField">
                <span className="compositeField__label">Key</span>
                <input
                  className="compositeField__input"
                  type="text"
                  name="key"
                  placeholder="for example: doug-petty-interview"
                  value={formValues.key}
                  onChange={handleFieldChange}
                />
              </label>

              <label className="compositeField">
                <span className="compositeField__label">Episode Number</span>
                <input
                  className="compositeField__input"
                  type="text"
                  name="episodeNumber"
                  inputMode="numeric"
                  placeholder="1"
                  value={formValues.episodeNumber}
                  onChange={handleFieldChange}
                />
              </label>

              <label className="compositeField">
                <span className="compositeField__label">Name</span>
                <input
                  className="compositeField__input"
                  type="text"
                  name="name"
                  placeholder="enter oral history title"
                  value={formValues.name}
                  onChange={handleFieldChange}
                />
              </label>

              <label className="compositeField">
                <span className="compositeField__label">Interviewee</span>
                <input
                  className="compositeField__input"
                  type="text"
                  name="interviewee"
                  placeholder="enter interviewee name"
                  value={formValues.interviewee}
                  onChange={handleFieldChange}
                />
              </label>

              <label className="compositeField profileManagerGrid__fullWidth">
                <span className="compositeField__label">Description</span>
                <textarea
                  className="compositeField__input compositeField__textarea"
                  name="description"
                  placeholder="write a short summary shown with the oral history"
                  rows={5}
                  value={formValues.description}
                  onChange={handleFieldChange}
                />
              </label>

              <div className="compositeField profileManagerGrid__fullWidth">
                <span className="compositeField__label">Oral History Video</span>
                <button
                  type="button"
                  className={`compositeDropzone${isDraggingFile ? ' compositeDropzone--active' : ''}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDraggingFile(true);
                  }}
                  onDragLeave={(event) => {
                    if (event.currentTarget.contains(event.relatedTarget)) {
                      return;
                    }

                    setIsDraggingFile(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDraggingFile(false);
                    handleFileSelection(event.dataTransfer.files?.[0] || null);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="compositeDropzone__title">Drop a video here or click to browse</span>
                  <span className="compositeDropzone__copy">
                    Accepted formats: MP4, MOV, M4V, and WEBM. The filename is taken directly from the selected file.
                  </span>
                </button>

                <input
                  key={fileInputKey}
                  ref={fileInputRef}
                  className="sr-only"
                  type="file"
                  accept={acceptedVideoTypes}
                  onChange={(event) => handleFileSelection(event.target.files?.[0] || null)}
                />
              </div>
            </div>

            <div className="compositeUploadForm__actions">
              <button
                type="submit"
                className="button compositeButton compositeButton--filled"
                disabled={isPreparing}
              >
                {isPreparing ? 'Uploading Video...' : 'Upload Oral History Video'}
              </button>

              {selectedFile ? (
                <p className="compositeUploadForm__fileMeta">
                  Selected file: <strong>{selectedFile.name}</strong> ({formatFileSize(selectedFile.size)})
                </p>
              ) : (
                <p className="compositeUploadForm__fileMeta">No video selected yet.</p>
              )}
            </div>

            {statusSummary ? (
              <p className="compositeMessage compositeMessage--success">{statusSummary}</p>
            ) : null}
            {statusError ? <p className="compositeMessage compositeMessage--error">{statusError}</p> : null}
          </form>
        </article>

        <article className="compositePanel compositePanel--spacious">
          <div className="compositePanel__header">
            <div>
              <h2 className="compositePanel__title">Stored Oral History Episodes</h2>
              <p className="compositePanel__description">
                These are the oral history videos currently stored by the backend and available to the site.
              </p>
            </div>
          </div>

          {isLoadingDrafts ? (
            <div className="compositeEmptyState">
              <p className="compositeEmptyState__description">Loading oral history uploads...</p>
            </div>
          ) : storedEpisodes.length === 0 ? (
            <div className="compositeEmptyState">
              <h3 className="compositeEmptyState__title">No uploaded oral histories yet.</h3>
              <p className="compositeEmptyState__description">
                After a video upload succeeds, its episode metadata and filename will appear here.
              </p>
            </div>
          ) : (
            <div className="compositeCardGrid">
              {storedEpisodes.map((episode) => (
                <article key={episode.oralHistoryId} className="compositeCard">
                  <div className="compositeCard__body">
                    <div className="compositeCard__metaRow">
                      <span className="compositeCard__pill">episode {episode.episodeNumber}</span>
                      <span className="compositeCard__pill compositeCard__pill--year">
                        {formatFileSize(episode.fileSize)}
                      </span>
                    </div>

                    <h3 className="compositeCard__title">{episode.title}</h3>
                    <p className="compositeCard__meta">
                      Interviewee: <strong>{episode.interviewee}</strong>
                    </p>
                    <p className="compositeCard__sourceName">{episode.fileName}</p>
                    <p className="compositeCard__meta">
                      Key: <strong>{episode.key}</strong>
                    </p>
                    <p className="compositeCard__meta">{episode.description}</p>
                    <p className="compositeCard__meta">
                      Uploaded {formatDate(episode.preparedAt)}
                    </p>

                    <div style={{ marginTop: '18px' }}>
                      <button
                        type="button"
                        className="button compositeButton compositeButton--danger"
                        onClick={() => handleDeleteEpisode(episode)}
                        disabled={deletingOralHistoryId === episode.oralHistoryId}
                      >
                        {deletingOralHistoryId === episode.oralHistoryId ? 'Deleting...' : 'Delete Episode'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {latestStoredEpisode ? (
            <p className="compositeMessage" style={{ marginTop: '18px' }}>
              Latest upload: <strong>{latestStoredEpisode.title}</strong> using filename{' '}
              <strong>{latestStoredEpisode.fileName}</strong>.
            </p>
          ) : null}
        </article>
      </div>
    </section>
  );
}

function validateRequiredField(value, emptyMessage) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(emptyMessage);
  }

  return normalizedValue;
}

function validateEpisodeNumber(value) {
  const normalizedValue = Number(String(value || '').trim());

  if (!Number.isInteger(normalizedValue) || normalizedValue <= 0 || normalizedValue > 999) {
    throw new Error('Enter a valid positive episode number.');
  }

  return normalizedValue;
}

function validateOralHistoryKey(value) {
  const normalizedValue = value.trim().toLowerCase();

  if (!normalizedValue) {
    throw new Error('Enter an oral history key before uploading the video.');
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedValue)) {
    throw new Error('Use a lowercase slug for the key, with letters, numbers, and hyphens only.');
  }

  return normalizedValue;
}

async function validateVideoFile(file) {
  const normalizedFileName = file.name.trim().toLowerCase();
  const isAcceptedExtension = ['.mp4', '.mov', '.m4v', '.webm'].some((extension) =>
    normalizedFileName.endsWith(extension),
  );
  const isAcceptedMimeType = !file.type || file.type.startsWith('video/');

  if (!isAcceptedExtension || !isAcceptedMimeType) {
    throw new Error('Choose a valid video file with an MP4, MOV, M4V, or WEBM extension.');
  }

  if (file.size <= 0) {
    throw new Error('The selected video file is empty.');
  }

  await file.slice(0, 1).arrayBuffer();
}

function normalizeOralHistories(oralHistories) {
  return [...(Array.isArray(oralHistories) ? oralHistories : [])]
    .map((entry) => normalizeOralHistory(entry))
    .sort((leftEntry, rightEntry) => Number(leftEntry.episodeNumber || 0) - Number(rightEntry.episodeNumber || 0));
}

function normalizeOralHistory(oralHistory) {
  return {
    ...oralHistory,
    oralHistoryId: String(oralHistory?.oralHistoryId || ''),
    key: String(oralHistory?.key || ''),
    title: String(oralHistory?.title || ''),
    interviewee: String(oralHistory?.interviewee || ''),
    description: String(oralHistory?.description || ''),
    episodeNumber: Number(oralHistory?.episodeNumber || 0),
    fileName: String(oralHistory?.originalFilename || ''),
    fileSize: Number(oralHistory?.fileSize || 0),
    preparedAt: oralHistory?.uploadTimestamp || new Date().toISOString(),
  };
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** unitIndex);

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
