export const HOMEPAGE_SITE_EYEBROW = 'German Club of Virginia Tech';
export const DEFAULT_HOMEPAGE_TITLE = 'Digital Archives';
export const DEFAULT_HOMEPAGE_DESCRIPTION = 'This is a test description. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec a diam lectus. Sed sit amet ipsum mauris. Maecenas congue ligula ac quam viverra nec consectetur ante hendrerit. Donec et mollis dolor. Praesent et diam eget libero egestas mattis sit amet vitae augue.';
export const DEFAULT_HOMEPAGE_IMAGE_SRC = '/images/homepageimage.jpg';
export const DEFAULT_HOMEPAGE_IMAGE_ALT = 'German Club alumni';
const homepageContentCacheKey = 'gc-homepage-content-cache';

export function normalizeHomepageContent(homepageContent) {
  const description = String(homepageContent?.description || '').trim() || DEFAULT_HOMEPAGE_DESCRIPTION;
  const imageUrl = String(homepageContent?.imageUrl || '').trim() || DEFAULT_HOMEPAGE_IMAGE_SRC;

  return {
    title: DEFAULT_HOMEPAGE_TITLE,
    description,
    imageUrl,
    imageAlt: DEFAULT_HOMEPAGE_IMAGE_ALT,
    imageOriginalFilename: String(homepageContent?.imageOriginalFilename || '').trim(),
    updatedAt: homepageContent?.updatedAt || null,
    imageUploadTimestamp: homepageContent?.imageUploadTimestamp || null,
    hasCustomImage: Boolean(homepageContent?.hasCustomImage),
  };
}

export function loadStoredHomepageContent() {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(homepageContentCacheKey);

    if (!storedValue) {
      return null;
    }

    return normalizeHomepageContent(JSON.parse(storedValue));
  } catch (error) {
    console.error('Unable to read stored homepage content.', error);
    return null;
  }
}

export function persistHomepageContent(homepageContent) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(
    homepageContentCacheKey,
    JSON.stringify(normalizeHomepageContent(homepageContent)),
  );
}
