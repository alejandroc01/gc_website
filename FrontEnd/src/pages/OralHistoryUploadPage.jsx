import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  deleteOralHistory,
  getOralHistories,
  getProfiles,
  updateOralHistory,
  uploadOralHistory,
  uploadOralHistoryLowRes,
} from '../api/composites.js';
import '../styles/composites.css';

const acceptedVideoTypes = 'video/*,.mp4,.mov,.m4v,.webm';
const defaultInterviewees = ['Doug Petty', 'Randy Minix', 'Tom Dalzell'];
const defaultOralHistoryCategories = [
  'Why Virginia Tech?',
  'German Club Life',
  'Traditions & Values',
  'Athletics & Student Life',
  'Alumni, Giving & GCAF',
  'Military, Career & Personal Stories',
];

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
  const [profiles, setProfiles] = useState([]);
  const [storedEpisodeSearchQuery, setStoredEpisodeSearchQuery] = useState('');
  const [editingOralHistoryId, setEditingOralHistoryId] = useState('');
  const [editValues, setEditValues] = useState(null);
  const [editStatusError, setEditStatusError] = useState('');
  const [savingOralHistoryId, setSavingOralHistoryId] = useState('');
  const [selectedInterviewee, setSelectedInterviewee] = useState('');
  const [customInterviewees, setCustomInterviewees] = useState([]);
  const [isAddingInterviewee, setIsAddingInterviewee] = useState(false);
  const [newIntervieweeName, setNewIntervieweeName] = useState('');
  const [customCategories, setCustomCategories] = useState([]);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    let isActive = true;

    const loadOralHistoryEntries = async () => {
      setIsLoadingDrafts(true);
      setStatusError('');

      try {
        const [loadedOralHistories, loadedProfiles] = await Promise.all([
          getOralHistories(),
          getProfiles(),
        ]);

        if (!isActive) {
          return;
        }

        setStoredEpisodes(normalizeOralHistories(loadedOralHistories));
        setProfiles(normalizeProfiles(loadedProfiles));
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
    () => getLatestStoredEpisode(storedEpisodes),
    [storedEpisodes],
  );

  const profileOptions = useMemo(
    () => profiles.map((profile) => ({
      id: profile.id,
      label: profile.displayName || `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || 'Unnamed member',
      meta: [profile.graduationYear ? `Class of ${profile.graduationYear}` : '', [profile.city, profile.stateProvince].filter(Boolean).join(', ')].filter(Boolean).join(' | '),
    })),
    [profiles],
  );

  const profileMap = useMemo(
    () => new Map(profileOptions.map((profile) => [profile.id, profile])),
    [profileOptions],
  );

  const filteredStoredEpisodes = useMemo(
    () => filterStoredEpisodes(storedEpisodes, storedEpisodeSearchQuery, profileMap),
    [profileMap, storedEpisodeSearchQuery, storedEpisodes],
  );

  const editingEpisode = useMemo(
    () => storedEpisodes.find((episode) => episode.oralHistoryId === editingOralHistoryId) || null,
    [editingOralHistoryId, storedEpisodes],
  );

  const nextAvailableEpisodeNumber = useMemo(
    () => getNextAvailableEpisodeNumber(storedEpisodes, uploadEntries, selectedInterviewee),
    [storedEpisodes, uploadEntries, selectedInterviewee],
  );

  const availableInterviewees = useMemo(
    () => buildIntervieweeOptions(defaultInterviewees, storedEpisodes, customInterviewees),
    [storedEpisodes, customInterviewees],
  );

  const availableCategories = useMemo(
    () => buildCategoryOptions(defaultOralHistoryCategories, storedEpisodes, customCategories),
    [storedEpisodes, customCategories],
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

      if (fieldName === 'title') {
        nextEntry.isTitleEdited = true;
      }

      if (fieldName === 'title' && entry.key === slugifyFilename(entry.file?.name || '')) {
        nextEntry.key = slugifyFilename(value);
      }

      if (fieldName === 'isFullLength' && value) {
        nextEntry.episodeNumber = '';
      }

      return syncGeneratedTitleForEntry(nextEntry);
    }));
    setStatusError('');
    setStatusSummary('');
  };

  const handleEntryProfileToggle = (entryId, profileId) => {
    setUploadEntries((currentEntries) => currentEntries.map((entry) => (
      entry.id === entryId
        ? { ...entry, profileIds: toggleProfileId(entry.profileIds, profileId) }
        : entry
    )));
    setStatusError('');
    setStatusSummary('');
  };

  const handleEntryLowResFileChange = async (entryId, file) => {
    setStatusError('');
    setStatusSummary('');

    if (!file) {
      setUploadEntries((currentEntries) => currentEntries.map((entry) => (
        entry.id === entryId ? { ...entry, lowResFile: null } : entry
      )));
      return;
    }

    try {
      await validateVideoFile(file);
      setUploadEntries((currentEntries) => currentEntries.map((entry) => (
        entry.id === entryId ? { ...entry, lowResFile: file } : entry
      )));
    } catch (error) {
      setStatusError(error.message);
    }
  };

  const applyIntervieweeToEntries = (intervieweeName) => {
    setUploadEntries((currentEntries) => (
      assignEpisodeNumbersForInterviewee(
        currentEntries.map((entry) => syncGeneratedTitleForEntry({
          ...entry,
          interviewee: intervieweeName,
        })),
        storedEpisodes,
        intervieweeName,
      )
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

  const handleCreateCategory = () => {
    try {
      const normalizedName = validateRequiredField(newCategoryName, 'Enter a new category name.');
      const existingName = findMatchingCategoryName(availableCategories, normalizedName);
      const nextCategoryName = existingName || normalizedName;

      setCustomCategories((currentNames) => {
        if (findMatchingCategoryName(currentNames, nextCategoryName)) {
          return currentNames;
        }

        return existingName ? currentNames : [...currentNames, nextCategoryName];
      });

      setUploadEntries((currentEntries) => currentEntries.map((entry) => syncGeneratedTitleForEntry({
        ...entry,
        category: entry.category || nextCategoryName,
      })));
      setIsAddingCategory(false);
      setNewCategoryName('');
      setStatusError('');
      setStatusSummary('');
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
        const filenameTitle = deriveTitleFromFilename(file.name);
        const nextKey = getUniqueKey(slugifyFilename(file.name), existingKeys);

        return {
          id: buildClientEntryId(),
          file,
          isFullLength: false,
          episodeNumber: '',
          title: '',
          isTitleEdited: false,
          key: nextKey,
          interviewee: selectedInterviewee,
          category: getCategoryForTitle(filenameTitle),
          description: '',
          profileIds: [],
          lowResFile: null,
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
      const lowResFailedEntries = [];

      for (const entry of uploadEntries) {
        try {
          await validateVideoFile(entry.file);

          if (entry.lowResFile) {
            await validateVideoFile(entry.lowResFile);
          }

          const metadata = {
            key: validateOralHistoryKey(entry.key),
            isFullLength: Boolean(entry.isFullLength),
            episodeNumber: entry.isFullLength ? null : String(validateEpisodeNumber(entry.episodeNumber)),
            title: validateRequiredField(entry.title, 'Enter an oral history title.'),
            interviewee: validateRequiredField(entry.interviewee, 'Enter the interviewee name.'),
            category: validateRequiredField(entry.category, 'Choose a category for the oral history.'),
            description: String(entry.description || '').trim(),
            profileIds: normalizeProfileIds(entry.profileIds),
          };

          let createdOralHistory = normalizeOralHistory(await uploadOralHistory(entry.file, metadata, {
            onProgress: (nextProgress) => setUploadProgress({
              ...nextProgress,
              fileName: entry.file.name,
            }),
          }));

          if (entry.lowResFile) {
            setUploadProgress(null);
            try {
              createdOralHistory = normalizeOralHistory(await uploadOralHistoryLowRes(
                createdOralHistory.oralHistoryId,
                entry.lowResFile,
                {
                  onProgress: (nextProgress) => setUploadProgress({
                    ...nextProgress,
                    fileName: `${entry.lowResFile.name} (low-res)`,
                  }),
                },
              ));
            } catch (error) {
              lowResFailedEntries.push({
                title: createdOralHistory.title,
                fileName: entry.lowResFile.name,
                uploadError: error.message,
              });
            }
          }

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
        if (lowResFailedEntries.length > 0) {
          setStatusError(lowResFailedEntries.map((entry) =>
            `${entry.title} low-res file ${entry.fileName}: ${entry.uploadError}`).join(' '));
        }
        setFileInputKey((currentValue) => currentValue + 1);
      } else if (createdEntries.length > 0) {
        setStatusSummary(`Uploaded ${createdEntries.length} oral history videos. Fix the remaining entries and retry.`);
        setStatusError([
          ...failedEntries.map((entry) => `${entry.file.name}: ${entry.uploadError}`),
          ...lowResFailedEntries.map((entry) => `${entry.title} low-res file ${entry.fileName}: ${entry.uploadError}`),
        ].join(' '));
      } else {
        setStatusError([
          ...failedEntries.map((entry) => `${entry.file.name}: ${entry.uploadError}`),
          ...lowResFailedEntries.map((entry) => `${entry.title} low-res file ${entry.fileName}: ${entry.uploadError}`),
        ].join(' '));
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

  const handleEditEpisode = (episode) => {
    setEditingOralHistoryId(episode.oralHistoryId);
    setEditValues(buildEpisodeEditValues(episode));
    setEditStatusError('');
    setUploadProgress(null);
    setStatusSummary('');
  };

  const handleCancelEdit = () => {
    setEditingOralHistoryId('');
    setEditValues(null);
    setEditStatusError('');
    setUploadProgress(null);
    setStatusSummary('');
  };

  const handleEditFieldChange = (fieldName, value) => {
    setEditValues((currentValues) => {
      if (!currentValues) {
        return currentValues;
      }

      const nextValues = {
        ...currentValues,
        [fieldName]: fieldName === 'isFullLength' ? Boolean(value) : value,
      };

      if (fieldName === 'isFullLength' && value) {
        nextValues.episodeNumber = '';
      }

      return nextValues;
    });
    setEditStatusError('');
    setStatusSummary('');
  };

  const handleEditProfileToggle = (profileId) => {
    setEditValues((currentValues) => (
      currentValues
        ? { ...currentValues, profileIds: toggleProfileId(currentValues.profileIds, profileId) }
        : currentValues
    ));
    setEditStatusError('');
    setStatusSummary('');
  };

  const handleEditLowResFileChange = async (file) => {
    setEditStatusError('');
    setStatusSummary('');

    if (!file) {
      setEditValues((currentValues) => (
        currentValues ? { ...currentValues, lowResFile: null } : currentValues
      ));
      return;
    }

    try {
      await validateVideoFile(file);
      setEditValues((currentValues) => (
        currentValues ? { ...currentValues, lowResFile: file } : currentValues
      ));
    } catch (error) {
      setEditStatusError(error.message);
    }
  };

  const handleSaveEpisode = async (event) => {
    event.preventDefault();

    if (!editValues) {
      return;
    }

    setSavingOralHistoryId(editValues.oralHistoryId);
    setEditStatusError('');
    setStatusSummary('');
    setUploadProgress(null);

    try {
      validateEpisodeMetadata(editValues, storedEpisodes, editValues.oralHistoryId);

      let updatedEpisode = normalizeOralHistory(await updateOralHistory(editValues.oralHistoryId, {
        key: validateOralHistoryKey(editValues.key),
        isFullLength: Boolean(editValues.isFullLength),
        episodeNumber: editValues.isFullLength ? null : String(validateEpisodeNumber(editValues.episodeNumber)),
        title: validateRequiredField(editValues.title, 'Enter an oral history title.'),
        interviewee: validateRequiredField(editValues.interviewee, 'Enter the interviewee name.'),
        category: validateRequiredField(editValues.category, 'Choose a category for the oral history.'),
        description: String(editValues.description || '').trim(),
        profileIds: normalizeProfileIds(editValues.profileIds),
      }));

      if (editValues.lowResFile) {
        updatedEpisode = normalizeOralHistory(await uploadOralHistoryLowRes(
          updatedEpisode.oralHistoryId,
          editValues.lowResFile,
          {
            onProgress: (nextProgress) => setUploadProgress({
              ...nextProgress,
              fileName: `${editValues.lowResFile.name} (low-res)`,
            }),
          },
        ));
      }

      setStoredEpisodes((currentEpisodes) => normalizeOralHistories(currentEpisodes.map((episode) => (
        episode.oralHistoryId === updatedEpisode.oralHistoryId ? updatedEpisode : episode
      ))));
      setEditingOralHistoryId('');
      setEditValues(null);
      setStatusSummary(`Saved ${formatEpisodeLabel(updatedEpisode)}: ${updatedEpisode.title}.`);
    } catch (error) {
      setEditStatusError(error.message);
    } finally {
      setSavingOralHistoryId('');
      setUploadProgress(null);
    }
  };

  const isEpisodeEditModalOpen = Boolean(editingOralHistoryId && editValues);

  useEffect(() => {
    if (!isEpisodeEditModalOpen) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const handleWindowKeyDown = (event) => {
      if (event.key === 'Escape' && !savingOralHistoryId) {
        setEditingOralHistoryId('');
        setEditValues(null);
        setEditStatusError('');
        setStatusSummary('');
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleWindowKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isEpisodeEditModalOpen, savingOralHistoryId]);

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
            Back to Admin Tools
          </Link>
        </div>

        <article className="compositePanel compositePanel--spacious">
          <div className="compositePanel__header">
            <div>
              <h2 className="compositePanel__title">Prepare Oral History Uploads</h2>
              <p className="compositePanel__description">
                Each selected file gets a generated key, the next available episode number, and an
                editable title based on the interviewee, episode number, and category.
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

              <div className="compositeField">
                <span className="compositeField__label">Add New Category</span>
                {isAddingCategory ? (
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <input
                      className="compositeField__input"
                      type="text"
                      value={newCategoryName}
                      placeholder="Enter a new category"
                      onChange={(event) => setNewCategoryName(event.target.value)}
                    />
                    <button
                      type="button"
                      className="button compositeButton compositeButton--filled"
                      onClick={handleCreateCategory}
                    >
                      Save Category
                    </button>
                    <button
                      type="button"
                      className="button compositeButton"
                      onClick={() => {
                        setIsAddingCategory(false);
                        setNewCategoryName('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="button compositeButton"
                    onClick={() => setIsAddingCategory(true)}
                  >
                    Add Category
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
                        <span className="compositeField__label">Low-Res Version (Optional)</span>
                        <input
                          className="compositeField__input compositeField__input--file"
                          type="file"
                          accept={acceptedVideoTypes}
                          onChange={(event) => void handleEntryLowResFileChange(
                            entry.id,
                            event.target.files?.[0] || null,
                          )}
                        />
                        <span className="compositeField__hint">
                          {entry.lowResFile
                            ? `${entry.lowResFile.name} (${formatFileSize(entry.lowResFile.size)})`
                            : 'Upload a smaller copy for the public viewer quality toggle.'}
                        </span>
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

                      <label className="compositeField">
                        <span className="compositeField__label">Category</span>
                        <select
                          className="compositeField__input"
                          value={entry.category}
                          onChange={(event) => handleEntryFieldChange(entry.id, 'category', event.target.value)}
                        >
                          <option value="">Choose a category</option>
                          {availableCategories.map((categoryName) => (
                            <option key={categoryName} value={categoryName}>
                              {categoryName}
                            </option>
                          ))}
                        </select>
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

                      <div className="profileManagerGrid__fullWidth">
                        <ProfileAssignmentPicker
                          selectedProfileIds={entry.profileIds}
                          profiles={profileOptions}
                          profileMap={profileMap}
                          onToggleProfile={(profileId) => handleEntryProfileToggle(entry.id, profileId)}
                        />
                      </div>
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
              <UploadProgressIndicator uploadProgress={uploadProgress} />
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
            <>
              <div className="oralHistoryStoredToolbar">
                <label className="compositeField oralHistoryStoredToolbar__search">
                  <span className="compositeField__label">Search Stored Episodes</span>
                  <input
                    className="compositeField__input"
                    type="search"
                    value={storedEpisodeSearchQuery}
                    placeholder="Search by interviewee, title, category, key, or profile"
                    onChange={(event) => setStoredEpisodeSearchQuery(event.target.value)}
                  />
                </label>
                <p className="oralHistoryStoredToolbar__count">
                  {filteredStoredEpisodes.length} of {storedEpisodes.length} episode{storedEpisodes.length === 1 ? '' : 's'}
                </p>
              </div>

              <div className="oralHistoryStoredList">
              {filteredStoredEpisodes.map((episode) => (
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
                    <p className="compositeCard__meta">
                      Category: <strong>{episode.category}</strong>
                    </p>
                    <p className="compositeCard__sourceName">{episode.fileName}</p>
                    {episode.lowResVideoUrl ? (
                      <p className="compositeCard__meta">
                        Low-res version: <strong>{episode.lowResOriginalFilename || 'Uploaded'}</strong>
                      </p>
                    ) : null}
                    <p className="compositeCard__meta">
                      Key: <strong>{episode.key}</strong>
                    </p>
                    {episode.profileIds.length > 0 ? (
                      <p className="compositeCard__meta">
                        Member profiles: <strong>{formatProfileNames(episode.profileIds, profileMap)}</strong>
                      </p>
                    ) : null}
                    <p className="compositeCard__meta">{episode.description}</p>
                    <p className="compositeCard__meta">
                      Uploaded {formatDate(episode.preparedAt)}
                    </p>

                    <div className="profileDirectoryCard__actions" style={{ marginTop: '18px' }}>
                      <button
                        type="button"
                        className="button compositeButton"
                        onClick={() => handleEditEpisode(episode)}
                        disabled={Boolean(editingOralHistoryId) && editingOralHistoryId !== episode.oralHistoryId}
                      >
                        Edit Episode
                      </button>
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
              {!isLoadingDrafts && filteredStoredEpisodes.length === 0 ? (
                <div className="compositeEmptyState">
                  <p className="compositeEmptyState__description">No stored oral history episodes match that search.</p>
                </div>
              ) : null}
              </div>
            </>
          )}

          {latestStoredEpisode ? (
            <p className="compositeMessage" style={{ marginTop: '18px' }}>
              Latest upload: <strong>{latestStoredEpisode.title}</strong> using filename{' '}
              <strong>{latestStoredEpisode.fileName}</strong>.
            </p>
          ) : null}
        </article>
      </div>

      {isEpisodeEditModalOpen ? (
        <div
          className="oralHistoryEditModalBackdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingOralHistoryId) {
              handleCancelEdit();
            }
          }}
        >
          <article
            className="compositePanel compositePanel--spacious oralHistoryEditModal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="oral-history-edit-modal-title"
          >
            <div className="oralHistoryEditModal__header">
              <div>
                <p className="compositePageHeader__eyebrow">Stored Oral History</p>
                <h2 id="oral-history-edit-modal-title" className="compositePanel__title">
                  Edit Episode
                </h2>
                <p className="compositePanel__description">
                  {editingEpisode
                    ? `${formatEpisodeLabel(editingEpisode)}: ${editingEpisode.title}`
                    : 'Update this stored oral history episode.'}
                </p>
              </div>

              <button
                type="button"
                className="button compositeButton compositeButton--subtle"
                onClick={handleCancelEdit}
                disabled={Boolean(savingOralHistoryId)}
              >
                Close
              </button>
            </div>

            <form className="oralHistoryEditModal__form" onSubmit={handleSaveEpisode}>
              <EpisodeMetadataFields
                values={editValues}
                availableCategories={availableCategories}
                onFieldChange={handleEditFieldChange}
              />
              <LowResVideoField
                existingLowResFileName={editingEpisode?.lowResOriginalFilename || ''}
                existingLowResFileSize={editingEpisode?.lowResFileSize || 0}
                selectedLowResFile={editValues.lowResFile}
                onFileChange={handleEditLowResFileChange}
              />
              <ProfileAssignmentPicker
                selectedProfileIds={editValues.profileIds}
                profiles={profileOptions}
                profileMap={profileMap}
                onToggleProfile={handleEditProfileToggle}
              />

              {editStatusError ? (
                <p className="compositeMessage compositeMessage--error">{editStatusError}</p>
              ) : null}
              {savingOralHistoryId === editingOralHistoryId && uploadProgress ? (
                <UploadProgressIndicator uploadProgress={uploadProgress} />
              ) : null}

              <div className="profileDirectoryCard__actions">
                <button
                  type="submit"
                  className="button compositeButton compositeButton--filled"
                  disabled={savingOralHistoryId === editingOralHistoryId}
                >
                  {savingOralHistoryId === editingOralHistoryId ? 'Saving...' : 'Save Episode'}
                </button>
                <button
                  type="button"
                  className="button compositeButton"
                  onClick={handleCancelEdit}
                  disabled={savingOralHistoryId === editingOralHistoryId}
                >
                  Cancel
                </button>
              </div>
            </form>
          </article>
        </div>
      ) : null}
    </section>
  );
}

function EpisodeMetadataFields({
  values,
  availableCategories,
  onFieldChange,
}) {
  return (
    <div className="profileManagerGrid">
      <label className="compositeCheckbox">
        <input
          type="checkbox"
          checked={values.isFullLength}
          onChange={(event) => onFieldChange('isFullLength', event.target.checked)}
        />
        Full-length interview
      </label>

      <label className="compositeField">
        <span className="compositeField__label">Episode Number</span>
        <input
          className="compositeField__input"
          type="text"
          inputMode="numeric"
          value={values.episodeNumber}
          disabled={values.isFullLength}
          placeholder={values.isFullLength ? 'No episode number' : ''}
          onChange={(event) => onFieldChange('episodeNumber', event.target.value)}
        />
      </label>

      <label className="compositeField">
        <span className="compositeField__label">Key</span>
        <input
          className="compositeField__input"
          type="text"
          value={values.key}
          onChange={(event) => onFieldChange('key', event.target.value)}
        />
      </label>

      <label className="compositeField">
        <span className="compositeField__label">Title</span>
        <input
          className="compositeField__input"
          type="text"
          value={values.title}
          onChange={(event) => onFieldChange('title', event.target.value)}
        />
      </label>

      <label className="compositeField">
        <span className="compositeField__label">Interviewee</span>
        <input
          className="compositeField__input"
          type="text"
          value={values.interviewee}
          onChange={(event) => onFieldChange('interviewee', event.target.value)}
        />
      </label>

      <label className="compositeField">
        <span className="compositeField__label">Category</span>
        <select
          className="compositeField__input"
          value={values.category}
          onChange={(event) => onFieldChange('category', event.target.value)}
        >
          <option value="">Choose a category</option>
          {availableCategories.map((categoryName) => (
            <option key={categoryName} value={categoryName}>
              {categoryName}
            </option>
          ))}
        </select>
      </label>

      <label className="compositeField profileManagerGrid__fullWidth">
        <span className="compositeField__label">Description</span>
        <textarea
          className="compositeField__input compositeField__textarea"
          rows={4}
          value={values.description}
          onChange={(event) => onFieldChange('description', event.target.value)}
        />
      </label>
    </div>
  );
}

function LowResVideoField({
  existingLowResFileName = '',
  existingLowResFileSize = 0,
  selectedLowResFile = null,
  onFileChange,
}) {
  const hasExistingLowRes = Boolean(existingLowResFileName);
  const helperText = selectedLowResFile
    ? `${selectedLowResFile.name} (${formatFileSize(selectedLowResFile.size)})`
    : hasExistingLowRes
      ? `Current low-res file: ${existingLowResFileName} (${formatFileSize(existingLowResFileSize)})`
      : 'Upload a smaller copy for the public viewer quality toggle.';

  return (
    <label className="compositeField">
      <span className="compositeField__label">Low-Res Version (Optional)</span>
      <input
        className="compositeField__input compositeField__input--file"
        type="file"
        accept={acceptedVideoTypes}
        onChange={(event) => void onFileChange(event.target.files?.[0] || null)}
      />
      <span className="compositeField__hint">{helperText}</span>
    </label>
  );
}

function UploadProgressIndicator({ uploadProgress }) {
  const progressMetrics = getUploadProgressMetrics(uploadProgress);

  return (
    <div className="compositeUploadProgress" role="status" aria-live="polite">
      <div className="compositeUploadProgress__header">
        <span>{progressMetrics.fileName || 'Uploading video'}</span>
        <strong>{progressMetrics.uploadPercent}%</strong>
      </div>
      <div
        className="compositeUploadProgress__bar"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={progressMetrics.uploadPercent}
        aria-label={progressMetrics.fileName ? `${progressMetrics.fileName} upload progress` : 'Upload progress'}
      >
        <span
          className="compositeUploadProgress__barFill"
          style={{ width: `${progressMetrics.uploadPercent}%` }}
        />
      </div>
      <p className="compositeUploadProgress__meta">
        {formatUploadProgress(uploadProgress)}
      </p>
    </div>
  );
}

function ProfileAssignmentPicker({
  selectedProfileIds,
  profiles,
  profileMap,
  onToggleProfile,
}) {
  const [query, setQuery] = useState('');
  const normalizedSelectedProfileIds = normalizeProfileIds(selectedProfileIds);
  const selectedProfileIdSet = new Set(normalizedSelectedProfileIds);
  const normalizedQuery = query.trim().toLowerCase();
  const matchingProfiles = profiles
    .filter((profile) => {
      if (!normalizedQuery) {
        return selectedProfileIdSet.has(profile.id);
      }

      return [
        profile.label,
        profile.meta,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
    })
    .slice(0, normalizedQuery ? 12 : 8);

  return (
    <div className="oralHistoryProfilePicker">
      <label className="compositeField">
        <span className="compositeField__label">Assigned Member Profiles</span>
        <input
          className="compositeField__input"
          type="search"
          value={query}
          placeholder="Search member profiles to assign"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {normalizedSelectedProfileIds.length > 0 ? (
        <div className="oralHistoryProfilePicker__chips" aria-label="Selected member profiles">
          {normalizedSelectedProfileIds.map((profileId) => {
            const profile = profileMap.get(profileId);

            return (
              <button
                key={profileId}
                type="button"
                className="oralHistoryProfilePicker__chip"
                onClick={() => onToggleProfile(profileId)}
              >
                {profile?.label || profileId}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="oralHistoryProfilePicker__hint">No member profiles assigned.</p>
      )}

      <div className="oralHistoryProfilePicker__results">
        {matchingProfiles.map((profile) => (
          <label key={profile.id} className="oralHistoryProfilePicker__option">
            <input
              type="checkbox"
              checked={selectedProfileIdSet.has(profile.id)}
              onChange={() => onToggleProfile(profile.id)}
            />
            <span>
              <strong>{profile.label}</strong>
              {profile.meta ? <small>{profile.meta}</small> : null}
            </span>
          </label>
        ))}
        {normalizedQuery && matchingProfiles.length === 0 ? (
          <p className="oralHistoryProfilePicker__hint">No matching member profiles.</p>
        ) : null}
      </div>
    </div>
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
    validateRequiredField(entry.category, 'Choose a category for the oral history.');

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

function validateEpisodeMetadata(entry, storedEpisodes, currentOralHistoryId = '') {
  const comparableEpisodes = storedEpisodes.filter((episode) => episode.oralHistoryId !== currentOralHistoryId);

  validateUploadEntries([entry], comparableEpisodes);
}

function buildEpisodeEditValues(episode) {
  return {
    oralHistoryId: episode.oralHistoryId,
    key: episode.key,
    title: episode.title,
    interviewee: episode.interviewee,
    category: episode.category,
    description: episode.description,
    isFullLength: Boolean(episode.isFullLength),
    episodeNumber: episode.isFullLength ? '' : String(episode.episodeNumber || ''),
    profileIds: normalizeProfileIds(episode.profileIds),
    lowResFile: null,
  };
}

function filterStoredEpisodes(storedEpisodes, query, profileMap) {
  const normalizedQuery = String(query || '').trim().toLowerCase();

  if (!normalizedQuery) {
    return storedEpisodes;
  }

  return storedEpisodes.filter((episode) => [
    episode.title,
    episode.interviewee,
    episode.category,
    episode.key,
    episode.description,
    formatEpisodeLabel(episode),
    ...normalizeProfileIds(episode.profileIds).map((profileId) => profileMap.get(profileId)?.label || profileId),
  ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery)));
}

function getLatestStoredEpisode(storedEpisodes) {
  return [...storedEpisodes].sort((leftEpisode, rightEpisode) => (
    new Date(rightEpisode.preparedAt || 0).getTime() - new Date(leftEpisode.preparedAt || 0).getTime()
  ))[0] || null;
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

function buildCategoryOptions(defaultNames, storedEpisodes, customNames) {
  const knownNames = new Map();

  [...defaultNames, ...customNames, ...storedEpisodes.map((episode) => episode.category)]
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

function findMatchingCategoryName(names, targetName) {
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

function normalizeProfiles(profiles) {
  return [...(Array.isArray(profiles) ? profiles : [])]
    .map((profile) => ({
      ...profile,
      id: String(profile?.id || ''),
      displayName: String(profile?.displayName || ''),
      firstName: String(profile?.firstName || ''),
      lastName: String(profile?.lastName || ''),
      city: String(profile?.city || ''),
      stateProvince: String(profile?.stateProvince || ''),
      graduationYear: profile?.graduationYear || '',
    }))
    .filter((profile) => profile.id)
    .sort((leftProfile, rightProfile) =>
      String(leftProfile.displayName || '').localeCompare(String(rightProfile.displayName || ''), undefined, {
        sensitivity: 'base',
      }),
    );
}

function normalizeOralHistory(oralHistory) {
  const isFullLength = Boolean(oralHistory?.isFullLength);

  return {
    ...oralHistory,
    oralHistoryId: String(oralHistory?.oralHistoryId || ''),
    key: String(oralHistory?.key || ''),
    title: String(oralHistory?.title || ''),
    interviewee: String(oralHistory?.interviewee || ''),
    category: String(oralHistory?.category || getCategoryForTitle(oralHistory?.title)),
    description: String(oralHistory?.description || ''),
    isFullLength,
    episodeNumber: isFullLength ? null : Number(oralHistory?.episodeNumber || 0),
    fileName: String(oralHistory?.originalFilename || ''),
    fileSize: Number(oralHistory?.fileSize || 0),
    profileIds: normalizeProfileIds(oralHistory?.profileIds),
    lowResVideoUrl: String(oralHistory?.lowResVideoUrl || ''),
    lowResOriginalFilename: String(oralHistory?.lowResOriginalFilename || ''),
    lowResFileSize: Number(oralHistory?.lowResFileSize || 0),
    lowResMimeType: String(oralHistory?.lowResMimeType || ''),
    preparedAt: oralHistory?.uploadTimestamp || new Date().toISOString(),
  };
}

function normalizeProfileIds(profileIds) {
  return Array.from(new Set(
    (Array.isArray(profileIds) ? profileIds : [])
      .map((profileId) => String(profileId || '').trim())
      .filter(Boolean),
  ));
}

function toggleProfileId(profileIds, profileId) {
  const normalizedProfileId = String(profileId || '').trim();
  const currentProfileIds = normalizeProfileIds(profileIds);

  if (!normalizedProfileId) {
    return currentProfileIds;
  }

  return currentProfileIds.includes(normalizedProfileId)
    ? currentProfileIds.filter((currentProfileId) => currentProfileId !== normalizedProfileId)
    : [...currentProfileIds, normalizedProfileId];
}

function formatProfileNames(profileIds, profileMap) {
  return normalizeProfileIds(profileIds)
    .map((profileId) => profileMap.get(profileId)?.label || profileId)
    .join(', ');
}

function compareOralHistories(leftEntry, rightEntry) {
  const intervieweeComparison = String(leftEntry.interviewee || '').localeCompare(
    String(rightEntry.interviewee || ''),
    undefined,
    { sensitivity: 'base' },
  );

  if (intervieweeComparison !== 0) {
    return intervieweeComparison;
  }

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

function buildGeneratedEpisodeTitle(entry) {
  const interviewee = normalizeIntervieweeName(entry.interviewee);
  const episodeLabel = entry.isFullLength
    ? 'Full Interview'
    : entry.episodeNumber
      ? `E${entry.episodeNumber}`
      : '';
  const category = String(entry.category || '').trim();

  return [interviewee, episodeLabel, category].filter(Boolean).join(' - ');
}

function syncGeneratedTitleForEntry(entry) {
  if (entry.isTitleEdited) {
    return entry;
  }

  return {
    ...entry,
    title: buildGeneratedEpisodeTitle(entry),
  };
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
    return entries.map(syncGeneratedTitleForEntry);
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
      return syncGeneratedTitleForEntry(entry);
    }

    if (entry.isFullLength) {
      return syncGeneratedTitleForEntry({
        ...entry,
        episodeNumber: '',
      });
    }

    return syncGeneratedTitleForEntry({
      ...entry,
      episodeNumber: String(getNextSequentialNumber(usedNumbers)),
    });
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
  const progressMetrics = getUploadProgressMetrics(uploadProgress);
  const prefix = progressMetrics.fileName ? `${progressMetrics.fileName}: ` : '';

  return `${prefix}Uploading ${formatFileSize(progressMetrics.uploadedBytes)} of ${formatFileSize(progressMetrics.totalBytes)} (${progressMetrics.uploadPercent}%, chunk ${progressMetrics.completedChunks} of ${progressMetrics.totalChunks}).`;
}

function getUploadProgressMetrics(uploadProgress) {
  const uploadedBytes = Number(uploadProgress?.uploadedBytes || 0);
  const totalBytes = Math.max(Number(uploadProgress?.totalBytes || 0), 1);
  const totalChunks = Math.max(Number(uploadProgress?.totalChunks || 0), 1);
  const completedChunks = Math.min(Math.max(Number(uploadProgress?.chunkIndex || -1) + 1, 0), totalChunks);
  const uploadPercent = Math.min(100, Math.round((uploadedBytes / totalBytes) * 100));
  const fileName = String(uploadProgress?.fileName || '').trim();

  return {
    completedChunks,
    fileName,
    totalBytes,
    totalChunks,
    uploadedBytes,
    uploadPercent,
  };
}

function formatEpisodeLabel(episode) {
  return episode?.isFullLength ? 'Full-length interview' : `Episode ${episode?.episodeNumber}`;
}
