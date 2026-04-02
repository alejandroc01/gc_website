import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import CompositeCopyrightNotice from '../components/Composite/CompositeCopyrightNotice.jsx';
import {
  deleteScrapbook as deleteScrapbookRequest,
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

        setScrapbooks(scrapbookRecords);
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

    setUploadError('');
    setUploadSuccess('');
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

        return [createdScrapbook, ...remainingScrapbooks];
      });
      setSelectedFile(null);
      setScrapbookYear('');
      setUploadSuccess(`Added ${selectedFile.name} to ${createdScrapbook.title}.`);
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
      `Delete ${scrapbook.title || scrapbook.originalFilename}? This removes the stored PDF and generated page images.`,
    );

    if (!confirmed) {
      return;
    }

    setListError('');
    setDeletingScrapbookId(scrapbook.scrapbookId);

    try {
      await deleteScrapbookRequest(scrapbook.scrapbookId);
      setScrapbooks((currentScrapbooks) =>
        currentScrapbooks.filter((entry) => entry.scrapbookId !== scrapbook.scrapbookId),
      );
    } catch (error) {
      setListError(error.message);
    } finally {
      setDeletingScrapbookId(null);
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
              <h2 className="compositePanel__title">Previously Uploaded Scrapbooks</h2>
              <p className="compositePanel__description">
                These scrapbook collections are already available from the scrapbook shelf page.
              </p>
            </div>
          </div>

          {listError ? <p className="compositeMessage compositeMessage--error">{listError}</p> : null}
          {isLoading ? <p className="compositeMessage">Loading saved scrapbooks...</p> : null}

          {!isLoading && !listError && scrapbooks.length === 0 ? (
            <div className="compositeEmptyState">
              <h3 className="compositeEmptyState__title">No scrapbook pages uploaded yet.</h3>
              <p className="compositeEmptyState__description">
                Uploaded scrapbook page images will appear here after they are grouped into a scrapbook year.
              </p>
            </div>
          ) : null}

          {!isLoading && scrapbooks.length > 0 ? (
            <div className="compositeCardGrid">
              {scrapbooks.map((scrapbook) => (
                <article key={scrapbook.scrapbookId} className="compositeCard">
                  <div className="compositeCard__media">
                    {scrapbook.pageImageUrls?.[0] ? (
                      <img
                        className="compositeCard__image"
                        src={scrapbook.pageImageUrls[0]}
                        alt={`${scrapbook.title} cover preview`}
                        loading="lazy"
                      />
                    ) : (
                      <div className="compositeCard__image" style={{ display: 'grid', placeItems: 'center' }}>
                        Page
                      </div>
                    )}
                  </div>

                  <div className="compositeCard__body">
                    <div className="compositeCard__metaRow">
                      {scrapbook.scrapbookYear ? (
                        <span className="compositeCard__pill compositeCard__pill--year">
                          Year {scrapbook.scrapbookYear}
                        </span>
                      ) : null}
                      <span className="compositeCard__pill">
                        {scrapbook.pageCount || scrapbook.pageImageUrls?.length || 0} pages
                      </span>
                    </div>

                    <h3 className="compositeCard__title">
                      {scrapbook.title || scrapbook.originalFilename}
                    </h3>
                    <p className="compositeCard__sourceName">{scrapbook.originalFilename}</p>
                    <p className="compositeCard__meta">
                      Uploaded {formatDate(scrapbook.uploadTimestamp)}
                    </p>

                    <div className="compositeCard__actions">
                      <Link className="button compositeButton" to="/scrapbooks">
                        Open shelf
                      </Link>
                      <button
                        type="button"
                        className="button compositeButton compositeButton--danger"
                        onClick={() => handleDeleteScrapbook(scrapbook)}
                        disabled={deletingScrapbookId === scrapbook.scrapbookId}
                      >
                        {deletingScrapbookId === scrapbook.scrapbookId ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </article>
      </div>
    </section>
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
