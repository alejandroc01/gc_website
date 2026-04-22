const configuredApiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
const compositeUploadChunkSizeBytes = 256 * 1024;
const historyUploadChunkSizeBytes = 1024 * 1024;
const oralHistoryUploadChunkSizeBytes = 8 * 1024 * 1024;
const oralHistoryUploadChunkRetryCount = 3;

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
      if (key === 'pageImageUrls' && Array.isArray(entryValue)) {
        return [key, entryValue.map((url) => (typeof url === 'string' ? buildAssetUrl(url) : url))];
      }

      if (
        (key === 'imageUrl'
        || key === 'profileImageUrl'
        || key === 'thumbnailUrl'
        || key === 'videoUrl'
        || key === 'pdfUrl')
        && typeof entryValue === 'string'
      ) {
        return [key, buildAssetUrl(entryValue)];
      }

      return [key, normalizeResponseUrls(entryValue)];
    }),
  );
}

export function getComposites() {
  return requestJson('/api/composites');
}

export function getScrapbooks() {
  return requestJson('/api/scrapbooks');
}

export function getScrapbookMetadataYears() {
  return requestJson('/api/scrapbooks/metadata/years');
}

export function getScrapbookMetadataReview(year = '') {
  const query = buildOptionalYearQuery(year);
  return requestJson(`/api/scrapbooks/metadata/review${query}`);
}

export function importScrapbookMetadataCsv(file) {
  const payload = new FormData();
  payload.append('metadataCsv', file);

  return requestJson('/api/scrapbooks/metadata/import', {
    method: 'POST',
    body: payload,
  });
}

