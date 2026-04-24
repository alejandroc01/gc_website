import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  getComposites,
  getProfile,
  getProfiles,
  getScrapbooks,
  getScrapbookMetadataReview,
} from '../../api/composites.js';
import scrapbookBookIcon from '../../assets/icons/scrapbook-book.svg';
import './SearchBar.css';

const SEARCH_FILTER_OPTIONS = [
  { id: 'composite', label: 'Composites' },
  { id: 'scrapbook', label: 'Scrapbooks' },
  { id: 'member', label: 'Members' },
  { id: 'scrapbookPage', label: 'Scrapbook Pages' },
];

const ALL_FILTER_IDS = SEARCH_FILTER_OPTIONS.map((option) => option.id);

export default function SearchBar({ className = '' }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [isSearchDataLoading, setIsSearchDataLoading] = useState(true);
  const [isMemberScrapbookLoading, setIsMemberScrapbookLoading] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [composites, setComposites] = useState([]);
  const [scrapbooks, setScrapbooks] = useState([]);
  const [scrapbookMetadataRows, setScrapbookMetadataRows] = useState([]);
  const [memberScrapbookItems, setMemberScrapbookItems] = useState([]);
  const [selectedFilterIds, setSelectedFilterIds] = useState(ALL_FILTER_IDS);
  const [loadError, setLoadError] = useState('');
  const searchRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    let isActive = true;

    const loadSearchData = async () => {
      setIsSearchDataLoading(true);

      try {
        const [profilesResult, compositesResult, scrapbooksResult, scrapbookMetadataResult] = await Promise.allSettled([
          getProfiles(),
          getComposites(),
          getScrapbooks(),
          getScrapbookMetadataReview(),
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

        if (scrapbookMetadataResult.status === 'fulfilled') {
          setScrapbookMetadataRows(
            Array.isArray(scrapbookMetadataResult.value?.rows) ? scrapbookMetadataResult.value.rows : [],
          );
        }

        if (
          profilesResult.status === 'rejected'
          && compositesResult.status === 'rejected'
          && scrapbooksResult.status === 'rejected'
          && scrapbookMetadataResult.status === 'rejected'
        ) {
          setLoadError('Search results could not be loaded.');
        }
      } finally {
        if (isActive) {
          setIsSearchDataLoading(false);
        }
      }
    };

    loadSearchData();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    const value = query.trim().toLowerCase();

    if (!value || profiles.length === 0) {
      setMemberScrapbookItems([]);
      setIsMemberScrapbookLoading(false);
      return () => {
        isActive = false;
      };
    }

    const matchingProfiles = profiles
      .map((profile) => buildMemberSearchItem(profile, value))
      .filter(Boolean)
      .slice(0, 5);

    if (matchingProfiles.length === 0) {
      setMemberScrapbookItems([]);
      setIsMemberScrapbookLoading(false);
      return () => {
        isActive = false;
      };
    }

    const loadMemberScrapbookItems = async () => {
      setIsMemberScrapbookLoading(true);

      try {
        const detailedProfiles = await Promise.all(
          matchingProfiles.map((item) => getProfile(item.profileId)),
        );

        if (!isActive) {
          return;
        }

        setMemberScrapbookItems(buildMemberScrapbookSearchItems(detailedProfiles, value));
      } catch {
        if (isActive) {
          setMemberScrapbookItems([]);
        }
      } finally {
        if (isActive) {
          setIsMemberScrapbookLoading(false);
        }
      }
    };

    loadMemberScrapbookItems();

    return () => {
      isActive = false;
    };
  }, [profiles, query]);

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
    const uploadedScrapbookPageResults = activeFilterIds.has('scrapbookPage')
      ? buildUploadedScrapbookPageSearchItems(scrapbooks, value)
      : [];
    const memberScrapbookResults = activeFilterIds.has('scrapbookPage')
      ? memberScrapbookItems
      : [];
    const metadataScrapbookPageResults = activeFilterIds.has('scrapbookPage')
      ? buildMetadataScrapbookPageSearchItems(scrapbookMetadataRows, value)
      : [];
    const taggedScrapbookResults = activeFilterIds.has('scrapbookPage')
      ? buildTaggedScrapbookSearchItems(scrapbookMetadataRows, value, memberScrapbookResults)
      : [];
    const scrapbookPageResults = dedupeSearchItems([
      ...uploadedScrapbookPageResults,
      ...memberScrapbookResults,
      ...metadataScrapbookPageResults,
      ...taggedScrapbookResults,
    ]);

    return [
      ...compositeResults.sort(compareSearchItems),
      ...scrapbookResults.sort(compareSearchItems),
      ...memberResults.sort(compareSearchItems),
      ...scrapbookPageResults.sort(compareSearchItems),
    ];
  }, [
    activeFilterIds,
    composites,
    memberScrapbookItems,
    noFiltersSelected,
    profiles,
    query,
    scrapbookMetadataRows,
    scrapbooks,
  ]);
  const showLoadingResults = query.trim().length > 0
    && !loadError
    && !noFiltersSelected
    && (isSearchDataLoading || (activeFilterIds.has('scrapbookPage') && isMemberScrapbookLoading && results.length === 0));

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
    <section className={['search', 'section', className].filter(Boolean).join(' ')} aria-label="Search">
      <div className="container">
        <div className="search__outer">
          <div className="search__panel">
            <div className="search__header">
              <h2 className="search__title">Archive Search</h2>
              <p className="search__description">
                Find members, composites, scrapbooks, oral histories, and club history.
              </p>
            </div>

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
                  ) : showLoadingResults ? (
                    <p className="search__empty">Loading results...</p>
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
                              <SearchResultMedia result={result} />

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
    profileId: profile.id,
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

function buildMemberScrapbookSearchItems(profiles, query) {
  const itemsByKey = new Map();

  (Array.isArray(profiles) ? profiles : []).forEach((profile) => {
    const profileLabel = profile?.displayName || 'Member';
    const memberScore = getSearchScore([
      profileLabel,
      profile?.firstName,
      profile?.lastName,
      profile?.preferredName,
    ], query);

    if (memberScore <= 0) {
      return;
    }

    (Array.isArray(profile?.relatedScrapbookPages) ? profile.relatedScrapbookPages : []).forEach((page) => {
      const identifier = page.identifier || page.title || page.to;
      const key = `member-scrapbook-${profile.id}-${identifier}`;

      if (itemsByKey.has(key)) {
        return;
      }

      itemsByKey.set(key, {
        key,
        kind: 'scrapbookPage',
        label: `${profileLabel} in ${page.title || 'scrapbook page'}`,
        meta: buildMemberScrapbookMeta(page),
        score: memberScore + 18,
        to: page.to || buildScrapbookLink(page.year),
      });
    });
  });

  return Array.from(itemsByKey.values()).slice(0, 8);
}

function buildTaggedScrapbookSearchItems(metadataRows, query, memberScrapbookItems = []) {
  const itemsByKey = new Map();
  const profileLinkedPageTargets = new Set(
    (Array.isArray(memberScrapbookItems) ? memberScrapbookItems : [])
      .map((item) => String(item?.to || ''))
      .filter(Boolean),
  );

  (Array.isArray(metadataRows) ? metadataRows : []).forEach((row) => {
    const people = Array.isArray(row?.people) ? row.people : [];

    people.forEach((person) => {
      const rawName = String(person?.rawName || '').trim();

      if (!rawName) {
        return;
      }

      const score = getSearchScore([rawName], query);

      if (score <= 0) {
        return;
      }

      const identifier = row.identifier || row.title || rawName;
      const key = `tagged-scrapbook-${normalizeSearchKey(rawName)}-${normalizeSearchKey(identifier)}`;
      const to = buildScrapbookLink(row.year, row.pageIndex, row.pageNumber);

      if (itemsByKey.has(key) || (person?.profileId && profileLinkedPageTargets.has(to))) {
        return;
      }

      itemsByKey.set(key, {
        key,
        kind: 'scrapbookPage',
        label: `${rawName} in ${row.title || 'scrapbook page'}`,
        meta: buildTaggedScrapbookMeta(row),
        score: score + 16,
        to,
      });
    });
  });

  return Array.from(itemsByKey.values()).slice(0, 12);
}

function buildMetadataScrapbookPageSearchItems(metadataRows, query) {
  const itemsByKey = new Map();

  (Array.isArray(metadataRows) ? metadataRows : []).forEach((row) => {
    const year = String(row?.year || '').trim();
    const pageNumber = normalizePositiveInteger(row?.pageNumber);
    const title = String(row?.title || '').trim();
    const label = buildScrapbookPageLabel({ year, pageNumber, title });
    const fields = [
      label,
      year,
      title,
      row?.identifier,
      row?.category,
      row?.description,
      row?.source,
      pageNumber ? `page ${pageNumber}` : '',
      pageNumber ? String(pageNumber) : '',
      'scrapbook page',
      ...(Array.isArray(row?.people) ? row.people.map((person) => person?.rawName) : []),
    ];
    const score = getSearchScore(fields, query, {
      exactBoost: year === query ? 26 : 0,
    });

    if (score <= 0) {
      return;
    }

    const to = buildScrapbookLink(year, row?.pageIndex, row?.pageNumber);
    const key = `metadata-scrapbook-page-${normalizeSearchKey(row?.identifier || to || label)}`;

    if (itemsByKey.has(key)) {
      return;
    }

    itemsByKey.set(key, {
      key,
      kind: 'scrapbookPage',
      label,
      meta: buildTaggedScrapbookMeta(row),
      score,
      to,
    });
  });

  return Array.from(itemsByKey.values()).slice(0, 24);
}

function buildUploadedScrapbookPageSearchItems(scrapbooks, query) {
  const items = [];

  (Array.isArray(scrapbooks) ? scrapbooks : []).forEach((scrapbook) => {
    const year = String(scrapbook?.scrapbookYear || '').trim();
    const pageEntries = Array.isArray(scrapbook?.pageEntries) ? scrapbook.pageEntries : [];
    const pageOriginalFilenames = Array.isArray(scrapbook?.pageOriginalFilenames)
      ? scrapbook.pageOriginalFilenames
      : [];
    const pageCount = Math.max(
      pageEntries.length,
      pageOriginalFilenames.length,
      Number(scrapbook?.pageCount || scrapbook?.pageImageUrls?.length || 0),
    );

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      const pageEntry = pageEntries[pageIndex] || {};
      const pageNumber = pageIndex + 1;
      const originalFilename = pageEntry.originalFilename || pageOriginalFilenames[pageIndex] || '';
      const label = buildScrapbookPageLabel({
        year,
        pageNumber,
        title: scrapbook?.title,
      });
      const fields = [
        label,
        year,
        scrapbook?.title,
        originalFilename,
        pageEntry.pageId,
        `page ${pageNumber}`,
        String(pageNumber),
        'scrapbook page',
      ];
      const score = getSearchScore(fields, query, {
        exactBoost: year === query ? 28 : 0,
      });

      if (score <= 0) {
        continue;
      }

      items.push({
        key: `uploaded-scrapbook-page-${scrapbook?.scrapbookId || year || 'scrapbook'}-${pageEntry.pageId || pageNumber}`,
        kind: 'scrapbookPage',
        label,
        meta: buildUploadedScrapbookPageMeta({ year, pageNumber, originalFilename }),
        score,
        to: buildScrapbookLink(year, pageIndex),
      });
    }
  });

  return items.slice(0, 36);
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

function buildMemberScrapbookMeta(page) {
  const noteParts = [
    page.year ? `${page.year} Scrapbook` : 'Scrapbook page',
    page.pageNumber ? `Page ${page.pageNumber}` : '',
    page.category || '',
  ].filter(Boolean);

  return noteParts.join(' | ');
}

function buildScrapbookPageLabel({ year, pageNumber, title }) {
  const normalizedTitle = String(title || '').trim();
  const baseTitle = normalizedTitle || (year ? `${year} Scrapbook` : 'Scrapbook');

  return pageNumber ? `${baseTitle} Page ${pageNumber}` : `${baseTitle} Page`;
}

function buildUploadedScrapbookPageMeta({ year, pageNumber, originalFilename }) {
  const noteParts = [
    year ? `${year} Scrapbook` : 'Scrapbook page',
    pageNumber ? `Page ${pageNumber}` : '',
    originalFilename || '',
  ].filter(Boolean);

  return noteParts.join(' | ');
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

function dedupeSearchItems(items) {
  const dedupedItems = new Map();

  (Array.isArray(items) ? items : []).forEach((item) => {
    const key = String(item?.key || '').trim();

    if (!key || dedupedItems.has(key)) {
      return;
    }

    dedupedItems.set(key, item);
  });

  return Array.from(dedupedItems.values());
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

function buildScrapbookLink(scrapbookYear, pageIndex, pageNumber) {
  if (!scrapbookYear) {
    return '/scrapbooks';
  }

  const searchParams = new URLSearchParams({ year: String(scrapbookYear) });
  const normalizedPageIndex = Number(pageIndex);
  const normalizedPageNumber = Number(pageNumber);

  if (Number.isInteger(normalizedPageIndex) && normalizedPageIndex >= 0) {
    searchParams.set('page', String(normalizedPageIndex + 1));
  } else if (Number.isInteger(normalizedPageNumber) && normalizedPageNumber > 0) {
    searchParams.set('page', String(normalizedPageNumber));
  }

  return `/scrapbooks?${searchParams.toString()}`;
}

function buildTaggedScrapbookMeta(row) {
  const noteParts = [
    row.year ? `${row.year} Scrapbook` : 'Scrapbook page',
    row.pageNumber ? `Page ${row.pageNumber}` : '',
    row.category || '',
  ].filter(Boolean);

  return noteParts.join(' | ');
}

function normalizeSearchKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizePositiveInteger(value) {
  const normalizedValue = Number(value);

  return Number.isInteger(normalizedValue) && normalizedValue > 0 ? normalizedValue : null;
}

function SearchItemIcon({ kind }) {
  if (kind === 'member') {
    return <MemberIcon />;
  }

  if (kind === 'scrapbook' || kind === 'scrapbookPage') {
    return <ScrapbookIcon />;
  }

  return <CompositeIcon />;
}

function SearchResultMedia({ result }) {
  return (
    <span className="search__itemTypeIcon" aria-hidden="true">
      <SearchItemIcon kind={result.kind} />
    </span>
  );
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
