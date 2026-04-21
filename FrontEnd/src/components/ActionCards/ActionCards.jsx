import { Link } from 'react-router-dom';
import './ActionCards.css';

const CARDS = [
  {
    key: 'composites',
    imageSrc: '/images/2025.jpeg',
    imageAlt: 'Composites preview',
    title: 'Composites',
    description: 'Browse class composites by year and view member details.',
    buttonText: 'View Composites',
    to: '/composites',
  },
  {
    key: 'scrapbooks',
    imageSrc: '/images/1983ScrapB-P26.jpg',
    imageAlt: 'Scrapbooks preview',
    title: 'Scrapbooks',
    description: 'Flip through scrapbook pages and open scanned photos.',
    buttonText: 'Open Scrapbooks',
    to: '/scrapbooks',
  },
  {
    key: 'oral-histories',
    imageSrc: '/images/doug_oral_history_thumbnail.png',
    imageAlt: 'Oral histories preview',
    title: 'Oral Histories',
    description: 'Watch alumni interviews and themed video clips.',
    buttonText: 'Watch Oral Histories',
    to: '/oral-histories',
  },
  {
    key: 'history',
    imageSrc: '/images/homepageimage.jpg',
    imageAlt: 'German Club history preview',
    title: 'History of the German Club',
    description: 'Open curated club-history documents and archival PDFs by topic.',
    buttonText: 'View History',
    to: '/history',
  },
];

/**
 * ActionCards
 *
 * A responsive card grid used on both the public homepage and upload landing page.
 */
export default function ActionCards({
  cards = CARDS,
  ariaLabel = 'Main actions',
  eyebrow = null,
  heading = null,
  description = null,
}) {
  const gridClassName = ['actionCards__grid', cards.length === 1 ? 'actionCards__grid--single' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <section className="actionCards section" aria-label={ariaLabel}>
      <div className="container">
        {eyebrow || heading || description ? (
          <div className="actionCards__header">
            {eyebrow ? <p className="actionCards__eyebrow">{eyebrow}</p> : null}
            {heading ? <h2 className="actionCards__heading">{heading}</h2> : null}
            {description ? <p className="actionCards__intro">{description}</p> : null}
          </div>
        ) : null}

        <div className={gridClassName}>
          {cards.map((card) => (
            <article key={card.key} className="actionCard">
              <Link className="actionCard__link" to={card.to}>
                <img
                  className="actionCard__image"
                  src={card.imageSrc}
                  alt={card.imageAlt}
                />
                <div className="actionCard__body">
                  <h2 className="actionCard__title">{card.title}</h2>
                  <p className="actionCard__description">{card.description}</p>

                  <div className="actionCard__buttonRow">
                    <span className="button actionCard__button">{card.buttonText}</span>
                  </div>
                </div>
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
