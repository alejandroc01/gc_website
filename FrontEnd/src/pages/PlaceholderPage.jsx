/**
 * PlaceholderPage
 *
 * This is a simple stand-in for future pages.
 * Replace the content of these pages (or create dedicated components)
 * when you're ready to build the real functionality.
 */
export default function PlaceholderPage({ title }) {
  return (
    <section className="section">
      <div className="container">
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(2rem, 3vw, 3rem)',
            margin: '0 0 12px',
          }}
        >
          {title}
        </h1>
        <p style={{ margin: 0, color: 'var(--muted)', maxWidth: 720 }}>
          This page is a placeholder. The route is already wired up — you can now build the real content
          and keep the navbar/buttons working without changing your links.
        </p>
        {title === 'Composites' && (
          <p style={{ marginTop: 12, color: 'var(--muted)' }}>
            Link to a demo member page: <a href="/member">/member</a>
          </p>
        )}
      </div>
    </section>
  );
}
