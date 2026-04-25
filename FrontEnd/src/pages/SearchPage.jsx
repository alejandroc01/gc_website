import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { getComposites, getProfiles, getHistories, getOralHistories } from '../api/composites.js';
import './SearchPage.css';

const SECTION_CARD_LIMIT = 8;

const SCRAPBOOK_ITEMS = [
  { key: 'scrapbook-1984', title: '1984 Scrapbook', meta: 'Scrapbook archive preview', href: '/scrapbooks' },
  { key: 'scrapbook-1983', title: '1983 Scrapbook', meta: 'Scrapbook archive preview', href: '/scrapbooks' },
  { key: 'scrapbook-1982', title: '1982 Scrapbook', meta: 'Scrapbook archive placeholder', href: '/scrapbooks' },
  { key: 'scrapbook-1981', title: '1981 Scrapbook', meta: 'Scrapbook archive placeholder', href: '/scrapbooks' },
  { key: 'scrapbook-1980', title: '1980 Scrapbook', meta: 'Scrapbook archive placeholder', href: '/scrapbooks' },
  { key: 'scrapbook-1979', title: '1979 Scrapbook', meta: 'Scrapbook archive placeholder', href: '/scrapbooks' },
  { key: 'scrapbook-1978', title: '1978 Scrapbook', meta: 'Scrapbook archive placeholder', href: '/scrapbooks' },
  { key: 'scrapbook-1977', title: '1977 Scrapbook', meta: 'Scrapbook archive placeholder', href: '/scrapbooks' },
];

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get('q') || '');
  const [profiles, setProfiles] = useState([]);
  const [composites, setComposites] = useState([]);
  const [writtenHistories, setWrittenHistories] = useState([]);
  const [oralHistories, setOralHistories] = useState([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [isLoadingComposites, setIsLoadingComposites] = useState(true);
  const [isLoadingWrittenHistories, setIsLoadingWrittenHistories] = useState(true);
  const [isLoadingOralHistories, setIsLoadingOralHistories] = useState(true);
  const [profilesError, setProfilesError] = useState('');
  const [compositesError, setCompositesError] = useState('');
  const [writtenHistoriesError, setWrittenHistoriesError] = useState('');
  const [oralHistoriesError, setOralHistoriesError] = useState('');

  useEffect(() => {
    const nextQuery = searchParams.get('q') || '';
    setQuery((currentQuery) => (currentQuery === nextQuery ? currentQuery : nextQuery));
  }, [searchParams]);

  useEffect(() => {
    const normalizedQuery = query.trim();
    const currentQuery = searchParams.get('q') || '';

    if (normalizedQuery === currentQuery) {
      return;
    }

    if (normalizedQuery) {
      setSearchParams({ q: normalizedQuery }, { replace: true });
      return;
    }

    setSearchParams({}, { replace: true });
  }, [query, searchParams, setSearchParams]);

  useEffect(() => {
    let isActive = true;
    
    const loadProfiles = async () => {
      setIsLoadingProfiles(true);
      setProfilesError('');

      try {
        const loadedProfiles = await getProfiles();

        if (!isActive) {
          return;
        }

        setProfiles(Array.isArray(loadedProfiles) ? loadedProfiles : []);
      } catch (error) {
        if (isActive) {
          setProfilesError(error.message);
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

  useEffect(() => {
    let isActive = true;

    const loadOralHistories = async () => {
      setIsLoadingOralHistories(true);
      setOralHistoriesError('');

      try {
        const loadedOralHistories = await getOralHistories();

        if (!isActive) {
          return;
        }

        setOralHistories(Array.isArray(loadedOralHistories) ? loadedOralHistories : []);
      } catch (error) {
        if (isActive) {
          setOralHistoriesError(error.message);
        }
      } finally {
        if (isActive) {
          setIsLoadingOralHistories(false);
        }
      }
    };

    loadOralHistories();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadComposites = async () => {
      setIsLoadingComposites(true);
      setCompositesError('');

      try {
        const loadedComposites = await getComposites();

        if (!isActive) {
          return;
        }

        setComposites(Array.isArray(loadedComposites) ? loadedComposites : []);
      } catch (error) {
        if (isActive) {
          setCompositesError(error.message);
        }
      } finally {
        if (isActive) {
          setIsLoadingComposites(false);
        }
      }
    };

    loadComposites();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    
    const loadWrittenHistories = async () => {
      setIsLoadingWrittenHistories(true);
      setWrittenHistoriesError('');

      try {
        const loadedWrittenHistories = await getHistories();
        
        if (!isActive) {
          return;
        }
        setWrittenHistories(Array.isArray(loadedWrittenHistories) ? loadedWrittenHistories : []);
      }
      catch (error) {
        if (isActive) {
          setWrittenHistoriesError(error.message);
        }
      }
      finally {
        if (isActive) {
          setIsLoadingWrittenHistories(false);
        }
      }
    }
    loadWrittenHistories();

    return () => {
      isActive = false;
    }
  }, []);


  const normalizedQuery = query.trim().toLowerCase();

  const memberItems = useMemo(
    () => filterByTitle(
      profiles.map((profile) => ({
        key: profile.id,
        title: profile.displayName || 'Unnamed member',
        meta: buildMemberMeta(profile),
        href: `/member/${profile.id}`,
      })),
      normalizedQuery,
    ),
    [normalizedQuery, profiles],
  );

  const compositeItems = useMemo(
    () => filterByTitle(
      composites.map((composite) => ({
        key: composite.compositeId,
        title: composite.displayName || composite.originalFilename || 'Composite',
        meta: composite.compositeYear ? `Class year ${composite.compositeYear}` : 'Composite archive item',
        href: buildSectionLink('/composites', query),
      })),
      normalizedQuery,
    ),
    [composites, normalizedQuery, query],
  );

  const oralHistoryItems = useMemo(
    () => filterByTitle(buildOralHistoryItems(oralHistories), normalizedQuery),
    [normalizedQuery, oralHistories],
  );

  const oralHistoryEpisodeItems = useMemo(
    () => filterByTitle(buildOralHistoryEpisodeItems(oralHistories), normalizedQuery),
    [normalizedQuery, oralHistories],
  );

  const scrapbookItems = useMemo(
    () => filterByTitle(SCRAPBOOK_ITEMS, normalizedQuery),
    [normalizedQuery],
  );

  const writtenHistoryItems = useMemo(
    () => filterByTitle(writtenHistories.map((history) => ({
      key: history.historyId,
      title: history.title || history.originalFilename || 'Club History',
      meta: buildClubHistoryMeta(history),
      href: buildSectionLink('/written-history', query, { history: history.key }),
    })), normalizedQuery),
    [normalizedQuery, writtenHistories, query],
  );

  const sections = [
    {
      key: 'members',
      title: 'Members',
      items: memberItems,
      viewAllHref: '',
      emptyMessage: profilesError || (isLoadingProfiles ? 'Loading member results...' : 'No matching members.'),
    },
    {
      key: 'oral-histories',
      title: 'Oral Histories',
      items: oralHistoryItems,
      viewAllHref: buildSectionLink('/oral-histories', query),
      emptyMessage: oralHistoriesError || (isLoadingOralHistories ? 'Loading oral history results...' : 'No matching oral histories.'),
    },
    {
      key: 'oral-history-episodes',
      title: 'Oral History Episodes',
      items: oralHistoryEpisodeItems,
      viewAllHref: buildSectionLink('/oral-histories', query),
      emptyMessage: oralHistoriesError || (isLoadingOralHistories ? 'Loading oral history episode results...' : 'No matching oral history episodes.'),
    },
    {
      key: 'composites',
      title: 'Composites',
      items: compositeItems,
      viewAllHref: buildSectionLink('/composites', query),
      emptyMessage: compositesError || (isLoadingComposites ? 'Loading composite results...' : 'No matching composites.'),
    },
    {
      key: 'scrapbooks',
      title: 'Scrapbooks',
      items: scrapbookItems,
      viewAllHref: buildSectionLink('/scrapbooks', query),
      emptyMessage: 'No matching scrapbooks.',
    },
    {
      key: 'written-history',
      title: 'Club History',
      items: writtenHistoryItems,
      viewAllHref: buildSectionLink('/written-history', query),
      emptyMessage: writtenHistoriesError || (isLoadingWrittenHistories ? 'Loading club history results...' : 'No matching club history documents.'),
    },
  ];

  return (
    <div className="searchPage">
      <section className="searchPage__hero section">
        <div className="container">
          <p className="searchPage__eyebrow">German Club Alumni Archives</p>
          <h1 className="searchPage__title">Search the Archive</h1>
          <p className="searchPage__lede">
            Search across members, oral histories, composites, scrapbooks, and club history from one
            place.
          </p>

          <div className="searchPage__barWrap">
            <label className="sr-only" htmlFor="archive-search-page-input">
              Search the archive
            </label>
            <input
              id="archive-search-page-input"
              className="searchPage__bar"
              type="search"
              placeholder="Search archive by content title or member name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="searchPage__results section">
        <div className="container searchPage__sections">
          {sections.map((section) => (
            <SectionRow
              key={section.key}
              title={section.title}
              items={section.items}
              viewAllHref={section.viewAllHref}
              emptyMessage={section.emptyMessage}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function SectionRow({ title, items, viewAllHref, emptyMessage }) {
  const visibleItems = items.slice(0, SECTION_CARD_LIMIT);

  return (
    <section className="searchPage__section" aria-label={title}>
      <div className="searchPage__sectionHeader">
        <div>
          <p className="searchPage__sectionLabel">Search results</p>
          <h2 className="searchPage__sectionTitle">{title}</h2>
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
            <Link key={item.key} className="searchPage__card" to={item.href}>
              <span className="searchPage__cardEyebrow">{title}</span>
              <h3 className="searchPage__cardTitle">{item.title}</h3>
              <p className="searchPage__cardMeta">{item.meta}</p>
            </Link>
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

function filterByTitle(items, normalizedQuery) {
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => [
    item.title,
    item.meta,
    item.searchText,
  ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery)));
}

function buildSectionLink(pathname, query, extraParams = {}) {
  const searchParams = new URLSearchParams();
  const normalizedQuery = query.trim();

  if (normalizedQuery) {
    searchParams.set('q', normalizedQuery);
  }

  Object.entries(extraParams).forEach(([key, value]) => {
    const normalizedValue = String(value || '').trim();

    if (normalizedValue) {
      searchParams.set(key, normalizedValue);
    }
  });

  const serializedParams = searchParams.toString();
  return serializedParams ? `${pathname}?${serializedParams}` : pathname;
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

function buildOralHistoryItems(episodes) {
  const groupsByInterviewee = new Map();

  (Array.isArray(episodes) ? episodes : []).forEach((episode) => {
    const interviewee = normalizeSearchText(episode?.interviewee);

    if (!interviewee) {
      return;
    }

    const key = interviewee.toLowerCase();
    const existingGroup = groupsByInterviewee.get(key) || {
      interviewee,
      episodes: [],
    };

    existingGroup.episodes.push(episode);
    groupsByInterviewee.set(key, existingGroup);
  });

  return Array.from(groupsByInterviewee.values())
    .sort((leftGroup, rightGroup) => leftGroup.interviewee.localeCompare(rightGroup.interviewee))
    .map((group) => ({
      key: `oral-history-${slugifySearchValue(group.interviewee)}`,
      title: `${group.interviewee} Oral History`,
      meta: buildOralHistoryMeta(group.episodes),
      searchText: [
        group.interviewee,
        'oral history',
        'interview',
        ...group.episodes.flatMap((episode) => [
          episode?.title,
          episode?.category,
          episode?.key,
        ]),
      ].filter(Boolean).join(' '),
      href: buildOralHistoryLink(group.interviewee),
    }));
}

function buildOralHistoryEpisodeItems(episodes) {
  return (Array.isArray(episodes) ? episodes : [])
    .map((episode) => {
      const interviewee = normalizeSearchText(episode?.interviewee);
      const isFullLength = Boolean(episode?.isFullLength);
      const episodeNumber = isFullLength ? null : Number(episode?.episodeNumber || 0);
      const episodeLabel = isFullLength ? 'Full Interview' : `Episode ${episodeNumber || ''}`.trim();
      const title = formatOralHistoryEpisodeTitle(episode?.title);
      const displayTitle = [
        interviewee || 'Oral History',
        [episodeLabel, title].filter(Boolean).join(': '),
      ].filter(Boolean).join(' - ');

      return {
        key: `oral-history-episode-${episode?.oralHistoryId || episode?.key || slugifySearchValue(displayTitle)}`,
        title: displayTitle,
        meta: isFullLength
          ? 'Full Interview | Oral History'
          : `${normalizeSearchText(episode?.category) || 'Episode'} | Oral History Episode`,
        searchText: [
          interviewee,
          episode?.title,
          episode?.category,
          episode?.key,
          isFullLength ? 'full interview' : '',
          episodeNumber ? `episode ${episodeNumber}` : '',
          episodeNumber ? String(episodeNumber) : '',
          'oral history episode',
        ].filter(Boolean).join(' '),
        href: buildOralHistoryLink(interviewee, episode?.oralHistoryId || episode?.key),
      };
    })
    .sort((leftItem, rightItem) => leftItem.title.localeCompare(rightItem.title));
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

function buildOralHistoryMeta(episodes) {
  const fullInterviews = episodes.filter((episode) => Boolean(episode?.isFullLength)).length;
  const episodeCount = Math.max(0, episodes.length - fullInterviews);
  const parts = [];

  if (fullInterviews > 0) {
    parts.push(`${fullInterviews} full interview${fullInterviews === 1 ? '' : 's'}`);
  }

  if (episodeCount > 0) {
    parts.push(`${episodeCount} episode${episodeCount === 1 ? '' : 's'}`);
  }

  return parts.length > 0 ? parts.join(' | ') : 'Oral History Interview';
}

function buildClubHistoryMeta(history) {
  const years = extractAssociatedYears([
    history?.title,
    history?.key,
    history?.description,
    history?.originalFilename,
  ]);

  return years.length > 0 ? `Club History Document | ${years.join(', ')}` : 'Club History Document';
}

function formatOralHistoryEpisodeTitle(title) {
  const normalizedTitle = normalizeSearchText(title);

  if (!normalizedTitle) {
    return '';
  }

  return normalizedTitle.replace(/^episode\s+\d+\s*(?:-|:|\u2013|\u2014)\s*/i, '').trim();
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

function slugifySearchValue(value) {
  return normalizeSearchText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}
