import './Hero.css';

/**
 * Hero
 *
 * Layout matches the provided HeroExample.png:
 * - Two-column grid
 * - Left: image (no rounded corners)
 * - Right: title + description
 */
export default function Hero({
  imageSrc,
  imageAlt,
  eyebrow = '',
  title,
  description,
}) {
  return (
    <section className="hero section" aria-label="Hero">
      <div className="container">
        <div className="hero__grid">
          <div className="hero__media">
            <img className="hero__image" src={imageSrc} alt={imageAlt} />
          </div>
          <div className="hero__content">
            {eyebrow ? <p className="hero__eyebrow">{eyebrow}</p> : null}
            <h1 className="hero__title">{title}</h1>
            <p className="hero__description">{description}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
