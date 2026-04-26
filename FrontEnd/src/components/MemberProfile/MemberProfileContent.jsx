import { useState } from 'react';
import { Link } from 'react-router-dom';

import CompositeCopyrightNotice from '../Composite/CompositeCopyrightNotice.jsx';
import ScrapbookPageModal from '../Scrapbook/ScrapbookPageModal.jsx';
import '../../pages/MemberPage.css';

export default function MemberProfileContent({
  profile,
  onArchiveNavigate = null,
  archiveLinkBuilder = null,
}) {
  const [activeScrapbookIdentifier, setActiveScrapbookIdentifier] = useState('');
  const factItems = [
    { label: 'Preferred Name', value: profile.preferredName || profile.firstName || 'Not listed' },
    { label: 'Email', value: profile.email || 'Not listed' },
    { label: 'Candlelight', value: profile.candlelightDate || 'Not listed' },
  ];

  const badges = [];

  if (isBoardDepartment(profile.department)) {
    badges.push('Board');
  }

  if (profile.emeritus) {
    badges.push('Emeritus');
  }

  if (profile.deceased) {
    badges.push('Deceased');
  }

  const compositeArchiveItems = buildCompositeItems(profile.relatedComposites, archiveLinkBuilder);
  const scrapbookArchiveItems = buildScrapbookItems(profile.relatedScrapbookPages, archiveLinkBuilder);
  const oralHistoryArchiveItems = buildOralHistoryItems(profile.relatedOralHistories, archiveLinkBuilder);
  const clubHistoryArchiveItems = buildClubHistoryItems(profile.relatedClubHistories, archiveLinkBuilder);
  const hasArchiveMaterials = (
    compositeArchiveItems.length > 0
    || scrapbookArchiveItems.length > 0
    || oralHistoryArchiveItems.length > 0
    || clubHistoryArchiveItems.length > 0
  );

  const showsCompositeCopyrightNotice = (
    profile.portrait?.mode === 'composite-reference'
    || (Array.isArray(profile.relatedComposites) && profile.relatedComposites.length > 0)
  );

  return (
    <>
      <div className="member__shell">
        <div className="member__mediaColumn">
          <div className="member__photoCard">
            <ProfilePortrait profile={profile} />
          </div>

          {showsCompositeCopyrightNotice ? (
            <CompositeCopyrightNotice className="member__photoCopyrightNotice" />
          ) : null}
        </div>

        <div className="member__body">
          <p className="member__eyebrow">Member Profile</p>
          <h1 className="member__name">{profile.displayName}</h1>
          <p className="member__meta">
            <span>{buildLocation(profile) || 'Location not listed'}</span>
            {profile.graduationYear ? <span className="member__dot" aria-hidden="true" /> : null}
            {profile.graduationYear ? <span>{`Class of ${profile.graduationYear}`}</span> : null}
          </p>

          <div className="member__facts">
            {factItems.map((fact) => (
              <Fact key={fact.label} label={fact.label} value={fact.value} />
            ))}
          </div>

          {badges.length > 0 ? (
            <div className="member__badges" aria-label="Profile details">
              {badges.map((item) => (
                <span key={item} className="member__badge">
                  {item}
                </span>
              ))}
            </div>
          ) : null}

          {hasArchiveMaterials ? (
            <div className="member__materials" aria-label="Related archives">
              <h2 className="member__subheading">Included in the Archives</h2>
              <ArchiveSection
                label="Composites"
                items={compositeArchiveItems}
                onNavigate={onArchiveNavigate}
              />
              <ArchiveSection
                label="Featured in Scrapbook Pages"
                items={scrapbookArchiveItems}
                onNavigate={onArchiveNavigate}
                onOpenScrapbookViewer={setActiveScrapbookIdentifier}
                preferLinkNavigation={Boolean(archiveLinkBuilder)}
                variant="stacked"
              />
              <ArchiveSection
                label="Oral Histories"
                items={oralHistoryArchiveItems}
                onNavigate={onArchiveNavigate}
                variant="titleList"
              />
              <ArchiveSection
                label="Club History"
                items={clubHistoryArchiveItems}
                onNavigate={onArchiveNavigate}
                variant="titleList"
              />
            </div>
          ) : null}
        </div>
      </div>

      {activeScrapbookIdentifier ? (
        <ScrapbookPageModal
          identifier={activeScrapbookIdentifier}
          onClose={() => setActiveScrapbookIdentifier('')}
        />
      ) : null}
    </>
  );
}

