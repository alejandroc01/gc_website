import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import trashIcon from '../assets/icons/trash.svg';
import AnnotationStage from '../components/Composite/AnnotationStage.jsx';
import ProfileSearchSelect from '../components/Composite/ProfileSearchSelect.jsx';
import {
  getComposite,
  getProfiles,
  saveCompositeAnnotations,
} from '../api/composites.js';
import '../styles/composites.css';

const DEFAULT_BOX_SIZE = {
  width: 72,
  height: 90,
};
const MIN_ZOOM_LEVEL = 1;
const MAX_ZOOM_LEVEL = 4;
const ZOOM_STEP = 0.25;

export default function CompositeEditorPage() {
  const { compositeId } = useParams();
  const [composite, setComposite] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [annotations, setAnnotations] = useState([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState(null);
  const [lastBoxSize, setLastBoxSize] = useState(DEFAULT_BOX_SIZE);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const [pageError, setPageError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [annotationPanelHeight, setAnnotationPanelHeight] = useState(null);
  const [isStackedLayout, setIsStackedLayout] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 1180 : false
  ));

  const saveTimeoutRef = useRef(null);
  const latestSavedSignatureRef = useRef('[]');
  const currentSignatureRef = useRef('[]');
  const canvasPanelRef = useRef(null);

  useEffect(() => {
    let isActive = true;

    const loadEditorData = async () => {
      setIsLoading(true);
      setPageError('');

      try {
        const [loadedComposite, loadedProfiles] = await Promise.all([
          getComposite(compositeId),
          getProfiles(),
        ]);

        if (!isActive) {
          return;
        }

        const nextAnnotations = loadedComposite.annotations || [];
        const reusableSize = getReusableBoxSize(nextAnnotations);

        setComposite(loadedComposite);
        setProfiles(loadedProfiles);
        setAnnotations(nextAnnotations);
        setSelectedAnnotationId(nextAnnotations[0]?.annotationId || null);
        setLastBoxSize(reusableSize);
        setZoomLevel(1);
        latestSavedSignatureRef.current = createAnnotationSignature(nextAnnotations);
        currentSignatureRef.current = latestSavedSignatureRef.current;
        setSaveStatus('idle');
        setSaveError('');
      } catch (error) {
        if (isActive) {
          setPageError(error.message);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadEditorData();

    return () => {
      isActive = false;
      window.clearTimeout(saveTimeoutRef.current);
    };
  }, [compositeId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(max-width: 1180px)');
    const updateLayoutMode = (event) => {
      setIsStackedLayout(event.matches);
    };

    setIsStackedLayout(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateLayoutMode);
      return () => mediaQuery.removeEventListener('change', updateLayoutMode);
    }

    mediaQuery.addListener(updateLayoutMode);
    return () => mediaQuery.removeListener(updateLayoutMode);
  }, []);

  useEffect(() => {
    if (isStackedLayout) {
      setAnnotationPanelHeight(null);
      return undefined;
    }

    const canvasPanel = canvasPanelRef.current;

    if (!canvasPanel) {
      return undefined;
    }

    const syncPanelHeight = () => {
      setAnnotationPanelHeight(Math.round(canvasPanel.getBoundingClientRect().height));
    };

    syncPanelHeight();

    // Keep the annotation list column visually aligned with the composite panel
    // without stretching the composite itself.
    const resizeObserver = new ResizeObserver(() => {
      syncPanelHeight();
    });

    resizeObserver.observe(canvasPanel);

    return () => {
      resizeObserver.disconnect();
    };
  }, [isStackedLayout, composite?.imageUrl]);

  const profileMap = useMemo(
    () => new Map(profiles.map((profile) => [profile.id, profile])),
    [profiles],
  );

  const duplicateProfileIds = useMemo(() => {
    const profileUseCounts = new Map();

    annotations.forEach((annotation) => {
      if (!annotation.profileId) {
        return;
      }

      profileUseCounts.set(
        annotation.profileId,
        (profileUseCounts.get(annotation.profileId) || 0) + 1,
      );
    });

    return new Set(
      Array.from(profileUseCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([profileId]) => profileId),
    );
  }, [annotations]);

  currentSignatureRef.current = createAnnotationSignature(annotations);

  useEffect(() => {
    if (!composite || isLoading) {
      return undefined;
    }

    const nextSignature = createAnnotationSignature(annotations);

    if (nextSignature === latestSavedSignatureRef.current) {
      return undefined;
    }

    setSaveStatus('dirty');
    window.clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = window.setTimeout(() => {
      void persistAnnotations(annotations);
    }, 700);

    return () => {
      window.clearTimeout(saveTimeoutRef.current);
    };
  }, [annotations, composite, isLoading]);

  const persistAnnotations = async (annotationsToSave) => {
    if (!composite) {
      return;
    }

    const snapshotSignature = createAnnotationSignature(annotationsToSave);

    setSaveStatus('saving');
    setSaveError('');

    try {
      const updatedComposite = await saveCompositeAnnotations(
        composite.compositeId,
        annotationsToSave.map(toAnnotationPayload),
      );

      if (currentSignatureRef.current !== snapshotSignature) {
        latestSavedSignatureRef.current = snapshotSignature;
        setComposite((currentComposite) => (
          currentComposite
            ? { ...currentComposite, annotationCount: updatedComposite.annotationCount }
            : currentComposite
        ));
        setSaveStatus('dirty');
        return;
      }

      const savedAnnotations = updatedComposite.annotations || [];

      latestSavedSignatureRef.current = createAnnotationSignature(savedAnnotations);
      setComposite(updatedComposite);
      setAnnotations(savedAnnotations);
      setLastBoxSize(getReusableBoxSize(savedAnnotations, lastBoxSize));
      setSelectedAnnotationId((currentSelectedId) => {
        if (!currentSelectedId) {
          return savedAnnotations[0]?.annotationId || null;
        }

        return savedAnnotations.some((annotation) => annotation.annotationId === currentSelectedId)
          ? currentSelectedId
          : savedAnnotations[0]?.annotationId || null;
      });
      setSaveStatus('saved');
    } catch (error) {
      if (currentSignatureRef.current !== snapshotSignature) {
        setSaveStatus('dirty');
        return;
      }

      setSaveStatus('error');
      setSaveError(error.message);
    }
  };

  const handleAnnotationListChange = (nextAnnotations) => {
    if (!composite) {
      return;
    }

    const syncedAnnotations = nextAnnotations.map((annotation) =>
      syncAnnotationForDisplay(annotation, composite),
    );

    setAnnotations(syncedAnnotations);
  };

  const handleProfileSelect = (annotationId, profileId) => {
    if (!composite) {
      return;
    }

    setAnnotations((currentAnnotations) =>
      currentAnnotations.map((annotation) => (
        annotation.annotationId === annotationId
          ? syncAnnotationForDisplay(
              {
                ...annotation,
                profileId,
                updatedAt: new Date().toISOString(),
              },
              composite,
            )
          : annotation
      )),
    );
  };

  const handleDeleteAnnotation = (annotationToDelete) => {
    if (!annotationToDelete) {
      return;
    }

    const confirmed = window.confirm('Delete this annotation box? This removes the saved coordinates.');

    if (!confirmed) {
      return;
    }

    setAnnotations((currentAnnotations) => {
      const nextAnnotations = currentAnnotations.filter(
        (annotation) => annotation.annotationId !== annotationToDelete.annotationId,
      );

      setSelectedAnnotationId((currentSelectedId) => (
        currentSelectedId === annotationToDelete.annotationId
          ? nextAnnotations[0]?.annotationId || null
          : currentSelectedId
      ));
      return nextAnnotations;
    });
  };

  const handleManualSave = async () => {
    window.clearTimeout(saveTimeoutRef.current);
    await persistAnnotations(annotations);
  };

  if (isLoading) {
    return (
      <section className="section compositeEditor">
        <div className="container">
          <div className="compositePanel">
            <p className="compositeMessage">Loading composite editor...</p>
          </div>
        </div>
      </section>
    );
  }

  if (pageError || !composite) {
    return (
      <section className="section compositeEditor">
        <div className="container">
          <div className="compositePanel">
            <p className="compositeMessage compositeMessage--error">
              {pageError || 'The requested composite could not be loaded.'}
            </p>
            <Link className="button compositeButton" to="/upload/composites">
              Back to composite uploads
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section compositeEditor">
      <div className="container">
        <header className="compositeEditor__topBar compositePanel">
          <div>
            <p className="compositePageHeader__eyebrow">Manual Annotation</p>
            <h1 className="compositeEditor__title">
              {composite.displayName || composite.originalFilename}
            </h1>
            <p className="compositeEditor__meta">
              {buildCompositeMeta(composite)}
            </p>
          </div>

          <div className="compositeEditor__actions">
            <StatusBadge saveStatus={saveStatus} />

            <div className="compositeZoomControls" aria-label="Image zoom controls">
              <span className="compositeZoomControls__label">Zoom</span>
              <button
                type="button"
                className="button compositeButton compositeZoomControls__button"
                onClick={() => setZoomLevel((currentZoom) => clampZoom(currentZoom - ZOOM_STEP))}
              >
                -
              </button>
              <input
                className="compositeZoomControls__slider"
                type="range"
                min={MIN_ZOOM_LEVEL}
                max={MAX_ZOOM_LEVEL}
                step={ZOOM_STEP}
                value={zoomLevel}
                onChange={(event) => setZoomLevel(Number(event.target.value))}
              />
              <button
                type="button"
                className="button compositeButton compositeZoomControls__button"
                onClick={() => setZoomLevel((currentZoom) => clampZoom(currentZoom + ZOOM_STEP))}
              >
                +
              </button>
              <button
                type="button"
                className="button compositeButton compositeZoomControls__reset"
                onClick={() => setZoomLevel(1)}
              >
                Reset
              </button>
              <span className="compositeZoomControls__value">
                {Math.round(zoomLevel * 100)}%
              </span>
            </div>

            <Link className="button compositeButton" to="/upload/composites">
              Back to list
            </Link>

            <button
              type="button"
              className="button compositeButton compositeButton--filled"
              onClick={handleManualSave}
            >
              Save
            </button>
          </div>
        </header>

        {saveError ? <p className="compositeMessage compositeMessage--error">{saveError}</p> : null}

        <div className="compositeEditor__content">
          <article ref={canvasPanelRef} className="compositePanel compositePanel--canvas">
            <div className="compositeCanvasToolbar">
              <p className="compositeCanvasToolbar__hint">
                Reusable box size: {Math.round(lastBoxSize.width)} x {Math.round(lastBoxSize.height)} px
              </p>
            </div>

            <AnnotationStage
              composite={composite}
              annotations={annotations}
              selectedAnnotationId={selectedAnnotationId}
              zoom={zoomLevel}
              lastBoxSize={lastBoxSize}
              onAnnotationsChange={handleAnnotationListChange}
              onSelectAnnotation={setSelectedAnnotationId}
              onLastBoxSizeChange={(nextSize) => setLastBoxSize(normalizeBoxSize(nextSize))}
              resolveAnnotationLabel={(annotation) => profileMap.get(annotation.profileId)?.displayName || 'Unassigned'}
            />
          </article>

          <aside className="compositeSidebar">
            <section
              className="compositePanel compositeSidebar__panel"
              style={!isStackedLayout && annotationPanelHeight ? { height: `${annotationPanelHeight}px` } : undefined}
            >
              <div className="compositePanel__header compositePanel__header--compact">
                <div>
                  <h2 className="compositeSidebar__title">Annotation List</h2>
                </div>
              </div>

              {annotations.length > 0 ? (
                <div className="annotationList">
                  {annotations.map((annotation, index) => (
                    <article
                      key={annotation.annotationId}
                      className={[
                        'annotationList__item',
                        annotation.annotationId === selectedAnnotationId ? 'annotationList__item--selected' : '',
                      ].filter(Boolean).join(' ')}
                      onPointerDown={() => setSelectedAnnotationId(annotation.annotationId)}
                      onFocusCapture={() => setSelectedAnnotationId(annotation.annotationId)}
                    >
                      <div className="annotationList__content">
                        <button
                          type="button"
                          className="annotationList__previewButton"
                          onClick={() => setSelectedAnnotationId(annotation.annotationId)}
                          aria-label={`Highlight annotation ${index + 1} on the composite image`}
                        >
                          <span className="annotationList__previewFrame">
                            <span
                              className="annotationList__previewImage"
                              style={buildPreviewStyle(annotation, composite, {
                                maxWidth: 60,
                                maxHeight: 78,
                              })}
                            />
                          </span>
                        </button>

                        <div className="annotationList__main">
                          <ProfileSearchSelect
                            profiles={profiles}
                            selectedProfileId={annotation.profileId}
                            onSelectProfile={(profileId) => handleProfileSelect(annotation.annotationId, profileId)}
                            inputId={`annotation-profile-${annotation.annotationId}`}
                            placeholder="Assign profile"
                            hideLabel
                            invalid={!annotation.profileId}
                          />

                          {annotation.profileId && duplicateProfileIds.has(annotation.profileId) ? (
                            <p className="compositeMessage compositeMessage--warning">
                              This profile is already assigned to another box in this composite.
                            </p>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          className="annotationList__deleteButton"
                          onClick={() => handleDeleteAnnotation(annotation)}
                          aria-label={`Delete annotation ${index + 1}`}
                        >
                          <img src={trashIcon} alt="" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="compositeEmptyState compositeEmptyState--tight">
                  <h3 className="compositeEmptyState__title">No boxes yet.</h3>
                  <p className="compositeEmptyState__description">
                    Drag over a portrait or click to place the reusable box size and start annotating.
                  </p>
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ saveStatus }) {
  const labelByStatus = {
    idle: 'Ready',
    dirty: 'Unsaved changes',
    saving: 'Saving...',
    saved: 'Saved',
    error: 'Save failed',
  };

  return (
    <span className={`compositeStatus compositeStatus--${saveStatus}`}>
      {labelByStatus[saveStatus] || 'Ready'}
    </span>
  );
}

function syncAnnotationForDisplay(annotation, composite) {
  const x = clamp(Math.round(annotation.x), 0, composite.imageWidth);
  const y = clamp(Math.round(annotation.y), 0, composite.imageHeight);
  const width = clamp(Math.round(annotation.width), 0, composite.imageWidth - x);
  const height = clamp(Math.round(annotation.height), 0, composite.imageHeight - y);

  return {
    ...annotation,
    x,
    y,
    width,
    height,
    normalizedX: roundNormalized(x / composite.imageWidth),
    normalizedY: roundNormalized(y / composite.imageHeight),
    normalizedWidth: roundNormalized(width / composite.imageWidth),
    normalizedHeight: roundNormalized(height / composite.imageHeight),
  };
}

function toAnnotationPayload(annotation) {
  return {
    annotationId: annotation.annotationId,
    profileId: annotation.profileId ?? null,
    x: annotation.x,
    y: annotation.y,
    width: annotation.width,
    height: annotation.height,
  };
}

function createAnnotationSignature(annotations) {
  return JSON.stringify(
    annotations.map((annotation) => ({
      annotationId: annotation.annotationId,
      profileId: annotation.profileId ?? null,
      x: Math.round(annotation.x),
      y: Math.round(annotation.y),
      width: Math.round(annotation.width),
      height: Math.round(annotation.height),
    })),
  );
}

function buildCompositeMeta(composite) {
  const parts = [];

  if (composite.compositeYear) {
    parts.push(`Year ${composite.compositeYear}`);
  }

  parts.push(composite.originalFilename);
  parts.push(`${composite.imageWidth} x ${composite.imageHeight} px`);

  return parts.join(' | ');
}

function getReusableBoxSize(annotations, fallback = DEFAULT_BOX_SIZE) {
  const latestAnnotation = annotations[annotations.length - 1];

  if (!latestAnnotation) {
    return fallback;
  }

  return normalizeBoxSize({
    width: latestAnnotation.width,
    height: latestAnnotation.height,
  });
}

function normalizeBoxSize(size) {
  return {
    width: Math.max(16, Math.round(size?.width || DEFAULT_BOX_SIZE.width)),
    height: Math.max(16, Math.round(size?.height || DEFAULT_BOX_SIZE.height)),
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampZoom(value) {
  return clamp(Number(value.toFixed(2)), MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL);
}

function roundNormalized(value) {
  return Number(value.toFixed(6));
}

function buildPreviewStyle(annotation, composite, { maxWidth, maxHeight }) {
  if (!annotation || !composite) {
    return {};
  }

  const widthScale = maxWidth / Math.max(annotation.width, 1);
  const heightScale = maxHeight / Math.max(annotation.height, 1);
  const previewScale = Math.min(widthScale, heightScale);

  return {
    width: `${annotation.width * previewScale}px`,
    height: `${annotation.height * previewScale}px`,
    backgroundImage: `url(${composite.imageUrl})`,
    backgroundSize: `${composite.imageWidth * previewScale}px ${composite.imageHeight * previewScale}px`,
    backgroundPosition: `${-annotation.x * previewScale}px ${-annotation.y * previewScale}px`,
  };
}
