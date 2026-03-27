import { useEffect, useState } from 'react';

import { createProfile } from '../../api/composites.js';

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

export default function CreateProfileModal({
  annotation,
  compositeYear,
  isOpen,
  onClose,
  onProfileCreated,
}) {
  const [profileForm, setProfileForm] = useState(() => buildInitialProfileForm(compositeYear));
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileFormError, setProfileFormError] = useState('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setProfileForm(buildInitialProfileForm(compositeYear));
    setProfileFormError('');
  }, [annotation?.annotationId, compositeYear, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const handleWindowKeyDown = (event) => {
      if (event.key === 'Escape' && !isSavingProfile) {
        onClose();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleWindowKeyDown);

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [isOpen, isSavingProfile, onClose]);

  if (!isOpen || !annotation) {
    return null;
  }

  const handleProfileFormChange = (event) => {
    const { name, type, checked, value } = event.target;

    setProfileForm((currentForm) => ({
      ...currentForm,
      [name]: type === 'checkbox' ? checked : value,
    }));
    setProfileFormError('');
  };

  const handleProfileSaveSubmit = async (event) => {
    event.preventDefault();
    setIsSavingProfile(true);
    setProfileFormError('');

    try {
      const savedProfile = await createProfile(buildProfilePayload(profileForm));
      onProfileCreated(savedProfile, annotation.annotationId);
      onClose();
    } catch (error) {
      setProfileFormError(error.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <div
      className="profileModalBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSavingProfile) {
          onClose();
        }
      }}
    >
      <article
        className="compositePanel compositePanel--spacious profileModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-profile-modal-title"
      >
        <div className="profileModal__header">
          <div>
            <h2 id="create-profile-modal-title" className="compositePanel__title">
              Create Member Profile
            </h2>
            <p className="compositePanel__description">
              Add a new member profile and assign it to this annotation.
            </p>
            {annotation.detectedName ? (
              <p className="profileModal__helper">
                Detected name: <strong>{annotation.detectedName}</strong>
              </p>
            ) : null}
          </div>

          <button
            type="button"
            className="button compositeButton compositeButton--subtle"
            onClick={onClose}
            disabled={isSavingProfile}
          >
            Close
          </button>
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
              {isSavingProfile ? 'Saving...' : 'Create Member Profile'}
            </button>

            <button
              type="button"
              className="button compositeButton compositeButton--subtle"
              onClick={onClose}
              disabled={isSavingProfile}
            >
              Cancel
            </button>
          </div>

          {profileFormError ? (
            <p className="compositeMessage compositeMessage--error">{profileFormError}</p>
          ) : null}
        </form>
      </article>
    </div>
  );
}

function buildInitialProfileForm(compositeYear) {
  return {
    ...emptyProfileForm,
    graduationYear: compositeYear ? String(compositeYear) : '',
  };
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
