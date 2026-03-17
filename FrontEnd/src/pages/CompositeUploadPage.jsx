import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingCompositeId, setDeletingCompositeId] = useState(null);
  const [listError, setListError] = useState('');
  const [uploadError, setUploadError] = useState('');

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

    try {
      const createdComposite = await uploadComposite(selectedFile, normalizedYear);
      navigate(`/upload/composites/${createdComposite.compositeId}`);
    } catch (error) {
      setUploadError(error.message);
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
                {isUploading ? 'Uploading...' : 'Upload and Annotate'}
              </button>

              {selectedFile ? (
                <p className="compositeUploadForm__fileMeta">
                  Selected file: <strong>{selectedFile.name}</strong>
                </p>
              ) : (
                <p className="compositeUploadForm__fileMeta">No file selected yet.</p>
              )}
            </div>

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

          {!isLoading && composites.length > 0 ? (
            <div className="compositeCardGrid">
              {composites.map((composite) => (
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
