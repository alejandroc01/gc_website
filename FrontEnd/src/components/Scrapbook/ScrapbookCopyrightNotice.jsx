import '../Composite/CompositeCopyrightNotice.css';
import './ScrapbookCopyrightNotice.css';

export default function ScrapbookCopyrightNotice({ className = '' }) {
  return (
    <p className={['compositeCopyrightNotice', 'scrapbookCopyrightNotice', className].filter(Boolean).join(' ')}>
      This Item is protected by copyright and/or related rights. However, for this Item, either
      {' '}
      (a) no rights-holder(s) have been identified or (b) one or more rights-holder(s) have been
      {' '}
      identified but none have been located. You are free to use this Item in any way that is
      {' '}
      permitted by the copyright and related rights legislation that applies to your use.
      {' '}
      <a href="https://rightsstatements.org/page/InC-RUU/1.0/?language=en" target="_blank" rel="noreferrer">
        Learn more.
      </a>
    </p>
  );
}
