const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');

async function requestJson(url, options = {}) {
  const response = await fetch(buildApiUrl(url), options);
  const responseText = await response.text();
  const payload = normalizeResponseUrls(parseResponseBody(responseText));

  if (!response.ok) {
    const errorMessage = (
      payload && typeof payload === 'object'
        ? payload.error
        : typeof payload === 'string'
          ? payload.trim()
          : ''
    ) || 'The request could not be completed.';

    throw new Error(errorMessage);
  }

  return payload;
}

function parseResponseBody(responseText) {
  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

function buildApiUrl(url) {
  if (!url || isAbsoluteUrl(url) || !configuredApiBaseUrl) {
    return url;
  }

  return new URL(url, `${configuredApiBaseUrl}/`).toString();
}

function buildAssetUrl(url) {
  if (!url || isAbsoluteUrl(url) || !configuredApiBaseUrl) {
    return url;
  }

  return new URL(url, `${configuredApiBaseUrl}/`).toString();
}

function isAbsoluteUrl(url) {
  return /^[a-z]+:\/\//i.test(String(url || '')) || String(url || '').startsWith('//');
}

function normalizeResponseUrls(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeResponseUrls(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => {
      if ((key === 'imageUrl' || key === 'profileImageUrl') && typeof entryValue === 'string') {
        return [key, buildAssetUrl(entryValue)];
      }

      return [key, normalizeResponseUrls(entryValue)];
    }),
  );
}

export function getComposites() {
  return requestJson('/api/composites');
}

export function getComposite(compositeId) {
  return requestJson(`/api/composites/${compositeId}`);
}

export function getCompositeTextBoxes(compositeId) {
  return requestJson(`/api/composites/${compositeId}/text-boxes`);
}

export function getProfiles() {
  return requestJson('/api/profiles');
}

export function getProfile(profileId) {
  return requestJson(`/api/profiles/${profileId}`);
}

export function createProfile(profile) {
  return requestJson('/api/profiles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(profile),
  });
}

export function updateProfile(profileId, profile) {
  return requestJson(`/api/profiles/${profileId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(profile),
  });
}

export function deleteProfile(profileId) {
  return requestJson(`/api/profiles/${profileId}`, {
    method: 'DELETE',
  });
}

export function importProfilesCsv(file) {
  const payload = new FormData();
  payload.append('profilesCsv', file);

  return requestJson('/api/profiles/import', {
    method: 'POST',
    body: payload,
  });
}

export function uploadComposite(file, compositeYear) {
  const payload = new FormData();
  payload.append('compositeYear', compositeYear);
  payload.append('image', file);

  return requestJson('/api/composites', {
    method: 'POST',
    body: payload,
  });
}

export function saveCompositeAnnotations(compositeId, annotations) {
  return requestJson(`/api/composites/${compositeId}/annotations`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ annotations }),
  });
}

export function autoDetectCompositeAnnotations(
  compositeId,
  existingAnnotations = [],
  referenceAnnotation = null,
) {
  return requestJson(`/api/composites/${compositeId}/auto-detect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ existingAnnotations, referenceAnnotation }),
  });
}

export function deleteComposite(compositeId) {
  return requestJson(`/api/composites/${compositeId}`, {
    method: 'DELETE',
  });
}
