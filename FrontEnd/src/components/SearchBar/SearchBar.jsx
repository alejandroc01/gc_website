import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import './SearchBar.css';

const DUMMY_RECORDS = [
  { name: 'Michael Krause', city: 'Richmond', state: 'VA' },
  { name: 'Alex Fischer', city: 'Richmond', state: 'VA' },
  { name: 'Rachel Nguyen', city: 'Norfolk', state: 'VA' },
  { name: 'Sarah Ellis', city: 'Charlotte', state: 'NC' },
  { name: 'Jordan Kim', city: 'Washington', state: 'DC' },
  { name: 'Marcus Lopez', city: 'Roanoke', state: 'VA' },
  { name: 'Emily Chen', city: 'Atlanta', state: 'GA' },
  { name: 'Tyler Brooks', city: 'Chicago', state: 'IL' },
  { name: 'Priya Patel', city: 'Blacksburg', state: 'VA' },
  { name: 'Hannah Ward', city: 'Charleston', state: 'SC' },
  { name: 'James Nolan', city: 'Philadelphia', state: 'PA' },
];

/**
 * SearchBar
 *
 * Simple autocomplete using a dummy list of names/cities/states.
 *
 * Requirements:
 * - Centered full-width search input
 * - Placeholder text exactly: "Search by name, city, or state...."
 * - Small search icon inside the input on the left
 * - Not rounded
 * - Nice focus ring
 */
export default function SearchBar() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimer = useRef(null);
  const navigate = useNavigate();

  const clearBlurTimer = () => {
    if (blurTimer.current) {
      clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  };

  const results = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return [];

    return DUMMY_RECORDS.filter(({ name, city, state }) =>
      [name, city, state].some((field) => field.toLowerCase().includes(value)),
    );
  }, [query]);

  const handleFocus = () => {
    clearBlurTimer();
    setOpen(true);
  };

  const handleBlur = () => {
    blurTimer.current = setTimeout(() => setOpen(false), 120);
  };

  const handleSelect = (record) => {
    clearBlurTimer();
    setQuery(`${record.name} — ${record.city}, ${record.state}`);
    setOpen(false);
    setTimeout(() => navigate('/member'), 100); // Small delay to allow click event to finish before navigating
  };

  return (
    <section className="search section" aria-label="Search">
      <div className="container">
        <div className="search__outer">
          <label className="sr-only" htmlFor="archive-search">
            Search
          </label>

          <form className="search__inputWrap" onSubmit={(e) => e.preventDefault()} role="search">
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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />

            {open && (
              <div className="search__dropdown" role="listbox" aria-label="Search suggestions">
                {query.trim().length === 0 ? (
                  <p className="search__empty">Start typing to see matches.</p>
                ) : results.length === 0 ? (
                  <p className="search__empty">No matching results.</p>
                ) : (
                  <ul className="search__list">
                    {results.map((record) => (
                      <li key={`${record.name}-${record.city}`} className="search__item">
                        <button type="button" onMouseDown={() => handleSelect(record)}>
                          <span className="search__itemName">{record.name}</span>
                          <span className="search__itemMeta">
                            {record.city}, {record.state}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
