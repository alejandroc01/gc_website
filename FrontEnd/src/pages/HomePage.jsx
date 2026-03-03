import Hero from '../components/Hero/Hero.jsx';
import SearchBar from '../components/SearchBar/SearchBar.jsx';
import ActionCards from '../components/ActionCards/ActionCards.jsx';

/**
 * HomePage ("Archive Home")
 *
 * This is the landing page for the Alumni Archives.
 *
 * Sections:
 * 1) Hero (image left, headline + description right)
 * 2) Search input (UI only, no functionality yet)
 * 3) Action cards (Composites, Scrapbooks, Oral Histories)
 */
export default function HomePage() {
  return (
    <>
      <Hero
        imageSrc="/images/homepageimage.jpg"
        imageAlt="German Club alumni"
        title="Alumni Archives"
        description="This is a test description. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec a diam lectus. Sed sit amet ipsum mauris. Maecenas congue ligula ac quam viverra nec consectetur ante hendrerit. Donec et mollis dolor. Praesent et diam eget libero egestas mattis sit amet vitae augue."
      />

      <SearchBar />

      <ActionCards />
    </>
  );
}
