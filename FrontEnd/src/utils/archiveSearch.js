export const SEARCH_FILTER_OPTIONS = [
  { id: 'member', label: 'Members', sectionTitle: 'Members', viewAllHref: '' },
  { id: 'composite', label: 'Composites', sectionTitle: 'Composites', viewAllHref: '/composites' },
  { id: 'scrapbook', label: 'Scrapbooks', sectionTitle: 'Scrapbooks', viewAllHref: '/scrapbooks' },
  { id: 'scrapbookPage', label: 'Scrapbook Pages', sectionTitle: 'Scrapbook Pages', viewAllHref: '/scrapbooks' },
  { id: 'oralHistory', label: 'Oral History', sectionTitle: 'Oral Histories', viewAllHref: '/oral-histories' },
  { id: 'oralHistoryEpisode', label: 'Oral History Episodes', sectionTitle: 'Oral History Episodes', viewAllHref: '/oral-histories' },
  { id: 'clubHistory', label: 'Club History', sectionTitle: 'Club History', viewAllHref: '/written-history' },
];

export const ALL_FILTER_IDS = SEARCH_FILTER_OPTIONS.map((option) => option.id);

export function getFilteredSearchSections(searchIndex, selectedFilterIds, query) {
  const activeFilterIds = new Set(selectedFilterIds);
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const sections = searchIndex?.sections || {};

  return Object.fromEntries(
    ALL_FILTER_IDS.map((filterId) => {
      if (!activeFilterIds.has(filterId)) {
        return [filterId, []];
      }

      const items = Array.isArray(sections[filterId]) ? sections[filterId] : [];
      return [filterId, filterSearchItems(items, normalizedQuery)];
    }),
  );
}

export function filterSearchItems(items, normalizedQuery) {
  return dedupeScoredSearchItems((Array.isArray(items) ? items : [])
    .map((item) => {
      const score = scoreSearchItem(item, normalizedQuery);
      return score > 0 ? { ...item, score } : null;
    })
    .filter(Boolean))
    .sort(compareSearchItems);
}

export function flattenSearchSections(resultsByFilterId, orderedFilterIds = ALL_FILTER_IDS) {
  return orderedFilterIds.flatMap((filterId) => resultsByFilterId?.[filterId] || []);
}

export function compareSearchItems(leftItem, rightItem) {
  if (rightItem.score !== leftItem.score) {
    return rightItem.score - leftItem.score;
  }

  return String(leftItem.label || '').localeCompare(String(rightItem.label || ''), undefined, {
    sensitivity: 'base',
  });
}

function scoreSearchItem(item, normalizedQuery) {
  if (!normalizedQuery) {
    return 1;
  }

  const fields = Array.isArray(item?.searchFields) ? item.searchFields : [];
  const exactValues = Array.isArray(item?.exactValues) ? item.exactValues : [];
  let bestScore = 0;

  fields.forEach((field) => {
    const normalizedField = String(field || '').trim().toLowerCase();

    if (!normalizedField) {
      return;
    }

    if (normalizedField === normalizedQuery) {
      bestScore = Math.max(bestScore, 120);
      return;
    }

    if (normalizedField.startsWith(normalizedQuery)) {
      bestScore = Math.max(bestScore, 82);
      return;
    }

    if (normalizedField.includes(normalizedQuery)) {
      bestScore = Math.max(bestScore, 48);
    }
  });

  if (bestScore <= 0) {
    return 0;
  }

  const exactBoost = exactValues.includes(normalizedQuery) ? Number(item?.exactBoost || 0) : 0;
  return bestScore + exactBoost;
}

function dedupeScoredSearchItems(items) {
  const itemsByResultKey = new Map();

  items.forEach((item) => {
    const resultKey = buildSearchResultDedupeKey(item);
    const existingItem = itemsByResultKey.get(resultKey);

    if (!existingItem || compareSearchItems(item, existingItem) < 0) {
      itemsByResultKey.set(resultKey, item);
    }
  });

  return Array.from(itemsByResultKey.values());
}

function buildSearchResultDedupeKey(item) {
  if (item?.kind === 'scrapbookPage') {
    const year = String(item?.year || '').trim().toLowerCase();
    const pageNumber = normalizePositiveInteger(item?.pageNumber)
      || extractPageNumber(item?.modalIdentifier)
      || extractPageNumber(item?.to);

    if (year && pageNumber) {
      return `scrapbook-page-${year}-page-${pageNumber}`;
    }
  }

  const target = String(item?.to || item?.modalIdentifier || item?.key || '').trim().toLowerCase();
  return `${item?.kind || 'item'}-${target}`;
}

function extractPageNumber(value) {
  const pageMatch = String(value || '').match(/(?:[?&]page=|-p)(\d+)/i);
  return pageMatch ? Number(pageMatch[1]) : null;
}

function normalizePositiveInteger(value) {
  const normalizedValue = Number(value);

  return Number.isInteger(normalizedValue) && normalizedValue > 0 ? normalizedValue : null;
}
