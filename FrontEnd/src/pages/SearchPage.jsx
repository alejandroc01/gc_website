import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import {
  getComposites,
  getHistories,
  getOralHistories,
  getProfile,
  getProfiles,
  getScrapbooks,
  getScrapbookMetadataReview,
} from '../api/composites.js';
import ScrapbookPageModal from '../components/Scrapbook/ScrapbookPageModal.jsx';
import './SearchPage.css';

const SECTION_CARD_LIMIT = 12;
const SEARCH_FILTER_OPTIONS = [
  { id: 'member', label: 'Members', sectionTitle: 'Members', viewAllHref: '' },
  { id: 'composite', label: 'Composites', sectionTitle: 'Composites', viewAllHref: '/composites' },
  { id: 'scrapbook', label: 'Scrapbooks', sectionTitle: 'Scrapbooks', viewAllHref: '/scrapbooks' },
  { id: 'scrapbookPage', label: 'Scrapbook Pages', sectionTitle: 'Scrapbook Pages', viewAllHref: '/scrapbooks' },
  { id: 'oralHistory', label: 'Oral History', sectionTitle: 'Oral Histories', viewAllHref: '/oral-histories' },
  { id: 'oralHistoryEpisode', label: 'Oral History Episodes', sectionTitle: 'Oral History Episodes', viewAllHref: '/oral-histories' },
  { id: 'clubHistory', label: 'Club History', sectionTitle: 'Club History', viewAllHref: '/written-history' },
];
const ALL_FILTER_IDS = SEARCH_FILTER_OPTIONS.map((option) => option.id);

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [selectedFilterIds, setSelectedFilterIds] = useState(() =>
    parseSelectedFilters(searchParams.get('filters')),
  );
  const [profiles, setProfiles] = useState([]);
  const [composites, setComposites] = useState([]);
  const [scrapbooks, setScrapbooks] = useState([]);
  const [clubHistories, setClubHistories] = useState([]);
  const [oralHistories, setOralHistories] = useState([]);
  const [scrapbookMetadataRows, setScrapbookMetadataRows] = useState([]);
  const [memberScrapbookItems, setMemberScrapbookItems] = useState([]);
  const [isSearchDataLoading, setIsSearchDataLoading] = useState(true);
  const [isMemberScrapbookLoading, setIsMemberScrapbookLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [activeScrapbookIdentifier, setActiveScrapbookIdentifier] = useState('');

  useEffect(() => {
    const nextQuery = searchParams.get('q') || '';
    setQuery((currentQuery) => (currentQuery === nextQuery ? currentQuery : nextQuery));
    setSelectedFilterIds((currentFilterIds) => {
      const nextFilterIds = parseSelectedFilters(searchParams.get('filters'));
      return areFilterIdsEqual(currentFilterIds, nextFilterIds) ? currentFilterIds : nextFilterIds;
    });
  }, [searchParams]);

  useEffect(() => {
    const nextSearchParams = new URLSearchParams();
    const normalizedQuery = query.trim();

    if (normalizedQuery) {
      nextSearchParams.set('q', normalizedQuery);
    }

    if (selectedFilterIds.length !== ALL_FILTER_IDS.length) {
      nextSearchParams.set('filters', selectedFilterIds.join(','));
    }

    if (nextSearchParams.toString() !== searchParams.toString()) {
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [query, searchParams, selectedFilterIds, setSearchParams]);

  useEffect(() => {
    let isActive = true;

    const loadSearchData = async () => {
      setIsSearchDataLoading(true);
      setLoadError('');

      try {
        const [
          profilesResult,
          compositesResult,
          scrapbooksResult,
          clubHistoriesResult,
          oralHistoriesResult,
          scrapbookMetadataResult,
        ] = await Promise.allSettled([
          getProfiles(),
          getComposites(),
          getScrapbooks(),
          getHistories(),
          getOralHistories(),
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

        if (clubHistoriesResult.status === 'fulfilled') {
          setClubHistories(Array.isArray(clubHistoriesResult.value) ? clubHistoriesResult.value : []);
        }

        if (oralHistoriesResult.status === 'fulfilled') {
          setOralHistories(Array.isArray(oralHistoriesResult.value) ? oralHistoriesResult.value : []);
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
          && clubHistoriesResult.status === 'rejected'
          && oralHistoriesResult.status === 'rejected'
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

        if (isActive) {
          setMemberScrapbookItems(buildMemberScrapbookSearchItems(detailedProfiles, value));
        }
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

  const activeFilterIds = useMemo(() => new Set(selectedFilterIds), [selectedFilterIds]);
  const allFiltersSelected = selectedFilterIds.length === ALL_FILTER_IDS.length;
  const noFiltersSelected = selectedFilterIds.length === 0;
  const normalizedQuery = query.trim().toLowerCase();

  const resultsByFilterId = useMemo(() => {
    if (!normalizedQuery || noFiltersSelected) {
      return {};
    }

    const memberResults = activeFilterIds.has('member')
      ? profiles.map((profile) => buildMemberSearchItem(profile, normalizedQuery)).filter(Boolean)
      : [];
    const compositeResults = activeFilterIds.has('composite')
      ? composites.map((composite) => buildCompositeSearchItem(composite, normalizedQuery)).filter(Boolean)
      : [];
    const scrapbookResults = activeFilterIds.has('scrapbook')
      ? scrapbooks.map((scrapbook) => buildScrapbookSearchItem(scrapbook, normalizedQuery)).filter(Boolean)
      : [];
    const clubHistoryResults = activeFilterIds.has('clubHistory')
      ? clubHistories.map((history) => buildClubHistorySearchItem(history, normalizedQuery)).filter(Boolean)
      : [];
    const oralHistoryResults = activeFilterIds.has('oralHistory')
      ? buildOralHistorySearchItems(oralHistories, normalizedQuery)
      : [];
    const oralHistoryEpisodeResults = activeFilterIds.has('oralHistoryEpisode')
      ? oralHistories
        .map((episode) => buildOralHistoryEpisodeSearchItem(episode, normalizedQuery))
        .filter(Boolean)
      : [];
    const uploadedScrapbookPageResults = activeFilterIds.has('scrapbookPage')
      ? buildUploadedScrapbookPageSearchItems(scrapbooks, normalizedQuery)
      : [];
    const metadataScrapbookPageResults = activeFilterIds.has('scrapbookPage')
      ? buildMetadataScrapbookPageSearchItems(scrapbookMetadataRows, normalizedQuery)
      : [];
    const taggedScrapbookResults = activeFilterIds.has('scrapbookPage')
      ? buildTaggedScrapbookSearchItems(scrapbookMetadataRows, normalizedQuery, memberScrapbookItems)
      : [];
    const scrapbookPageResults = activeFilterIds.has('scrapbookPage')
      ? dedupeSearchItems([
        ...uploadedScrapbookPageResults,
        ...memberScrapbookItems,
        ...metadataScrapbookPageResults,
        ...taggedScrapbookResults,
      ])
      : [];

    return {
      member: memberResults.sort(compareSearchItems),
      composite: compositeResults.sort(compareSearchItems),
      scrapbook: scrapbookResults.sort(compareSearchItems),
      scrapbookPage: scrapbookPageResults.sort(compareSearchItems),
      oralHistory: oralHistoryResults.sort(compareSearchItems),
      oralHistoryEpisode: oralHistoryEpisodeResults.sort(compareSearchItems),
      clubHistory: clubHistoryResults.sort(compareSearchItems),
    };
  }, [
    activeFilterIds,
    clubHistories,
    composites,
    memberScrapbookItems,
    noFiltersSelected,
    normalizedQuery,
    oralHistories,
    profiles,
    scrapbookMetadataRows,
    scrapbooks,
  ]);

  const visibleSections = SEARCH_FILTER_OPTIONS
    .filter((option) => activeFilterIds.has(option.id))
    .map((option) => ({
      ...option,
      items: resultsByFilterId[option.id] || [],
      emptyMessage: buildSectionEmptyMessage({
        option,
        hasQuery: Boolean(normalizedQuery),
        isLoading: isSearchDataLoading
          || (option.id === 'scrapbookPage' && isMemberScrapbookLoading),
        loadError,
      }),
    }));
  const resultCount = visibleSections.reduce((total, section) => total + section.items.length, 0);

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

  const handleClearQuery = () => {
    setQuery('');
  };

  const handleCloseScrapbookModal = () => {
    setActiveScrapbookIdentifier('');
  };

  return (
    <div className="searchPage">
      <section className="searchPage__hero section">
        <div className="container">
          <p className="searchPage__eyebrow">German Club Alumni Archives</p>
          <h1 className="searchPage__title">Advanced Search</h1>
          <p className="searchPage__lede">
            Search the same archive index used on the homepage, then narrow results by collection.
          </p>

          <div className="searchPage__barWrap">
            <label className="sr-only" htmlFor="archive-search-page-input">
              Search the archive
            </label>
            <input
              id="archive-search-page-input"
              className="searchPage__bar"
              type="search"
              placeholder="Search by name, city, state, year, title, or collection..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button type="button" className="searchPage__clearButton" onClick={handleClearQuery}>
                Clear
              </button>
            ) : null}
          </div>

          <div className="searchPage__filters" aria-label="Search filters">
            <label className="searchPage__filterOption searchPage__filterOption--all">
              <input
                type="checkbox"
                checked={allFiltersSelected}
                onChange={handleToggleAllFilters}
              />
              <span>Select all</span>
            </label>

            {SEARCH_FILTER_OPTIONS.map((option) => (
              <label key={option.id} className="searchPage__filterOption">
                <input
                  type="checkbox"
                  checked={selectedFilterIds.includes(option.id)}
                  onChange={() => handleToggleFilter(option.id)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>

          <p className="searchPage__summary" role="status" aria-live="polite">
            {!normalizedQuery
              ? 'Enter a search term to see grouped archive results.'
              : noFiltersSelected
                ? 'Select at least one filter to search the archive.'
                : isSearchDataLoading
                  ? 'Loading archive search data...'
                  : `${resultCount} matching result${resultCount === 1 ? '' : 's'}.`}
          </p>
        </div>
      </section>

      <section className="searchPage__results section">
        <div className="container searchPage__sections">
          {noFiltersSelected ? (
            <div className="searchPage__emptyState">
              <p className="searchPage__emptyTitle">Select at least one filter to search the archive.</p>
            </div>
          ) : (
            visibleSections.map((section) => (
              <SectionRow
                key={section.id}
                title={section.sectionTitle}
                items={section.items}
                viewAllHref={section.viewAllHref ? buildSectionLink(section.viewAllHref, query) : ''}
                emptyMessage={section.emptyMessage}
                onOpenScrapbookPage={setActiveScrapbookIdentifier}
              />
            ))
          )}
        </div>
      </section>

      {activeScrapbookIdentifier ? (
        <ScrapbookPageModal
          identifier={activeScrapbookIdentifier}
          onClose={handleCloseScrapbookModal}
        />
      ) : null}
    </div>
  );
}

function SectionRow({
  title,
  items,
  viewAllHref,
  emptyMessage,
  onOpenScrapbookPage,
}) {
  const visibleItems = items.slice(0, SECTION_CARD_LIMIT);

  return (
    <section className="searchPage__section" aria-label={title}>
      <div className="searchPage__sectionHeader">
        <div>
          <p className="searchPage__sectionLabel">Search results</p>
          <h2 className="searchPage__sectionTitle">
            {title}
            <span className="searchPage__sectionCount">{items.length}</span>
          </h2>
        </div>

        {viewAllHref ? (
          <Link className="button searchPage__viewAll" to={viewAllHref}>
            View All
          </Link>
        ) : null}
      </div>

      {visibleItems.length > 0 ? (
        <div className="searchPage__grid">
          {visibleItems.map((item) => (
            <SearchResultCard
              key={item.key}
              item={item}
              title={title}
              onOpenScrapbookPage={onOpenScrapbookPage}
            />
          ))}
        </div>
      ) : (
        <div className="searchPage__emptyState">
          <p className="searchPage__emptyTitle">{emptyMessage}</p>
        </div>
      )}
    </section>
  );
}

function SearchResultCard({ item, title, onOpenScrapbookPage }) {
  const content = (
    <>
      <span className="searchPage__cardEyebrow">{title}</span>
      <h3 className="searchPage__cardTitle">{item.label}</h3>
      <p className="searchPage__cardMeta">{item.meta}</p>
    </>
  );

  if (item.modalIdentifier) {
    return (
      <button
        type="button"
        className="searchPage__card searchPage__card--button"
        onClick={() => onOpenScrapbookPage(item.modalIdentifier)}
      >
        {content}
      </button>
    );
  }

  return (
    <Link className="searchPage__card" to={item.to}>
      {content}
    </Link>
  );
}

function buildSectionEmptyMessage({
  option,
  hasQuery,
  isLoading,
  loadError,
}) {
  if (loadError) {
    return loadError;
  }

  if (!hasQuery) {
    return 'Enter a search term to search this collection.';
  }

  if (isLoading) {
    return `Loading ${option.label.toLowerCase()} results...`;
  }

  return `No matching ${option.label.toLowerCase()}.`;
}

function parseSelectedFilters(rawFilters) {
  if (rawFilters === null) {
    return ALL_FILTER_IDS;
  }

  const filterIds = String(rawFilters || '')
    .split(',')
    .map((filterId) => filterId.trim())
    .filter((filterId) => ALL_FILTER_IDS.includes(filterId));

  return Array.from(new Set(filterIds));
}

function areFilterIdsEqual(leftFilterIds, rightFilterIds) {
  return leftFilterIds.length === rightFilterIds.length
    && leftFilterIds.every((filterId, index) => filterId === rightFilterIds[index]);
}

function buildSectionLink(pathname, query) {
  const searchParams = new URLSearchParams();
  const normalizedQuery = query.trim();

  if (normalizedQuery) {
    searchParams.set('q', normalizedQuery);
  }

  const serializedParams = searchParams.toString();
  return serializedParams ? `${pathname}?${serializedParams}` : pathname;
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
    year,
    to: buildCompositeLink(year),
  };
}

function buildClubHistorySearchItem(history, query) {
  const title = String(history?.title || history?.originalFilename || '').trim();
  const key = String(history?.key || '').trim();
  const years = extractAssociatedYears([
    title,
    key,
    history?.description,
    history?.originalFilename,
  ]);
  const label = title || 'Club History';
  const fields = [
    label,
    key,
    history?.description,
    history?.originalFilename,
    'club history',
    'history document',
    'written history',
    ...years,
  ];
  const score = getSearchScore(fields, query, {
    exactBoost: years.includes(query) ? 28 : 0,
  });

  if (score <= 0) {
    return null;
  }

  return {
    key: `club-history-${history?.historyId || key || label}`,
    kind: 'clubHistory',
    label,
    meta: buildClubHistoryMeta(years),
    score,
    historyKey: key,
    year: years[years.length - 1] || '',
    to: buildClubHistoryLink(key),
  };
}

function buildOralHistorySearchItems(episodes, query) {
  const groupsByInterviewee = new Map();

  (Array.isArray(episodes) ? episodes : []).forEach((episode) => {
    const normalizedEpisode = normalizeOralHistorySearchEpisode(episode);
    const interviewee = normalizeSearchText(normalizedEpisode.interviewee);

    if (!interviewee) {
      return;
    }

    const key = interviewee.toLowerCase();
    const existingGroup = groupsByInterviewee.get(key) || {
      interviewee,
      episodes: [],
    };

    existingGroup.episodes.push(normalizedEpisode);
    groupsByInterviewee.set(key, existingGroup);
  });

  return Array.from(groupsByInterviewee.values())
    .map((group) => {
      const fields = [
        group.interviewee,
        'oral history',
        'oral histories',
        'interview',
        ...group.episodes.flatMap((episode) => [
          episode.title,
          episode.category,
          episode.key,
          episode.isFullLength ? 'full interview' : '',
          episode.episodeNumber ? `episode ${episode.episodeNumber}` : '',
        ]),
      ];
      const score = getSearchScore(fields, query, {
        exactBoost: group.interviewee.toLowerCase() === query ? 32 : 0,
      });

      if (score <= 0) {
        return null;
      }

      return {
        key: `oral-history-${normalizeSearchKey(group.interviewee)}`,
        kind: 'oralHistory',
        label: `${group.interviewee} Oral History`,
        meta: buildOralHistoryMeta(group.episodes),
        score,
        interviewee: group.interviewee,
        to: buildOralHistoryLink(group.interviewee),
      };
    })
    .filter(Boolean);
}

function buildOralHistoryEpisodeSearchItem(episode, query) {
  const normalizedEpisode = normalizeOralHistorySearchEpisode(episode);
  const episodeLabel = formatOralHistoryEpisodeLabel(normalizedEpisode);
  const title = formatOralHistoryEpisodeTitle(normalizedEpisode.title);
  const label = [
    normalizedEpisode.interviewee || 'Oral History',
    [episodeLabel, title].filter(Boolean).join(': '),
  ].filter(Boolean).join(' - ');
  const fields = [
    label,
    normalizedEpisode.interviewee,
    normalizedEpisode.title,
    normalizedEpisode.key,
    normalizedEpisode.category,
    normalizedEpisode.isFullLength ? 'full interview' : '',
    normalizedEpisode.episodeNumber ? `episode ${normalizedEpisode.episodeNumber}` : '',
    normalizedEpisode.episodeNumber ? String(normalizedEpisode.episodeNumber) : '',
    'oral history episode',
    'oral history',
    'interview episode',
  ];
  const score = getSearchScore(fields, query, {
    exactBoost: normalizedEpisode.episodeNumber && String(normalizedEpisode.episodeNumber) === query ? 16 : 0,
  });

  if (score <= 0) {
    return null;
  }

  return {
    key: `oral-history-episode-${normalizedEpisode.oralHistoryId || normalizedEpisode.key || normalizeSearchKey(label)}`,
    kind: 'oralHistoryEpisode',
    label,
    meta: normalizedEpisode.isFullLength
      ? 'Full Interview | Oral History'
      : `${normalizedEpisode.category || 'Episode'} | Oral History Episode`,
    score,
    interviewee: normalizedEpisode.interviewee,
    episodeId: normalizedEpisode.oralHistoryId || normalizedEpisode.key,
    to: buildOralHistoryLink(
      normalizedEpisode.interviewee,
      normalizedEpisode.oralHistoryId || normalizedEpisode.key,
    ),
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
        year: String(page.year || '').trim(),
        pageNumber: normalizePositiveInteger(page.pageNumber),
        to: page.to || buildScrapbookLink(page.year),
        modalIdentifier: page.identifier,
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
        year: String(row?.year || '').trim(),
        pageIndex: normalizeZeroBasedInteger(row?.pageIndex),
        pageNumber: normalizePositiveInteger(row?.pageNumber),
        to,
        modalIdentifier: row.identifier,
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
      year,
      pageIndex: normalizeZeroBasedInteger(row?.pageIndex),
      pageNumber,
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
        year,
        pageIndex,
        pageNumber,
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
    year,
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

function buildClubHistoryLink(historyKey) {
  if (!historyKey) {
    return '/written-history';
  }

  return `/written-history?history=${encodeURIComponent(historyKey)}`;
}

function buildOralHistoryLink(interviewee, episodeId = '') {
  const searchParams = new URLSearchParams();
  const normalizedInterviewee = normalizeSearchText(interviewee);
  const normalizedEpisodeId = normalizeSearchText(episodeId);

  if (normalizedInterviewee) {
    searchParams.set('interviewee', normalizedInterviewee);
  }

  if (normalizedEpisodeId) {
    searchParams.set('episode', normalizedEpisodeId);
  }

  const serializedParams = searchParams.toString();
  return serializedParams ? `/oral-histories?${serializedParams}` : '/oral-histories';
}

function buildClubHistoryMeta(years) {
  const yearLabel = years.length > 0 ? ` | ${years.join(', ')}` : '';
  return `Club History Document${yearLabel}`;
}

function buildOralHistoryMeta(episodes) {
  const episodeCount = episodes.length;
  const fullInterviewCount = episodes.filter((episode) => episode.isFullLength).length;
  const numberedEpisodeCount = episodeCount - fullInterviewCount;
  const parts = [];

  if (fullInterviewCount > 0) {
    parts.push(`${fullInterviewCount} full interview${fullInterviewCount === 1 ? '' : 's'}`);
  }

  if (numberedEpisodeCount > 0) {
    parts.push(`${numberedEpisodeCount} episode${numberedEpisodeCount === 1 ? '' : 's'}`);
  }

  return parts.length > 0 ? parts.join(' | ') : 'Oral History Interview';
}

function normalizeOralHistorySearchEpisode(episode) {
  const isFullLength = Boolean(episode?.isFullLength);

  return {
    oralHistoryId: normalizeSearchText(episode?.oralHistoryId),
    key: normalizeSearchText(episode?.key),
    title: normalizeSearchText(episode?.title),
    interviewee: normalizeSearchText(episode?.interviewee),
    category: normalizeSearchText(episode?.category),
    isFullLength,
    episodeNumber: isFullLength ? null : normalizePositiveInteger(episode?.episodeNumber),
  };
}

function formatOralHistoryEpisodeLabel(episode) {
  return episode?.isFullLength ? 'Full Interview' : `Episode ${episode?.episodeNumber || ''}`.trim();
}

function formatOralHistoryEpisodeTitle(title) {
  const normalizedTitle = normalizeSearchText(title);

  if (!normalizedTitle) {
    return '';
  }

  return normalizedTitle.replace(/^episode\s+\d+\s*(?:-|:|\u2013|\u2014)\s*/i, '').trim();
}

function buildTaggedScrapbookMeta(row) {
  const noteParts = [
    row.year ? `${row.year} Scrapbook` : 'Scrapbook page',
    row.pageNumber ? `Page ${row.pageNumber}` : '',
    row.category || '',
  ].filter(Boolean);

  return noteParts.join(' | ');
}

function extractAssociatedYears(values) {
  const detectedYears = new Set();

  (Array.isArray(values) ? values : []).forEach((value) => {
    const matches = String(value || '').match(/\b(19|20)\d{2}\b/g) || [];
    matches.forEach((match) => detectedYears.add(match));
  });

  return Array.from(detectedYears).sort((leftYear, rightYear) => Number(leftYear) - Number(rightYear));
}

function normalizeSearchText(value) {
  return String(value || '').trim();
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

function normalizeZeroBasedInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalizedValue = Number(value);

  return Number.isInteger(normalizedValue) && normalizedValue >= 0 ? normalizedValue : null;
}
