async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const responseText = await response.text();
  const payload = parseResponseBody(responseText);

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

export function getComposites() {
  return requestJson('/api/composites');
}

export function getComposite(compositeId) {
  return requestJson(`/api/composites/${compositeId}`);
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

export function deleteComposite(compositeId) {
  return requestJson(`/api/composites/${compositeId}`, {
    method: 'DELETE',
  });
}
