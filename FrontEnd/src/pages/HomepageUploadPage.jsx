import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  getHomepageContent,
  updateHomepageContent,
  uploadHomepageContent,
} from '../api/composites.js';
import {
  HOMEPAGE_SITE_EYEBROW,
  DEFAULT_HOMEPAGE_TITLE,
  loadStoredHomepageContent,
  normalizeHomepageContent,
  persistHomepageContent,
} from '../constants/homepageContent.js';
import '../styles/composites.css';

const acceptedTypes = '.jpg,.jpeg,.png,.webp';
const initialHomepageContent = loadStoredHomepageContent() || normalizeHomepageContent(null);

export default function HomepageUploadPage() {
  const [formValues, setFormValues] = useState(() => buildFormValues(initialHomepageContent));
  const [homepageContent, setHomepageContent] = useState(() => initialHomepageContent);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState('');
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [statusError, setStatusError] = useState('');
  const [statusSummary, setStatusSummary] = useState('');
  const [uploadProgress, setUploadProgress] = useState(null);

  useEffect(() => {
    let isActive = true;

    const loadContent = async () => {
      setIsLoading(true);
      setLoadError('');

      try {
        const loadedHomepageContent = normalizeHomepageContent(await getHomepageContent());

        if (!isActive) {
          return;
        }

        setHomepageContent(loadedHomepageContent);
        setFormValues(buildFormValues(loadedHomepageContent));
        persistHomepageContent(loadedHomepageContent);
      } catch (error) {
        if (!isActive) {
          return;
        }

        const fallbackHomepageContent = normalizeHomepageContent(null);
        setHomepageContent(fallbackHomepageContent);
        setFormValues(buildFormValues(fallbackHomepageContent));
        setLoadError(`${error.message} Showing the bundled homepage defaults instead.`);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadContent();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedFile) {
      setSelectedFilePreviewUrl('');
      return undefined;
    }

    const nextPreviewUrl = URL.createObjectURL(selectedFile);
    setSelectedFilePreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [selectedFile]);

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
    setUploadProgress(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setStatusError('');
    setStatusSummary('');
    setUploadProgress(null);
    setIsSaving(true);

    try {
      const normalizedDescription = validateRequiredField(
        formValues.description,
        'Enter a homepage description before saving.',
      );

      const savedHomepageContent = normalizeHomepageContent(selectedFile
        ? await saveWithImage(selectedFile, normalizedDescription, setUploadProgress)
        : await updateHomepageContent({
          title: DEFAULT_HOMEPAGE_TITLE,
          description: normalizedDescription,
        }));

      setHomepageContent(savedHomepageContent);
      setFormValues(buildFormValues(savedHomepageContent));
      persistHomepageContent(savedHomepageContent);
      setSelectedFile(null);
      setFileInputKey((currentValue) => currentValue + 1);
      setLoadError('');
      setUploadProgress(null);
      setStatusSummary(
        selectedFile
          ? 'Saved the homepage content and uploaded a new hero image.'
          : 'Saved the homepage description.',
      );
    } catch (error) {
      setStatusError(error.message);
      setUploadProgress(null);
    } finally {
      setIsSaving(false);
    }
  };

  const previewDescription = formValues.description.trim() || homepageContent.description;
  const previewImageUrl = selectedFilePreviewUrl || homepageContent.imageUrl;

  return (
    <section className="section compositeAdmin">
      <div className="container">
        <div className="compositePageHeader">
          <p className="compositePageHeader__eyebrow">Admin Upload Flow</p>
          <h1 className="compositePageHeader__title">Edit Homepage Hero</h1>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <Link className="button compositeButton" to="/upload">
            Back to upload options
          </Link>
        </div>

        <article className="compositePanel compositePanel--spacious">
          <div className="compositePanel__header">
            <div>
              <h2 className="compositePanel__title">Homepage Content</h2>
              <p className="compositePanel__description">
                Use the options below to edit the hero image and description. The site title is fixed.
              </p>
            </div>
          </div>

          <form className="compositeUploadForm" onSubmit={handleSubmit}>
            <div className="profileManagerGrid">
              <label className="compositeField">
                <span className="compositeField__label">Hero Image</span>
                <input
                  key={fileInputKey}
                  className="compositeField__input compositeField__input--file"
                  type="file"
                  accept={acceptedTypes}
                  onChange={(event) => handleFileSelection(event.target.files?.[0] || null)}
                />
              </label>

              <label className="compositeField">
                <span className="compositeField__label">Site Title</span>
                <input
                  className="compositeField__input"
                  type="text"
                  value={DEFAULT_HOMEPAGE_TITLE}
                  readOnly
                  aria-readonly="true"
                />
              </label>

              <label className="compositeField profileManagerGrid__fullWidth">
                <span className="compositeField__label">Homepage Description</span>
                <textarea
                  className="compositeField__input compositeField__textarea"
                  name="description"
                  placeholder="write the homepage description shown in the hero"
                  rows={6}
                  value={formValues.description}
                  onChange={handleFieldChange}
                />
              </label>
            </div>

            <div className="compositeUploadForm__actions">
              <button
                type="submit"
                className="button compositeButton compositeButton--filled"
                disabled={isSaving}
              >
                {isSaving
                  ? selectedFile
                    ? 'Saving Homepage in Chunks...'
                    : 'Saving Homepage...'
                  : selectedFile
                    ? 'Save Homepage and Upload Image'
                    : 'Save Homepage Content'}
              </button>

              {selectedFile ? (
                <p className="compositeUploadForm__fileMeta">
                  Selected file: <strong>{selectedFile.name}</strong> ({formatFileSize(selectedFile.size)})
                </p>
              ) : (
                <p className="compositeUploadForm__fileMeta">
                  No new image selected. Saving now will keep the current hero image.
                </p>
              )}
            </div>

            {uploadProgress ? <p className="compositeMessage">{formatUploadProgress(uploadProgress)}</p> : null}
            {statusSummary ? (
              <p className="compositeMessage compositeMessage--success">{statusSummary}</p>
            ) : null}
            {statusError ? <p className="compositeMessage compositeMessage--error">{statusError}</p> : null}
          </form>
        </article>

        <article className="compositePanel compositePanel--spacious">
          <div className="compositePanel__header">
            <div>
              <h2 className="compositePanel__title">Live Homepage Preview</h2>
            </div>
          </div>

          {isLoading ? <p className="compositeMessage">Loading saved homepage content...</p> : null}
          {loadError ? <p className="compositeMessage compositeMessage--warning">{loadError}</p> : null}

            <div className="homepageEditorPreview">
              <div className="homepageEditorPreview__media">
                <img
                  className="homepageEditorPreview__image"
                src={previewImageUrl}
                alt={homepageContent.imageAlt}
              />
            </div>

            <div className="homepageEditorPreview__content">
              <div>
                <p className="homepageEditorPreview__eyebrow">{HOMEPAGE_SITE_EYEBROW}</p>
                <h2 className="homepageEditorPreview__title">{DEFAULT_HOMEPAGE_TITLE}</h2>
                <p className="homepageEditorPreview__description">{previewDescription}</p>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

async function saveWithImage(file, description, onProgress) {
  await validateImageFile(file);

  return uploadHomepageContent(file, DEFAULT_HOMEPAGE_TITLE, description, {
    onProgress,
  });
}

function buildFormValues(homepageContent) {
  return {
    description: homepageContent.description,
  };
}

function validateRequiredField(value, emptyMessage) {
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    throw new Error(emptyMessage);
  }

  return normalizedValue;
}

async function validateImageFile(file) {
  const normalizedFileName = file.name.trim().toLowerCase();
  const isAcceptedExtension = ['.jpg', '.jpeg', '.png', '.webp'].some((extension) =>
    normalizedFileName.endsWith(extension),
  );
  const isAcceptedMimeType = !file.type || file.type.startsWith('image/');

  if (!isAcceptedExtension || !isAcceptedMimeType) {
    throw new Error('Choose a valid JPG, JPEG, PNG, or WEBP image file.');
  }

  if (file.size <= 0) {
    throw new Error('The selected image file is empty.');
  }

  await file.slice(0, 1).arrayBuffer();
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
