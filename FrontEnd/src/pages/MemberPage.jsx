import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { getProfile } from '../api/composites.js';
import './MemberPage.css';

export default function MemberPage() {
  const { profileId } = useParams();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(profileId));
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    if (!profileId) {
      setProfile(null);
      setPageError('');
      setIsLoading(false);
      return;
    }

    let isActive = true;

    const loadProfile = async () => {
      setIsLoading(true);
      setPageError('');

      try {
        const profileRecord = await getProfile(profileId);

        if (!isActive) {
          return;
        }

        setProfile(profileRecord);
      } catch (error) {
        if (isActive) {
          setPageError(error.message);
          setProfile(null);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isActive = false;
    };
  }, [profileId]);

  const factItems = useMemo(() => {
    if (!profile) {
      return [];
    }

    return [
      { label: 'Preferred Name', value: profile.preferredName || profile.firstName || 'Not listed' },
      { label: 'Email', value: profile.email || 'Not listed' },
      { label: 'Candlelight', value: profile.candlelightDate || 'Not listed' },
    ];
  }, [profile]);

  const badges = useMemo(() => {
    if (!profile) {
      return [];
    }

    const nextBadges = [];

    if (profile.emeritus) {
      nextBadges.push('Emeritus');
    }

    if (profile.deceased) {
      nextBadges.push('Deceased');
    }

    return nextBadges;
  }, [profile]);

  if (!profileId) {
    return (
      <section className="member section" aria-label="Member profile">
        <div className="container">
          <div className="member__emptyState">
            <h1 className="member__name">Select a Member</h1>
            <p className="member__bio">
              Search from the homepage to open a member profile populated from the archive.
            </p>
            <Link className="button" to="/">
              Back to home
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="member section" aria-label="Member profile">
        <div className="container">
          <div className="member__emptyState">
            <p className="member__bio">Loading member profile...</p>
          </div>
        </div>
      </section>
    );
  }

  if (pageError || !profile) {
    return (
      <section className="member section" aria-label="Member profile">
        <div className="container">
          <div className="member__emptyState">
            <h1 className="member__name">Member Not Found</h1>
            <p className="member__bio">{pageError || 'The requested member profile could not be loaded.'}</p>
            <Link className="button" to="/">
              Back to home
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="member section" aria-label="Member profile">
      <div className="container">
        <div className="member__shell">
          <div className="member__photoCard">
            <ProfilePortrait profile={profile} />
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
              <ArchiveSection label="Composites" items={buildCompositeItems(profile.relatedComposites)} />
            </div>
          </div>
        </div>
      </div>
    </section>
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

function ArchiveSection({ label, items }) {
  const hasItems = Array.isArray(items) && items.length > 0;

  return (
    <section className="member__archiveSection" aria-label={label}>
      <div className="member__archiveHeader">
        <p className="member__archiveLabel">{label}</p>
        <span className="member__archiveCount">
          {hasItems ? `${items.length} item${items.length > 1 ? 's' : ''}` : 'No entries yet'}
        </span>
      </div>

      {hasItems ? (
        <div className="member__materialsGrid">
          {items.map((item) => (
            <MaterialCard key={`${label}-${item.compositeId}-${item.annotationId}`} {...item} />
          ))}
        </div>
      ) : (
        <p className="member__archiveEmpty">No {label.toLowerCase()} listed for this member yet.</p>
      )}
    </section>
  );
}

function MaterialCard({ title, year, note, href }) {
  const Wrapper = href ? 'a' : 'div';

  return (
    <Wrapper className="member__materialCard" href={href}>
      <div className="member__materialYear">{year}</div>
      <div className="member__materialBody">
        <p className="member__materialTitle">{title}</p>
        {note ? <p className="member__materialNote">{note}</p> : null}
      </div>
    </Wrapper>
  );
}

function buildLocation(profile) {
  return [profile.city, profile.stateProvince].filter(Boolean).join(', ');
}

function buildCompositeItems(relatedComposites) {
  return (Array.isArray(relatedComposites) ? relatedComposites : []).map((composite) => ({
    compositeId: composite.compositeId,
    annotationId: composite.annotationId,
    title: composite.compositeName,
    year: composite.compositeYear || 'N/A',
    note: composite.updatedAt
      ? `Updated ${formatDate(composite.updatedAt)}`
      : 'Saved in archive',
    href: `/upload/composites/${composite.compositeId}`,
  }));
}

function buildCompositePortraitStyle(reference) {
  return {
    width: `${(reference.imageWidth / reference.width) * 100}%`,
    height: `${(reference.imageHeight / reference.height) * 100}%`,
    left: `${-(reference.x / reference.width) * 100}%`,
    top: `${-(reference.y / reference.height) * 100}%`,
  };
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}
