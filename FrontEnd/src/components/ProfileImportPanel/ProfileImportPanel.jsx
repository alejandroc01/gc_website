import { useEffect, useMemo, useState } from 'react';

import {
  createProfile,
  deleteProfile,
  getProfiles,
  importProfilesCsv,
  updateProfile,
} from '../../api/composites.js';
import '../../styles/composites.css';

const acceptedCsvTypes = '.csv';
const emptyProfileForm = {
  graduationYear: '',
  lastName: '',
  firstName: '',
  preferredName: '',
  city: '',
  stateProvince: '',
  email: '',
  candlelightDate: '',
  deceased: false,
  board: false,
  emeritus: false,
};

export default function ProfileImportPanel() {
  const [selectedCsvFile, setSelectedCsvFile] = useState(null);
  const [csvInputKey, setCsvInputKey] = useState(0);
  const [profiles, setProfiles] = useState([]);
  const [profileSearchQuery, setProfileSearchQuery] = useState('');
  const [profileForm, setProfileForm] = useState(() => ({ ...emptyProfileForm }));
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [isImportingProfiles, setIsImportingProfiles] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [deleteProfileId, setDeleteProfileId] = useState('');
  const [profileLoadError, setProfileLoadError] = useState('');
  const [profileImportError, setProfileImportError] = useState('');
  const [profileImportSummary, setProfileImportSummary] = useState('');
  const [profileFormError, setProfileFormError] = useState('');
  const [profileFormSummary, setProfileFormSummary] = useState('');
  const [profileListError, setProfileListError] = useState('');
  const [profileListSummary, setProfileListSummary] = useState('');

  useEffect(() => {
    let isActive = true;

    const loadProfiles = async () => {
      setIsLoadingProfiles(true);
      setProfileLoadError('');

      try {
        const loadedProfiles = await getProfiles();

        if (!isActive) {
          return;
        }

        setProfiles(sortProfiles(Array.isArray(loadedProfiles) ? loadedProfiles : []));
      } catch (error) {
        if (isActive) {
          setProfileLoadError(error.message);
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

  const filteredProfiles = useMemo(() => {
    const normalizedQuery = profileSearchQuery.trim().toLowerCase();

    if (!normalizedQuery) {
      return profiles;
    }

    return profiles.filter((profile) => matchesProfileQuery(profile, normalizedQuery));
  }, [profileSearchQuery, profiles]);

  const formTitle = editingProfileId ? 'Edit Member Profile' : 'Create Member Profile';
  const formActionLabel = editingProfileId ? 'Save Changes' : 'Create Member Profile';

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

      setProfileLoadError('');
      setProfiles(sortProfiles(Array.isArray(importSummary.profiles) ? importSummary.profiles : profiles));
      setProfileImportSummary(
        `Imported ${importSummary.importedCount} profiles, updated ${importSummary.updatedCount}, skipped ${importSummary.skippedCount}. Total profiles: ${importSummary.totalProfiles}.`,
      );
      setSelectedCsvFile(null);
      setCsvInputKey((currentValue) => currentValue + 1);
    } catch (error) {
      setProfileImportError(error.message);
    } finally {
      setIsImportingProfiles(false);
    }
  };

  const handleProfileFormChange = (event) => {
    const { name, type, checked, value } = event.target;

    setProfileForm((currentForm) => ({
      ...currentForm,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setProfileFormError('');
    setProfileFormSummary('');
  };

  const handleProfileFormReset = () => {
    setEditingProfileId(null);
    setProfileForm({ ...emptyProfileForm });
    setProfileFormError('');
    setProfileFormSummary('');
  };

  const handleProfileSaveSubmit = async (event) => {
    event.preventDefault();

    setIsSavingProfile(true);
    setProfileFormError('');
    setProfileFormSummary('');
    setProfileListError('');
    setProfileListSummary('');

    try {
      const payload = buildProfilePayload(profileForm);
      const savedProfile = editingProfileId
        ? await updateProfile(editingProfileId, payload)
        : await createProfile(payload);

      setProfileLoadError('');
      setProfiles((currentProfiles) => sortProfiles(
        editingProfileId
          ? currentProfiles.map((profile) => (profile.id === savedProfile.id ? savedProfile : profile))
          : [...currentProfiles, savedProfile],
      ));
      setProfileFormSummary(
        editingProfileId
          ? `Updated ${savedProfile.displayName}.`
          : `Created ${savedProfile.displayName}.`,
      );
      setEditingProfileId(null);
      setProfileForm({ ...emptyProfileForm });
    } catch (error) {
      setProfileFormError(error.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleEditProfile = (profile) => {
    setEditingProfileId(profile.id);
    setProfileForm({
      graduationYear: profile.graduationYear ? String(profile.graduationYear) : '',
      lastName: profile.lastName || '',
      firstName: profile.firstName || '',
      preferredName: profile.preferredName || '',
      city: profile.city || '',
      stateProvince: profile.stateProvince || '',
      email: profile.email || '',
      candlelightDate: profile.candlelightDate || '',
      deceased: Boolean(profile.deceased),
      board: isBoardDepartment(profile.department),
      emeritus: Boolean(profile.emeritus),
    });
    setProfileFormError('');
    setProfileFormSummary('');
    setProfileListError('');
    setProfileListSummary('');
    document.getElementById('member-profile-editor')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  const handleDeleteProfile = async (profile) => {
    const confirmed = window.confirm(
      `Delete ${profile.displayName}? This will also clear the member from any composite annotations.`,
    );

    if (!confirmed) {
      return;
    }

    setDeleteProfileId(profile.id);
    setProfileListError('');
    setProfileListSummary('');
    setProfileFormError('');

    try {
      const deleteSummary = await deleteProfile(profile.id);

      setProfileLoadError('');
      setProfiles((currentProfiles) => currentProfiles.filter((entry) => entry.id !== profile.id));

      if (editingProfileId === profile.id) {
        setEditingProfileId(null);
        setProfileForm({ ...emptyProfileForm });
        setProfileFormSummary('');
      }

      setProfileListSummary(
        deleteSummary.clearedAnnotationCount > 0
          ? `Deleted ${profile.displayName} and cleared ${deleteSummary.clearedAnnotationCount} composite annotation${deleteSummary.clearedAnnotationCount === 1 ? '' : 's'}.`
          : `Deleted ${profile.displayName}.`,
      );
    } catch (error) {
      setProfileListError(error.message);
    } finally {
      setDeleteProfileId('');
    }
  };

  return (
    <>
      <article className="compositePanel compositePanel--spacious">
        <div className="compositePanel__header">
          <div>
            <h2 className="compositePanel__title">Bulk Upload Member Profiles</h2>
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
                key={csvInputKey}
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
              ) : isLoadingProfiles ? (
                'Loading member profiles...'
              ) : (
                <>
                  Currently loaded profiles: <strong>{profiles.length}</strong>
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
          {profileLoadError ? (
            <p className="compositeMessage compositeMessage--error">{profileLoadError}</p>
          ) : null}
        </form>
      </article>

      <article id="member-profile-editor" className="compositePanel compositePanel--spacious">
        <div className="compositePanel__header">
          <div>
            <h2 className="compositePanel__title">{formTitle}</h2>
            <p className="compositePanel__description">
              Add an individual member profile manually or edit an existing record from the list
              below.
            </p>
          </div>
        </div>

        <form className="compositeUploadForm" onSubmit={handleProfileSaveSubmit}>
          <div className="profileManagerGrid">
            <label className="compositeField">
              <span className="compositeField__label">Class (Year)</span>
              <input
                className="compositeField__input"
                type="text"
                name="graduationYear"
                inputMode="numeric"
                maxLength="4"
                placeholder="YYYY"
                value={profileForm.graduationYear}
                onChange={handleProfileFormChange}
                required
              />
            </label>

            <label className="compositeField">
              <span className="compositeField__label">Last Name</span>
              <input
                className="compositeField__input"
                type="text"
                name="lastName"
                value={profileForm.lastName}
                onChange={handleProfileFormChange}
                required
              />
            </label>

            <label className="compositeField">
              <span className="compositeField__label">First Name</span>
              <input
                className="compositeField__input"
                type="text"
                name="firstName"
                value={profileForm.firstName}
                onChange={handleProfileFormChange}
                required
              />
            </label>

            <label className="compositeField">
              <span className="compositeField__label">Preferred Name</span>
              <input
                className="compositeField__input"
                type="text"
                name="preferredName"
                value={profileForm.preferredName}
                onChange={handleProfileFormChange}
              />
            </label>

            <label className="compositeField">
              <span className="compositeField__label">City</span>
              <input
                className="compositeField__input"
                type="text"
                name="city"
                value={profileForm.city}
                onChange={handleProfileFormChange}
              />
            </label>

            <label className="compositeField">
              <span className="compositeField__label">State</span>
              <input
                className="compositeField__input"
                type="text"
                name="stateProvince"
                value={profileForm.stateProvince}
                onChange={handleProfileFormChange}
              />
            </label>

            <label className="compositeField">
              <span className="compositeField__label">Email</span>
              <input
                className="compositeField__input"
                type="text"
                name="email"
                value={profileForm.email}
                onChange={handleProfileFormChange}
              />
            </label>

            <label className="compositeField">
              <span className="compositeField__label">Candlelight Date</span>
              <input
                className="compositeField__input"
                type="text"
                name="candlelightDate"
                placeholder="MM/DD/YYYY"
                value={profileForm.candlelightDate}
                onChange={handleProfileFormChange}
              />
            </label>
          </div>

          <div className="profileManagerCheckboxRow">
            <label className="compositeCheckbox">
              <input
                type="checkbox"
                name="board"
                checked={profileForm.board}
                onChange={handleProfileFormChange}
              />
              <span>Board</span>
            </label>

            <label className="compositeCheckbox">
              <input
                type="checkbox"
                name="deceased"
                checked={profileForm.deceased}
                onChange={handleProfileFormChange}
              />
              <span>Deceased</span>
            </label>

            <label className="compositeCheckbox">
              <input
                type="checkbox"
                name="emeritus"
                checked={profileForm.emeritus}
                onChange={handleProfileFormChange}
              />
              <span>Emeritus</span>
            </label>
          </div>

          <div className="compositeUploadForm__actions">
            <button
              type="submit"
              className="button compositeButton compositeButton--filled"
              disabled={isSavingProfile}
            >
              {isSavingProfile ? 'Saving...' : formActionLabel}
            </button>

            {editingProfileId ? (
              <button
                type="button"
                className="button compositeButton compositeButton--subtle"
                onClick={handleProfileFormReset}
                disabled={isSavingProfile}
              >
                Cancel Edit
              </button>
            ) : null}
          </div>

          {profileFormSummary ? (
            <p className="compositeMessage compositeMessage--success">{profileFormSummary}</p>
          ) : null}
          {profileFormError ? (
            <p className="compositeMessage compositeMessage--error">{profileFormError}</p>
          ) : null}
        </form>
      </article>

      <article className="compositePanel compositePanel--spacious">
        <div className="compositePanel__header">
          <div>
            <h2 className="compositePanel__title">Member Profiles</h2>
            <p className="compositePanel__description">
              Search existing profiles, then edit or delete individual member records.
            </p>
          </div>
        </div>

        <div className="profileDirectoryToolbar">
          <label className="compositeField profileDirectoryToolbar__search">
            <span className="compositeField__label">Search Member Profiles</span>
            <input
              className="compositeField__input"
              type="search"
              placeholder="Search by name, year, city, email, or board"
              value={profileSearchQuery}
              onChange={(event) => setProfileSearchQuery(event.target.value)}
            />
          </label>

          <p className="profileDirectoryToolbar__count">
            {profileSearchQuery.trim()
              ? `Showing ${filteredProfiles.length} of ${profiles.length} profiles`
              : `Total profiles: ${profiles.length}`}
          </p>
        </div>

        {profileListSummary ? (
          <p className="compositeMessage compositeMessage--success">{profileListSummary}</p>
        ) : null}
        {profileListError ? (
          <p className="compositeMessage compositeMessage--error">{profileListError}</p>
        ) : null}
        {profileLoadError ? (
          <p className="compositeMessage compositeMessage--error">{profileLoadError}</p>
        ) : null}

        {isLoadingProfiles ? (
          <div className="compositeEmptyState compositeEmptyState--tight">
            <p className="compositeEmptyState__description">Loading member profiles...</p>
          </div>
        ) : filteredProfiles.length === 0 ? (
          <div className="compositeEmptyState compositeEmptyState--tight">
            <h3 className="compositeEmptyState__title">No Member Profiles Found</h3>
            <p className="compositeEmptyState__description">
              {profileSearchQuery.trim()
                ? 'Try a different search term or create a new member profile above.'
                : 'Import a CSV or create a member profile to get started.'}
            </p>
          </div>
        ) : (
          <div className="profileDirectoryList" role="list">
            {filteredProfiles.map((profile) => (
              <article key={profile.id} className="profileDirectoryCard" role="listitem">
                <div className="profileDirectoryCard__header">
                  <div>
                    <h3 className="profileDirectoryCard__title">{profile.displayName}</h3>
                    <p className="profileDirectoryCard__meta">{buildProfileSummary(profile)}</p>
                  </div>

                  <div className="profileDirectoryCard__actions">
                    <button
                      type="button"
                      className="button compositeButton compositeButton--subtle"
                      onClick={() => handleEditProfile(profile)}
                      disabled={deleteProfileId === profile.id}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="button compositeButton compositeButton--danger"
                      onClick={() => handleDeleteProfile(profile)}
                      disabled={deleteProfileId === profile.id}
                    >
                      {deleteProfileId === profile.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>

                <div className="profileDirectoryCard__badges">
                  {isBoardDepartment(profile.department) ? (
                    <span className="profileDirectoryBadge profileDirectoryBadge--muted">Board</span>
                  ) : null}
                  {profile.emeritus ? <span className="profileDirectoryBadge">Emeritus</span> : null}
                  {profile.deceased ? <span className="profileDirectoryBadge">Deceased</span> : null}
                </div>

                <dl className="profileDirectoryCard__details">
                  <div className="profileDirectoryCard__detail">
                    <dt>Class</dt>
                    <dd>{profile.graduationYear || 'Not listed'}</dd>
                  </div>
                  <div className="profileDirectoryCard__detail">
                    <dt>Preferred Name</dt>
                    <dd>{profile.preferredName || 'Not listed'}</dd>
                  </div>
                  <div className="profileDirectoryCard__detail">
                    <dt>Location</dt>
                    <dd>{buildProfileLocation(profile) || 'Not listed'}</dd>
                  </div>
                  <div className="profileDirectoryCard__detail">
                    <dt>Email</dt>
                    <dd>{profile.email || 'Not listed'}</dd>
                  </div>
                  <div className="profileDirectoryCard__detail">
                    <dt>Candlelight Date</dt>
                    <dd>{profile.candlelightDate || 'Not listed'}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        )}
      </article>
    </>
  );
}

function buildProfilePayload(profileForm) {
  return {
    graduationYear: profileForm.graduationYear.trim(),
    lastName: profileForm.lastName.trim(),
    firstName: profileForm.firstName.trim(),
    preferredName: profileForm.preferredName.trim(),
    city: profileForm.city.trim(),
    stateProvince: profileForm.stateProvince.trim(),
    email: profileForm.email.trim(),
    candlelightDate: profileForm.candlelightDate.trim(),
    deceased: Boolean(profileForm.deceased),
    department: profileForm.board ? 'Board' : '',
    emeritus: Boolean(profileForm.emeritus),
  };
}

function matchesProfileQuery(profile, query) {
  return [
    profile.displayName,
    profile.firstName,
    profile.lastName,
    profile.preferredName,
    profile.city,
    profile.stateProvince,
    profile.email,
    profile.department,
    profile.candlelightDate,
    profile.graduationYear ? String(profile.graduationYear) : '',
  ].some((field) => String(field || '').toLowerCase().includes(query));
}

function sortProfiles(profileList) {
  return [...profileList].sort((leftProfile, rightProfile) => (
    compareStrings(leftProfile.lastName, rightProfile.lastName)
    || compareStrings(leftProfile.firstName, rightProfile.firstName)
    || compareStrings(String(leftProfile.graduationYear || ''), String(rightProfile.graduationYear || ''))
  ));
}

function compareStrings(leftValue, rightValue) {
  return String(leftValue || '').localeCompare(String(rightValue || ''), undefined, {
    sensitivity: 'base',
  });
}

function buildProfileSummary(profile) {
  const summaryParts = [];
  const location = buildProfileLocation(profile);

  if (profile.graduationYear) {
    summaryParts.push(`Class of ${profile.graduationYear}`);
  }

  if (location) {
    summaryParts.push(location);
  }

  if (profile.email) {
    summaryParts.push(profile.email);
  }

  return summaryParts.join(' | ') || 'Member profile';
}

function buildProfileLocation(profile) {
  return [profile.city, profile.stateProvince].filter(Boolean).join(', ');
}

function isBoardDepartment(department) {
  return String(department || '').trim().toLowerCase() === 'board';
}
