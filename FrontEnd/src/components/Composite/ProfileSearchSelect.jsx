import { useEffect, useMemo, useRef, useState } from 'react';

export default function ProfileSearchSelect({
  profiles,
  selectedProfileId,
  onSelectProfile,
  inputId = 'annotation-profile-search',
  label = 'Assign profile',
  placeholder = 'Search profiles by name or year',
  hideLabel = false,
  invalid = false,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef(null);
  const inputRef = useRef(null);

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) || null;

  useEffect(() => {
    setQuery(selectedProfile ? selectedProfile.displayName : '');
  }, [selectedProfile]);

  const filteredProfiles = useMemo(() => {
    const trimmedQuery = query.trim().toLowerCase();

    if (!trimmedQuery) {
      return profiles.slice(0, 8);
    }

    return profiles.filter((profile) =>
      [
        profile.firstName,
        profile.lastName,
        profile.displayName,
        profile.graduationYear ? String(profile.graduationYear) : '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(trimmedQuery),
    );
  }, [profiles, query]);

  const clearBlurTimer = () => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  };

  const handleBlur = () => {
    blurTimer.current = setTimeout(() => setOpen(false), 120);
  };

  const handleFocus = () => {
    clearBlurTimer();
    setOpen(true);
  };

  const handleSelectProfile = (profileId) => {
    clearBlurTimer();
    onSelectProfile(profileId);
    setOpen(false);
  };

  const handleClearProfile = () => {
    clearBlurTimer();
    setQuery('');
    onSelectProfile(null);
    setOpen(false);
    inputRef.current?.focus();
  };

  const showsClearButton = Boolean(query || selectedProfile);

  return (
    <div className={['profileSearch', invalid ? 'profileSearch--invalid' : ''].filter(Boolean).join(' ')}>
      <label className={hideLabel ? 'profileSearch__label sr-only' : 'profileSearch__label'} htmlFor={inputId}>
        {label}
      </label>

      <div className="profileSearch__inputWrap">
        <input
          ref={inputRef}
          id={inputId}
          className={[
            'profileSearch__input',
            showsClearButton ? 'profileSearch__input--clearable' : '',
          ].filter(Boolean).join(' ')}
          type="search"
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            const nextQuery = event.target.value;

            setQuery(nextQuery);

            if (!nextQuery.trim() && selectedProfileId) {
              onSelectProfile(null);
            }

            setOpen(true);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoComplete="off"
        />

        {showsClearButton ? (
          <button
            type="button"
            className="profileSearch__clear"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleClearProfile}
            aria-label="Clear assigned profile"
          >
            <ClearIcon />
          </button>
        ) : null}

        {open ? (
          <div className="profileSearch__dropdown" role="listbox" aria-label="Profile matches">
            {filteredProfiles.length > 0 ? (
              <ul className="profileSearch__list">
                {filteredProfiles.map((profile) => (
                  <li key={profile.id} className="profileSearch__item">
                    <button type="button" onMouseDown={() => handleSelectProfile(profile.id)}>
                      <span className="profileSearch__name">{profile.displayName}</span>
                      <span className="profileSearch__meta">
                        {profile.graduationYear ? `Class of ${profile.graduationYear}` : 'Alumni profile'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="profileSearch__empty">No matching profiles.</p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ClearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18 6L6 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 6L18 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
