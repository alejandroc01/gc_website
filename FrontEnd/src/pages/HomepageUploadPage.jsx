import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  getHomepageContent,
  updateHomepageContent,
  uploadHomepageContent,
} from '../api/composites.js';
import {
  HOMEPAGE_FONT_OPTIONS,
  buildHomepageTextStyle,
  loadStoredHomepageContent,
  normalizeHomepageContent,
  normalizeHomepageTextStyles,
  persistHomepageContent,
} from '../constants/homepageContent.js';
import '../styles/composites.css';

const acceptedTypes = '.jpg,.jpeg,.png,.webp';
const initialHomepageContent = loadStoredHomepageContent() || normalizeHomepageContent(null);
const homepageTextEditorFields = [
  {
    key: 'eyebrow',
    label: 'Eyebrow Text',
    placeholder: 'German Club of Virginia Tech',
    rows: 1,
    minSize: 10,
    maxSize: 40,
  },
  {
    key: 'title',
    label: 'Site Title',
    placeholder: 'Digital Archives',
    rows: 1,
    minSize: 24,
    maxSize: 96,
  },
  {
    key: 'description',
    label: 'Homepage Description',
    placeholder: 'Write the homepage description shown in the hero',
    rows: 6,
    minSize: 12,
    maxSize: 42,
  },
];

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

  const handleTextStyleChange = (styleKey, propertyName, nextValue) => {
    setFormValues((currentValues) => ({
      ...currentValues,
      textStyles: normalizeHomepageTextStyles({
        ...currentValues.textStyles,
        [styleKey]: {
          ...currentValues.textStyles?.[styleKey],
          [propertyName]: nextValue,
        },
      }),
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
      const normalizedEyebrow = validateRequiredField(
        formValues.eyebrow,
        'Enter the eyebrow text before saving.',
      );
      const normalizedTitle = validateRequiredField(
        formValues.title,
        'Enter a homepage title before saving.',
      );
      const normalizedDescription = validateRequiredField(
        formValues.description,
        'Enter a homepage description before saving.',
      );
      const homepageMetadata = {
        eyebrow: normalizedEyebrow,
        title: normalizedTitle,
        description: normalizedDescription,
        textStyles: normalizeHomepageTextStyles(formValues.textStyles),
      };

      const savedHomepageContent = normalizeHomepageContent(selectedFile
        ? await saveWithImage(selectedFile, homepageMetadata, setUploadProgress)
        : await updateHomepageContent(homepageMetadata));

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
          : 'Saved the homepage content.',
      );
    } catch (error) {
      setStatusError(error.message);
      setUploadProgress(null);
    } finally {
      setIsSaving(false);
    }
  };

  const previewEyebrow = formValues.eyebrow.trim() || homepageContent.eyebrow;
  const previewTitle = formValues.title.trim() || homepageContent.title;
  const previewDescription = formValues.description.trim() || homepageContent.description;
  const previewTextStyles = normalizeHomepageTextStyles(formValues.textStyles);
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
            Back to Admin Tools
          </Link>
        </div>

        <article className="compositePanel compositePanel--spacious">
          <div className="compositePanel__header">
            <div>
              <h2 className="compositePanel__title">Homepage Content</h2>
              <p className="compositePanel__description">
                Edit the hero image, copy, and text styling.
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

              <div className="homepageTextEditor profileManagerGrid__fullWidth">
                {homepageTextEditorFields.map((field) => (
                  <HomepageTextEditorField
                    key={field.key}
                    field={field}
                    value={formValues[field.key]}
                    textStyle={previewTextStyles[field.key]}
                    onFieldChange={handleFieldChange}
                    onStyleChange={handleTextStyleChange}
                  />
                ))}
              </div>
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
                <p
                  className="homepageEditorPreview__eyebrow"
                  style={buildHomepageTextStyle(previewTextStyles.eyebrow, 'eyebrow')}
                >
                  {previewEyebrow}
                </p>
                <h2
                  className="homepageEditorPreview__title"
                  style={buildHomepageTextStyle(previewTextStyles.title, 'title')}
                >
                  {previewTitle}
                </h2>
                <p
                  className="homepageEditorPreview__description"
                  style={buildHomepageTextStyle(previewTextStyles.description, 'description')}
                >
                  {previewDescription}
                </p>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

function HomepageTextEditorField({
  field,
  value,
  textStyle,
  onFieldChange,
  onStyleChange,
}) {
  const fieldId = `homepage-${field.key}-text`;

  return (
    <div className="homepageTextEditor__block">
      <label className="compositeField" htmlFor={fieldId}>
        <span className="compositeField__label">{field.label}</span>
        {field.rows > 1 ? (
          <textarea
            id={fieldId}
            className="compositeField__input compositeField__textarea"
            name={field.key}
            placeholder={field.placeholder}
            rows={field.rows}
            value={value}
            onChange={onFieldChange}
          />
        ) : (
          <input
            id={fieldId}
            className="compositeField__input"
            type="text"
            name={field.key}
            placeholder={field.placeholder}
            value={value}
            onChange={onFieldChange}
          />
        )}
      </label>

      <HomepageTextStyleControls
        field={field}
        textStyle={textStyle}
        onStyleChange={onStyleChange}
      />
    </div>
  );
}

function HomepageTextStyleControls({
  field,
  textStyle,
  onStyleChange,
}) {
  const sizeInputId = `homepage-${field.key}-size`;
  const sizeLabelId = `homepage-${field.key}-size-label`;

  return (
    <div className="homepageTextToolbar" aria-label={`${field.label} text formatting`}>
      <label className="homepageTextToolbar__field">
        <span className="compositeField__label">Font</span>
        <select
          className="compositeField__input homepageTextToolbar__select"
          value={textStyle.fontFamily}
          onChange={(event) => onStyleChange(field.key, 'fontFamily', event.target.value)}
        >
          {HOMEPAGE_FONT_OPTIONS.map((fontOption) => (
            <option key={fontOption.value} value={fontOption.value}>
              {fontOption.label}
            </option>
          ))}
        </select>
      </label>

      <div className="homepageTextToolbar__field homepageTextToolbar__field--size">
        <span className="compositeField__label" id={sizeLabelId}>Size</span>
        <span className="homepageTextToolbar__sizeControls">
          <input
            className="homepageTextToolbar__range"
            type="range"
            min={field.minSize}
            max={field.maxSize}
            value={textStyle.fontSize}
            aria-labelledby={sizeLabelId}
            onChange={(event) => onStyleChange(field.key, 'fontSize', Number(event.target.value))}
          />
          <input
            id={sizeInputId}
            className="compositeField__input homepageTextToolbar__number"
            type="number"
            min={field.minSize}
            max={field.maxSize}
            value={textStyle.fontSize}
            aria-labelledby={sizeLabelId}
            onChange={(event) => onStyleChange(field.key, 'fontSize', Number(event.target.value))}
          />
        </span>
      </div>

      <div className="homepageTextToolbar__formatGroup" aria-label={`${field.label} style toggles`}>
        <button
          type="button"
          className={buildFormatButtonClassName(textStyle.isBold)}
          aria-label={`Bold ${field.label}`}
          aria-pressed={textStyle.isBold}
          title="Bold"
          onClick={() => onStyleChange(field.key, 'isBold', !textStyle.isBold)}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className={buildFormatButtonClassName(textStyle.isItalic)}
          aria-label={`Italic ${field.label}`}
          aria-pressed={textStyle.isItalic}
          title="Italic"
          onClick={() => onStyleChange(field.key, 'isItalic', !textStyle.isItalic)}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className={buildFormatButtonClassName(textStyle.isUnderlined)}
          aria-label={`Underline ${field.label}`}
          aria-pressed={textStyle.isUnderlined}
          title="Underline"
          onClick={() => onStyleChange(field.key, 'isUnderlined', !textStyle.isUnderlined)}
        >
          <span className="homepageTextToolbar__underline">U</span>
        </button>
      </div>
    </div>
  );
}

function buildFormatButtonClassName(isActive) {
  return [
    'homepageTextToolbar__formatButton',
    isActive ? 'homepageTextToolbar__formatButton--active' : '',
  ].filter(Boolean).join(' ');
}

async function saveWithImage(file, homepageMetadata, onProgress) {
  await validateImageFile(file);

  return uploadHomepageContent(file, homepageMetadata, {
    onProgress,
  });
}

function buildFormValues(homepageContent) {
  const normalizedHomepageContent = normalizeHomepageContent(homepageContent);

  return {
    eyebrow: normalizedHomepageContent.eyebrow,
    title: normalizedHomepageContent.title,
    description: normalizedHomepageContent.description,
    textStyles: normalizedHomepageContent.textStyles,
  };
}

function validateRequiredField(value, emptyMessage) {
  const normalizedValue = String(value || '').trim();

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
