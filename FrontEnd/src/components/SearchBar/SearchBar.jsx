import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getProfiles } from '../../api/composites.js';
import './SearchBar.css';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [loadError, setLoadError] = useState('');
  const blurTimer = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let isActive = true;

    const loadProfiles = async () => {
      try {
        const profileResults = await getProfiles();

        if (!isActive) {
          return;
        }

        setProfiles(Array.isArray(profileResults) ? profileResults : []);
      } catch (error) {
        if (isActive) {
          setLoadError(error.message);
        }
      }
    };

    loadProfiles();

    return () => {
      isActive = false;
    };
  }, []);

  const clearBlurTimer = () => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  };

  const results = useMemo(() => {
    const value = query.trim().toLowerCase();

    if (!value) {
      return [];
    }

    return profiles
      .filter((profile) => (
        [
          profile.displayName,
          profile.firstName,
          profile.lastName,
          profile.preferredName,
          profile.city,
          profile.stateProvince,
          profile.graduationYear ? String(profile.graduationYear) : '',
        ].some((field) => String(field || '').toLowerCase().includes(value))
      ))
      .slice(0, 12);
  }, [profiles, query]);

  const handleFocus = () => {
    clearBlurTimer();
    setOpen(true);
  };

  const handleBlur = () => {
    blurTimer.current = setTimeout(() => setOpen(false), 120);
  };

  const handleSelect = (profile) => {
    clearBlurTimer();
    setQuery(profile.displayName);
    setOpen(false);
    setTimeout(() => navigate(`/member/${profile.id}`), 100);
  };

  return (
    <section className="search section" aria-label="Search">
      <div className="container">
        <div className="search__outer">
          <label className="sr-only" htmlFor="archive-search">
            Search
          </label>

          <form className="search__inputWrap" onSubmit={(event) => event.preventDefault()} role="search">
            <svg
              className="search__icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.3-4.3" />
            </svg>

            <input
              id="archive-search"
              className="search__input"
              type="search"
              placeholder="Search by name, city, or state...."
              autoComplete="off"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />

            {open && (
              <div className="search__dropdown" role="listbox" aria-label="Search suggestions">
                {loadError ? (
                  <p className="search__empty">{loadError}</p>
                ) : query.trim().length === 0 ? (
                  <p className="search__empty">Start typing to see matches.</p>
                ) : results.length === 0 ? (
                  <p className="search__empty">No matching results.</p>
                ) : (
                  <ul className="search__list">
                    {results.map((profile) => (
                      <li key={profile.id} className="search__item">
                        <button type="button" onMouseDown={() => handleSelect(profile)}>
                          <span className="search__itemName">{profile.displayName}</span>
                          <span className="search__itemMeta">{buildSearchMeta(profile)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}

function buildSearchMeta(profile) {
  const location = [profile.city, profile.stateProvince].filter(Boolean).join(', ');

  if (location && profile.graduationYear) {
    return `${location} | Class of ${profile.graduationYear}`;
  }

  if (location) {
    return location;
  }

  if (profile.graduationYear) {
    return `Class of ${profile.graduationYear}`;
  }

  return 'Member profile';
}
