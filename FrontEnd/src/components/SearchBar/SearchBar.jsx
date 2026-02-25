import './SearchBar.css';

/**
 * SearchBar
 *
 * UI-only search input (no functionality yet).
 *
 * Requirements:
 * - Centered full-width search input
 * - Placeholder text exactly: "Search by name, city, or state...."
 * - Small search icon inside the input on the left
 * - Not rounded
 * - Nice focus ring
 */
export default function SearchBar() {
  return (
    <section className="search section" aria-label="Search">
      <div className="container">
        <div className="search__outer">
          <label className="sr-only" htmlFor="archive-search">
            Search
          </label>

          <div className="search__inputWrap">
            <svg
              className="search__icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.3-4.3" />
            </svg>

            <input
              id="archive-search"
              className="search__input"
              type="search"
              placeholder="Search by name, city, or state...."
              autoComplete="off"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
