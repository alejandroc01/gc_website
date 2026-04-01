import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import '../styles/composites.css';

const acceptedVideoTypes = 'video/*,.mp4,.mov,.m4v,.webm';
const localDraftStorageKey = 'gc-oral-history-upload-drafts';
const emptyForm = {
  key: '',
  name: '',
  description: '',
};

export default function OralHistoryUploadPage() {
  const [formValues, setFormValues] = useState(emptyForm);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [statusError, setStatusError] = useState('');
  const [statusSummary, setStatusSummary] = useState('');
  const [preparedDrafts, setPreparedDrafts] = useState(() => loadPreparedDrafts());
  const fileInputRef = useRef(null);

  const latestPreparedDraft = useMemo(
    () => (preparedDrafts.length > 0 ? preparedDrafts[0] : null),
    [preparedDrafts],
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
      const normalizedName = validateRequiredField(formValues.name, 'Enter an oral history title.');
      const normalizedDescription = validateRequiredField(
        formValues.description,
        'Enter a description for this oral history video.',
      );

      if (!selectedFile) {
        throw new Error('Choose a video file before preparing the oral history upload.');
      }

      await validateVideoFile(selectedFile);

      const preparedDraft = {
        key: normalizedKey,
        title: normalizedName,
        description: normalizedDescription,
        fileName: selectedFile.name,
        fileSize: selectedFile.size,
        mimeType: selectedFile.type || 'video/mp4',
        preparedAt: new Date().toISOString(),
        storageStatus: 'ready-for-local-save',
      };

      const nextDrafts = [preparedDraft, ...preparedDrafts.filter((entry) => entry.key !== preparedDraft.key)]
        .slice(0, 12);

      setPreparedDrafts(nextDrafts);
      persistPreparedDrafts(nextDrafts);
      setStatusSummary(
        `Prepared ${preparedDraft.title} for local save. Metadata is stored in this browser and the video filename ${preparedDraft.fileName} passed validation.`,
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

  return (
    <section className="section compositeAdmin">
      <div className="container">
        <div className="compositePageHeader">
          <p className="compositePageHeader__eyebrow">Admin Upload Flow</p>
          <h1 className="compositePageHeader__title">Upload Oral History Video</h1>
          <p className="compositePageHeader__description">
            Prepare an oral history recording for archive storage by entering its key, display name,
            and description, then validating the video locally before the database workflow exists.
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
              <h2 className="compositePanel__title">Prepare a New Oral History Video</h2>
              <p className="compositePanel__description">
                The current flow validates the video and stores the prepared metadata locally in the
                browser. The actual file is not persisted to the archive yet.
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
                {isPreparing ? 'Preparing Video...' : 'Prepare Oral History Video'}
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
              <h2 className="compositePanel__title">Prepared Local Oral History Drafts</h2>
              <p className="compositePanel__description">
                These are the metadata records that have passed validation in this browser and are ready
                to be connected to backend storage later.
              </p>
            </div>
          </div>

          {preparedDrafts.length === 0 ? (
            <div className="compositeEmptyState">
              <h3 className="compositeEmptyState__title">No prepared oral history drafts yet.</h3>
              <p className="compositeEmptyState__description">
                After a video passes validation, its key, name, description, and filename will appear
                here.
              </p>
            </div>
          ) : (
            <div className="compositeCardGrid">
              {preparedDrafts.map((draft) => (
                <article key={draft.key} className="compositeCard">
                  <div className="compositeCard__body">
                    <div className="compositeCard__metaRow">
                      <span className="compositeCard__pill">{draft.storageStatus}</span>
                      <span className="compositeCard__pill compositeCard__pill--year">
                        {formatFileSize(draft.fileSize)}
                      </span>
                    </div>

                    <h3 className="compositeCard__title">{draft.title}</h3>
                    <p className="compositeCard__sourceName">{draft.fileName}</p>
                    <p className="compositeCard__meta">
                      Key: <strong>{draft.key}</strong>
                    </p>
                    <p className="compositeCard__meta">{draft.description}</p>
                    <p className="compositeCard__meta">
                      Prepared {formatDate(draft.preparedAt)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}

          {latestPreparedDraft ? (
            <p className="compositeMessage" style={{ marginTop: '18px' }}>
              Latest prepared draft: <strong>{latestPreparedDraft.title}</strong> using filename{' '}
              <strong>{latestPreparedDraft.fileName}</strong>.
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

function validateOralHistoryKey(value) {
  const normalizedValue = value.trim().toLowerCase();

  if (!normalizedValue) {
    throw new Error('Enter an oral history key before preparing the video.');
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

function loadPreparedDrafts() {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const storedValue = window.localStorage.getItem(localDraftStorageKey);

    if (!storedValue) {
      return [];
    }

    const parsedValue = JSON.parse(storedValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch (error) {
    console.error('Unable to read stored oral history drafts.', error);
    return [];
  }
}

function persistPreparedDrafts(drafts) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(localDraftStorageKey, JSON.stringify(drafts));
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
