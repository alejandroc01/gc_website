import { useEffect, useState } from 'react';

import { getProfile } from '../../api/composites.js';
import MemberProfileContent from './MemberProfileContent.jsx';

export default function MemberProfileModal({
  profileId,
  onClose,
  onArchiveNavigate = null,
}) {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!profileId) {
      return undefined;
    }

    let isActive = true;

    const loadProfile = async () => {
      setIsLoading(true);
      setErrorMessage('');
      setProfile(null);

      try {
        const loadedProfile = await getProfile(profileId);

        if (!isActive) {
          return;
        }

        setProfile(loadedProfile);
      } catch (error) {
        if (isActive) {
          setErrorMessage(error.message);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isActive = false;
    };
  }, [profileId]);

  useEffect(() => {
    if (!profileId) {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [profileId]);

  if (!profileId) {
    return null;
  }

  return (
    <div
      className="compositesModalBackdrop compositesModalBackdrop--stacked"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="compositesModal compositesModal--profile"
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-profile-modal-title"
      >
        <div className="compositesModal__header">
          <div>
            <p className="compositesModal__eyebrow">Member Profile</p>
            <h2 id="member-profile-modal-title" className="compositesModal__title">
              {profile?.displayName || 'Loading member profile'}
            </h2>
          </div>

          <button
            type="button"
            className="button compositeButton compositeButton--subtle compositesModal__closeButton"
            onClick={onClose}
            aria-label="Close member profile"
          >
            X
          </button>
        </div>

        <div className="compositesModal__body compositesModal__body--profile">
          {isLoading ? (
            <div className="memberProfileModal__state">
              <p className="compositeMessage">Loading member profile...</p>
            </div>
          ) : null}

          {!isLoading && errorMessage ? (
            <div className="memberProfileModal__state">
              <p className="compositeMessage compositeMessage--error">{errorMessage}</p>
            </div>
          ) : null}

          {!isLoading && !errorMessage && profile ? (
            <MemberProfileContent
              profile={profile}
              onArchiveNavigate={onArchiveNavigate || onClose}
            />
          ) : null}
        </div>
      </section>
    </div>
  );
}
