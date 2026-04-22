import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { deleteOralHistory, getOralHistories, uploadOralHistory } from '../api/composites.js';
import '../styles/composites.css';

const acceptedVideoTypes = 'video/*,.mp4,.mov,.m4v,.webm';
const defaultInterviewees = ['Doug Petty', 'Randy Minix', 'Tom Dalzell'];

export default function OralHistoryUploadPage() {
  const [uploadEntries, setUploadEntries] = useState([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isLoadingDrafts, setIsLoadingDrafts] = useState(true);
  const [deletingOralHistoryId, setDeletingOralHistoryId] = useState('');
  const [statusError, setStatusError] = useState('');
  const [statusSummary, setStatusSummary] = useState('');
  const [uploadProgress, setUploadProgress] = useState(null);
  const [storedEpisodes, setStoredEpisodes] = useState([]);
  const [selectedInterviewee, setSelectedInterviewee] = useState('');
  const [customInterviewees, setCustomInterviewees] = useState([]);
  const [isAddingInterviewee, setIsAddingInterviewee] = useState(false);
  const [newIntervieweeName, setNewIntervieweeName] = useState('');
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

  const nextAvailableEpisodeNumber = useMemo(
    () => getNextAvailableEpisodeNumber(storedEpisodes, uploadEntries, selectedInterviewee),
    [storedEpisodes, uploadEntries, selectedInterviewee],
  );

  const availableInterviewees = useMemo(
    () => buildIntervieweeOptions(defaultInterviewees, storedEpisodes, customInterviewees),
    [storedEpisodes, customInterviewees],
  );

  const handleEntryFieldChange = (entryId, fieldName, value) => {
    setUploadEntries((currentEntries) => currentEntries.map((entry) => {
      if (entry.id !== entryId) {
        return entry;
      }

      const nextEntry = {
        ...entry,
        [fieldName]: fieldName === 'isFullLength' ? Boolean(value) : value,
      };

      if (fieldName === 'title' && entry.key === slugifyFilename(entry.file?.name || '')) {
        nextEntry.key = slugifyFilename(value);
      }

      if (fieldName === 'isFullLength' && value) {
        nextEntry.episodeNumber = '';
      }

      return nextEntry;
    }));
    setStatusError('');
    setStatusSummary('');
  };

  const applyIntervieweeToEntries = (intervieweeName) => {
    setUploadEntries((currentEntries) => assignEpisodeNumbersForInterviewee(
      currentEntries.map((entry) => ({
        ...entry,
        interviewee: intervieweeName,
      })),
      storedEpisodes,
      intervieweeName,
    ));
  };

  const handleIntervieweeSelection = (value) => {
    setSelectedInterviewee(value);
    applyIntervieweeToEntries(value);
    setStatusError('');
    setStatusSummary('');
  };

  const handleCreateInterviewee = () => {
    try {
      const normalizedName = validateRequiredField(newIntervieweeName, 'Enter a new interviewee name.');
      const existingName = findMatchingIntervieweeName(availableInterviewees, normalizedName);
      const nextIntervieweeName = existingName || normalizedName;

      setCustomInterviewees((currentNames) => {
        if (findMatchingIntervieweeName(currentNames, nextIntervieweeName)) {
          return currentNames;
        }

        return existingName ? currentNames : [...currentNames, nextIntervieweeName];
      });

      handleIntervieweeSelection(nextIntervieweeName);
      setIsAddingInterviewee(false);
      setNewIntervieweeName('');
    } catch (error) {
      setStatusError(error.message);
      setStatusSummary('');
    }
  };

  const handleFilesSelection = (fileList) => {
    const nextFiles = Array.from(fileList || []).filter(Boolean);

    if (nextFiles.length === 0) {
      return;
    }

    setUploadEntries((currentEntries) => {
      const existingKeys = new Set([
        ...storedEpisodes.map((episode) => String(episode.key || '').trim().toLowerCase()),
        ...currentEntries.map((entry) => String(entry.key || '').trim().toLowerCase()),
      ]);

      const createdEntries = nextFiles.map((file) => {
        const title = deriveTitleFromFilename(file.name);
        const nextKey = getUniqueKey(slugifyFilename(file.name), existingKeys);

        return {
          id: buildClientEntryId(),
          file,
          isFullLength: false,
          episodeNumber: '',
          title,
          key: nextKey,
          interviewee: selectedInterviewee,
          description: '',
        };
      });

      return assignEpisodeNumbersForInterviewee(
        [...currentEntries, ...createdEntries],
        storedEpisodes,
        selectedInterviewee,
      );
    });

    setFileInputKey((currentValue) => currentValue + 1);
    setStatusError('');
    setStatusSummary('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setStatusError('');
    setStatusSummary('');
    setUploadProgress(null);
    setIsPreparing(true);

    try {
      if (uploadEntries.length === 0) {
        throw new Error('Choose at least one video file before uploading oral histories.');
      }

      validateUploadEntries(uploadEntries, storedEpisodes);

      const createdEntries = [];
      const failedEntries = [];

      for (const entry of uploadEntries) {
        try {
          await validateVideoFile(entry.file);

          const metadata = {
            key: validateOralHistoryKey(entry.key),
            isFullLength: Boolean(entry.isFullLength),
            episodeNumber: entry.isFullLength ? null : String(validateEpisodeNumber(entry.episodeNumber)),
            title: validateRequiredField(entry.title, 'Enter an oral history title.'),
            interviewee: validateRequiredField(entry.interviewee, 'Enter the interviewee name.'),
            description: String(entry.description || '').trim(),
          };

          const createdOralHistory = normalizeOralHistory(await uploadOralHistory(entry.file, metadata, {
            onProgress: (nextProgress) => setUploadProgress({
              ...nextProgress,
              fileName: entry.file.name,
            }),
          }));
          createdEntries.push(createdOralHistory);
        } catch (error) {
          failedEntries.push({
            ...entry,
            uploadError: error.message,
          });
        }
      }

      if (createdEntries.length > 0) {
        setStoredEpisodes((currentEpisodes) => normalizeOralHistories([...currentEpisodes, ...createdEntries]));
      }

      setUploadEntries(failedEntries.map(({ uploadError, ...entry }) => entry));

      if (createdEntries.length > 0 && failedEntries.length === 0) {
        setStatusSummary(
          createdEntries.length === 1
            ? `Uploaded ${formatEpisodeLabel(createdEntries[0])}: ${createdEntries[0].title}.`
            : `Uploaded ${createdEntries.length} oral history videos.`,
        );
        setFileInputKey((currentValue) => currentValue + 1);
      } else if (createdEntries.length > 0) {
        setStatusSummary(`Uploaded ${createdEntries.length} oral history videos. Fix the remaining entries and retry.`);
        setStatusError(failedEntries.map((entry) => `${entry.file.name}: ${entry.uploadError}`).join(' '));
      } else {
        setStatusError(failedEntries.map((entry) => `${entry.file.name}: ${entry.uploadError}`).join(' '));
      }
    } catch (error) {
      setStatusError(error.message);
    } finally {
      setUploadProgress(null);
      setIsPreparing(false);
    }
  };

  const handleDeleteEpisode = async (episode) => {
    const confirmed = window.confirm(
      `Delete ${formatEpisodeLabel(episode)}: ${episode.title}? This will remove the video from backend storage.`,
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
      setStatusSummary(`Deleted ${formatEpisodeLabel(episode)}: ${episode.title}.`);
    } catch (error) {
      setStatusError(error.message);
    } finally {
      setDeletingOralHistoryId('');
    }
  };

  const handleRemovePendingEntry = (entryId) => {
    setUploadEntries((currentEntries) => currentEntries.filter((entry) => entry.id !== entryId));
    setStatusError('');
    setStatusSummary('');
  };

  return (
    <section className="section compositeAdmin">
      <div className="container">
        <div className="compositePageHeader">
          <p className="compositePageHeader__eyebrow">Admin Upload Flow</p>
          <h1 className="compositePageHeader__title">Upload Oral History Videos</h1>
          <p className="compositePageHeader__description">
            Select one or more oral history recordings, review the generated metadata for each video,
            and upload the batch to backend storage.
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
              <h2 className="compositePanel__title">Prepare Oral History Uploads</h2>
              <p className="compositePanel__description">
                Each selected file gets a default title from its filename, a generated key, and the
                next available episode number. Choose the interviewee for this batch, then edit any
                other metadata before upload.
              </p>
            </div>
          </div>

          <form className="compositeUploadForm" onSubmit={handleSubmit}>
            <div className="profileManagerGrid" style={{ marginBottom: '24px' }}>
              <label className="compositeField">
                <span className="compositeField__label">Interviewee</span>
                <select
                  className="compositeField__input"
                  value={selectedInterviewee}
                  onChange={(event) => handleIntervieweeSelection(event.target.value)}
                >
                  <option value="">Select an interviewee</option>
                  {availableInterviewees.map((intervieweeName) => (
                    <option key={intervieweeName} value={intervieweeName}>
                      {intervieweeName}
                    </option>
                  ))}
                </select>
              </label>

              <div className="compositeField">
                <span className="compositeField__label">Add New Interviewee</span>
                {isAddingInterviewee ? (
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <input
                      className="compositeField__input"
                      type="text"
                      value={newIntervieweeName}
                      placeholder="Enter a new interviewee name"
                      onChange={(event) => setNewIntervieweeName(event.target.value)}
                    />
                    <button
                      type="button"
                      className="button compositeButton compositeButton--filled"
                      onClick={handleCreateInterviewee}
                    >
                      Save Name
                    </button>
                    <button
                      type="button"
                      className="button compositeButton"
                      onClick={() => {
                        setIsAddingInterviewee(false);
                        setNewIntervieweeName('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="button compositeButton"
                    onClick={() => setIsAddingInterviewee(true)}
                  >
                    Add Interviewee
                  </button>
                )}
              </div>
            </div>

            <div className="compositeField">
              <span className="compositeField__label">Oral History Videos</span>
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
                  handleFilesSelection(event.dataTransfer.files);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <span className="compositeDropzone__title">Drop videos here or click to browse</span>
                <span className="compositeDropzone__copy">
                  Accepted formats: MP4, MOV, M4V, and WEBM. Titles are auto-filled from filenames and remain editable.
                </span>
              </button>

              <input
                key={fileInputKey}
                ref={fileInputRef}
                className="sr-only"
                type="file"
                accept={acceptedVideoTypes}
                multiple
                onChange={(event) => handleFilesSelection(event.target.files)}
              />
            </div>

            {uploadEntries.length > 0 ? (
              <div className="profileDirectoryList">
                {uploadEntries.map((entry) => (
                  <article key={entry.id} className="profileDirectoryCard">
                    <div className="profileDirectoryCard__header">
                      <div>
                        <h3 className="profileDirectoryCard__title">{entry.title || entry.file.name}</h3>
                        <p className="profileDirectoryCard__meta">
                          Source file: <strong>{entry.file.name}</strong> ({formatFileSize(entry.file.size)})
                        </p>
                      </div>

                      <div className="profileDirectoryCard__actions">
                        <button
                          type="button"
                          className="button compositeButton"
                          onClick={() => handleRemovePendingEntry(entry.id)}
                          disabled={isPreparing}
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    <div className="profileManagerGrid">
                      <label className="compositeCheckbox">
                        <input
                          type="checkbox"
                          checked={entry.isFullLength}
                          onChange={(event) => handleEntryFieldChange(entry.id, 'isFullLength', event.target.checked)}
                        />
                        Full-length interview
                      </label>

                      <label className="compositeField">
                        <span className="compositeField__label">Episode Number</span>
                        <input
                          className="compositeField__input"
                          type="text"
                          inputMode="numeric"
                          value={entry.episodeNumber}
                          disabled={entry.isFullLength}
                          placeholder={entry.isFullLength ? 'No episode number' : ''}
                          onChange={(event) => handleEntryFieldChange(entry.id, 'episodeNumber', event.target.value)}
                        />
                      </label>

                      <label className="compositeField">
                        <span className="compositeField__label">Key</span>
                        <input
                          className="compositeField__input"
                          type="text"
                          value={entry.key}
                          onChange={(event) => handleEntryFieldChange(entry.id, 'key', event.target.value)}
                        />
                      </label>

                      <label className="compositeField">
                        <span className="compositeField__label">Title</span>
                        <input
                          className="compositeField__input"
                          type="text"
                          value={entry.title}
                          onChange={(event) => handleEntryFieldChange(entry.id, 'title', event.target.value)}
                        />
                      </label>

                      <label className="compositeField">
                        <span className="compositeField__label">Interviewee</span>
                        <input
                          className="compositeField__input"
                          type="text"
                          value={entry.interviewee}
                          readOnly
                        />
                      </label>

                      <label className="compositeField profileManagerGrid__fullWidth">
                        <span className="compositeField__label">Description</span>
                        <textarea
                          className="compositeField__input compositeField__textarea"
                          rows={4}
                          value={entry.description}
                          onChange={(event) => handleEntryFieldChange(entry.id, 'description', event.target.value)}
                        />
                      </label>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="compositeEmptyState">
                <h3 className="compositeEmptyState__title">No pending uploads yet.</h3>
                <p className="compositeEmptyState__description">
                  Add one or more files to start a batch. The next suggested episode number is{' '}
                  <strong>{nextAvailableEpisodeNumber}</strong>.
                </p>
              </div>
            )}

            <div className="compositeUploadForm__actions">
              <button
                type="submit"
                className="button compositeButton compositeButton--filled"
                disabled={isPreparing || uploadEntries.length === 0}
              >
                {isPreparing ? 'Uploading Videos...' : `Upload ${uploadEntries.length || ''} Oral History Videos`}
              </button>

              <p className="compositeUploadForm__fileMeta">
                {uploadEntries.length > 0
                  ? `${uploadEntries.length} video${uploadEntries.length === 1 ? '' : 's'} ready for review.`
                  : 'No videos selected yet.'}
              </p>
            </div>

            {statusSummary ? (
              <p className="compositeMessage compositeMessage--success">{statusSummary}</p>
            ) : null}
            {isPreparing && uploadProgress ? (
              <p className="compositeMessage">{formatUploadProgress(uploadProgress)}</p>
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
                      <span className="compositeCard__pill">{formatEpisodeLabel(episode)}</span>
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

function validateUploadEntries(uploadEntries, storedEpisodes) {
  const usedKeys = new Set(storedEpisodes.map((episode) => String(episode.key || '').trim().toLowerCase()));
  const usedEpisodeNumbersByInterviewee = buildEpisodeNumbersByInterviewee(storedEpisodes);
  const fullLengthInterviewees = new Set(
    storedEpisodes
      .filter((episode) => episode.isFullLength)
      .map((episode) => normalizeIntervieweeName(episode.interviewee).toLowerCase())
      .filter(Boolean),
  );

  uploadEntries.forEach((entry) => {
    const normalizedKey = validateOralHistoryKey(entry.key);
    const normalizedEpisodeNumber = entry.isFullLength ? null : validateEpisodeNumber(entry.episodeNumber);
    const normalizedInterviewee = normalizeIntervieweeName(entry.interviewee);

    validateRequiredField(entry.title, 'Enter an oral history title.');
    validateRequiredField(normalizedInterviewee, 'Enter the interviewee name.');

    if (usedKeys.has(normalizedKey)) {
      throw new Error(`The key "${normalizedKey}" is already in use. Update it before uploading.`);
    }

    if (entry.isFullLength) {
      if (fullLengthInterviewees.has(normalizedInterviewee.toLowerCase())) {
        throw new Error(`A full-length interview already exists for ${normalizedInterviewee}.`);
      }

      usedKeys.add(normalizedKey);
      fullLengthInterviewees.add(normalizedInterviewee.toLowerCase());
      return;
    }

    const usedEpisodeNumbers = usedEpisodeNumbersByInterviewee.get(normalizedInterviewee.toLowerCase()) || new Set();

    if (usedEpisodeNumbers.has(normalizedEpisodeNumber)) {
      throw new Error(
        `Episode ${normalizedEpisodeNumber} is already in use for ${normalizedInterviewee}. Update it before uploading.`,
      );
    }

    usedKeys.add(normalizedKey);
    usedEpisodeNumbers.add(normalizedEpisodeNumber);
    usedEpisodeNumbersByInterviewee.set(normalizedInterviewee.toLowerCase(), usedEpisodeNumbers);
  });
}

function buildIntervieweeOptions(defaultNames, storedEpisodes, customNames) {
  const knownNames = new Map();

  [...defaultNames, ...customNames, ...storedEpisodes.map((episode) => episode.interviewee)]
    .map((name) => String(name || '').trim())
    .filter(Boolean)
    .forEach((name) => {
      const normalizedKey = name.toLowerCase();

      if (!knownNames.has(normalizedKey)) {
        knownNames.set(normalizedKey, name);
      }
    });

  return [...knownNames.values()];
}

function findMatchingIntervieweeName(names, targetName) {
  const normalizedTargetName = String(targetName || '').trim().toLowerCase();

  if (!normalizedTargetName) {
    return '';
  }

  return names.find((name) => String(name || '').trim().toLowerCase() === normalizedTargetName) || '';
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
    .sort(compareOralHistories);
}

function normalizeOralHistory(oralHistory) {
  const isFullLength = Boolean(oralHistory?.isFullLength);

  return {
    ...oralHistory,
    oralHistoryId: String(oralHistory?.oralHistoryId || ''),
    key: String(oralHistory?.key || ''),
    title: String(oralHistory?.title || ''),
    interviewee: String(oralHistory?.interviewee || ''),
    description: String(oralHistory?.description || ''),
    isFullLength,
    episodeNumber: isFullLength ? null : Number(oralHistory?.episodeNumber || 0),
    fileName: String(oralHistory?.originalFilename || ''),
    fileSize: Number(oralHistory?.fileSize || 0),
    preparedAt: oralHistory?.uploadTimestamp || new Date().toISOString(),
  };
}

function compareOralHistories(leftEntry, rightEntry) {
  if (Boolean(leftEntry.isFullLength) !== Boolean(rightEntry.isFullLength)) {
    return leftEntry.isFullLength ? -1 : 1;
  }

  return Number(leftEntry.episodeNumber || 0) - Number(rightEntry.episodeNumber || 0);
}

function deriveTitleFromFilename(fileName) {
  return String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .trim();
}

function slugifyFilename(value) {
  const normalizedValue = String(value || '')
    .replace(/\.[^.]+$/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalizedValue || 'oral-history';
}

function getUniqueKey(baseKey, existingKeys) {
  const normalizedBaseKey = baseKey || 'oral-history';

  if (!existingKeys.has(normalizedBaseKey)) {
    existingKeys.add(normalizedBaseKey);
    return normalizedBaseKey;
  }

  let suffix = 2;
  let nextKey = `${normalizedBaseKey}-${suffix}`;

  while (existingKeys.has(nextKey)) {
    suffix += 1;
    nextKey = `${normalizedBaseKey}-${suffix}`;
  }

  existingKeys.add(nextKey);
  return nextKey;
}

function getNextSequentialNumber(existingNumbers) {
  let nextNumber = 1;

  while (existingNumbers.has(nextNumber)) {
    nextNumber += 1;
  }

  existingNumbers.add(nextNumber);
  return nextNumber;
}

function getNextAvailableEpisodeNumber(storedEpisodes, uploadEntries, intervieweeName) {
  const normalizedInterviewee = normalizeIntervieweeName(intervieweeName);

  if (!normalizedInterviewee) {
    return 1;
  }

  const usedNumbers = new Set([
    ...storedEpisodes
      .filter((episode) =>
        !episode.isFullLength
        && normalizeIntervieweeName(episode.interviewee).toLowerCase() === normalizedInterviewee.toLowerCase(),
      )
      .map((episode) => Number(episode.episodeNumber || 0)),
    ...uploadEntries
      .filter((entry) =>
        !entry.isFullLength
        && normalizeIntervieweeName(entry.interviewee).toLowerCase() === normalizedInterviewee.toLowerCase(),
      )
      .map((entry) => Number(entry.episodeNumber || 0)),
  ]);

  return getNextSequentialNumber(usedNumbers);
}

function assignEpisodeNumbersForInterviewee(entries, storedEpisodes, intervieweeName) {
  const normalizedInterviewee = normalizeIntervieweeName(intervieweeName);

  if (!normalizedInterviewee) {
    return entries;
  }

  const usedNumbers = new Set(
    storedEpisodes
      .filter((episode) =>
        !episode.isFullLength
        && normalizeIntervieweeName(episode.interviewee).toLowerCase() === normalizedInterviewee.toLowerCase(),
      )
      .map((episode) => Number(episode.episodeNumber || 0)),
  );

  return entries.map((entry) => {
    if (normalizeIntervieweeName(entry.interviewee).toLowerCase() !== normalizedInterviewee.toLowerCase()) {
      return entry;
    }

    if (entry.isFullLength) {
      return {
        ...entry,
        episodeNumber: '',
      };
    }

    return {
      ...entry,
      episodeNumber: String(getNextSequentialNumber(usedNumbers)),
    };
  });
}

function buildEpisodeNumbersByInterviewee(entries) {
  const episodeNumbersByInterviewee = new Map();

  entries.forEach((entry) => {
    const normalizedInterviewee = normalizeIntervieweeName(entry.interviewee);

    if (!normalizedInterviewee) {
      return;
    }

    const normalizedKey = normalizedInterviewee.toLowerCase();
    const usedNumbers = episodeNumbersByInterviewee.get(normalizedKey) || new Set();
    const episodeNumber = Number(entry.episodeNumber || 0);

    if (!entry.isFullLength && episodeNumber > 0) {
      usedNumbers.add(episodeNumber);
    }

    episodeNumbersByInterviewee.set(normalizedKey, usedNumbers);
  });

  return episodeNumbersByInterviewee;
}

function normalizeIntervieweeName(value) {
  return String(value || '').trim();
}

function buildClientEntryId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `upload-entry-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

function formatUploadProgress(uploadProgress) {
  const uploadedBytes = Number(uploadProgress?.uploadedBytes || 0);
  const totalBytes = Math.max(Number(uploadProgress?.totalBytes || 0), 1);
  const totalChunks = Math.max(Number(uploadProgress?.totalChunks || 0), 1);
  const completedChunks = Math.min(Math.max(Number(uploadProgress?.chunkIndex || -1) + 1, 0), totalChunks);
  const uploadPercent = Math.min(100, Math.round((uploadedBytes / totalBytes) * 100));
  const fileName = String(uploadProgress?.fileName || '').trim();
  const prefix = fileName ? `${fileName}: ` : '';

  return `${prefix}Uploading ${formatFileSize(uploadedBytes)} of ${formatFileSize(totalBytes)} (${uploadPercent}%, chunk ${completedChunks} of ${totalChunks}).`;
}

function formatEpisodeLabel(episode) {
  return episode?.isFullLength ? 'Full-length interview' : `Episode ${episode?.episodeNumber}`;
}
