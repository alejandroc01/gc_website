import { use, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { getComposites, getProfiles, getHistories } from '../api/composites.js';
import './SearchPage.css';

const SECTION_CARD_LIMIT = 8;

const ORAL_HISTORY_ITEMS = Array.from({ length: 16 }, (_, index) => ({
  key: `oral-history-${index + 1}`,
  title: index === 0 ? 'Why Did You Come to Tech?' : `Episode ${index + 1}`,
  meta: index === 0 ? 'Featured oral history' : 'Oral history placeholder',
  href: '/oral-histories',
}));

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
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
  const [isLoadingComposites, setIsLoadingComposites] = useState(true);
  const [isLoadingWrittenHistories, setIsLoadingWrittenHistories] = useState(true);
  const [profilesError, setProfilesError] = useState('');
  const [compositesError, setCompositesError] = useState('');
  const [writtenHistoriesError, setWrittenHistoriesError] = useState('');

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
    () => filterByTitle(ORAL_HISTORY_ITEMS, normalizedQuery),
    [normalizedQuery],
  );

  const scrapbookItems = useMemo(
    () => filterByTitle(SCRAPBOOK_ITEMS, normalizedQuery),
    [normalizedQuery],
  );

  const writtenHistoryItems = useMemo(
    () => filterByTitle(writtenHistories.map((history) => ({
      key: history.historyId,
      title: history.displayName || history.originalFilename || 'Written history',
      meta: 'Written history archive item',
      href: buildSectionLink('/history', query),
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
      emptyMessage: 'No matching oral histories.',
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
      title: 'Written History',
      items: writtenHistoryItems,
      viewAllHref: buildSectionLink('/written-history', query),
      emptyMessage: writtenHistoriesError || (isLoadingWrittenHistories ? 'Loading written history results...' : 'No matching written histories.'),
    },
  ];

  return (
    <div className="searchPage">
      <section className="searchPage__hero section">
        <div className="container">
          <p className="searchPage__eyebrow">German Club Alumni Archives</p>
          <h1 className="searchPage__title">Search the Archive</h1>
          <p className="searchPage__lede">
            Search across members, oral histories, composites, scrapbooks, and written history from one
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

  return items.filter((item) => String(item.title || '').toLowerCase().includes(normalizedQuery));
}

function buildSectionLink(pathname, query) {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return pathname;
  }

  return `${pathname}?q=${encodeURIComponent(normalizedQuery)}`;
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
