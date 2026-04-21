import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import trashIcon from '../assets/icons/trash.svg';
import AnnotationStage from '../components/Composite/AnnotationStage.jsx';
import CompositeCopyrightNotice from '../components/Composite/CompositeCopyrightNotice.jsx';
import CreateProfileModal from '../components/Composite/CreateProfileModal.jsx';
import ProfileSearchSelect from '../components/Composite/ProfileSearchSelect.jsx';
import {
  autoDetectCompositeAnnotations,
  getComposite,
  getCompositeTextBoxes,
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
  const [createProfileAnnotationId, setCreateProfileAnnotationId] = useState('');
  const [lastBoxSize, setLastBoxSize] = useState(DEFAULT_BOX_SIZE);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveError, setSaveError] = useState('');
  const [textBoxes, setTextBoxes] = useState([]);
  const [textBoxStatus, setTextBoxStatus] = useState('idle');
  const [textBoxError, setTextBoxError] = useState('');
  const [autoDetectStatus, setAutoDetectStatus] = useState('idle');
  const [autoDetectMessage, setAutoDetectMessage] = useState('');
  const [autoDetectError, setAutoDetectError] = useState('');
  const [pageError, setPageError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [annotationPanelHeight, setAnnotationPanelHeight] = useState(null);
  const [isStackedLayout, setIsStackedLayout] = useState(() => (
    typeof window !== 'undefined' ? window.innerWidth <= 1180 : false
  ));

  const saveTimeoutRef = useRef(null);
  const textBoxPollTimeoutRef = useRef(null);
  const textBoxRequestSequenceRef = useRef(0);
  const latestSavedSignatureRef = useRef('[]');
  const currentSignatureRef = useRef('[]');
  const pendingAnnotationScrollRef = useRef(null);
  const canvasPanelRef = useRef(null);
  const annotationListRef = useRef(null);
  const annotationItemRefs = useRef(new Map());

  useEffect(() => {
    let isActive = true;

    const loadEditorData = async () => {
      setIsLoading(true);
      setPageError('');
      setTextBoxes([]);
      setTextBoxStatus('idle');
      setTextBoxError('');
      setAutoDetectStatus('idle');
      setAutoDetectMessage('');
      setAutoDetectError('');

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
      window.clearTimeout(textBoxPollTimeoutRef.current);
      textBoxRequestSequenceRef.current += 1;
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

  const refreshTextBoxes = useCallback(async () => {
    if (!compositeId) {
      return;
    }

    const requestSequence = ++textBoxRequestSequenceRef.current;
    window.clearTimeout(textBoxPollTimeoutRef.current);
    setTextBoxError('');

    try {
      const textBoxResult = await getCompositeTextBoxes(compositeId);

      if (requestSequence !== textBoxRequestSequenceRef.current) {
        return;
      }

      const nextTextBoxStatus = normalizeTextBoxStatus(textBoxResult.ocrStatus);

      setTextBoxes(textBoxResult.textBoxes || []);
      setTextBoxStatus(nextTextBoxStatus);
      setTextBoxError(textBoxResult.error || '');

      if (isOcrBusyStatus(nextTextBoxStatus)) {
        textBoxPollTimeoutRef.current = window.setTimeout(() => {
          void refreshTextBoxes();
        }, 2500);
      }
    } catch (error) {
      if (requestSequence !== textBoxRequestSequenceRef.current) {
        return;
      }

      setTextBoxes([]);
      setTextBoxStatus('error');
      setTextBoxError(error.message);
    }
  }, [compositeId]);

  useEffect(() => {
    if (!compositeId) {
      return undefined;
    }

    void refreshTextBoxes();

    return () => {
      window.clearTimeout(textBoxPollTimeoutRef.current);
      textBoxRequestSequenceRef.current += 1;
    };
  }, [compositeId, refreshTextBoxes]);

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

  const orderedAnnotations = useMemo(
    () => orderAnnotationsByGridPosition(annotations),
    [annotations],
  );
  const createProfileTargetAnnotation = useMemo(
    () => annotations.find((annotation) => annotation.annotationId === createProfileAnnotationId) || null,
    [annotations, createProfileAnnotationId],
  );

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
                needsReview: profileId ? false : annotation.source === 'auto' ? true : annotation.needsReview,
                updatedAt: new Date().toISOString(),
              },
              composite,
            )
          : annotation
      )),
    );
  };

  const scrollAnnotationIntoView = useCallback((annotationId, behavior = 'smooth') => {
    if (!annotationId) {
      return;
    }

    const annotationListElement = annotationListRef.current;
    const annotationElement = annotationItemRefs.current.get(annotationId);

    if (!annotationListElement || !annotationElement) {
      return;
    }

    const listRect = annotationListElement.getBoundingClientRect();
    const itemRect = annotationElement.getBoundingClientRect();
    const nextScrollTop = annotationListElement.scrollTop + (itemRect.top - listRect.top) - 6;

    annotationListElement.scrollTo({
      top: Math.max(0, Math.round(nextScrollTop)),
      behavior,
    });
  }, []);

  const handleSelectAnnotation = useCallback((annotationId, { scrollList = false, behavior = 'smooth' } = {}) => {
    pendingAnnotationScrollRef.current = scrollList
      ? { annotationId, behavior }
      : null;
    setSelectedAnnotationId(annotationId);
  }, []);

  const handleDeleteAnnotation = useCallback((annotationToDelete, { requireConfirmation = true } = {}) => {
    if (!annotationToDelete) {
      return;
    }

    if (requireConfirmation) {
      const confirmed = window.confirm('Delete this annotation box? This removes the saved coordinates.');

      if (!confirmed) {
        return;
      }
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
  }, []);

  const handleOpenCreateProfileModal = useCallback((annotationId) => {
    setCreateProfileAnnotationId(annotationId);
    setSelectedAnnotationId(annotationId);
  }, []);

  const handleCloseCreateProfileModal = useCallback(() => {
    setCreateProfileAnnotationId('');
  }, []);

  const handleProfileCreated = useCallback((savedProfile, annotationId) => {
    setProfiles((currentProfiles) => sortProfiles([
      ...currentProfiles.filter((profile) => profile.id !== savedProfile.id),
      savedProfile,
    ]));

    if (annotationId) {
      handleProfileSelect(annotationId, savedProfile.id);
      setSelectedAnnotationId(annotationId);
    }
  }, [handleProfileSelect]);

  useEffect(() => {
    if (!selectedAnnotationId) {
      return;
    }

    const pendingScroll = pendingAnnotationScrollRef.current;

    if (!pendingScroll || pendingScroll.annotationId !== selectedAnnotationId) {
      return;
    }

    scrollAnnotationIntoView(selectedAnnotationId, pendingScroll.behavior);
    pendingAnnotationScrollRef.current = null;
  }, [annotations, scrollAnnotationIntoView, selectedAnnotationId]);

  useEffect(() => {
    const handleWindowKeyDown = (event) => {
      if (event.key !== 'Delete' || isEditableElement(event.target)) {
        return;
      }

      const selectedAnnotation = annotations.find(
        (annotation) => annotation.annotationId === selectedAnnotationId,
      );

      if (!selectedAnnotation) {
        return;
      }

      event.preventDefault();
      handleDeleteAnnotation(selectedAnnotation, { requireConfirmation: false });
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [annotations, handleDeleteAnnotation, selectedAnnotationId]);

  const handleManualSave = async () => {
    window.clearTimeout(saveTimeoutRef.current);
    await persistAnnotations(annotations);
  };

  const handleAutoDetect = async () => {
    if (!composite || autoDetectStatus === 'detecting') {
      return;
    }

    if (textBoxStatus !== 'loaded') {
      setAutoDetectStatus('waiting');
      setAutoDetectError('');
      setAutoDetectMessage('OCR is still processing in the background. Auto-fill will unlock when the name boxes are ready.');
      void refreshTextBoxes();
      return;
    }

    const referenceAnnotation = annotations.find(
      (annotation) => annotation.annotationId === selectedAnnotationId,
    );

    if (!referenceAnnotation) {
      setAutoDetectStatus('error');
      setAutoDetectMessage('');
      setAutoDetectError('Draw and select a reference portrait box first.');
      return;
    }

    const preservedAnnotations = [...annotations];

    setAutoDetectStatus('detecting');
    setAutoDetectMessage('');
    setAutoDetectError('');

    try {
      const detectionResult = await autoDetectCompositeAnnotations(
        composite.compositeId,
        preservedAnnotations.map(toAnnotationPayload),
        toAnnotationPayload(referenceAnnotation),
      );
      const nextTextBoxStatus = normalizeTextBoxStatus(detectionResult.ocrStatus);

      if (nextTextBoxStatus !== 'loaded') {
        setTextBoxes(detectionResult.textBoxes || []);
        setTextBoxStatus(nextTextBoxStatus);
        setTextBoxError(detectionResult.error || '');
        setAutoDetectStatus('waiting');
        setAutoDetectMessage(
          detectionResult.message
            || 'OCR is still processing in the background. Auto-fill will unlock when the name boxes are ready.',
        );
        void refreshTextBoxes();
        return;
      }

      const detectedAnnotations = (detectionResult.detectedAnnotations || []).map((annotation) =>
        syncAnnotationForDisplay(annotation, composite),
      );
      const mergedAnnotations = [...preservedAnnotations, ...detectedAnnotations];

      setTextBoxes(detectionResult.textBoxes || []);
      setTextBoxStatus('loaded');
      setTextBoxError('');
      setAnnotations(mergedAnnotations);
      setLastBoxSize(getReusableBoxSize(mergedAnnotations, lastBoxSize));
      setSelectedAnnotationId(detectedAnnotations[0]?.annotationId || referenceAnnotation.annotationId || null);
      setAutoDetectStatus(detectedAnnotations.length > 0 ? 'done' : 'empty');
      setAutoDetectMessage(
        detectedAnnotations.length > 0
          ? `Added ${detectedAnnotations.length} portrait boxes from the selected reference and OCR name anchors.`
          : 'No new portrait boxes were added from the selected reference.',
      );
    } catch (error) {
      setAutoDetectStatus('error');
      setAutoDetectError(error.message);
    }
  };

  const isOcrBusy = isOcrBusyStatus(textBoxStatus);
  const isCanvasProcessing = isOcrBusy || autoDetectStatus === 'detecting';
  const canvasProcessingState = autoDetectStatus === 'detecting'
    ? {
        title: 'Auto-fill in progress',
        description: 'Generating portrait boxes from the cached OCR name anchors for this composite.',
      }
    : isOcrBusy
      ? {
          title: 'Processing OCR',
          description: 'Reading names and subtitle lines in the background. Manual editing and auto-fill will unlock when this finishes.',
        }
      : null;

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
              className="button compositeButton compositeButton--subtle"
              onClick={handleAutoDetect}
              disabled={autoDetectStatus === 'detecting' || textBoxStatus !== 'loaded'}
            >
              {autoDetectStatus === 'detecting' ? 'Filling...' : 'Auto-fill from reference'}
            </button>

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
        {textBoxError ? <p className="compositeMessage compositeMessage--error">{textBoxError}</p> : null}
        {autoDetectError ? <p className="compositeMessage compositeMessage--error">{autoDetectError}</p> : null}
        {isOcrBusy ? (
          <p className="compositeMessage compositeMessage--warning">
            OCR is running in the background for this composite. The editor will unlock once the name boxes are ready.
          </p>
        ) : null}
        {autoDetectMessage ? (
          <p className={[
            'compositeMessage',
            autoDetectStatus === 'done' ? 'compositeMessage--success' : 'compositeMessage--warning',
          ].join(' ')}>
            {autoDetectMessage}
          </p>
        ) : null}

        <div className="compositeEditor__content">
          <article ref={canvasPanelRef} className="compositePanel compositePanel--canvas">
            <div className={[
              'compositeCanvasSurface',
              isCanvasProcessing ? 'compositeCanvasSurface--processing' : '',
            ].filter(Boolean).join(' ')}>
              <AnnotationStage
                composite={composite}
                annotations={annotations}
                selectedAnnotationId={selectedAnnotationId}
                zoom={zoomLevel}
                lastBoxSize={lastBoxSize}
                interactionsDisabled={isCanvasProcessing}
                onZoomChange={(nextZoom) => setZoomLevel(clampZoom(nextZoom))}
                onAnnotationsChange={handleAnnotationListChange}
                onSelectAnnotation={(annotationId) => handleSelectAnnotation(annotationId, { scrollList: true })}
                onLastBoxSizeChange={(nextSize) => setLastBoxSize(normalizeBoxSize(nextSize))}
                resolveAnnotationLabel={(annotation) => (
                  profileMap.get(annotation.profileId)?.displayName
                  || annotation.detectedName
                  || 'Unassigned'
                )}
              />

              {canvasProcessingState ? (
                <div className="compositeProcessingOverlay" role="status" aria-live="polite">
                  <div className="compositeProcessingOverlay__card">
                    <p className="compositeProcessingOverlay__eyebrow">Please wait</p>
                    <h3 className="compositeProcessingOverlay__title">{canvasProcessingState.title}</h3>
                    <p className="compositeProcessingOverlay__description">
                      {canvasProcessingState.description}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <CompositeCopyrightNotice className="compositeEditor__copyrightNotice" />
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

              {orderedAnnotations.length > 0 ? (
                <div ref={annotationListRef} className="annotationList">
                  {orderedAnnotations.map((annotation, index) => {
                    const annotationState = getAnnotationAssignmentState(annotation);
                    const annotationStatusLabel = getAnnotationStatusLabel(annotationState);
                    const isSelected = annotation.annotationId === selectedAnnotationId;

                    return (
                      <article
                        key={annotation.annotationId}
                        ref={(node) => {
                          if (node) {
                            annotationItemRefs.current.set(annotation.annotationId, node);
                          } else {
                            annotationItemRefs.current.delete(annotation.annotationId);
                          }
                        }}
                        className={[
                          'annotationList__item',
                          `annotationList__item--${annotationState}`,
                          isSelected ? 'annotationList__item--selected' : '',
                        ].filter(Boolean).join(' ')}
                        onPointerDown={() => handleSelectAnnotation(annotation.annotationId)}
                        onFocusCapture={() => handleSelectAnnotation(annotation.annotationId)}
                      >
                        <div className="annotationList__meta">
                          <span className="annotationList__badge annotationList__badge--source">
                            {annotation.source === 'auto' ? 'Auto' : 'Manual'}
                          </span>
                          <span className={[
                            'annotationList__badge',
                            'annotationList__badge--status',
                            `annotationList__badge--${annotationState}`,
                          ].join(' ')}>
                            {annotationStatusLabel}
                          </span>
                          {isSelected ? (
                            <span className="annotationList__badge annotationList__badge--selected">
                              Selected
                            </span>
                          ) : null}
                        </div>

                        <div className="annotationList__content">
                          <button
                            type="button"
                            className="annotationList__previewButton"
                            onClick={() => handleSelectAnnotation(annotation.annotationId)}
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
                            placeholder={
                              annotation.detectedName
                                ? `Search profiles for ${annotation.detectedName}`
                                : 'Assign profile'
                            }
                            hideLabel
                          />

                            {annotation.detectedName ? (
                              <p className="annotationList__helper">
                                Detected name: <strong>{annotation.detectedName}</strong>
                              </p>
                            ) : null}

                            {annotation.matchedProfileId && annotation.profileId !== annotation.matchedProfileId ? (
                              <div className="annotationList__suggestion">
                                <p className="annotationList__helper">
                                  Suggested profile: <strong>{formatProfileSummary(profileMap.get(annotation.matchedProfileId))}</strong>
                                  {annotation.matchConfidence
                                    ? ` (${formatConfidence(annotation.matchConfidence)})`
                                    : ''}
                                </p>
                                <button
                                  type="button"
                                  className="button compositeButton compositeButton--subtle annotationList__suggestionButton"
                                  onClick={() => handleProfileSelect(annotation.annotationId, annotation.matchedProfileId)}
                                >
                                  Use suggestion
                                </button>
                              </div>
                            ) : null}

                            {annotation.profileId && duplicateProfileIds.has(annotation.profileId) ? (
                              <p className="compositeMessage compositeMessage--warning">
                                This profile is already assigned to another box in this composite.
                              </p>
                            ) : null}

                            {annotationState !== 'assigned' ? (
                              <div className="annotationList__actions">
                                <button
                                  type="button"
                                  className="button compositeButton compositeButton--subtle annotationList__createProfileButton"
                                  onClick={() => handleOpenCreateProfileModal(annotation.annotationId)}
                                >
                                  Create New Profile
                                </button>
                              </div>
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
                    );
                  })}
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

      <CreateProfileModal
        annotation={createProfileTargetAnnotation}
        compositeYear={composite?.compositeYear}
        isOpen={Boolean(createProfileTargetAnnotation)}
        onClose={handleCloseCreateProfileModal}
        onProfileCreated={handleProfileCreated}
      />
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
    source: annotation.source === 'auto' ? 'auto' : 'manual',
    detectedName: annotation.detectedName ?? null,
    matchedProfileId: annotation.matchedProfileId ?? null,
    matchConfidence: annotation.matchConfidence ?? null,
    needsReview: Boolean(annotation.needsReview),
    captionBox: annotation.captionBox
      ? {
          x: annotation.captionBox.x,
          y: annotation.captionBox.y,
          width: annotation.captionBox.width,
          height: annotation.captionBox.height,
        }
      : null,
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
      source: annotation.source === 'auto' ? 'auto' : 'manual',
      detectedName: annotation.detectedName ?? null,
      matchedProfileId: annotation.matchedProfileId ?? null,
      matchConfidence: annotation.matchConfidence ?? null,
      needsReview: Boolean(annotation.needsReview),
      captionBox: annotation.captionBox
        ? {
            x: Math.round(annotation.captionBox.x),
            y: Math.round(annotation.captionBox.y),
            width: Math.round(annotation.captionBox.width),
            height: Math.round(annotation.captionBox.height),
          }
        : null,
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

function isEditableElement(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();

  return (
    target.isContentEditable
    || tagName === 'input'
    || tagName === 'textarea'
    || tagName === 'select'
  );
}

function formatConfidence(confidence) {
  return `${Math.round(confidence * 100)}% match`;
}

function getAnnotationAssignmentState(annotation) {
  if (annotation?.profileId) {
    return 'assigned';
  }

  if (annotation?.matchedProfileId) {
    return 'suggested';
  }

  return 'unresolved';
}

function getAnnotationStatusLabel(annotationState) {
  if (annotationState === 'assigned') {
    return 'Completed';
  }

  if (annotationState === 'suggested') {
    return 'Needs review';
  }

  return 'Needs profile';
}

function formatProfileSummary(profile) {
  if (!profile) {
    return 'Unknown profile';
  }

  if (profile.graduationYear) {
    return `${profile.displayName} (Class of ${profile.graduationYear})`;
  }

  return profile.displayName || 'Unknown profile';
}

function sortProfiles(profileList) {
  return [...profileList].sort((leftProfile, rightProfile) => (
    compareStrings(leftProfile.lastName, rightProfile.lastName)
    || compareStrings(leftProfile.firstName, rightProfile.firstName)
    || compareStrings(String(leftProfile.graduationYear || ''), String(rightProfile.graduationYear || ''))
  ));
}

function normalizeTextBoxStatus(status) {
  if (status === 'ready') {
    return 'loaded';
  }

  if (['queued', 'processing', 'loaded', 'error'].includes(status)) {
    return status;
  }

  return 'queued';
}

function isOcrBusyStatus(status) {
  return ['idle', 'queued', 'processing'].includes(status);
}

function orderAnnotationsByGridPosition(annotations) {
  const annotationEntries = (Array.isArray(annotations) ? annotations : []).map((annotation, index) => ({
    annotation,
    index,
    centerX: annotation.x + (annotation.width / 2),
    centerY: annotation.y + (annotation.height / 2),
  }));

  if (annotationEntries.length < 2) {
    return annotationEntries.map(({ annotation }) => annotation);
  }

  const medianHeight = getMedianValue(
    annotationEntries.map(({ annotation }) => Math.max(Number(annotation.height) || 0, 1)),
  );
  const rowThreshold = Math.max(24, medianHeight * 0.55);
  const rows = [];

  annotationEntries
    .sort((leftEntry, rightEntry) => (
      compareNumbers(leftEntry.centerY, rightEntry.centerY)
      || compareNumbers(leftEntry.centerX, rightEntry.centerX)
      || compareNumbers(leftEntry.index, rightEntry.index)
    ))
    .forEach((entry) => {
      const matchingRow = rows.find((row) => doesAnnotationEntryBelongToRow(entry, row, rowThreshold));

      if (matchingRow) {
        addAnnotationEntryToRow(matchingRow, entry);
        return;
      }

      rows.push(createAnnotationRow(entry));
    });

  return rows
    .sort((leftRow, rightRow) => (
      compareNumbers(leftRow.centerY, rightRow.centerY)
      || compareNumbers(leftRow.left, rightRow.left)
    ))
    .flatMap((row) => (
      row.entries
        .sort((leftEntry, rightEntry) => (
          compareNumbers(leftEntry.annotation.x, rightEntry.annotation.x)
          || compareNumbers(leftEntry.centerX, rightEntry.centerX)
          || compareNumbers(leftEntry.annotation.y, rightEntry.annotation.y)
          || compareNumbers(leftEntry.index, rightEntry.index)
        ))
        .map(({ annotation }) => annotation)
    ));
}

function createAnnotationRow(entry) {
  const annotationTop = Number(entry.annotation.y) || 0;
  const annotationHeight = Number(entry.annotation.height) || 0;

  return {
    entries: [entry],
    centerY: entry.centerY,
    left: Number(entry.annotation.x) || 0,
    top: annotationTop,
    bottom: annotationTop + annotationHeight,
    averageHeight: Math.max(annotationHeight, 1),
  };
}

function addAnnotationEntryToRow(row, entry) {
  const annotationTop = Number(entry.annotation.y) || 0;
  const annotationHeight = Number(entry.annotation.height) || 0;
  const nextEntries = [...row.entries, entry];

  row.entries = nextEntries;
  row.centerY = nextEntries.reduce((total, currentEntry) => total + currentEntry.centerY, 0) / nextEntries.length;
  row.left = Math.min(row.left, Number(entry.annotation.x) || 0);
  row.top = Math.min(row.top, annotationTop);
  row.bottom = Math.max(row.bottom, annotationTop + annotationHeight);
  row.averageHeight = nextEntries.reduce(
    (total, currentEntry) => total + Math.max(Number(currentEntry.annotation.height) || 0, 1),
    0,
  ) / nextEntries.length;
}

function doesAnnotationEntryBelongToRow(entry, row, rowThreshold) {
  const annotationTop = Number(entry.annotation.y) || 0;
  const annotationHeight = Number(entry.annotation.height) || 0;
  const annotationBottom = annotationTop + annotationHeight;
  const verticalOverlap = Math.min(annotationBottom, row.bottom) - Math.max(annotationTop, row.top);
  const minimumSharedHeight = Math.min(Math.max(annotationHeight, 1), Math.max(row.averageHeight, 1)) * 0.25;

  return (
    Math.abs(entry.centerY - row.centerY) <= rowThreshold
    || verticalOverlap >= minimumSharedHeight
  );
}

function getMedianValue(values) {
  const sortedValues = [...values].sort((leftValue, rightValue) => leftValue - rightValue);
  const middleIndex = Math.floor(sortedValues.length / 2);

  if (sortedValues.length === 0) {
    return DEFAULT_BOX_SIZE.height;
  }

  if (sortedValues.length % 2 === 0) {
    return (sortedValues[middleIndex - 1] + sortedValues[middleIndex]) / 2;
  }

  return sortedValues[middleIndex];
}

function compareNumbers(leftValue, rightValue) {
  return Number(leftValue || 0) - Number(rightValue || 0);
}

function compareStrings(leftValue, rightValue) {
  return String(leftValue || '').localeCompare(String(rightValue || ''), undefined, {
    sensitivity: 'base',
  });
}
