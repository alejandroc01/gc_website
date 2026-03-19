const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const compositeUploadChunkSize = 512 * 1024;

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

export function importProfilesCsv(file) {
  const payload = new FormData();
  payload.append('profilesCsv', file);

  return requestJson('/api/profiles/import', {
    method: 'POST',
    body: payload,
  });
}

export async function uploadComposite(file, compositeYear, { onProgress } = {}) {
  const uploadSession = await requestJson('/api/composites/upload-sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      compositeYear,
      originalFilename: file.name,
      mimeType: resolveCompositeUploadMimeType(file),
    }),
  });
  const totalChunks = Math.max(1, Math.ceil(file.size / compositeUploadChunkSize));

  onProgress?.({
    uploadedChunks: 0,
    totalChunks,
    percent: 0,
  });

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const startIndex = chunkIndex * compositeUploadChunkSize;
    const chunkBlob = file.slice(startIndex, startIndex + compositeUploadChunkSize);
    const payload = new FormData();

    payload.append('chunkIndex', String(chunkIndex));
    payload.append('totalChunks', String(totalChunks));
    payload.append('imageChunk', chunkBlob, file.name);

    await requestJson(`/api/composites/upload-sessions/${uploadSession.uploadId}/chunks`, {
      method: 'POST',
      body: payload,
    });

    onProgress?.({
      uploadedChunks: chunkIndex + 1,
      totalChunks,
      percent: Math.round(((chunkIndex + 1) / totalChunks) * 100),
    });
  }

  return requestJson(`/api/composites/upload-sessions/${uploadSession.uploadId}/complete`, {
    method: 'POST',
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

function resolveCompositeUploadMimeType(file) {
  if (file?.type) {
    return file.type;
  }

  const normalizedFilename = String(file?.name || '').toLowerCase();

  if (normalizedFilename.endsWith('.png')) {
    return 'image/png';
  }

  if (normalizedFilename.endsWith('.webp')) {
    return 'image/webp';
  }

  return 'image/jpeg';
}