function ProfilePortrait({ profile }) {
  if (profile.portrait?.mode === 'composite-reference') {
    return (
      <div
        className="member__photo member__photo--composite"
        style={{
          aspectRatio: `${profile.portrait.width} / ${profile.portrait.height}`,
        }}
      >
        <img
          className="member__compositeImage"
          src={profile.portrait.imageUrl}
          alt={`Referenced portrait of ${profile.displayName}`}
          style={buildCompositePortraitStyle(profile.portrait)}
        />
      </div>
    );
  }

  return (
    <img
      className="member__photo"
      src={profile.portrait?.imageUrl || profile.profileImageUrl}
      alt={`Portrait placeholder for ${profile.displayName}`}
      loading="lazy"
    />
  );
}

function Fact({ label, value }) {
  return (
    <div className="member__fact">
      <span className="member__factLabel">{label}</span>
      <span className="member__factValue">{value}</span>
    </div>
  );
}

function ArchiveSection({
  label,
  items,
  onNavigate,
  onOpenScrapbookViewer = null,
  preferLinkNavigation = false,
  variant = 'default',
}) {
  const hasItems = Array.isArray(items) && items.length > 0;

  if (!hasItems) {
    return null;
  }

  const isYearOnlySection = hasItems && items.every((item) => item.yearOnly);
  const isScrollableSection = variant === 'titleList' || (variant === 'stacked' && items.length > 6);

  return (
    <section
      className={[
        'member__archiveSection',
        variant === 'stacked' ? 'member__archiveSection--stacked' : '',
        variant === 'titleList' ? 'member__archiveSection--titleList' : '',
      ].filter(Boolean).join(' ')}
      aria-label={label}
    >
      <div className="member__archiveHeader">
        <p className="member__archiveLabel">{label}</p>
        <span className="member__archiveCount">
          {items.length} item{items.length > 1 ? 's' : ''}
        </span>
      </div>

      <div
        className={[
          'member__materialsGrid',
          isYearOnlySection ? 'member__materialsGrid--yearOnly' : '',
          isScrollableSection ? 'member__materialsGrid--scrollable' : '',
          variant === 'titleList' ? 'member__materialsGrid--titleList' : '',
        ].filter(Boolean).join(' ')}
      >
        {items.map((item) => (
          <MaterialCard
            key={`${label}-${item.compositeId}-${item.annotationId}`}
            {...item}
            onNavigate={onNavigate}
            onOpenScrapbookViewer={onOpenScrapbookViewer}
            preferLinkNavigation={preferLinkNavigation}
            variant={variant}
          />
        ))}
      </div>
    </section>
  );
}

function MaterialCard({
  title,
  year,
  note,
  to,
  onNavigate,
  yearOnly = false,
  variant = 'default',
  thumbnailUrl = '',
  imageUrl = '',
  imageAlt = '',
  scrapbookIdentifier = '',
  onOpenScrapbookViewer = null,
  preferLinkNavigation = false,
}) {
  const cardClassName = [
    'member__materialCard',
    yearOnly ? 'member__materialCard--yearOnly' : '',
    variant === 'stacked' ? 'member__materialCard--stacked' : '',
    variant === 'titleList' ? 'member__materialCard--titleList' : '',
  ].filter(Boolean).join(' ');
  const isScrapbookCard = variant === 'stacked';
  const isTitleListCard = variant === 'titleList';
  const thumbnailSrc = thumbnailUrl || imageUrl;
  const cardContent = isTitleListCard ? (
    <p className="member__materialTitle">{title}</p>
  ) : isScrapbookCard ? (
    <>
      {thumbnailSrc ? (
        <div className="member__materialThumbnail">
          <img
            className="member__materialThumbnailImage"
            src={thumbnailSrc}
            alt={imageAlt || title || 'Scrapbook page'}
            loading="lazy"
            decoding="async"
          />
        </div>
      ) : null}
      {title ? <p className="member__materialTitle">{title}</p> : null}
    </>
  ) : (
    <>
      <div className="member__materialYear">{year}</div>
      {!yearOnly && (title || note) ? (
        <div className="member__materialBody">
          {title ? <p className="member__materialTitle">{title}</p> : null}
          {note ? <p className="member__materialNote">{note}</p> : null}
        </div>
      ) : null}
    </>
  );

  if (isScrapbookCard && scrapbookIdentifier && onOpenScrapbookViewer && !preferLinkNavigation) {
    return (
      <button
        type="button"
        className={cardClassName}
        onClick={() => onOpenScrapbookViewer(scrapbookIdentifier)}
      >
        {cardContent}
      </button>
    );
  }

  if (to) {
    return (
      <Link className={cardClassName} to={to} onClick={onNavigate || undefined}>
        {cardContent}
      </Link>
    );
  }

  return (
    <div className={cardClassName}>
      {cardContent}
    </div>
  );
}

