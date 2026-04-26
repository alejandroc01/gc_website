import './Hero.css';
import { buildHomepageTextStyle } from '../../constants/homepageContent.js';

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
  textStyles = {},
}) {
  return (
    <section className="hero section" aria-label="Hero">
      <div className="container">
        <div className="hero__grid">
          <div className="hero__media">
            <img className="hero__image" src={imageSrc} alt={imageAlt} />
          </div>
          <div className="hero__content">
            {eyebrow ? (
              <p className="hero__eyebrow" style={buildHomepageTextStyle(textStyles.eyebrow, 'eyebrow')}>
                {eyebrow}
              </p>
            ) : null}
            <h1 className="hero__title" style={buildHomepageTextStyle(textStyles.title, 'title')}>{title}</h1>
            <p className="hero__description" style={buildHomepageTextStyle(textStyles.description, 'description')}>
              {description}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
