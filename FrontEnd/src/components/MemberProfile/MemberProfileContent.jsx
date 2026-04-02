import { Link } from 'react-router-dom';

import CompositeCopyrightNotice from '../Composite/CompositeCopyrightNotice.jsx';
import '../../pages/MemberPage.css';

export default function MemberProfileContent({ profile, onArchiveNavigate = null }) {
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

  const showsCompositeCopyrightNotice = (
    profile.portrait?.mode === 'composite-reference'
    || (Array.isArray(profile.relatedComposites) && profile.relatedComposites.length > 0)
  );

  return (
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

        <div className="member__materials" aria-label="Related archives">
          <h2 className="member__subheading">Included in the Archives</h2>
          <ArchiveSection
            label="Composites"
            items={buildCompositeItems(profile.relatedComposites)}
            onNavigate={onArchiveNavigate}
          />
        </div>
      </div>
    </div>
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

function ArchiveSection({ label, items, onNavigate }) {
  const hasItems = Array.isArray(items) && items.length > 0;
  const isYearOnlySection = hasItems && items.every((item) => item.yearOnly);

  return (
    <section className="member__archiveSection" aria-label={label}>
      <div className="member__archiveHeader">
        <p className="member__archiveLabel">{label}</p>
        <span className="member__archiveCount">
          {hasItems ? `${items.length} item${items.length > 1 ? 's' : ''}` : 'No entries yet'}
        </span>
      </div>

      {hasItems ? (
        <div
          className={[
            'member__materialsGrid',
            isYearOnlySection ? 'member__materialsGrid--yearOnly' : '',
          ].filter(Boolean).join(' ')}
        >
          {items.map((item) => (
            <MaterialCard
              key={`${label}-${item.compositeId}-${item.annotationId}`}
              {...item}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : (
        <p className="member__archiveEmpty">No {label.toLowerCase()} listed for this member yet.</p>
      )}
    </section>
  );
}

function MaterialCard({ title, year, note, to, onNavigate, yearOnly = false }) {
  const cardClassName = [
    'member__materialCard',
    yearOnly ? 'member__materialCard--yearOnly' : '',
  ].filter(Boolean).join(' ');

  if (to) {
    return (
      <Link className={cardClassName} to={to} onClick={onNavigate || undefined}>
        <div className="member__materialYear">{year}</div>
        {!yearOnly && (title || note) ? (
          <div className="member__materialBody">
            {title ? <p className="member__materialTitle">{title}</p> : null}
            {note ? <p className="member__materialNote">{note}</p> : null}
          </div>
        ) : null}
      </Link>
    );
  }

  return (
    <div className={cardClassName}>
      <div className="member__materialYear">{year}</div>
      {!yearOnly && (title || note) ? (
        <div className="member__materialBody">
          {title ? <p className="member__materialTitle">{title}</p> : null}
          {note ? <p className="member__materialNote">{note}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function buildLocation(profile) {
  return [profile.city, profile.stateProvince].filter(Boolean).join(', ');
}

function buildCompositeItems(relatedComposites) {
  return [...(Array.isArray(relatedComposites) ? relatedComposites : [])]
    .sort(compareCompositeArchiveItems)
    .map((composite) => ({
      compositeId: composite.compositeId,
      annotationId: composite.annotationId,
      title: '',
      year: composite.compositeYear || 'N/A',
      note: '',
      yearOnly: true,
      to: buildCompositeLink(composite.compositeYear),
    }));
}

function buildCompositeLink(compositeYear) {
  if (!compositeYear) {
    return '/composites';
  }

  return `/composites?year=${encodeURIComponent(compositeYear)}`;
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

function isBoardDepartment(department) {
  return String(department || '').trim().toLowerCase() === 'board';
}