function buildLocation(profile) {
  return [profile.city, profile.stateProvince].filter(Boolean).join(', ');
}

function buildCompositeItems(relatedComposites, archiveLinkBuilder = null) {
  return [...(Array.isArray(relatedComposites) ? relatedComposites : [])]
    .sort(compareCompositeArchiveItems)
    .map((composite) => ({
      compositeId: composite.compositeId,
      annotationId: composite.annotationId,
      title: '',
      year: composite.compositeYear || 'N/A',
      note: '',
      yearOnly: true,
      to: buildCompositeLink(composite.compositeYear, archiveLinkBuilder),
    }));
}

function buildScrapbookItems(relatedScrapbookPages, archiveLinkBuilder = null) {
  return [...(Array.isArray(relatedScrapbookPages) ? relatedScrapbookPages : [])]
    .sort(compareScrapbookArchiveItems)
    .map((scrapbookPage) => ({
      compositeId: scrapbookPage.identifier,
      annotationId: `${scrapbookPage.identifier}-scrapbook`,
      title: scrapbookPage.title || 'Untitled scrapbook page',
      year: scrapbookPage.year || 'N/A',
      note: buildScrapbookNote(scrapbookPage),
      to: buildScrapbookLink(scrapbookPage.year, scrapbookPage.pageNumber, archiveLinkBuilder, scrapbookPage.to),
      scrapbookIdentifier: scrapbookPage.identifier || '',
      thumbnailUrl: scrapbookPage.thumbnailUrl || '',
      imageUrl: scrapbookPage.imageUrl || '',
      imageAlt: scrapbookPage.originalFilename || scrapbookPage.title || 'Scrapbook page',
    }));
}

function buildOralHistoryItems(relatedOralHistories, archiveLinkBuilder = null) {
  return [...(Array.isArray(relatedOralHistories) ? relatedOralHistories : [])]
    .sort(compareOralHistoryArchiveItems)
    .map((oralHistory) => ({
      compositeId: oralHistory.oralHistoryId,
      annotationId: `${oralHistory.oralHistoryId}-oral-history`,
      title: oralHistory.title || 'Untitled oral history',
      year: formatOralHistoryArchiveLabel(oralHistory),
      note: buildOralHistoryNote(oralHistory),
      to: buildOralHistoryLink(oralHistory, archiveLinkBuilder),
    }));
}

function buildClubHistoryItems(relatedClubHistories, archiveLinkBuilder = null) {
  return [...(Array.isArray(relatedClubHistories) ? relatedClubHistories : [])]
    .sort(compareClubHistoryArchiveItems)
    .map((history) => ({
      compositeId: history.historyId,
      annotationId: `${history.historyId}-club-history`,
      title: history.title || 'Untitled club history',
      year: '',
      note: '',
      to: buildClubHistoryLink(history, archiveLinkBuilder),
    }));
}

function buildCompositeLink(compositeYear, archiveLinkBuilder = null) {
  const normalizedYear = String(compositeYear || '').trim();
  const to = normalizedYear ? `/composites?year=${encodeURIComponent(normalizedYear)}` : '/composites';

  return archiveLinkBuilder
    ? archiveLinkBuilder({ kind: 'composite', year: normalizedYear, to })
    : to;
}

function buildClubHistoryLink(history, archiveLinkBuilder = null) {
  const historyKey = String(history?.key || '').trim();
  const to = historyKey ? `/written-history?history=${encodeURIComponent(historyKey)}` : '/written-history';

  return archiveLinkBuilder
    ? archiveLinkBuilder({ kind: 'clubHistory', history: historyKey, to })
    : to;
}

function buildOralHistoryLink(oralHistory, archiveLinkBuilder = null) {
  const interviewee = String(oralHistory?.interviewee || '').trim();
  const episodeId = String(oralHistory?.oralHistoryId || oralHistory?.key || '').trim();
  const searchParams = new URLSearchParams();

  if (interviewee) {
    searchParams.set('interviewee', interviewee);
  }

  if (episodeId) {
    searchParams.set('episode', episodeId);
  }

  const query = searchParams.toString();
  const to = query ? `/oral-histories?${query}` : '/oral-histories';

  return archiveLinkBuilder
    ? archiveLinkBuilder({
      kind: 'oralHistoryEpisode',
      interviewee,
      episode: episodeId,
      to,
    })
    : to;
}

