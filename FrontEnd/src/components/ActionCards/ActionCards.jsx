import { Link } from 'react-router-dom'
import './ActionCards.css'

const CARDS = [
  {
    key: 'composites',
    imageSrc: '/images/2025.jpeg',
    imageAlt: 'Composites preview',
    title: 'Composites',
    description: 'Browse class composites by year and view member details.',
    buttonText: 'View Composites',
    to: '/composites'
  },
  {
    key: 'scrapbooks',
    imageSrc: '/images/1983ScrapB-P26.jpg',
    imageAlt: 'Scrapbooks preview',
    title: 'Scrapbooks',
    description: 'Flip through scrapbook pages and open scanned photos.',
    buttonText: 'Open Scrapbooks',
    to: '/scrapbooks'
  },
  {
    key: 'oral-histories',
    imageSrc: '/images/doug_oral_history_thumbnail.png',
    imageAlt: 'Oral histories preview',
    title: 'Oral Histories',
    description: 'Watch alumni interviews and themed video clips.',
    buttonText: 'Watch Oral Histories',
    to: '/oral-histories'
  }
]

/**
 * ActionCards
 *
 * A 3-card grid using a "news card" style (image, title, description, button).
 * Buttons use client-side navigation (react-router) so hooking up future pages is easy.
 */
export default function ActionCards () {
  return (
    <section className='actionCards section' aria-label='Main actions'>
      <div className='container'>
        <div className='actionCards__grid'>
          {CARDS.map(card => (
            <article key={card.key} className='actionCard'>
              <img
                className='actionCard__image'
                src={card.imageSrc}
                alt={card.imageAlt}
              />
              <div className='actionCard__body'>
                <h2 className='actionCard__title'>{card.title}</h2>
                <p className='actionCard__description'>{card.description}</p>

                <div className='actionCard__buttonRow'>
                  <Link className='button actionCard__button' to={card.to}>
                    {card.buttonText}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
