import './MemberPage.css';

const member = {
  name: 'Michael "Demo" Krause',
  chapter: 'Gamma Tau Chapter',
  location: 'Richmond, VA',
  classYear: 'Class of 2012',
  honors: ['President 2011', 'Philanthropy Chair', 'Distinguished Service Award'],
  headshot:
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80',
  bio: `Demo joined the German Club in 2009 and quickly became a familiar face at every service
  project and alumni weekend. He later mentored new members, helped modernize the clubhouse
  archives, and continues to coordinate regional meetups for Richmond-area alumni.`,
  highlights: [
    'Spearheaded the 2011 "Build-A-Playground" philanthropy in partnership with VT Engage.',
    'Organized the first digital composite scanning party for alumni archives.',
    'Regular volunteer for move-in crew and graduation guard of honor.',
  ],
  materials: {
    composites: [
      { title: 'Composite 2011', year: '2011', note: 'President', href: '/composites' },
      { title: 'Composite 2010', year: '2010', note: 'Member', href: '/composites' },
    ],
    scrapbooks: [
      { title: 'Spring Service Trip', year: '2011', note: 'Featured in photo set', href: '/scrapbooks' },
    ],
    oralHistories: [
      { title: 'Interview with Demo Krause', year: '2019', note: 'Recorded by Alumni Archives', href: '/oral-histories' },
    ],
  },
};

/**
 * MemberPage
 *
 * A simple profile layout showing a member headshot, quick facts, honors/positions,
 * and a short narrative. Uses the site’s existing typography and spacing scale.
 */
export default function MemberPage() {
  return (
    <section className="member section" aria-label="Member profile">
      <div className="container">
        <div className="member__shell">
          <div className="member__photoCard">
            <div className="member__tag">Alumni</div>
            <img
              className="member__photo"
              src={member.headshot}
              alt={`Headshot of ${member.name}`}
              loading="lazy"
            />
          </div>

          <div className="member__body">
            <p className="member__eyebrow">Member Profile</p>
            <h1 className="member__name">{member.name}</h1>
            <p className="member__meta">
              <span>{member.location}</span>
              <span className="member__dot" aria-hidden="true" />
              <span>{member.classYear}</span>
            </p>

            <div className="member__facts">
              <Fact label="Chapter" value={member.chapter} />
              <Fact label="Location" value={member.location} />
              <Fact label="Year" value={member.classYear} />
            </div>

            <div className="member__badges" aria-label="Honors and positions">
              {member.honors.map((item) => (
                <span key={item} className="member__badge">
                  {item}
                </span>
              ))}
            </div>

            <p className="member__bio">{member.bio}</p>

            <div className="member__highlights" aria-label="Highlights">
              <h2 className="member__subheading">Involvement & Highlights</h2>
              <ul>
                {member.highlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="member__materials" aria-label="Related archives">
              <h2 className="member__subheading">Included in the Archives</h2>
              <ArchiveSection label="Composites" items={member.materials.composites} />
              <ArchiveSection label="Scrapbooks" items={member.materials.scrapbooks} />
              <ArchiveSection label="Oral Histories" items={member.materials.oralHistories} />
            </div>
          </div>
        </div>
      </div>
    </section>
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
            <MaterialCard key={`${label}-${item.title}`} {...item} />
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
