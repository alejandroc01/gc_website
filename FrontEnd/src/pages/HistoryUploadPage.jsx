import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { deleteHistory, getHistories, uploadHistory } from '../api/composites.js';
import '../styles/composites.css';

const acceptedPdfTypes = '.pdf,application/pdf';
const emptyForm = {
  key: '',
  name: '',
  description: '',
};

export default function HistoryUploadPage() {
  const [formValues, setFormValues] = useState(emptyForm);
  const [selectedFile, setSelectedFile] = useState(null);
  const [storedHistories, setStoredHistories] = useState([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isLoadingHistories, setIsLoadingHistories] = useState(true);
  const [deletingHistoryId, setDeletingHistoryId] = useState('');
  const [statusError, setStatusError] = useState('');
  const [statusSummary, setStatusSummary] = useState('');
  const [uploadProgress, setUploadProgress] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let isActive = true;

    const loadHistories = async () => {
      setIsLoadingHistories(true);
      setStatusError('');

      try {
        const loadedHistories = await getHistories();

        if (!isActive) {
          return;
        }

        setStoredHistories(normalizeHistories(loadedHistories));
      } catch (error) {
        if (isActive) {
          setStatusError(error.message);
        }
      } finally {
        if (isActive) {
          setIsLoadingHistories(false);
        }
      }
    };

    loadHistories();

    return () => {
      isActive = false;
    };
  }, []);

  const latestStoredHistory = useMemo(
    () => (storedHistories.length > 0 ? storedHistories[0] : null),
    [storedHistories],
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

  const handleFileSelection = async (nextFile) => {
    setStatusError('');
    setStatusSummary('');

    if (!nextFile) {
      setSelectedFile(null);
      setFormValues(emptyForm);
      return;
    }

    try {
      await validatePdfFile(nextFile);

      const derivedMetadata = deriveHistoryMetadata(nextFile.name);

      setSelectedFile(nextFile);
      setFormValues({
        key: derivedMetadata.key,
        name: derivedMetadata.name,
        description: '',
      });
      setStatusSummary(
        `Loaded ${nextFile.name}. The title and key were derived from the filename and can be edited below.`,
      );
    } catch (error) {
      setSelectedFile(null);
      setFormValues(emptyForm);
      setFileInputKey((currentValue) => currentValue + 1);
      setStatusError(error.message);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setStatusError('');
    setStatusSummary('');
    setUploadProgress(null);
    setIsPreparing(true);

    try {
      const normalizedKey = validateHistoryKey(formValues.key);
      const normalizedName = validateRequiredField(formValues.name, 'Enter a history name.');
      const normalizedDescription = validateRequiredField(
        formValues.description,
        'Enter a description for this history document.',
      );

      if (!selectedFile) {
        throw new Error('Choose a PDF file before preparing the history upload.');
      }

      await validatePdfFile(selectedFile);

      const createdHistory = normalizeHistory(
        await uploadHistory(
          selectedFile,
          {
            key: normalizedKey,
            title: normalizedName,
            description: normalizedDescription,
          },
          {
            onProgress: (nextProgress) => setUploadProgress(nextProgress),
          },
        ),
      );

      setStoredHistories((currentHistories) => normalizeHistories([createdHistory, ...currentHistories]));
      setStatusSummary(`Uploaded ${createdHistory.title}.`);
      setFormValues(emptyForm);
      setSelectedFile(null);
      setFileInputKey((currentValue) => currentValue + 1);
    } catch (error) {
      setStatusError(error.message);
    } finally {
      setUploadProgress(null);
      setIsPreparing(false);
    }
  };

  const handleDeleteHistory = async (history) => {
    const confirmed = window.confirm(
      `Delete "${history.title}"? This will remove the written history PDF from backend storage.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingHistoryId(history.historyId);
    setStatusError('');
    setStatusSummary('');

    try {
      await deleteHistory(history.historyId);
      setStoredHistories((currentHistories) =>
        currentHistories.filter((entry) => entry.historyId !== history.historyId));
      setStatusSummary(`Deleted ${history.title}.`);
    } catch (error) {
      setStatusError(error.message);
    } finally {
      setDeletingHistoryId('');
    }
  };

  return (
    <section className="section compositeAdmin">
      <div className="container">
        <div className="compositePageHeader">
          <p className="compositePageHeader__eyebrow">Admin Upload Flow</p>
          <h1 className="compositePageHeader__title">Upload Written History PDF</h1>
          <p className="compositePageHeader__description">
            Start with a PDF, derive a draft title and key from its filename, then adjust the
            metadata before uploading it to backend storage.
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
              <h2 className="compositePanel__title">Prepare a History Document</h2>
              <p className="compositePanel__description">
                Upload a single written-history PDF first. Once the file is selected, the page will
                derive the title and key from the filename and let you refine the metadata.
              </p>
            </div>
          </div>

          <form className="compositeUploadForm" onSubmit={handleSubmit}>
            <div className="historyUploadEditor">
              <div className="compositeField">
                <span className="compositeField__label">History PDF</span>
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
                    void handleFileSelection(event.dataTransfer.files?.[0] || null);
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="compositeDropzone__title">
                    {selectedFile ? 'Replace the selected PDF' : 'Drop a PDF here or click to browse'}
                  </span>
                  <span className="compositeDropzone__copy">
                    Accepted format: PDF. Filename parsing runs immediately after selection so the
                    form is prefilled.
                  </span>
                </button>

                <input
                  key={fileInputKey}
                  ref={fileInputRef}
                  className="sr-only"
                  type="file"
                  accept={acceptedPdfTypes}
                  onChange={(event) => void handleFileSelection(event.target.files?.[0] || null)}
                />
              </div>

              {selectedFile ? (
                <div className="historyUploadEditor__summary">
                  <div className="historyUploadEditor__summaryCard">
                    <span className="historyUploadEditor__summaryLabel">Selected file</span>
                    <strong className="historyUploadEditor__summaryValue">{selectedFile.name}</strong>
                    <p className="historyUploadEditor__summaryMeta">
                      {formatFileSize(selectedFile.size)} · PDF draft ready for metadata review
                    </p>
                  </div>

                  <div className="historyUploadEditor__summaryCard">
                    <span className="historyUploadEditor__summaryLabel">Derived draft</span>
                    <strong className="historyUploadEditor__summaryValue">{formValues.name || 'Untitled history'}</strong>
                    <p className="historyUploadEditor__summaryMeta">
                      Key: <strong>{formValues.key || 'pending'}</strong>
                    </p>
                  </div>
                </div>
              ) : (
                <div className="historyUploadEditor__emptyState">
                  <h3 className="historyUploadEditor__emptyTitle">Upload a PDF to unlock the editor.</h3>
                  <p className="historyUploadEditor__emptyCopy">
                    After a file is chosen, this page will prefill the title and key from the filename
                    so you only need to review and adjust the metadata.
                  </p>
                </div>
              )}
            </div>

            {selectedFile ? (
              <div className="historyUploadEditor__metadata">
                <div className="compositePanel__header compositePanel__header--compact">
                  <div>
                    <h3 className="historyUploadEditor__metadataTitle">Metadata Review</h3>
                    <p className="historyUploadEditor__metadataDescription">
                      Edit the derived values if the filename was not quite right, then add the public
                      description shown with the history card.
                    </p>
                  </div>
                </div>

                <div className="profileManagerGrid">
                  <label className="compositeField">
                    <span className="compositeField__label">Title</span>
                    <input
                      className="compositeField__input"
                      type="text"
                      name="name"
                      placeholder="enter history title"
                      value={formValues.name}
                      onChange={handleFieldChange}
                    />
                  </label>

                  <label className="compositeField">
                    <span className="compositeField__label">Key</span>
                    <input
                      className="compositeField__input"
                      type="text"
                      name="key"
                      placeholder="for example: history-of-the-class-of-1984"
                      value={formValues.key}
                      onChange={handleFieldChange}
                    />
                  </label>

                  <label className="compositeField profileManagerGrid__fullWidth">
                    <span className="compositeField__label">Description</span>
                    <textarea
                      className="compositeField__input compositeField__textarea"
                      name="description"
                      placeholder="write a short summary shown on the written history card"
                      rows={5}
                      value={formValues.description}
                      onChange={handleFieldChange}
                    />
                  </label>
                </div>
              </div>
            ) : null}

            <div className="compositeUploadForm__actions">
              <button
                type="submit"
                className="button compositeButton compositeButton--filled"
                disabled={isPreparing || !selectedFile}
              >
                {isPreparing ? 'Uploading History...' : 'Upload History'}
              </button>

              <p className="compositeUploadForm__fileMeta">
                {selectedFile
                  ? `Ready to upload ${selectedFile.name}.`
                  : 'Choose a PDF to generate the editable metadata fields.'}
              </p>
            </div>

            {uploadProgress ? (
              <p className="compositeUploadForm__fileMeta">
                Uploaded {formatFileSize(uploadProgress.uploadedBytes)} of {formatFileSize(uploadProgress.totalBytes)}
                {' '}({Math.round((uploadProgress.uploadedBytes / Math.max(uploadProgress.totalBytes, 1)) * 100)}%)
              </p>
            ) : null}

            {statusSummary ? (
              <p className="compositeMessage compositeMessage--success">{statusSummary}</p>
            ) : null}
            {statusError ? <p className="compositeMessage compositeMessage--error">{statusError}</p> : null}
          </form>
        </article>

        <article className="compositePanel compositePanel--spacious">
          <div className="compositePanel__header">
            <div>
              <h2 className="compositePanel__title">Stored Written Histories</h2>
              <p className="compositePanel__description">
                These written histories are currently stored by the backend and available to the site.
              </p>
            </div>
          </div>

          {isLoadingHistories ? (
            <div className="compositeEmptyState">
              <p className="compositeEmptyState__description">Loading written histories...</p>
            </div>
          ) : storedHistories.length === 0 ? (
            <div className="compositeEmptyState">
              <h3 className="compositeEmptyState__title">No stored written histories yet.</h3>
              <p className="compositeEmptyState__description">
                After a PDF upload completes, the written history will appear here.
              </p>
            </div>
          ) : (
            <div className="compositeCardGrid">
              {storedHistories.map((history) => (
                <article key={history.historyId} className="compositeCard">
                  <div className="compositeCard__body">
                    <div className="compositeCard__metaRow">
                      <span className="compositeCard__pill">stored</span>
                      <span className="compositeCard__pill compositeCard__pill--year">
                        {formatFileSize(history.fileSize)}
                      </span>
                    </div>

                    <h3 className="compositeCard__title">{history.title}</h3>
                    <p className="compositeCard__sourceName">{history.originalFilename || history.fileName}</p>
                    <p className="compositeCard__meta">
                      Key: <strong>{history.key}</strong>
                    </p>
                    <p className="compositeCard__meta">{history.description}</p>
                    <p className="compositeCard__meta">
                      Uploaded {formatDate(history.uploadTimestamp || history.updatedAt)}
                    </p>

                    <div className="profileDirectoryCard__actions">
                      {history.pdfUrl ? (
                        <a
                          className="button compositeButton"
                          href={history.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open PDF
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="button compositeButton"
                        onClick={() => void handleDeleteHistory(history)}
                        disabled={deletingHistoryId === history.historyId}
                      >
                        {deletingHistoryId === history.historyId ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {latestStoredHistory ? (
            <p className="compositeMessage" style={{ marginTop: '18px' }}>
              Latest stored history: <strong>{latestStoredHistory.title}</strong> using filename{' '}
              <strong>{latestStoredHistory.originalFilename || latestStoredHistory.fileName}</strong>.
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

function validateHistoryKey(value) {
  const normalizedValue = value.trim().toLowerCase();

  if (!normalizedValue) {
    throw new Error('Enter a history key before preparing the PDF.');
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedValue)) {
    throw new Error('Use a lowercase slug for the key, with letters, numbers, and hyphens only.');
  }

  return normalizedValue;
}

async function validatePdfFile(file) {
  const normalizedFileName = file.name.trim().toLowerCase();
  const isPdfByName = normalizedFileName.endsWith('.pdf');
  const isPdfByType = !file.type || file.type === 'application/pdf';

  if (!isPdfByName || !isPdfByType) {
    throw new Error('Choose a valid PDF file with a .pdf extension.');
  }

  const headerText = await file.slice(0, 5).text();

  if (headerText !== '%PDF-') {
    throw new Error('The selected file does not look like a valid PDF document.');
  }
}

function deriveHistoryMetadata(fileName) {
  const normalizedStem = stripKnownExtensions(fileName)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const name = formatHistoryTitle(normalizedStem);

  return {
    name,
    key: slugify(name),
  };
}

function stripKnownExtensions(fileName) {
  let normalizedValue = fileName.trim();

  while (/\.(pdf|doc|docx|pages)$/i.test(normalizedValue)) {
    normalizedValue = normalizedValue.replace(/\.(pdf|doc|docx|pages)$/i, '');
  }

  return normalizedValue;
}

function formatHistoryTitle(value) {
  if (!value) {
    return 'Untitled History';
  }

  const hasLowerAndUpperCase = /[a-z]/.test(value) && /[A-Z]/.test(value);
  if (hasLowerAndUpperCase) {
    return value;
  }

  return value.replace(/\b([a-zA-Z])([a-zA-Z]*)/g, (_, firstCharacter, remainingCharacters) => {
    return `${firstCharacter.toUpperCase()}${remainingCharacters.toLowerCase()}`;
  });
}

function slugify(value) {
  const normalizedValue = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalizedValue || 'history-document';
}

function normalizeHistories(histories) {
  return (Array.isArray(histories) ? histories : [])
    .map((history) => normalizeHistory(history))
    .sort((leftHistory, rightHistory) => {
      const leftTimestamp = new Date(leftHistory.uploadTimestamp || leftHistory.updatedAt || 0).getTime();
      const rightTimestamp = new Date(rightHistory.uploadTimestamp || rightHistory.updatedAt || 0).getTime();
      return rightTimestamp - leftTimestamp;
    });
}

function normalizeHistory(history) {
  return {
    historyId: String(history?.historyId || ''),
    key: String(history?.key || ''),
    title: String(history?.title || ''),
    description: String(history?.description || ''),
    originalFilename: String(history?.originalFilename || ''),
    fileName: String(history?.fileName || history?.originalFilename || ''),
    fileSize: Number(history?.fileSize || 0),
    pdfUrl: String(history?.pdfUrl || ''),
    uploadTimestamp: String(history?.uploadTimestamp || ''),
    updatedAt: String(history?.updatedAt || ''),
  };
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
