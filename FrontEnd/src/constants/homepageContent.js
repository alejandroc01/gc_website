export const HOMEPAGE_SITE_EYEBROW = 'German Club of Virginia Tech';
export const DEFAULT_HOMEPAGE_TITLE = 'Digital Archives';
export const DEFAULT_HOMEPAGE_DESCRIPTION = 'This is a test description. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec a diam lectus. Sed sit amet ipsum mauris. Maecenas congue ligula ac quam viverra nec consectetur ante hendrerit. Donec et mollis dolor. Praesent et diam eget libero egestas mattis sit amet vitae augue.';
export const DEFAULT_HOMEPAGE_IMAGE_SRC = '/images/homepageimage.jpg';
export const DEFAULT_HOMEPAGE_IMAGE_ALT = 'German Club alumni';
export const HOMEPAGE_TEXT_STYLE_KEYS = ['eyebrow', 'title', 'description'];
export const HOMEPAGE_FONT_OPTIONS = [
  { value: 'body', label: 'Roboto', cssValue: 'var(--font-body)' },
  { value: 'display', label: 'Cormorant Garamond', cssValue: 'var(--font-display)' },
  { value: 'smallcaps', label: 'Cormorant SC', cssValue: 'var(--font-smallcaps)' },
  { value: 'script', label: 'Tangerine', cssValue: 'var(--font-script)' },
  { value: 'georgia', label: 'Georgia', cssValue: 'Georgia, serif' },
  { value: 'times', label: 'Times New Roman', cssValue: '"Times New Roman", Times, serif' },
  { value: 'arial', label: 'Arial', cssValue: 'Arial, Helvetica, sans-serif' },
  { value: 'courier', label: 'Courier New', cssValue: '"Courier New", Courier, monospace' },
];
export const DEFAULT_HOMEPAGE_TEXT_STYLES = {
  eyebrow: {
    fontFamily: 'smallcaps',
    fontSize: 15,
    isBold: false,
    isItalic: false,
    isUnderlined: false,
  },
  title: {
    fontFamily: 'display',
    fontSize: 52,
    isBold: false,
    isItalic: false,
    isUnderlined: false,
  },
  description: {
    fontFamily: 'body',
    fontSize: 17,
    isBold: false,
    isItalic: false,
    isUnderlined: false,
  },
};
const homepageContentCacheKey = 'gc-homepage-content-cache';

export function normalizeHomepageContent(homepageContent) {
  const eyebrow = String(homepageContent?.eyebrow || '').trim() || HOMEPAGE_SITE_EYEBROW;
  const title = String(homepageContent?.title || '').trim() || DEFAULT_HOMEPAGE_TITLE;
  const description = String(homepageContent?.description || '').trim() || DEFAULT_HOMEPAGE_DESCRIPTION;
  const imageUrl = String(homepageContent?.imageUrl || '').trim() || DEFAULT_HOMEPAGE_IMAGE_SRC;

  return {
    eyebrow,
    title,
    description,
    imageUrl,
    imageAlt: DEFAULT_HOMEPAGE_IMAGE_ALT,
    imageOriginalFilename: String(homepageContent?.imageOriginalFilename || '').trim(),
    textStyles: normalizeHomepageTextStyles(homepageContent?.textStyles),
    updatedAt: homepageContent?.updatedAt || null,
    imageUploadTimestamp: homepageContent?.imageUploadTimestamp || null,
    hasCustomImage: Boolean(homepageContent?.hasCustomImage),
  };
}

export function buildHomepageTextStyle(textStyle, styleKey = 'description') {
  const fallbackStyle = DEFAULT_HOMEPAGE_TEXT_STYLES[styleKey] || DEFAULT_HOMEPAGE_TEXT_STYLES.description;
  const normalizedStyle = normalizeHomepageTextStyle(textStyle, fallbackStyle);
  const fontOption = HOMEPAGE_FONT_OPTIONS.find((option) => option.value === normalizedStyle.fontFamily)
    || HOMEPAGE_FONT_OPTIONS[0];

  return {
    fontFamily: fontOption.cssValue,
    fontSize: `${normalizedStyle.fontSize}px`,
    fontWeight: normalizedStyle.isBold ? 700 : undefined,
    fontStyle: normalizedStyle.isItalic ? 'italic' : undefined,
    textDecoration: normalizedStyle.isUnderlined ? 'underline' : undefined,
  };
}

export function normalizeHomepageTextStyles(textStyles) {
  return HOMEPAGE_TEXT_STYLE_KEYS.reduce((normalizedStyles, styleKey) => ({
    ...normalizedStyles,
    [styleKey]: normalizeHomepageTextStyle(
      textStyles?.[styleKey],
      DEFAULT_HOMEPAGE_TEXT_STYLES[styleKey],
    ),
  }), {});
}

function normalizeHomepageTextStyle(textStyle, fallbackStyle) {
  const fontFamily = String(textStyle?.fontFamily || '').trim();
  const parsedFontSize = Number(textStyle?.fontSize);

  return {
    fontFamily: HOMEPAGE_FONT_OPTIONS.some((option) => option.value === fontFamily)
      ? fontFamily
      : fallbackStyle.fontFamily,
    fontSize: clampNumber(
      Number.isFinite(parsedFontSize) ? parsedFontSize : fallbackStyle.fontSize,
      10,
      120,
    ),
    isBold: normalizeBoolean(textStyle?.isBold),
    isItalic: normalizeBoolean(textStyle?.isItalic),
    isUnderlined: normalizeBoolean(textStyle?.isUnderlined),
  };
}

function normalizeBoolean(value) {
  return value === true || value === 'true';
}

function clampNumber(value, minimumValue, maximumValue) {
  return Math.min(Math.max(Math.round(value), minimumValue), maximumValue);
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
