import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import MemberProfileContent from '../components/MemberProfile/MemberProfileContent.jsx';
import { getProfile } from '../api/composites.js';
import './MemberPage.css';

export default function MemberPage() {
  const { profileId } = useParams();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(Boolean(profileId));
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    if (!profileId) {
      setProfile(null);
      setPageError('');
      setIsLoading(false);
      return;
    }

    let isActive = true;

    const loadProfile = async () => {
      setIsLoading(true);
      setPageError('');

      try {
        const profileRecord = await getProfile(profileId);

        if (!isActive) {
          return;
        }

        setProfile(profileRecord);
      } catch (error) {
        if (isActive) {
          setPageError(error.message);
          setProfile(null);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isActive = false;
    };
  }, [profileId]);

  if (!profileId) {
    return (
      <section className="member section" aria-label="Member profile">
        <div className="container">
          <div className="member__emptyState">
            <h1 className="member__name">Select a Member</h1>
            <p className="member__bio">
              Search from the homepage to open a member profile populated from the archive.
            </p>
            <Link className="button" to="/">
              Back to home
            </Link>
          </div>
        </div>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="member section" aria-label="Member profile">
        <div className="container">
          <div className="member__emptyState">
            <p className="member__bio">Loading member profile...</p>
          </div>
        </div>
      </section>
    );
  }

  if (pageError || !profile) {
    return (
      <section className="member section" aria-label="Member profile">
        <div className="container">
          <div className="member__emptyState">
            <h1 className="member__name">Member Not Found</h1>
            <p className="member__bio">{pageError || 'The requested member profile could not be loaded.'}</p>
            <Link className="button" to="/">
              Back to home
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="member section" aria-label="Member profile">
      <div className="container">
        <MemberProfileContent profile={profile} />
      </div>
    </section>
  );
}
