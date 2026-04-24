import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import CompositeCopyrightNotice from '../components/Composite/CompositeCopyrightNotice.jsx';
import {
  deleteComposite as deleteCompositeRequest,
  getComposites,
  uploadComposite,
} from '../api/composites.js';
import '../styles/composites.css';

const acceptedTypes = '.jpg,.jpeg,.png,.webp';

export default function CompositeUploadPage() {
  const navigate = useNavigate();
  const [selectedFile, setSelectedFile] = useState(null);
  const [compositeYear, setCompositeYear] = useState('');
  const [composites, setComposites] = useState([]);
  const [compositeSearchQuery, setCompositeSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingCompositeId, setDeletingCompositeId] = useState(null);
  const [listError, setListError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(null);

  useEffect(() => {
    let isActive = true;

    const loadComposites = async () => {
      setIsLoading(true);
      setListError('');

      try {
        const compositeRecords = await getComposites();

        if (!isActive) {
          return;
        }

        setComposites(compositeRecords);
      } catch (error) {
        if (isActive) {
          setListError(error.message);
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
    () => [...composites].sort(compareCompositesByYearDescending),
    [composites],
  );

  const filteredComposites = useMemo(() => {
    const normalizedQuery = compositeSearchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return sortedComposites;
    }

    return sortedComposites.filter((composite) =>
      compositeMatchesSearch(composite, normalizedQuery),
    );
  }, [compositeSearchQuery, sortedComposites]);

  const handleUploadSubmit = async (event) => {
    event.preventDefault();
    const normalizedYear = compositeYear.trim();

    if (!selectedFile) {
      setUploadError('Choose a JPG, JPEG, PNG, or WEBP file to continue.');
      return;
    }

    if (!/^\d{4}$/.test(normalizedYear)) {
      setUploadError('Enter the four-digit composite year before uploading.');
      return;
    }

    if (composites.some((composite) => String(composite.compositeYear || '') === normalizedYear)) {
      setUploadError(`A composite for ${normalizedYear} already exists. Delete it first or use a different year.`);
      return;
    }

    setUploadError('');
    setIsUploading(true);
    setUploadProgress(null);

    try {
      const createdComposite = await uploadComposite(selectedFile, normalizedYear, {
        onProgress: (nextProgress) => setUploadProgress(nextProgress),
      });
      navigate(`/upload/composites/${createdComposite.compositeId}`);
    } catch (error) {
      setUploadError(error.message);
      setUploadProgress(null);
      setIsUploading(false);
    }
  };

  const handleDeleteComposite = async (composite) => {
    const confirmed = window.confirm(
      `Delete ${composite.displayName || composite.originalFilename}? This removes the uploaded image and its annotations.`,
    );

    if (!confirmed) {
      return;
    }

    setListError('');
    setDeletingCompositeId(composite.compositeId);

    try {
      await deleteCompositeRequest(composite.compositeId);
      setComposites((currentComposites) =>
        currentComposites.filter((entry) => entry.compositeId !== composite.compositeId),
      );
    } catch (error) {
      setListError(error.message);
    } finally {
      setDeletingCompositeId(null);
    }
  };

  return (
    <section className="section compositeAdmin">
      <div className="container">
        <div className="compositePageHeader">
          <p className="compositePageHeader__eyebrow">Admin Upload Flow</p>
          <h1 className="compositePageHeader__title">Composite Upload</h1>
          <p className="compositePageHeader__description">
            Upload a class composite, then annotate each portrait manually. The archive stores only the
            original image and portrait coordinates for licensing compliance.
          </p>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <Link className="button compositeButton" to="/upload">
            Back to upload options
          </Link>
        </div>

        <CompositeCopyrightNotice className="compositeUpload__copyrightNotice" />

        <article className="compositePanel compositePanel--spacious">
          <div className="compositePanel__header">
            <div>
              <h2 className="compositePanel__title">Upload a New Composite</h2>
              <p className="compositePanel__description">
                Accepted formats: JPG, JPEG, PNG, and WEBP. After upload, you will be taken directly to
                the annotation editor.
              </p>
            </div>
          </div>

          <form className="compositeUploadForm" onSubmit={handleUploadSubmit}>
            <div className="compositeUploadForm__grid">
              <label className="compositeField">
                <span className="compositeField__label">Composite year</span>
                <input
                  className="compositeField__input"
                  type="text"
                  inputMode="numeric"
                  placeholder="enter year"
                  maxLength={4}
                  value={compositeYear}
                  onChange={(event) => {
                    setCompositeYear(event.target.value.replace(/[^\d]/g, '').slice(0, 4));
                    setUploadError('');
                    setUploadProgress(null);
                  }}
                />
              </label>

              <label className="compositeField">
                <span className="compositeField__label">Composite image</span>
                <input
                  className="compositeField__input compositeField__input--file"
                  type="file"
                  accept={acceptedTypes}
                  onChange={(event) => {
                    setSelectedFile(event.target.files?.[0] || null);
                    setUploadError('');
                    setUploadProgress(null);
                  }}
                />
              </label>
            </div>

            <div className="compositeUploadForm__actions">
              <button
                type="submit"
                className="button compositeButton compositeButton--filled"
                disabled={isUploading}
              >
                {isUploading ? 'Uploading in Chunks...' : 'Upload and Annotate'}
              </button>

              {selectedFile ? (
                <p className="compositeUploadForm__fileMeta">
                  Selected file: <strong>{selectedFile.name}</strong> ({formatFileSize(selectedFile.size)})
                </p>
              ) : (
                <p className="compositeUploadForm__fileMeta">No file selected yet.</p>
              )}
            </div>

            {isUploading && uploadProgress ? (
              <p className="compositeMessage">{formatUploadProgress(uploadProgress)}</p>
            ) : null}
            {uploadError ? <p className="compositeMessage compositeMessage--error">{uploadError}</p> : null}
          </form>
        </article>

        <article className="compositePanel compositePanel--spacious">
          <div className="compositePanel__header">
            <div>
              <h2 className="compositePanel__title">Previously Uploaded Composites</h2>
              <p className="compositePanel__description">
                Reopen any saved composite to continue assigning portraits and profiles.
              </p>
            </div>
          </div>

          {!isLoading && composites.length > 0 ? (
            <div className="compositeUploadListControls">
              <label className="compositeField compositeUploadListControls__search">
                <span className="compositeField__label">Filter composites</span>
                <input
                  className="compositeField__input"
                  type="search"
                  placeholder="Search by year or filename"
                  value={compositeSearchQuery}
                  onChange={(event) => setCompositeSearchQuery(event.target.value)}
                />
              </label>
              <p className="compositeUploadListControls__count">
                Showing {filteredComposites.length} of {composites.length}
              </p>
            </div>
          ) : null}

          {listError ? <p className="compositeMessage compositeMessage--error">{listError}</p> : null}

          {isLoading ? <p className="compositeMessage">Loading saved composites...</p> : null}

          {!isLoading && !listError && composites.length === 0 ? (
            <div className="compositeEmptyState">
              <h3 className="compositeEmptyState__title">No composites uploaded yet.</h3>
              <p className="compositeEmptyState__description">
                Your first uploaded image will appear here with a thumbnail preview and annotation count.
              </p>
            </div>
          ) : null}

          {!isLoading && !listError && composites.length > 0 && filteredComposites.length === 0 ? (
            <div className="compositeEmptyState">
              <h3 className="compositeEmptyState__title">No composites match your search.</h3>
              <p className="compositeEmptyState__description">
                Try searching by a different year, file name, or display name.
              </p>
            </div>
          ) : null}

          {!isLoading && filteredComposites.length > 0 ? (
            <div className="compositeUploadListScrollbox">
              <div className="compositeCardGrid">
                {filteredComposites.map((composite) => (
                  <article key={composite.compositeId} className="compositeCard">
                    <div className="compositeCard__media">
                      <img
                        className="compositeCard__image"
                        src={composite.imageUrl}
                        alt={composite.originalFilename}
                        loading="lazy"
                      />
                    </div>

                    <div className="compositeCard__body">
                      <div className="compositeCard__metaRow">
                        {composite.compositeYear ? (
                          <span className="compositeCard__pill compositeCard__pill--year">
                            Class year {composite.compositeYear}
                          </span>
                        ) : null}
                        <span className="compositeCard__pill">
                          {composite.annotationCount} annotation{composite.annotationCount === 1 ? '' : 's'}
                        </span>
                      </div>

                      <h3 className="compositeCard__title">
                        {composite.displayName || composite.originalFilename}
                      </h3>
                      <p className="compositeCard__sourceName">{composite.originalFilename}</p>
                      <p className="compositeCard__meta">
                        Uploaded {formatDate(composite.uploadTimestamp)}
                      </p>

                      <div className="compositeCard__actions">
                        <Link className="button compositeButton" to={`/upload/composites/${composite.compositeId}`}>
                          Continue annotating
                        </Link>
                        <button
                          type="button"
                          className="button compositeButton compositeButton--danger"
                          onClick={() => handleDeleteComposite(composite)}
                          disabled={deletingCompositeId === composite.compositeId}
                        >
                          {deletingCompositeId === composite.compositeId ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      </div>
    </section>
  );
}

function compareCompositesByYearDescending(firstComposite, secondComposite) {
  const yearDifference =
    getCompositeSortYear(secondComposite) - getCompositeSortYear(firstComposite);

  if (yearDifference !== 0) {
    return yearDifference;
  }

  const timeDifference =
    getCompositeSortTime(secondComposite) - getCompositeSortTime(firstComposite);

  if (timeDifference !== 0) {
    return timeDifference;
  }

  return getCompositeSearchTitle(firstComposite).localeCompare(
    getCompositeSearchTitle(secondComposite),
    undefined,
    { numeric: true, sensitivity: 'base' },
  );
}

function getCompositeSortYear(composite) {
  const year = Number.parseInt(composite?.compositeYear, 10);
  return Number.isFinite(year) ? year : Number.NEGATIVE_INFINITY;
}

function getCompositeSortTime(composite) {
  const timestamp = Date.parse(composite?.uploadTimestamp || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getCompositeSearchTitle(composite) {
  return String(composite?.displayName || composite?.originalFilename || '');
}

function compositeMatchesSearch(composite, normalizedQuery) {
  const annotationCount = Number(composite?.annotationCount || 0);
  const searchableValues = [
    composite?.compositeYear,
    composite?.displayName,
    composite?.originalFilename,
    composite?.uploadTimestamp,
    `${annotationCount} annotation${annotationCount === 1 ? '' : 's'}`,
  ];

  return searchableValues.some((value) =>
    String(value || '').toLowerCase().includes(normalizedQuery),
  );
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

  return `Uploading ${formatFileSize(uploadedBytes)} of ${formatFileSize(totalBytes)} (${uploadPercent}%, chunk ${completedChunks} of ${totalChunks}).`;
}
