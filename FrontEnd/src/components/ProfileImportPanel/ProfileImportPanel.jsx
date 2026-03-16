import { useEffect, useState } from 'react';

import { getProfiles, importProfilesCsv } from '../../api/composites.js';
import '../../styles/composites.css';

const acceptedCsvTypes = '.csv';

export default function ProfileImportPanel() {
  const [selectedCsvFile, setSelectedCsvFile] = useState(null);
  const [profileCount, setProfileCount] = useState(0);
  const [isImportingProfiles, setIsImportingProfiles] = useState(false);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [profileImportError, setProfileImportError] = useState('');
  const [profileImportSummary, setProfileImportSummary] = useState('');

  useEffect(() => {
    let isActive = true;

    const loadProfiles = async () => {
      setIsLoadingProfiles(true);
      setProfileImportError('');

      try {
        const profiles = await getProfiles();

        if (!isActive) {
          return;
        }

        setProfileCount(Array.isArray(profiles) ? profiles.length : 0);
      } catch (error) {
        if (isActive) {
          setProfileImportError(error.message);
        }
      } finally {
        if (isActive) {
          setIsLoadingProfiles(false);
        }
      }
    };

    loadProfiles();

    return () => {
      isActive = false;
    };
  }, []);

  const handleProfileImportSubmit = async (event) => {
    event.preventDefault();

    if (!selectedCsvFile) {
      setProfileImportError('Choose the DA member CSV before importing.');
      return;
    }

    setProfileImportError('');
    setProfileImportSummary('');
    setIsImportingProfiles(true);

    try {
      const importSummary = await importProfilesCsv(selectedCsvFile);

      setProfileCount(importSummary.totalProfiles || profileCount);
      setProfileImportSummary(
        `Imported ${importSummary.importedCount} profiles, updated ${importSummary.updatedCount}, skipped ${importSummary.skippedCount}. Total profiles: ${importSummary.totalProfiles}.`,
      );
      setSelectedCsvFile(null);
    } catch (error) {
      setProfileImportError(error.message);
    } finally {
      setIsImportingProfiles(false);
    }
  };

  return (
    <article className="compositePanel compositePanel--spacious">
      <div className="compositePanel__header">
        <div>
          <h2 className="compositePanel__title">Upload Member Profiles</h2>
          <p className="compositePanel__description">
            Import the DA membership CSV to create or update backend member profiles. Imported
            members use the shared plank placeholder until composite coordinates are assigned.
          </p>
        </div>
      </div>

      <form className="compositeUploadForm" onSubmit={handleProfileImportSubmit}>
        <div className="compositeUploadForm__grid compositeUploadForm__grid--single">
          <label className="compositeField">
            <span className="compositeField__label">Membership CSV</span>
            <input
              className="compositeField__input compositeField__input--file"
              type="file"
              accept={acceptedCsvTypes}
              onChange={(event) => {
                setSelectedCsvFile(event.target.files?.[0] || null);
                setProfileImportError('');
                setProfileImportSummary('');
              }}
            />
          </label>
        </div>

        <div className="compositeUploadForm__actions">
          <button
            type="submit"
            className="button compositeButton compositeButton--filled"
            disabled={isImportingProfiles}
          >
            {isImportingProfiles ? 'Importing...' : 'Import Profiles'}
          </button>

          <p className="compositeUploadForm__fileMeta">
            {selectedCsvFile ? (
              <>
                Selected CSV: <strong>{selectedCsvFile.name}</strong>
              </>
            ) : (
              <>
                {isLoadingProfiles ? 'Loading member profiles...' : <>Currently loaded profiles: <strong>{profileCount}</strong></>}
              </>
            )}
          </p>
        </div>

        {profileImportSummary ? (
          <p className="compositeMessage compositeMessage--success">{profileImportSummary}</p>
        ) : null}
        {profileImportError ? (
          <p className="compositeMessage compositeMessage--error">{profileImportError}</p>
        ) : null}
      </form>
    </article>
  );
}
