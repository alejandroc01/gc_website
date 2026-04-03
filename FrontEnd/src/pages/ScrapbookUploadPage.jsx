import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import CompositeCopyrightNotice from '../components/Composite/CompositeCopyrightNotice.jsx';
import {
  getScrapbooks,
  uploadScrapbook,
} from '../api/composites.js';
import '../styles/composites.css';

const acceptedTypes = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

export default function ScrapbookUploadPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [scrapbookYear, setScrapbookYear] = useState('');
  const [scrapbooks, setScrapbooks] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState('');

  useEffect(() => {
    let isActive = true;

    const loadScrapbooks = async () => {
      try {
        const scrapbookRecords = await getScrapbooks();

        if (!isActive) {
          return;
        }

        setScrapbooks(scrapbookRecords);
      } catch {
        if (isActive) {
          setScrapbooks([]);
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
      </div>
    </section>
  );
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