export function saveScrapbookMetadataProfileLinks(links, year = '') {
  const query = buildOptionalYearQuery(year);

  return requestJson(`/api/scrapbooks/metadata/profile-links${query}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ links }),
  });
}

function buildOptionalYearQuery(year) {
  const selectedYear = String(year || '').trim();

  if (!/^\d{4}$/.test(selectedYear)) {
    return '';
  }

  return `?${new URLSearchParams({ year: selectedYear }).toString()}`;
}

export function getHistories() {
  return requestJson('/api/histories');
}

export function getHomepageContent() {
  return requestJson('/api/homepage');
}

export function updateHomepageContent(homepageContent) {
  return requestJson('/api/homepage', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(homepageContent),
  });
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

export async function exportProfilesCsv(selectedTags = []) {
  const normalizedTags = Array.from(new Set(
    (Array.isArray(selectedTags) ? selectedTags : [])
      .map((tag) => String(tag || '').trim())
      .filter(Boolean),
  ));

  if (normalizedTags.length === 0) {
    throw new Error('Select at least one member profile tag before exporting.');
  }

  const queryString = new URLSearchParams({
    tags: normalizedTags.join(','),
  }).toString();
  const response = await fetch(buildApiUrl(`/api/profiles/export?${queryString}`));

  if (!response.ok) {
    const responseText = await response.text();
    const payload = normalizeResponseUrls(parseResponseBody(responseText));
    throw new Error(buildErrorMessage(response, payload));
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get('content-disposition');

  return {
    blob,
    filename: parseDownloadFilename(contentDisposition) || 'member-profiles-export.csv',
  };
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

async function createScrapbookUploadSession(file, scrapbookYear, totalChunks) {
  return requestJson('/api/scrapbooks/upload-sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      scrapbookYear,
      originalFilename: file.name,
      mimeType: file.type || '',
      totalSize: file.size,
      totalChunks,
    }),
  });
}

async function uploadScrapbookChunk(uploadId, file, chunk, chunkIndex) {
  const payload = new FormData();
  payload.append('chunkIndex', String(chunkIndex));
  payload.append('chunk', chunk, file.name);

  return requestJson(`/api/scrapbooks/upload-sessions/${uploadId}/chunks`, {
    method: 'POST',
    body: payload,
  });
}

async function completeScrapbookUploadSession(uploadId) {
  return requestJson(`/api/scrapbooks/upload-sessions/${uploadId}/complete`, {
    method: 'POST',
  });
}

async function abortScrapbookUploadSession(uploadId) {
  return requestJson(`/api/scrapbooks/upload-sessions/${uploadId}`, {
    method: 'DELETE',
  });
}

async function createHomepageUploadSession(file, title, description, totalChunks) {
  return requestJson('/api/homepage/upload-sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title,
      description,
      originalFilename: file.name,
      mimeType: file.type || '',
      totalSize: file.size,
      totalChunks,
    }),
  });
}

async function uploadHomepageChunk(uploadId, file, chunk, chunkIndex) {
  const payload = new FormData();
  payload.append('chunkIndex', String(chunkIndex));
  payload.append('chunk', chunk, file.name);

  return requestJson(`/api/homepage/upload-sessions/${uploadId}/chunks`, {
    method: 'POST',
    body: payload,
  });
}

async function completeHomepageUploadSession(uploadId) {
  return requestJson(`/api/homepage/upload-sessions/${uploadId}/complete`, {
    method: 'POST',
  });
}

async function abortHomepageUploadSession(uploadId) {
  return requestJson(`/api/homepage/upload-sessions/${uploadId}`, {
    method: 'DELETE',
  });
}

async function createOralHistoryUploadSession(file, metadata, totalChunks) {
  return requestJson('/api/oral-histories/upload-sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...metadata,
      originalFilename: file.name,
      mimeType: file.type || '',
      totalSize: file.size,
      totalChunks,
    }),
  });
}

async function createHistoryUploadSession(file, metadata, totalChunks) {
  return requestJson('/api/histories/upload-sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...metadata,
      originalFilename: file.name,
      mimeType: file.type || '',
      totalSize: file.size,
      totalChunks,
    }),
  });
}

async function uploadHistoryChunk(uploadId, file, chunk, chunkIndex) {
  const payload = new FormData();
  payload.append('chunkIndex', String(chunkIndex));
  payload.append('chunk', chunk, file.name);

  return requestJson(`/api/histories/upload-sessions/${uploadId}/chunks`, {
    method: 'POST',
    body: payload,
  });
}

async function completeHistoryUploadSession(uploadId) {
  return requestJson(`/api/histories/upload-sessions/${uploadId}/complete`, {
    method: 'POST',
  });
}

async function abortHistoryUploadSession(uploadId) {
  return requestJson(`/api/histories/upload-sessions/${uploadId}`, {
    method: 'DELETE',
  });
}

async function uploadOralHistoryChunk(uploadId, file, chunk, chunkIndex) {
  const payload = new FormData();
  payload.append('chunkIndex', String(chunkIndex));
  payload.append('chunk', chunk, file.name);

  return requestJson(`/api/oral-histories/upload-sessions/${uploadId}/chunks`, {
    method: 'POST',
    body: payload,
  });
}

async function completeOralHistoryUploadSession(uploadId) {
  return requestJson(`/api/oral-histories/upload-sessions/${uploadId}/complete`, {
    method: 'POST',
  });
}

async function abortOralHistoryUploadSession(uploadId) {
  return requestJson(`/api/oral-histories/upload-sessions/${uploadId}`, {
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

export async function uploadScrapbook(file, scrapbookYear, options = {}) {
  const totalChunks = Math.max(1, Math.ceil(file.size / compositeUploadChunkSizeBytes));
  const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
  let uploadId = '';

  try {
    const uploadSession = await createScrapbookUploadSession(file, scrapbookYear, totalChunks);

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
      const chunkUploadSummary = await uploadScrapbookChunk(uploadId, file, chunk, chunkIndex);
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

    const createdScrapbook = await completeScrapbookUploadSession(uploadId);

    if (onProgress) {
      onProgress({
        uploadedBytes: file.size,
        totalBytes: file.size,
        chunkIndex: serverTotalChunks - 1,
        totalChunks: serverTotalChunks,
      });
    }

    return createdScrapbook;
  } catch (error) {
    if (uploadId) {
      try {
        await abortScrapbookUploadSession(uploadId);
      } catch {
        // Best-effort cleanup only; preserve the original upload error.
      }
    }

    throw error;
  }
}

export async function uploadHomepageContent(file, title, description, options = {}) {
  const totalChunks = Math.max(1, Math.ceil(file.size / compositeUploadChunkSizeBytes));
  const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
  let uploadId = '';

  try {
    const uploadSession = await createHomepageUploadSession(file, title, description, totalChunks);

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
      const chunkUploadSummary = await uploadHomepageChunk(uploadId, file, chunk, chunkIndex);
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

    const updatedHomepageContent = await completeHomepageUploadSession(uploadId);

    if (onProgress) {
      onProgress({
        uploadedBytes: file.size,
        totalBytes: file.size,
        chunkIndex: serverTotalChunks - 1,
        totalChunks: serverTotalChunks,
      });
    }

    return updatedHomepageContent;
  } catch (error) {
    if (uploadId) {
      try {
        await abortHomepageUploadSession(uploadId);
      } catch {
        // Best-effort cleanup only; preserve the original upload error.
      }
    }

    throw error;
  }
}

export async function uploadOralHistory(file, metadata, options = {}) {
  const totalChunks = Math.max(1, Math.ceil(file.size / oralHistoryUploadChunkSizeBytes));
  const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
  let uploadId = '';

  try {
    const uploadSession = await createOralHistoryUploadSession(file, metadata, totalChunks);

    uploadId = String(uploadSession?.uploadId || '');

    if (!uploadId) {
      throw new Error('The server did not return a valid upload session.');
    }

    const chunkSize = Number(uploadSession?.chunkSize) > 0
      ? Number(uploadSession.chunkSize)
      : oralHistoryUploadChunkSizeBytes;
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
      const chunkUploadSummary = await uploadOralHistoryChunkWithRetry(uploadId, file, chunk, chunkIndex);
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

    const createdOralHistory = await completeOralHistoryUploadSession(uploadId);

    if (onProgress) {
      onProgress({
        uploadedBytes: file.size,
        totalBytes: file.size,
        chunkIndex: serverTotalChunks - 1,
        totalChunks: serverTotalChunks,
      });
    }

    return createdOralHistory;
  } catch (error) {
    if (uploadId) {
      try {
        await abortOralHistoryUploadSession(uploadId);
      } catch {
        // Best-effort cleanup only; preserve the original upload error.
      }
    }

    throw error;
  }
}

export async function uploadHistory(file, metadata, options = {}) {
  const totalChunks = Math.max(1, Math.ceil(file.size / historyUploadChunkSizeBytes));
  const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
  let uploadId = '';

  try {
    const uploadSession = await createHistoryUploadSession(file, metadata, totalChunks);

    uploadId = String(uploadSession?.uploadId || '');

    if (!uploadId) {
      throw new Error('The server did not return a valid upload session.');
    }

    const chunkSize = Number(uploadSession?.chunkSize) > 0
      ? Number(uploadSession.chunkSize)
      : historyUploadChunkSizeBytes;
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
      const chunkUploadSummary = await uploadHistoryChunk(uploadId, file, chunk, chunkIndex);
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

    const createdHistory = await completeHistoryUploadSession(uploadId);

    if (onProgress) {
      onProgress({
        uploadedBytes: file.size,
        totalBytes: file.size,
        chunkIndex: serverTotalChunks - 1,
        totalChunks: serverTotalChunks,
      });
    }

    return createdHistory;
  } catch (error) {
    if (uploadId) {
      try {
        await abortHistoryUploadSession(uploadId);
      } catch {
        // Best-effort cleanup only; preserve the original upload error.
      }
    }

    throw error;
  }
}

async function uploadOralHistoryChunkWithRetry(uploadId, file, chunk, chunkIndex) {
  let lastError = null;

  for (let attempt = 1; attempt <= oralHistoryUploadChunkRetryCount; attempt += 1) {
    try {
      return await uploadOralHistoryChunk(uploadId, file, chunk, chunkIndex);
    } catch (error) {
      lastError = error;

      if (attempt === oralHistoryUploadChunkRetryCount) {
        break;
      }

      await delay(500 * attempt);
    }
  }

  throw lastError || new Error('The video chunk upload failed.');
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
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

export function deleteScrapbook(scrapbookId) {
  return requestJson(`/api/scrapbooks/${scrapbookId}`, {
    method: 'DELETE',
  });
}

export function deleteScrapbookPage(scrapbookId, pageId) {
  return requestJson(`/api/scrapbooks/${scrapbookId}/pages/${encodeURIComponent(pageId)}`, {
    method: 'DELETE',
  });
}

export function getOralHistories() {
  return requestJson('/api/oral-histories');
}

export function createOralHistory(formData) {
  return requestJson('/api/oral-histories', {
    method: 'POST',
    body: formData,
  });
}

export function deleteOralHistory(oralHistoryId) {
  return requestJson(`/api/oral-histories/${oralHistoryId}`, {
    method: 'DELETE',
  });
}

export function deleteHistory(historyId) {
  return requestJson(`/api/histories/${historyId}`, {
    method: 'DELETE',
  });
}

function parseDownloadFilename(contentDisposition) {
  const normalizedHeader = String(contentDisposition || '').trim();

  if (!normalizedHeader) {
    return '';
  }

  const utf8FilenameMatch = normalizedHeader.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);

  if (utf8FilenameMatch?.[1]) {
    return decodeURIComponent(utf8FilenameMatch[1].trim());
  }

  const filenameMatch = normalizedHeader.match(/filename\s*=\s*"([^"]+)"/i)
    || normalizedHeader.match(/filename\s*=\s*([^;]+)/i);

  return filenameMatch?.[1] ? filenameMatch[1].trim() : '';
}
