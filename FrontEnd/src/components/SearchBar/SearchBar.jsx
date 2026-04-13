import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  getComposites,
  getProfiles,
  getScrapbooks,
} from '../../api/composites.js';
import scrapbookBookIcon from '../../assets/icons/scrapbook-book.svg';
import './SearchBar.css';

const SEARCH_FILTER_OPTIONS = [
  { id: 'member', label: 'Members' },
  { id: 'composite', label: 'Composites' },
  { id: 'scrapbook', label: 'Scrapbooks' },
];

const ALL_FILTER_IDS = SEARCH_FILTER_OPTIONS.map((option) => option.id);

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [composites, setComposites] = useState([]);
  const [scrapbooks, setScrapbooks] = useState([]);
  const [selectedFilterIds, setSelectedFilterIds] = useState(ALL_FILTER_IDS);
  const [loadError, setLoadError] = useState('');
  const searchRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let isActive = true;

    const loadSearchData = async () => {
      const [profilesResult, compositesResult, scrapbooksResult] = await Promise.allSettled([
        getProfiles(),
        getComposites(),
        getScrapbooks(),
      ]);

      if (!isActive) {
        return;
      }

      if (profilesResult.status === 'fulfilled') {
        setProfiles(Array.isArray(profilesResult.value) ? profilesResult.value : []);
      }

      if (compositesResult.status === 'fulfilled') {
        setComposites(Array.isArray(compositesResult.value) ? compositesResult.value : []);
      }

      if (scrapbooksResult.status === 'fulfilled') {
        setScrapbooks(Array.isArray(scrapbooksResult.value) ? scrapbooksResult.value : []);
      }

      if (
        profilesResult.status === 'rejected'
        && compositesResult.status === 'rejected'
        && scrapbooksResult.status === 'rejected'
      ) {
        setLoadError('Search results could not be loaded.');
      }
    };

    loadSearchData();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (searchRef.current?.contains(event.target)) {
        return;
      }

      setOpen(false);
      setIsFilterMenuOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const activeFilterIds = useMemo(
    () => new Set(selectedFilterIds),
    [selectedFilterIds],
  );
  const allFiltersSelected = selectedFilterIds.length === SEARCH_FILTER_OPTIONS.length;
  const noFiltersSelected = selectedFilterIds.length === 0;

  const results = useMemo(() => {
    const value = query.trim().toLowerCase();

    if (!value || noFiltersSelected) {
      return [];
    }

    const memberResults = activeFilterIds.has('member')
      ? profiles
        .map((profile) => buildMemberSearchItem(profile, value))
        .filter(Boolean)
      : [];
    const compositeResults = activeFilterIds.has('composite')
      ? composites
        .map((composite) => buildCompositeSearchItem(composite, value))
        .filter(Boolean)
      : [];
    const scrapbookResults = activeFilterIds.has('scrapbook')
      ? scrapbooks
        .map((scrapbook) => buildScrapbookSearchItem(scrapbook, value))
        .filter(Boolean)
      : [];

    return [...memberResults, ...compositeResults, ...scrapbookResults].sort(compareSearchItems);
  }, [activeFilterIds, composites, noFiltersSelected, profiles, query, scrapbooks]);

  const handleInputFocus = () => {
    setIsFilterMenuOpen(false);
    setOpen(true);
  };

  const handleToggleFilterMenu = () => {
    const nextValue = !isFilterMenuOpen;
    setIsFilterMenuOpen(nextValue);
    setOpen(!nextValue && query.trim().length > 0);
  };

  const handleToggleAllFilters = () => {
    setSelectedFilterIds(allFiltersSelected ? [] : ALL_FILTER_IDS);
  };

  const handleToggleFilter = (filterId) => {
    setSelectedFilterIds((currentFilterIds) => (
      currentFilterIds.includes(filterId)
        ? currentFilterIds.filter((currentId) => currentId !== filterId)
        : [...currentFilterIds, filterId]
    ));
  };

  const handleSelect = (result) => {
    setQuery(result.label);
    setOpen(false);
    setIsFilterMenuOpen(false);
    setTimeout(() => navigate(result.to), 100);
  };

  const handleClearQuery = () => {
    setQuery('');
    setOpen(true);
    setIsFilterMenuOpen(false);
    inputRef.current?.focus();
  };

  return (
    <section className="search section" aria-label="Search">
      <div className="container">
        <div className="search__outer">
          <label className="sr-only" htmlFor="archive-search">
            Search
          </label>

          <form
            ref={searchRef}
            className="search__inputWrap"
            onSubmit={(event) => event.preventDefault()}
            role="search"
          >
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
              ref={inputRef}
              id="archive-search"
              className="search__input"
              type="search"
              placeholder="Search by name, city, state, or year..."
              autoComplete="off"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setIsFilterMenuOpen(false);
                setOpen(true);
              }}
              onFocus={handleInputFocus}
            />

            {query ? (
              <button
                type="button"
                className="search__clearButton"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleClearQuery}
                aria-label="Clear search"
              >
                <ClearIcon />
              </button>
            ) : null}

            <button
              type="button"
              className={[
                'search__filterButton',
                isFilterMenuOpen ? 'search__filterButton--active' : '',
              ].filter(Boolean).join(' ')}
              onClick={handleToggleFilterMenu}
              aria-label="Open search filters"
              aria-haspopup="menu"
              aria-expanded={isFilterMenuOpen ? 'true' : 'false'}
            >
              <FilterIcon />
            </button>

            {isFilterMenuOpen ? (
              <div className="search__filterMenu" role="menu" aria-label="Search filters">
                <label className="search__filterOption">
                  <input
                    type="checkbox"
                    checked={allFiltersSelected}
                    onChange={handleToggleAllFilters}
                  />
                  <span>Select all</span>
                </label>

                <div className="search__filterDivider" />

                {SEARCH_FILTER_OPTIONS.map((option) => (
                  <label key={option.id} className="search__filterOption">
                    <input
                      type="checkbox"
                      checked={selectedFilterIds.includes(option.id)}
                      onChange={() => handleToggleFilter(option.id)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            ) : null}

            {open && !isFilterMenuOpen ? (
              <div className="search__dropdown" role="listbox" aria-label="Search suggestions">
                {loadError ? (
                  <p className="search__empty">{loadError}</p>
                ) : query.trim().length === 0 ? (
                  <p className="search__empty">Start typing to see matches.</p>
                ) : noFiltersSelected ? (
                  <p className="search__empty">Select at least one filter to search the archive.</p>
                ) : results.length === 0 ? (
                  <p className="search__empty">No matching results.</p>
                ) : (
                  <ul className="search__list">
                    {results.map((result) => (
                      <li key={result.key} className="search__item">
                        <button type="button" onMouseDown={() => handleSelect(result)}>
                          <span className="search__itemLead">
                            <span className="search__itemTypeIcon" aria-hidden="true">
                              <SearchItemIcon kind={result.kind} />
                            </span>

                            <span className="search__itemText">
                              <span className="search__itemName">{result.label}</span>
                              <span className="search__itemMeta search__itemMeta--stacked">
                                {result.meta}
                              </span>
                            </span>
                          </span>

                          <span className="search__itemMeta search__itemMeta--side">{result.meta}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </section>
  );
}

function buildMemberSearchItem(profile, query) {
  const label = profile.displayName || 'Unnamed member';
  const fields = [
    label,
    profile.firstName,
    profile.lastName,
    profile.preferredName,
    profile.city,
    profile.stateProvince,
    profile.graduationYear ? String(profile.graduationYear) : '',
  ];
  const score = getSearchScore(fields, query, {
    exactBoost: String(profile.graduationYear || '') === query ? 12 : 0,
  });

  if (score <= 0) {
    return null;
  }

  return {
    key: `member-${profile.id}`,
    kind: 'member',
    label,
    meta: buildMemberMeta(profile),
    score,
    to: `/member/${profile.id}`,
  };
}

function buildCompositeSearchItem(composite, query) {
  const year = String(composite.compositeYear || '').trim();
  const label = year ? `${year} Composite` : 'Composite';
  const fields = [
    label,
    year,
    composite.displayName,
    composite.originalFilename,
    'composite',
    'archive',
  ];
  const score = getSearchScore(fields, query, {
    exactBoost: year === query ? 34 : 0,
  });

  if (score <= 0) {
    return null;
  }

  return {
    key: `composite-${composite.compositeId}`,
    kind: 'composite',
    label,
    meta: 'Composite Image',
    score,
    to: buildCompositeLink(year),
  };
}

function buildScrapbookSearchItem(scrapbook, query) {
  const year = String(scrapbook.scrapbookYear || '').trim();
  const label = scrapbook.title || (year ? `${year} Scrapbook` : 'Scrapbook');
  const fields = [
    label,
    year,
    scrapbook.title,
    scrapbook.originalFilename,
    ...(Array.isArray(scrapbook.pageOriginalFilenames) ? scrapbook.pageOriginalFilenames.slice(0, 3) : []),
    'scrapbook',
    'archive',
  ];
  const score = getSearchScore(fields, query, {
    exactBoost: year === query ? 30 : 0,
  });

  if (score <= 0) {
    return null;
  }

  return {
    key: `scrapbook-${scrapbook.scrapbookId || year || label}`,
    kind: 'scrapbook',
    label,
    meta: buildScrapbookMeta(scrapbook),
    score,
    to: buildScrapbookLink(year),
  };
}

function getSearchScore(fields, query, { exactBoost = 0 } = {}) {
  let bestScore = 0;

  fields.forEach((field) => {
    const normalizedField = String(field || '').trim().toLowerCase();

    if (!normalizedField) {
      return;
    }

    if (normalizedField === query) {
      bestScore = Math.max(bestScore, 120);
      return;
    }

    if (normalizedField.startsWith(query)) {
      bestScore = Math.max(bestScore, 82);
      return;
    }

    if (normalizedField.includes(query)) {
      bestScore = Math.max(bestScore, 48);
    }
  });

  return bestScore > 0 ? bestScore + exactBoost : 0;
}

function compareSearchItems(leftItem, rightItem) {
  if (rightItem.score !== leftItem.score) {
    return rightItem.score - leftItem.score;
  }

  return leftItem.label.localeCompare(rightItem.label, undefined, {
    sensitivity: 'base',
  });
}

function buildMemberMeta(profile) {
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

function buildCompositeLink(compositeYear) {
  if (!compositeYear) {
    return '/composites';
  }

  return `/composites?year=${encodeURIComponent(compositeYear)}`;
}

function buildScrapbookMeta(scrapbook) {
  const year = String(scrapbook.scrapbookYear || '').trim();
  const pageCount = Number(scrapbook.pageCount || scrapbook.pageImageUrls?.length || 0);
  const pageLabel = pageCount > 0 ? `${pageCount} page${pageCount === 1 ? '' : 's'}` : '';

  if (year && pageLabel) {
    return `${pageLabel} | Class year ${year}`;
  }

  if (pageLabel) {
    return pageLabel;
  }

  if (year) {
    return `Class year ${year}`;
  }

  return 'Scrapbook volume';
}

function buildScrapbookLink(scrapbookYear) {
  if (!scrapbookYear) {
    return '/scrapbooks';
  }

  return `/scrapbooks?year=${encodeURIComponent(scrapbookYear)}`;
}

function SearchItemIcon({ kind }) {
  if (kind === 'member') {
    return <MemberIcon />;
  }

  if (kind === 'scrapbook') {
    return <ScrapbookIcon />;
  }

  return <CompositeIcon />;
}

function FilterIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 6H20L14 13V19L10 21V13L4 6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

function MemberIcon() {
  return (
    <svg className="search__itemTypeGlyph" width="20" height="20" viewBox="0 0 80.13 80.13" fill="currentColor" aria-hidden="true">
      <path
        d="M40.656,41.984c6.491,0,11.752-5.262,11.752-11.752s-5.262-11.751-11.752-11.751c-6.49,0-11.754,5.262-11.754,11.752S34.166,41.984,40.656,41.984z"
      />
      <path
        d="M45.641,42.785h-9.972c-8.297,0-15.047,6.751-15.047,15.048v12.195l0.031,0.191l0.84,0.263c7.918,2.474,14.797,3.299,20.459,3.299c11.059,0,17.469-3.153,17.864-3.354l0.785-0.397h0.084V57.833C60.688,49.536,53.938,42.785,45.641,42.785z"
      />
    </svg>
  );
}

function CompositeIcon() {
  return (
    <svg className="search__itemTypeGlyph" width="20" height="20" viewBox="0 0 80.13 80.13" fill="currentColor" aria-hidden="true">
      <path
        d="M48.355,17.922c3.705,2.323,6.303,6.254,6.776,10.817c1.511,0.706,3.188,1.112,4.966,1.112c6.491,0,11.752-5.261,11.752-11.751c0-6.491-5.261-11.752-11.752-11.752C53.668,6.35,48.453,11.517,48.355,17.922z M40.656,41.984c6.491,0,11.752-5.262,11.752-11.752s-5.262-11.751-11.752-11.751c-6.49,0-11.754,5.262-11.754,11.752S34.166,41.984,40.656,41.984z M45.641,42.785h-9.972c-8.297,0-15.047,6.751-15.047,15.048v12.195l0.031,0.191l0.84,0.263c7.918,2.474,14.797,3.299,20.459,3.299c11.059,0,17.469-3.153,17.864-3.354l0.785-0.397h0.084V57.833C60.688,49.536,53.938,42.785,45.641,42.785z M65.084,30.653h-9.895c-0.107,3.959-1.797,7.524-4.47,10.088c7.375,2.193,12.771,9.032,12.771,17.11v3.758c9.77-0.358,15.4-3.127,15.771-3.313l0.785-0.398h0.084V45.699C80.13,37.403,73.38,30.653,65.084,30.653z M20.035,29.853c2.299,0,4.438-0.671,6.25-1.814c0.576-3.757,2.59-7.04,5.467-9.276c0.012-0.22,0.033-0.438,0.033-0.66c0-6.491-5.262-11.752-11.75-11.752c-6.492,0-11.752,5.261-11.752,11.752C8.283,24.591,13.543,29.853,20.035,29.853z M30.589,40.741c-2.66-2.551-4.344-6.097-4.467-10.032c-0.367-0.027-0.73-0.056-1.104-0.056h-9.971C6.75,30.653,0,37.403,0,45.699v12.197l0.031,0.188l0.84,0.265c6.352,1.983,12.021,2.897,16.945,3.185v-3.683C17.818,49.773,23.212,42.936,30.589,40.741z"
      />
    </svg>
  );
}

function ScrapbookIcon() {
  return (
    <img
      className="search__itemTypeGlyph search__itemTypeGlyph--image"
      src={scrapbookBookIcon}
      alt=""
      aria-hidden="true"
      draggable="false"
    />
  );
}
