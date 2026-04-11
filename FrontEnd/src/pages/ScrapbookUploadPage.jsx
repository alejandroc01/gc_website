import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import CompositeCopyrightNotice from '../components/Composite/CompositeCopyrightNotice.jsx';
import {
  deleteScrapbook as deleteScrapbookRequest,
  deleteScrapbookPage as deleteScrapbookPageRequest,
  getScrapbooks,
  uploadScrapbook,
} from '../api/composites.js';
import '../styles/composites.css';

const acceptedTypes = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

export default function ScrapbookUploadPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [scrapbookYear, setScrapbookYear] = useState('');
  const [scrapbooks, setScrapbooks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingScrapbookId, setDeletingScrapbookId] = useState(null);
  const [deletingPageKey, setDeletingPageKey] = useState('');
  const [expandedScrapbookId, setExpandedScrapbookId] = useState('');
  const [listError, setListError] = useState('');
  const [uploadError, setUploadError] = useState('');
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

  const handleUploadSubmit = async (event) => {
    event.preventDefault();
    const normalizedYear = scrapbookYear.trim();

    if (!selectedFile) {
      setUploadError('Choose a JPG or JPEG scrapbook page image to continue.');
      return;
    }

    // Safety check: require a numeric four-digit year like 2012 before upload.
    if (!/^\d{4}$/.test(normalizedYear)) {
      setUploadError('Enter a valid scrapbook year.');
      return;
    }

    if (Number(normalizedYear) < 1962 || Number(normalizedYear) > 9999) {
      setUploadError('Enter a valid scrapbook year.');
      return;
    }

    const normalizedFileName = String(selectedFile.name || '').toLowerCase();
    const isAcceptedImage = ['.jpg', '.jpeg', '.png', '.webp'].some((extension) => normalizedFileName.endsWith(extension));

    if (!isAcceptedImage) {
      setUploadError('Please upload a JPG or JPEG scrapbook page image.');
      return;
    }

    const existingScrapbook = scrapbooks.find(
      (scrapbook) => String(scrapbook.scrapbookYear || '') === normalizedYear,
    );
    const isCreatingNewScrapbook = !existingScrapbook;
    const hasDuplicateFilename = Array.isArray(existingScrapbook?.pageOriginalFilenames)
      && existingScrapbook.pageOriginalFilenames.some(
        (filename) => String(filename || '').toLowerCase() === normalizedFileName,
      );

    if (hasDuplicateFilename) {
      setUploadError('A scrapbook page with that filename already exists. Please rename the file and try again.');
      return;
    }

    setUploadError('');
    setUploadSuccess('');
    setListError('');
    setIsUploading(true);
    setUploadProgress(null);

    try {
      const createdScrapbook = await uploadScrapbook(selectedFile, normalizedYear, {
        onProgress: (nextProgress) => setUploadProgress(nextProgress),
      });

      setScrapbooks((currentScrapbooks) => {
        const remainingScrapbooks = currentScrapbooks.filter(
          (entry) => entry.scrapbookId !== createdScrapbook.scrapbookId,
        );

        return sortScrapbooks([createdScrapbook, ...remainingScrapbooks]);
      });
      setExpandedScrapbookId(createdScrapbook.scrapbookId);
      setSelectedFile(null);
      setScrapbookYear('');
      setUploadSuccess(
        isCreatingNewScrapbook
          ? `Created ${createdScrapbook.title} and added ${selectedFile.name}.`
          : `Added ${selectedFile.name} to ${createdScrapbook.title}.`,
      );
      setUploadProgress(null);
      setIsUploading(false);
    } catch (error) {
      setUploadError(error.message);
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
            Upload one scrapbook page at a time. The archive stores each page image with its scrapbook
            year so it can be displayed in the public viewer.
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
              <h2 className="compositePanel__title">Upload a New Scrapbook</h2>
              <p className="compositePanel__description">
                Accepted formats: JPG and JPEG. Use format <em>1991ScrapB-P2</em>.
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
                <span className="compositeField__label">Scrapbook page image</span>
                <input
                  className="compositeField__input compositeField__input--file"
                  type="file"
                  accept={acceptedTypes}
                  onChange={(event) => {
                    setSelectedFile(event.target.files?.[0] || null);
                    setUploadError('');
                    setUploadSuccess('');
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
                {isUploading ? 'Uploading Page...' : 'Upload Scrapbook Page'}
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
            {uploadSuccess ? <p className="compositeMessage">{uploadSuccess}</p> : null}
            {uploadError ? <p className="compositeMessage compositeMessage--error">{uploadError}</p> : null}
          </form>
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

  return `Uploading ${formatFileSize(uploadedBytes)} of ${formatFileSize(totalBytes)} (${uploadPercent}%, chunk ${completedChunks} of ${totalChunks}).`;
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