function buildScrapbookLink(scrapbookYear, pageNumber, archiveLinkBuilder = null, fallbackTo = '') {
  const normalizedYear = String(scrapbookYear || '').trim();
  const normalizedPageNumber = Number(pageNumber || 0);
  let to = fallbackTo;

  if (!to && normalizedYear) {
    const searchParams = new URLSearchParams({ year: normalizedYear });

    if (Number.isInteger(normalizedPageNumber) && normalizedPageNumber > 0) {
      searchParams.set('page', String(normalizedPageNumber));
    }

    to = `/scrapbooks?${searchParams.toString()}`;
  }

  if (!to) {
    to = '/scrapbooks';
  }

  return archiveLinkBuilder
    ? archiveLinkBuilder({
      kind: 'scrapbookPage',
      year: normalizedYear,
      pageNumber: Number.isInteger(normalizedPageNumber) && normalizedPageNumber > 0 ? normalizedPageNumber : '',
      to,
    })
    : to;
}

function formatOralHistoryArchiveLabel(oralHistory) {
  return oralHistory?.isFullLength ? 'Full Interview' : `Episode ${oralHistory?.episodeNumber || ''}`.trim();
}

function buildOralHistoryNote(oralHistory) {
  return [
    oralHistory.interviewee,
    oralHistory.category,
  ].filter(Boolean).join(' | ');
}

function buildScrapbookNote(scrapbookPage) {
  const noteParts = [
    scrapbookPage.source,
    scrapbookPage.category,
    scrapbookPage.pageNumber ? `Page ${scrapbookPage.pageNumber}` : '',
  ].filter(Boolean);
  const detailTitles = getMatchedDetailTitles(scrapbookPage);
  const baseNote = noteParts.join(' | ');

  if (detailTitles.length === 0) {
    return baseNote;
  }

  const detailNote = `Includes: ${detailTitles.join('; ')}`;
  return [baseNote, detailNote].filter(Boolean).join(' - ');
}

function getMatchedDetailTitles(scrapbookPage) {
  const parentIdentifier = String(scrapbookPage.identifier || '').trim().toLowerCase();

  return [...(Array.isArray(scrapbookPage.matchedItems) ? scrapbookPage.matchedItems : [])]
    .filter((item) => item?.isDetail)
    .filter((item) => String(item.identifier || '').trim().toLowerCase() !== parentIdentifier)
    .map((item) => item.title || item.identifier)
    .filter(Boolean);
}

function buildCompositePortraitStyle(reference) {
  return {
    width: `${(reference.imageWidth / reference.width) * 100}%`,
    height: `${(reference.imageHeight / reference.height) * 100}%`,
    left: `${-(reference.x / reference.width) * 100}%`,
    top: `${-(reference.y / reference.height) * 100}%`,
  };
}

function compareCompositeArchiveItems(leftComposite, rightComposite) {
  const leftYear = Number(leftComposite.compositeYear || 0);
  const rightYear = Number(rightComposite.compositeYear || 0);

  if (leftYear !== rightYear) {
    return rightYear - leftYear;
  }

  const leftTimestamp = new Date(leftComposite.updatedAt || leftComposite.uploadTimestamp || 0).getTime();
  const rightTimestamp = new Date(rightComposite.updatedAt || rightComposite.uploadTimestamp || 0).getTime();

  return rightTimestamp - leftTimestamp;
}

function compareScrapbookArchiveItems(leftPage, rightPage) {
  const leftYear = Number(leftPage.year || 0);
  const rightYear = Number(rightPage.year || 0);

  if (leftYear !== rightYear) {
    return rightYear - leftYear;
  }

  const leftPageNumber = Number(leftPage.pageNumber || 0);
  const rightPageNumber = Number(rightPage.pageNumber || 0);

  if (leftPageNumber !== rightPageNumber) {
    return leftPageNumber - rightPageNumber;
  }

  return String(leftPage.title || '').localeCompare(String(rightPage.title || ''), undefined, {
    sensitivity: 'base',
  });
}

function compareOralHistoryArchiveItems(leftItem, rightItem) {
  if (Boolean(leftItem.isFullLength) !== Boolean(rightItem.isFullLength)) {
    return leftItem.isFullLength ? -1 : 1;
  }

  return Number(leftItem.episodeNumber || 0) - Number(rightItem.episodeNumber || 0);
}

function compareClubHistoryArchiveItems(leftItem, rightItem) {
  return String(leftItem.title || '').localeCompare(String(rightItem.title || ''), undefined, {
    sensitivity: 'base',
  });
}

function isBoardDepartment(department) {
  return String(department || '').trim().toLowerCase() === 'board';
}
