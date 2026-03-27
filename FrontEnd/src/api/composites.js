const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const compositeUploadChunkSizeBytes = 256 * 1024;

async function requestJson(url, options = {}) {
  const response = await fetch(buildApiUrl(url), options);
  const responseText = await response.text();
  const payload = normalizeResponseUrls(parseResponseBody(responseText));

  if (!response.ok) {
    const errorMessage = buildErrorMessage(response, payload);

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

function buildErrorMessage(response, payload) {
  const payloadMessage = (
    payload && typeof payload === 'object'
      ? payload.error
      : typeof payload === 'string'
        ? payload.trim()
        : ''
  ) || '';

  if (
    response.status === 413
    || /413\s+Request Entity Too Large/i.test(payloadMessage)
  ) {
    return 'The upload was too large for the server to accept in one request.';
  }

  return payloadMessage || 'The request could not be completed.';
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

async function createCompositeUploadSession(file, compositeYear, totalChunks) {
  return requestJson('/api/composites/upload-sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      compositeYear,
      originalFilename: file.name,
      mimeType: file.type || '',
      totalSize: file.size,
      totalChunks,
    }),
  });
}

async function uploadCompositeChunk(uploadId, file, chunk, chunkIndex) {
  const payload = new FormData();
  payload.append('chunkIndex', String(chunkIndex));
  payload.append('chunk', chunk, file.name);

  return requestJson(`/api/composites/upload-sessions/${uploadId}/chunks`, {
    method: 'POST',
    body: payload,
  });
}

async function completeCompositeUploadSession(uploadId) {
  return requestJson(`/api/composites/upload-sessions/${uploadId}/complete`, {
    method: 'POST',
  });
}

async function abortCompositeUploadSession(uploadId) {
  return requestJson(`/api/composites/upload-sessions/${uploadId}`, {
    method: 'DELETE',
  });
}

export async function uploadComposite(file, compositeYear, options = {}) {
  const totalChunks = Math.max(1, Math.ceil(file.size / compositeUploadChunkSizeBytes));
  const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
  let uploadId = '';

  try {
    const uploadSession = await createCompositeUploadSession(file, compositeYear, totalChunks);

    uploadId = String(uploadSession?.uploadId || '');

    if (!uploadId) {
      throw new Error('The server did not return a valid upload session.');
    }

    const chunkSize = Number(uploadSession?.chunkSize) > 0
      ? Number(uploadSession.chunkSize)
      : compositeUploadChunkSizeBytes;
    const serverTotalChunks = Number(uploadSession?.totalChunks) > 0
      ? Number(uploadSession.totalChunks)
      : totalChunks;

    if (onProgress) {
      onProgress({
        uploadedBytes: 0,
        totalBytes: file.size,
        chunkIndex: -1,
        totalChunks: serverTotalChunks,
      });
    }

    for (let chunkIndex = 0; chunkIndex < serverTotalChunks; chunkIndex += 1) {
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end, file.type || undefined);
      const chunkUploadSummary = await uploadCompositeChunk(uploadId, file, chunk, chunkIndex);
      const uploadedBytes = Number(chunkUploadSummary?.uploadedBytes);

      if (onProgress) {
        onProgress({
          uploadedBytes: Number.isFinite(uploadedBytes) ? uploadedBytes : end,
          totalBytes: file.size,
          chunkIndex,
          totalChunks: serverTotalChunks,
        });
      }
    }

    const createdComposite = await completeCompositeUploadSession(uploadId);

    if (onProgress) {
      onProgress({
        uploadedBytes: file.size,
        totalBytes: file.size,
        chunkIndex: serverTotalChunks - 1,
        totalChunks: serverTotalChunks,
      });
    }

    return createdComposite;
  } catch (error) {
    if (uploadId) {
      try {
        await abortCompositeUploadSession(uploadId);
      } catch {
        // Best-effort cleanup only; preserve the original upload error.
      }
    }

    throw error;
  }
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
