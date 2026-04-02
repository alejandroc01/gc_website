import './CompositeCopyrightNotice.css';

export default function CompositeCopyrightNotice({ className = '' }) {
  return (
    <p className={['compositeCopyrightNotice', className].filter(Boolean).join(' ')}>
      © Vantine Imaging. All rights reserved. These composite images are exclusive property of
      {' '}
      Vantine Imaging and are protected under international copyright laws. They may not be
      {' '}
      downloaded, reproduced, copied, or used in any way without express written permission.
    </p>
  );
}
