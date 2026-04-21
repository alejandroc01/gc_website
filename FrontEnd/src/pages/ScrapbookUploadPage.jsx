import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import ProfileSearchSelect from '../components/Composite/ProfileSearchSelect.jsx';
import ScrapbookCopyrightNotice from '../components/Scrapbook/ScrapbookCopyrightNotice.jsx';
import {
  deleteScrapbook as deleteScrapbookRequest,
  deleteScrapbookPage as deleteScrapbookPageRequest,
  getProfiles,
  getScrapbookMetadataReview,
  getScrapbooks,
  importScrapbookMetadataCsv,
  saveScrapbookMetadataProfileLinks,
  uploadScrapbook,
} from '../api/composites.js';
import '../styles/composites.css';

const acceptedTypes = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
const acceptedFileExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
const maxQueuedScrapbookFiles = 20;

export default function ScrapbookUploadPage() {
  const nextQueueItemId = useRef(0);
  const metadataProgressTimer = useRef(null);
  const [uploadQueue, setUploadQueue] = useState([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [scrapbookYear, setScrapbookYear] = useState('');
  const [scrapbooks, setScrapbooks] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMetadataLoading, setIsMetadataLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isMetadataImporting, setIsMetadataImporting] = useState(false);
  const [isSavingMetadataLinks, setIsSavingMetadataLinks] = useState(false);
  const [deletingScrapbookId, setDeletingScrapbookId] = useState(null);
  const [deletingPageKey, setDeletingPageKey] = useState('');
  const [expandedScrapbookId, setExpandedScrapbookId] = useState('');
  const [listError, setListError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [metadataError, setMetadataError] = useState('');
  const [metadataSuccess, setMetadataSuccess] = useState('');
  const [metadataReview, setMetadataReview] = useState(null);
  const [metadataCsvFile, setMetadataCsvFile] = useState(null);
  const [metadataFileInputKey, setMetadataFileInputKey] = useState(0);
  const [manualProfileLinks, setManualProfileLinks] = useState({});
  const [metadataProgress, setMetadataProgress] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState('');

  useEffect(() => {
    let isActive = true;

    const loadScrapbooks = async () => {
      setIsLoading(true);
      setListError('');

      try {
        const scrapbookRecords = await getScrapbooks();

        if (!isActive) {
          return;
        }

        setScrapbooks(sortScrapbooks(scrapbookRecords));
      } catch {
        if (isActive) {
          setScrapbooks([]);
          setListError('Unable to load the current scrapbooks.');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadScrapbooks();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadMetadataContext = async () => {
      setIsMetadataLoading(true);
      setMetadataError('');
      startMetadataProgress('Loading metadata matches');

      try {
        const [profileRecords, review] = await Promise.all([
          getProfiles(),
          getScrapbookMetadataReview(),
        ]);

        if (!isActive) {
          return;
        }

        setProfiles(Array.isArray(profileRecords) ? profileRecords : []);
        applyMetadataReview(review);
      } catch (error) {
        if (isActive) {
          setProfiles([]);
          setMetadataError(error.message || 'Unable to load scrapbook metadata matches.');
        }
      } finally {
        if (isActive) {
          setIsMetadataLoading(false);
          completeMetadataProgress('Metadata matches loaded');
        }
      }
    };

    loadMetadataContext();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => () => {
    clearMetadataProgressTimer();
  }, []);

  const visibleMetadataRows = useMemo(() => {
    const rows = Array.isArray(metadataReview?.rows) ? metadataReview.rows : [];
    const activeYear = scrapbookYear.trim();

    if (!activeYear) {
      return rows;
    }

    return rows.filter((row) => String(row.year || '') === activeYear);
  }, [metadataReview, scrapbookYear]);

  const savedManualProfileLinks = useMemo(
    () => buildManualProfileLinkState(metadataReview),
    [metadataReview],
  );
  const unsavedManualLinkCount = useMemo(
    () => countUnsavedManualProfileLinks(manualProfileLinks, savedManualProfileLinks),
    [manualProfileLinks, savedManualProfileLinks],
  );

  const applyMetadataReview = (review) => {
    setMetadataReview(review || null);
    setManualProfileLinks(buildManualProfileLinkState(review));
  };

  const clearMetadataProgressTimer = () => {
    if (metadataProgressTimer.current) {
      window.clearInterval(metadataProgressTimer.current);
      metadataProgressTimer.current = null;
    }
  };

  const startMetadataProgress = (label) => {
    clearMetadataProgressTimer();
    setMetadataProgress({
      label,
      percent: 8,
    });

    metadataProgressTimer.current = window.setInterval(() => {
      setMetadataProgress((currentProgress) => {
        if (!currentProgress) {
          return currentProgress;
        }

        return {
          ...currentProgress,
          percent: Math.min(currentProgress.percent + 7, 92),
        };
      });
    }, 260);
  };

  const completeMetadataProgress = (label) => {
    clearMetadataProgressTimer();
    setMetadataProgress((currentProgress) => ({
      label: label || currentProgress?.label || 'Metadata action complete',
      percent: 100,
    }));

    window.setTimeout(() => {
      setMetadataProgress(null);
    }, 900);
  };

  const updateQueueItem = (queueItemId, updates) => {
    setUploadQueue((currentQueue) => currentQueue.map((queueItem) => (
      queueItem.id === queueItemId
        ? {
            ...queueItem,
            ...updates,
          }
        : queueItem
    )));
  };

  const resetFileInput = () => {
    setFileInputKey((currentValue) => currentValue + 1);
  };

  const handleFileSelection = (event) => {
    const incomingFiles = Array.from(event.target.files || []);

    if (incomingFiles.length === 0) {
      return;
    }

    setUploadQueue((currentQueue) => {
      const remainingSlots = Math.max(maxQueuedScrapbookFiles - currentQueue.length, 0);
      const filesToQueue = incomingFiles.slice(0, remainingSlots);

      if (remainingSlots === 0) {
        setUploadError(`The upload queue already has ${maxQueuedScrapbookFiles} files. Remove one to add another.`);
        return currentQueue;
      }

      if (incomingFiles.length > remainingSlots) {
        setUploadError(`Only ${maxQueuedScrapbookFiles} files can be queued at once. Added the first ${remainingSlots} from this selection.`);
      } else {
        setUploadError('');
      }

      setUploadSuccess('');
      setUploadProgress(null);

      return [
        ...currentQueue,
        ...filesToQueue.map((file) => createQueueItem(file, nextQueueItemId)),
      ];
    });

    resetFileInput();
  };

  const removeQueueItem = (queueItemId) => {
    setUploadQueue((currentQueue) => currentQueue.filter((queueItem) => queueItem.id !== queueItemId));
    setUploadError('');
    setUploadSuccess('');
    setUploadProgress(null);
  };

  const clearQueue = () => {
    setUploadQueue([]);
    setUploadError('');
    setUploadSuccess('');
    setUploadProgress(null);
    resetFileInput();
  };

  const handleMetadataFileSelection = (event) => {
    const file = event.target.files?.[0] || null;

    if (file && !isAcceptedMetadataCsv(file)) {
      setMetadataCsvFile(null);
      setMetadataError('Please choose a .csv file for scrapbook metadata.');
      setMetadataSuccess('');
      setMetadataFileInputKey((currentValue) => currentValue + 1);
      return;
    }

    setMetadataCsvFile(file);
    setMetadataError('');
    setMetadataSuccess('');
  };

  const handleMetadataImportSubmit = async (event) => {
    event.preventDefault();

    if (!metadataCsvFile) {
      setMetadataError('Choose a scrapbook metadata CSV file to import.');
      return;
    }

    setIsMetadataImporting(true);
    setMetadataError('');
    setMetadataSuccess('');
    startMetadataProgress('Importing metadata CSV');

    try {
      const review = await importScrapbookMetadataCsv(metadataCsvFile);
      applyMetadataReview(review);
      setMetadataSuccess(buildMetadataImportMessage(review));
      setMetadataCsvFile(null);
      setMetadataFileInputKey((currentValue) => currentValue + 1);
    } catch (error) {
      setMetadataError(error.message);
    } finally {
      setIsMetadataImporting(false);
      completeMetadataProgress('Metadata CSV imported');
    }
  };

  const handleManualProfileSelect = (rowIdentifier, rawName, profileId) => {
    const matchingLinkKeys = getMatchingManualLinkKeys(metadataReview, rawName);
    const fallbackLinkKey = buildManualLinkKey(rowIdentifier, rawName);
    const nextProfileId = profileId || '';

    setManualProfileLinks((currentLinks) => ({
      ...currentLinks,
      ...(matchingLinkKeys.length > 0
        ? Object.fromEntries(matchingLinkKeys.map((linkKey) => [linkKey, nextProfileId]))
        : { [fallbackLinkKey]: nextProfileId }),
    }));
    setMetadataSuccess('');
  };

  const handleMetadataLinksSave = async () => {
    const reviewRows = Array.isArray(metadataReview?.rows) ? metadataReview.rows : [];
    const links = reviewRows.flatMap((row) => (
      Array.isArray(row.people)
        ? row.people.map((person) => ({
            identifier: row.identifier,
            rawName: person.rawName,
            profileId: manualProfileLinks[buildManualLinkKey(row.identifier, person.rawName)] || null,
          }))
        : []
    ));

    setIsSavingMetadataLinks(true);
    setMetadataError('');
    setMetadataSuccess('');
    startMetadataProgress('Saving manual matches');

    try {
      const saveSummary = await saveScrapbookMetadataProfileLinks(links);
      applyMetadataReview(saveSummary.review);
      setMetadataSuccess(`Saved ${saveSummary.savedCount || 0} manual scrapbook member match${(saveSummary.savedCount || 0) === 1 ? '' : 'es'}.`);
    } catch (error) {
      setMetadataError(error.message);
    } finally {
      setIsSavingMetadataLinks(false);
      completeMetadataProgress('Manual matches saved');
    }
  };

  const handleUploadSubmit = async (event) => {
    event.preventDefault();
    const normalizedYear = scrapbookYear.trim();

    const validationError = validateUploadQueue(uploadQueue, normalizedYear, scrapbooks);

    if (validationError) {
      setUploadError(validationError);
      return;
    }

    const existingScrapbook = scrapbooks.find(
      (scrapbook) => String(scrapbook.scrapbookYear || '') === normalizedYear,
    );
    const isCreatingNewScrapbook = !existingScrapbook;

    setUploadError('');
    setUploadSuccess('');
    setListError('');
    setIsUploading(true);
    setUploadProgress(null);

    const uploadedFileNames = [];
    const failedUploads = [];
    let lastCreatedScrapbook = null;

    try {
      for (let queueIndex = 0; queueIndex < uploadQueue.length; queueIndex += 1) {
        const queueItem = uploadQueue[queueIndex];
        updateQueueItem(queueItem.id, {
          status: 'uploading',
          error: '',
        });

        try {
          const createdScrapbook = await uploadScrapbook(queueItem.file, normalizedYear, {
            onProgress: (nextProgress) => {
              updateQueueItem(queueItem.id, {
                progress: nextProgress,
              });
              setUploadProgress({
                ...nextProgress,
                fileName: queueItem.file.name,
                queueIndex,
                totalFiles: uploadQueue.length,
              });
            },
          });

          lastCreatedScrapbook = createdScrapbook;
          uploadedFileNames.push(queueItem.file.name);

          setScrapbooks((currentScrapbooks) => {
            const remainingScrapbooks = currentScrapbooks.filter(
              (entry) => entry.scrapbookId !== createdScrapbook.scrapbookId,
            );

            return sortScrapbooks([createdScrapbook, ...remainingScrapbooks]);
          });
          setExpandedScrapbookId(createdScrapbook.scrapbookId);
          updateQueueItem(queueItem.id, {
            status: 'uploaded',
            error: '',
            progress: {
              uploadedBytes: queueItem.file.size,
              totalBytes: queueItem.file.size,
              chunkIndex: Number(queueItem.progress?.totalChunks || 1) - 1,
              totalChunks: Number(queueItem.progress?.totalChunks || 1),
            },
          });
        } catch (error) {
          failedUploads.push({
            id: queueItem.id,
            fileName: queueItem.file.name,
            message: error.message,
          });
          updateQueueItem(queueItem.id, {
            status: 'failed',
            error: error.message,
            progress: null,
          });
        }
      }

      if (uploadedFileNames.length > 0 && lastCreatedScrapbook) {
        setUploadSuccess(buildUploadSuccessMessage({
          uploadedFileNames,
          failedUploads,
          scrapbookTitle: lastCreatedScrapbook.title,
          isCreatingNewScrapbook,
        }));
      }

      if (failedUploads.length > 0) {
        setUploadError(buildUploadFailureMessage(failedUploads));
        setUploadQueue((currentQueue) => currentQueue.filter((queueItem) => (
          failedUploads.some((failedUpload) => failedUpload.id === queueItem.id)
        )));
      } else {
        setUploadQueue([]);
        setScrapbookYear('');
        resetFileInput();
      }

      setUploadProgress(null);
    } finally {
      setUploadProgress(null);
      setIsUploading(false);
    }
  };

  const handleDeleteScrapbook = async (scrapbook) => {
    const confirmed = window.confirm(
      `Delete ${scrapbook.title}? This removes every uploaded page in that scrapbook.`,
    );

    if (!confirmed) {
      return;
    }

    setListError('');
    setUploadSuccess('');
    setDeletingScrapbookId(scrapbook.scrapbookId);

    try {
      await deleteScrapbookRequest(scrapbook.scrapbookId);
      setScrapbooks((currentScrapbooks) =>
        currentScrapbooks.filter((entry) => entry.scrapbookId !== scrapbook.scrapbookId),
      );
      setExpandedScrapbookId((currentValue) => (
        currentValue === scrapbook.scrapbookId ? '' : currentValue
      ));
    } catch (error) {
      setListError(error.message);
    } finally {
      setDeletingScrapbookId(null);
    }
  };

  const toggleScrapbookExpanded = (scrapbookId) => {
    setExpandedScrapbookId((currentValue) => (
      currentValue === scrapbookId ? '' : scrapbookId
    ));
  };

  const handleDeletePage = async (scrapbook, pageEntry) => {
    const confirmed = window.confirm(
      `Delete ${pageEntry.originalFilename || 'this page'} from ${scrapbook.title}? This will update the scrapbook page count.`,
    );

    if (!confirmed) {
      return;
    }

    const pageKey = `${scrapbook.scrapbookId}:${pageEntry.pageId}`;
    setListError('');
    setUploadSuccess('');
    setDeletingPageKey(pageKey);

    try {
      const deleteSummary = await deleteScrapbookPageRequest(scrapbook.scrapbookId, pageEntry.pageId);

      setScrapbooks((currentScrapbooks) => {
        if (!deleteSummary?.scrapbook) {
          return currentScrapbooks.filter((entry) => entry.scrapbookId !== scrapbook.scrapbookId);
        }

        return sortScrapbooks(
          currentScrapbooks.map((entry) =>
            entry.scrapbookId === scrapbook.scrapbookId ? deleteSummary.scrapbook : entry,
          ),
        );
      });
    } catch (error) {
      setListError(error.message);
    } finally {
      setDeletingPageKey('');
    }
  };

  return (
    <section className="section compositeAdmin">
      <div className="container">
        <div className="compositePageHeader">
          <p className="compositePageHeader__eyebrow">Admin Upload Flow</p>
          <h1 className="compositePageHeader__title">Scrapbook Upload</h1>
          <p className="compositePageHeader__description">
            Queue up to {maxQueuedScrapbookFiles} scrapbook page images at once. Each page is uploaded in order and
            stored under the scrapbook year you choose here for the public viewer.
          </p>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <Link className="button compositeButton" to="/upload">
            Back to upload options
          </Link>
        </div>

        <ScrapbookCopyrightNotice className="compositeUpload__copyrightNotice" />

        <article className="compositePanel compositePanel--spacious">
          <div className="compositePanel__header">
            <div>
              <h2 className="compositePanel__title">Upload a New Scrapbook</h2>
              <p className="compositePanel__description">
                Accepted formats: JPG, JPEG, PNG, and WEBP. Queue up to {maxQueuedScrapbookFiles} files and use format <em>1991ScrapB-P2</em>.
              </p>
            </div>
          </div>

          <form className="compositeUploadForm" onSubmit={handleUploadSubmit}>
            <div className="compositeUploadForm__grid">
              <label className="compositeField">
                <span className="compositeField__label">Scrapbook year</span>
                <input
                  className="compositeField__input"
                  type="text"
                  inputMode="numeric"
                  placeholder="enter year"
                  maxLength={4}
                  value={scrapbookYear}
                  onChange={(event) => {
                    setScrapbookYear(event.target.value.replace(/[^\d]/g, '').slice(0, 4));
                    setUploadError('');
                    setUploadSuccess('');
                    setUploadProgress(null);
                  }}
                />
              </label>

              <label className="compositeField">
                <span className="compositeField__label">Scrapbook page images</span>
                <input
                  key={fileInputKey}
                  className="compositeField__input compositeField__input--file"
                  type="file"
                  accept={acceptedTypes}
                  multiple
                  onChange={handleFileSelection}
                />
              </label>
            </div>

            <div className="compositeUploadForm__actions">
              <button
                type="submit"
                className="button compositeButton compositeButton--filled"
                disabled={isUploading || uploadQueue.length === 0}
              >
                {isUploading
                  ? 'Uploading Queue...'
                  : uploadQueue.length === 0
                    ? 'Upload Scrapbook Pages'
                    : `Upload ${uploadQueue.length} Scrapbook Page${uploadQueue.length === 1 ? '' : 's'}`}
              </button>

              <button
                type="button"
                className="button compositeButton compositeButton--subtle"
                onClick={clearQueue}
                disabled={isUploading || uploadQueue.length === 0}
              >
                Clear Queue
              </button>

              {uploadQueue.length > 0 ? (
                <p className="compositeUploadForm__fileMeta">
                  {uploadQueue.length} file{uploadQueue.length === 1 ? '' : 's'} queued for {scrapbookYear || 'this scrapbook year'}.
                </p>
              ) : (
                <p className="compositeUploadForm__fileMeta">No files queued yet.</p>
              )}
            </div>

            {uploadQueue.length > 0 ? (
              <div className="scrapbookUploadQueue" aria-live="polite">
                {uploadQueue.map((queueItem) => (
                  <div key={queueItem.id} className="scrapbookUploadQueue__item">
                    <div className="scrapbookUploadQueue__details">
                      <p className="scrapbookUploadQueue__name">{queueItem.file.name}</p>
                      <p className="scrapbookUploadQueue__meta">
                        {formatFileSize(queueItem.file.size)} · {formatQueueItemStatus(queueItem)}
                      </p>
                      {queueItem.error ? (
                        <p className="compositeMessage compositeMessage--error">{queueItem.error}</p>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      className="button compositeButton compositeButton--subtle"
                      onClick={() => removeQueueItem(queueItem.id)}
                      disabled={isUploading}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {isUploading && uploadProgress ? (
              <p className="compositeMessage">{formatUploadProgress(uploadProgress)}</p>
            ) : null}
            {uploadSuccess ? <p className="compositeMessage">{uploadSuccess}</p> : null}
            {uploadError ? <p className="compositeMessage compositeMessage--error">{uploadError}</p> : null}
          </form>
        </article>

        <article className="compositePanel compositePanel--spacious">
          <div className="compositePanel__header">
            <div>
              <h2 className="compositePanel__title">Import Scrapbook Metadata</h2>
              <p className="compositePanel__description">
                Upload the scrapbook metadata CSV, review automatic member matches, and manually connect nickname tags to member profiles.
              </p>
            </div>
          </div>

          <form className="compositeUploadForm" onSubmit={handleMetadataImportSubmit}>
            <div className="compositeUploadForm__grid compositeUploadForm__grid--single">
              <label className="compositeField">
                <span className="compositeField__label">Metadata CSV</span>
                <input
                  key={metadataFileInputKey}
                  className="compositeField__input compositeField__input--file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleMetadataFileSelection}
                />
              </label>
            </div>

            <div className="compositeUploadForm__actions">
              <button
                type="submit"
                className="button compositeButton compositeButton--filled"
                disabled={isMetadataImporting || !metadataCsvFile}
              >
                {isMetadataImporting ? 'Importing Metadata...' : 'Import Metadata CSV'}
              </button>

              <p className="compositeUploadForm__fileMeta">
                {metadataCsvFile ? metadataCsvFile.name : 'No metadata CSV selected.'}
              </p>
            </div>
          </form>

          <div className="scrapbookMetadataReview">
            <div className="scrapbookMetadataReview__summary">
              {isMetadataLoading && !metadataProgress ? (
                <p className="compositeMessage">Loading scrapbook metadata matches...</p>
              ) : (
                <p className="compositeUploadForm__fileMeta">
                  {metadataReview
                    ? `${metadataReview.rowCount || 0} metadata row${(metadataReview.rowCount || 0) === 1 ? '' : 's'}, ${metadataReview.matchedCount || 0} profile match${(metadataReview.matchedCount || 0) === 1 ? '' : 'es'}, ${metadataReview.needsReviewCount || 0} name${(metadataReview.needsReviewCount || 0) === 1 ? '' : 's'} needing review.`
                    : 'No metadata review loaded yet.'}
                </p>
              )}

              <button
                type="button"
                className="button compositeButton compositeButton--filled"
                onClick={handleMetadataLinksSave}
                disabled={isMetadataLoading || isSavingMetadataLinks || !metadataReview}
              >
                {isSavingMetadataLinks ? 'Saving Matches...' : `Save Manual Matches (${unsavedManualLinkCount})`}
              </button>
            </div>

            {metadataProgress ? (
              <MetadataProgressBar
                label={metadataProgress.label}
                percent={metadataProgress.percent}
              />
            ) : null}

            {metadataSuccess ? <p className="compositeMessage">{metadataSuccess}</p> : null}
            {metadataError ? <p className="compositeMessage compositeMessage--error">{metadataError}</p> : null}

            {!isMetadataLoading && metadataReview && visibleMetadataRows.length === 0 ? (
              <div className="compositeEmptyState compositeEmptyState--tight">
                <h3 className="compositeEmptyState__title">No metadata rows for this year.</h3>
                <p className="compositeEmptyState__description">
                  Clear or change the scrapbook year field above to review a different set of imported metadata rows.
                </p>
              </div>
            ) : null}

            {visibleMetadataRows.length > 0 ? (
              <div className="scrapbookMetadataRows">
                {visibleMetadataRows.map((row) => (
                  <article key={row.identifier} className="scrapbookMetadataRow">
                    <div className="scrapbookMetadataRow__header">
                      <div>
                        <h3 className="scrapbookMetadataRow__title">{row.title || row.identifier}</h3>
                        <p className="compositeCard__meta">
                          {row.identifier}
                          {row.year ? ` | ${row.year}` : ''}
                          {row.category ? ` | ${row.category}` : ''}
                        </p>
                      </div>

                      {row.isUploaded ? (
                        <span className="compositeCard__pill">Uploaded page</span>
                      ) : (
                        <span className="compositeCard__pill compositeCard__pill--muted">Metadata only</span>
                      )}
                    </div>

                    {Array.isArray(row.people) && row.people.length > 0 ? (
                      <div className="scrapbookMetadataPeople">
                        {row.people.map((person) => {
                          const linkKey = buildManualLinkKey(row.identifier, person.rawName);
                          const hasManualOverride = Object.prototype.hasOwnProperty.call(manualProfileLinks, linkKey);
                          const selectedProfileId = hasManualOverride
                            ? manualProfileLinks[linkKey]
                            : person.profileId || '';

                          return (
                            <div key={linkKey} className="scrapbookMetadataPerson">
                              <div className="scrapbookMetadataPerson__details">
                                <p className="scrapbookMetadataPerson__name">{person.rawName}</p>
                                <p className="scrapbookMetadataPerson__meta">
                                  {formatMetadataPersonStatus(person, selectedProfileId)}
                                </p>
                              </div>

                              <ProfileSearchSelect
                                profiles={profiles}
                                selectedProfileId={selectedProfileId}
                                onSelectProfile={(profileId) => handleManualProfileSelect(row.identifier, person.rawName, profileId)}
                                inputId={`scrapbook-profile-${row.identifier}-${person.rawName}`.replace(/[^a-z0-9_-]/gi, '-')}
                                label={`Match ${person.rawName}`}
                                placeholder={`Search profile for ${person.rawName}`}
                                hideLabel
                                invalid={Boolean(person.needsReview && !selectedProfileId)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="compositeUploadForm__fileMeta">No member names listed in this metadata row.</p>
                    )}
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </article>

        <article className="compositePanel compositePanel--spacious">
          <div className="compositePanel__header">
            <div>
              <h2 className="compositePanel__title">Currently Available Scrapbooks</h2>
              <p className="compositePanel__description">
                Review uploaded scrapbook years, delete an entire scrapbook, or remove a single page from a book.
              </p>
            </div>
          </div>

          {listError ? <p className="compositeMessage compositeMessage--error">{listError}</p> : null}

          {isLoading ? <p className="compositeMessage">Loading current scrapbooks...</p> : null}

          {!isLoading && !listError && scrapbooks.length === 0 ? (
            <div className="compositeEmptyState">
              <h3 className="compositeEmptyState__title">No scrapbooks uploaded yet.</h3>
              <p className="compositeEmptyState__description">
                Uploaded scrapbooks will appear here so you can review and edit them later.
              </p>
            </div>
          ) : null}

          {!isLoading && scrapbooks.length > 0 ? (
            <div className="compositeCardGrid">
              {scrapbooks.map((scrapbook) => {
                const pageEntries = Array.isArray(scrapbook.pageEntries) ? scrapbook.pageEntries : [];

                return (
                  <article key={scrapbook.scrapbookId} className="compositeCard">
                    <div className="compositeCard__body">
                      <button
                        type="button"
                        className="scrapbookAdminCard__toggle"
                        onClick={() => toggleScrapbookExpanded(scrapbook.scrapbookId)}
                        aria-expanded={expandedScrapbookId === scrapbook.scrapbookId}
                      >
                        <div className="compositeCard__metaRow">
                          {scrapbook.scrapbookYear ? (
                            <span className="compositeCard__pill compositeCard__pill--year">
                              Scrapbook year {scrapbook.scrapbookYear}
                            </span>
                          ) : null}
                          <span className="compositeCard__pill">
                            {scrapbook.pageCount || pageEntries.length} page{(scrapbook.pageCount || pageEntries.length) === 1 ? '' : 's'}
                          </span>
                        </div>

                        <div className="scrapbookAdminCard__summary">
                          <div className="scrapbookAdminCard__copy">
                            <h3 className="compositeCard__title">{scrapbook.title}</h3>
                            <p className="compositeCard__meta">
                              Updated {formatDate(scrapbook.uploadTimestamp)}
                            </p>
                          </div>

                          <span className="scrapbookAdminCard__chevron" aria-hidden="true">
                            {expandedScrapbookId === scrapbook.scrapbookId ? '−' : '+'}
                          </span>
                        </div>
                      </button>

                      <div className="compositeCard__actions scrapbookAdminCard__actions">
                        <button
                          type="button"
                          className="button compositeButton compositeButton--danger"
                          onClick={() => handleDeleteScrapbook(scrapbook)}
                          disabled={deletingScrapbookId === scrapbook.scrapbookId}
                        >
                          {deletingScrapbookId === scrapbook.scrapbookId ? 'Deleting...' : 'Delete Scrapbook'}
                        </button>
                      </div>

                      {expandedScrapbookId === scrapbook.scrapbookId && pageEntries.length > 0 ? (
                        <div className="scrapbookAdminPages">
                          {pageEntries.map((pageEntry) => {
                            const pageKey = `${scrapbook.scrapbookId}:${pageEntry.pageId}`;

                            return (
                              <div key={pageKey} className="scrapbookAdminPages__item">
                                <div className="scrapbookAdminPages__preview">
                                  <img
                                    className="scrapbookAdminPages__image"
                                    src={pageEntry.imageUrl}
                                    alt={pageEntry.originalFilename || `${scrapbook.title} page`}
                                    loading="lazy"
                                  />
                                </div>

                                <div className="scrapbookAdminPages__details">
                                  <p className="scrapbookAdminPages__name">
                                    {pageEntry.originalFilename || pageEntry.pageId}
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  className="button compositeButton compositeButton--danger"
                                  onClick={() => handleDeletePage(scrapbook, pageEntry)}
                                  disabled={deletingPageKey === pageKey}
                                >
                                  {deletingPageKey === pageKey ? 'Deleting...' : 'Delete Page'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}

function buildManualProfileLinkState(review) {
  const nextState = {};

  (Array.isArray(review?.rows) ? review.rows : []).forEach((row) => {
    (Array.isArray(row.people) ? row.people : []).forEach((person) => {
      const linkKey = buildManualLinkKey(row.identifier, person.rawName);

      if (person.matchType === 'manual') {
        nextState[linkKey] = person.profileId || '';
      }
    });
  });

  return nextState;
}

function isAcceptedMetadataCsv(file) {
  return String(file?.name || '').trim().toLowerCase().endsWith('.csv');
}

function countUnsavedManualProfileLinks(currentLinks, savedLinks) {
  const currentKeys = Object.keys(currentLinks || {});
  const savedKeys = Object.keys(savedLinks || {});
  const allKeys = new Set([...currentKeys, ...savedKeys]);
  const unsavedNames = new Set();

  allKeys.forEach((key) => {
    const currentProfileId = String(currentLinks?.[key] || '');
    const savedProfileId = String(savedLinks?.[key] || '');

    if (currentProfileId !== savedProfileId) {
      unsavedNames.add(extractRawNameFromManualLinkKey(key));
    }
  });

  return unsavedNames.size;
}

function buildManualLinkKey(identifier, rawName) {
  return `${normalizeMetadataKey(identifier)}::${normalizeMetadataKey(rawName)}`;
}

function getMatchingManualLinkKeys(review, rawName) {
  const normalizedRawName = normalizeMetadataKey(rawName);

  return (Array.isArray(review?.rows) ? review.rows : []).flatMap((row) => (
    (Array.isArray(row.people) ? row.people : [])
      .filter((person) => normalizeMetadataKey(person.rawName) === normalizedRawName)
      .map((person) => buildManualLinkKey(row.identifier, person.rawName))
  ));
}

function extractRawNameFromManualLinkKey(linkKey) {
  return String(linkKey || '').split('::').slice(1).join('::') || String(linkKey || '');
}

function normalizeMetadataKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function buildMetadataImportMessage(review) {
  const rowCount = Number(review?.rowCount || 0);
  const peopleCount = Number(review?.peopleCount || 0);
  const needsReviewCount = Number(review?.needsReviewCount || 0);

  return `Imported ${rowCount} metadata row${rowCount === 1 ? '' : 's'} with ${peopleCount} member name${peopleCount === 1 ? '' : 's'}. ${needsReviewCount} need${needsReviewCount === 1 ? 's' : ''} manual review.`;
}

function formatMetadataPersonStatus(person, selectedProfileId) {
  if (!selectedProfileId) {
    return 'No profile match yet';
  }

  if (person.matchType === 'manual') {
    return `Manually matched to ${person.profile?.displayName || 'selected profile'}`;
  }

  if (person.profile?.displayName) {
    return `Automatically matched to ${person.profile.displayName}`;
  }

  return 'Matched to selected profile';
}

function MetadataProgressBar({ label, percent }) {
  const normalizedPercent = Math.min(Math.max(Math.round(Number(percent) || 0), 0), 100);

  return (
    <div className="scrapbookMetadataProgress" role="status" aria-live="polite">
      <div className="scrapbookMetadataProgress__header">
        <span>{label}</span>
        <strong>{normalizedPercent}%</strong>
      </div>
      <div
        className="scrapbookMetadataProgress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalizedPercent}
      >
        <span
          className="scrapbookMetadataProgress__bar"
          style={{ width: `${normalizedPercent}%` }}
        />
      </div>
    </div>
  );
}

function createQueueItem(file, nextQueueItemId) {
  const queueItemId = nextQueueItemId.current;
  nextQueueItemId.current += 1;

  return {
    id: queueItemId,
    file,
    status: 'queued',
    error: '',
    progress: null,
  };
}

function validateUploadQueue(uploadQueue, normalizedYear, scrapbooks) {
  if (uploadQueue.length === 0) {
    return 'Choose at least one scrapbook page image to continue.';
  }

  if (uploadQueue.length > maxQueuedScrapbookFiles) {
    return `Only ${maxQueuedScrapbookFiles} files can be uploaded at once.`;
  }

  if (!/^\d{4}$/.test(normalizedYear)) {
    return 'Enter a valid scrapbook year.';
  }

  if (Number(normalizedYear) < 1962 || Number(normalizedYear) > 9999) {
    return 'Enter a valid scrapbook year.';
  }

  const invalidFile = uploadQueue.find((queueItem) => !isAcceptedScrapbookImage(queueItem.file));

  if (invalidFile) {
    return `Please upload only JPG, JPEG, PNG, or WEBP scrapbook page images. ${invalidFile.file.name} is not supported.`;
  }

  const existingScrapbook = scrapbooks.find(
    (scrapbook) => String(scrapbook.scrapbookYear || '') === normalizedYear,
  );
  const existingFilenames = new Set(
    Array.isArray(existingScrapbook?.pageOriginalFilenames)
      ? existingScrapbook.pageOriginalFilenames.map((filename) => String(filename || '').toLowerCase())
      : [],
  );
  const queuedFilenames = new Set();

  for (const queueItem of uploadQueue) {
    const normalizedFileName = String(queueItem.file.name || '').toLowerCase();

    if (existingFilenames.has(normalizedFileName)) {
      return `A scrapbook page named ${queueItem.file.name} already exists for ${normalizedYear}. Rename that file and try again.`;
    }

    if (queuedFilenames.has(normalizedFileName)) {
      return `The queue includes ${queueItem.file.name} more than once. Remove the duplicate and try again.`;
    }

    queuedFilenames.add(normalizedFileName);
  }

  return '';
}

function isAcceptedScrapbookImage(file) {
  const normalizedFileName = String(file?.name || '').toLowerCase();
  return acceptedFileExtensions.some((extension) => normalizedFileName.endsWith(extension));
}

function formatQueueItemStatus(queueItem) {
  switch (queueItem.status) {
    case 'uploading':
      return 'Uploading now';
    case 'uploaded':
      return 'Uploaded';
    case 'failed':
      return 'Failed';
    default:
      return 'Queued';
  }
}

function formatDate(value) {
  if (!value) {
    return 'recently';
  }

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
  const activeFileName = String(uploadProgress?.fileName || '').trim();
  const currentFileNumber = Number(uploadProgress?.queueIndex) + 1;
  const totalFiles = Math.max(Number(uploadProgress?.totalFiles || 0), 1);

  return `Uploading file ${currentFileNumber} of ${totalFiles}${activeFileName ? `: ${activeFileName}` : ''}. ${formatFileSize(uploadedBytes)} of ${formatFileSize(totalBytes)} transferred (${uploadPercent}%, chunk ${completedChunks} of ${totalChunks}).`;
}

function buildUploadSuccessMessage({ uploadedFileNames, failedUploads, scrapbookTitle, isCreatingNewScrapbook }) {
  if (uploadedFileNames.length === 0) {
    return '';
  }

  const uploadedCount = uploadedFileNames.length;
  const pageLabel = uploadedCount === 1 ? 'page' : 'pages';

  if (failedUploads.length > 0) {
    return `Uploaded ${uploadedCount} ${pageLabel} to ${scrapbookTitle}.`;
  }

  if (isCreatingNewScrapbook) {
    return `Created ${scrapbookTitle} and uploaded ${uploadedCount} ${pageLabel}.`;
  }

  return `Uploaded ${uploadedCount} ${pageLabel} to ${scrapbookTitle}.`;
}

function buildUploadFailureMessage(failedUploads) {
  if (failedUploads.length === 0) {
    return '';
  }

  const failedCount = failedUploads.length;
  const fileLabel = failedCount === 1 ? 'file' : 'files';
  const fileNames = failedUploads.slice(0, 2).map((failedUpload) => failedUpload.fileName).join(', ');
  const remainderCount = failedCount - Math.min(failedUploads.length, 2);
  const remainderText = remainderCount > 0 ? `, and ${remainderCount} more` : '';

  return `Unable to upload ${failedCount} ${fileLabel}: ${fileNames}${remainderText}.`;
}

function sortScrapbooks(scrapbookRecords) {
  return [...scrapbookRecords].sort((leftValue, rightValue) => {
    const leftYear = Number(leftValue?.scrapbookYear || 0);
    const rightYear = Number(rightValue?.scrapbookYear || 0);

    if (leftYear !== rightYear) {
      return leftYear - rightYear;
    }

    return String(leftValue?.title || '').localeCompare(String(rightValue?.title || ''));
  });
}
