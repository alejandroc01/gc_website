import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_BOX_SIZE = 16;
const CLICK_PLACEMENT_THRESHOLD = 6;
const DEFAULT_BOX_SIZE = {
  width: 72,
  height: 90,
};
const MIN_ZOOM_LEVEL = 1;
const MAX_ZOOM_LEVEL = 4;
const WHEEL_ZOOM_STEP = 0.25;
const RESIZE_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export default function AnnotationStage({
  composite,
  annotations,
  selectedAnnotationId,
  zoom = 1,
  lastBoxSize = DEFAULT_BOX_SIZE,
  onZoomChange,
  onAnnotationsChange,
  onSelectAnnotation,
  onLastBoxSizeChange,
  resolveAnnotationLabel,
}) {
  const imageRef = useRef(null);
  const viewportRef = useRef(null);
  const interactionRef = useRef(null);
  const listenersAttachedRef = useRef(false);
  const annotationsRef = useRef(annotations);
  const compositeRef = useRef(composite);
  const lastBoxSizeRef = useRef(lastBoxSize);
  const onAnnotationsChangeRef = useRef(onAnnotationsChange);
  const onSelectAnnotationRef = useRef(onSelectAnnotation);
  const onLastBoxSizeChangeRef = useRef(onLastBoxSizeChange);
  const pendingZoomFocusRef = useRef(null);
  const [baseDisplaySize, setBaseDisplaySize] = useState({ width: 0, height: 0 });
  const [draftRect, setDraftRect] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const draftRectRef = useRef(draftRect);

  annotationsRef.current = annotations;
  compositeRef.current = composite;
  lastBoxSizeRef.current = lastBoxSize;
  onAnnotationsChangeRef.current = onAnnotationsChange;
  onSelectAnnotationRef.current = onSelectAnnotation;
  onLastBoxSizeChangeRef.current = onLastBoxSizeChange;
  draftRectRef.current = draftRect;

  const handleWindowPointerMove = useCallback((event) => {
    const activeInteraction = interactionRef.current;

    if (!activeInteraction) {
      return;
    }

    if (activeInteraction.type === 'pan') {
      const viewportElement = viewportRef.current;

      if (!viewportElement) {
        return;
      }

      viewportElement.scrollLeft = activeInteraction.startScrollLeft - (event.clientX - activeInteraction.startClientX);
      viewportElement.scrollTop = activeInteraction.startScrollTop - (event.clientY - activeInteraction.startClientY);
      return;
    }

    const currentComposite = compositeRef.current;

    if (!currentComposite) {
      return;
    }

    const nextPoint = clientPointToImagePoint(event.clientX, event.clientY, imageRef.current, currentComposite);

    if (!nextPoint) {
      return;
    }

    if (activeInteraction.type === 'draw') {
      setDraftRect(createRectFromPoints(activeInteraction.startPoint, nextPoint));
      return;
    }

    if (activeInteraction.type === 'move') {
      const deltaX = nextPoint.x - activeInteraction.startPoint.x;
      const deltaY = nextPoint.y - activeInteraction.startPoint.y;
      const nextAnnotation = {
        ...activeInteraction.startAnnotation,
        x: clamp(
          activeInteraction.startAnnotation.x + deltaX,
          0,
          currentComposite.imageWidth - activeInteraction.startAnnotation.width,
        ),
        y: clamp(
          activeInteraction.startAnnotation.y + deltaY,
          0,
          currentComposite.imageHeight - activeInteraction.startAnnotation.height,
        ),
      };

      onAnnotationsChangeRef.current(
        annotationsRef.current.map((annotation) =>
          annotation.annotationId === activeInteraction.annotationId ? nextAnnotation : annotation,
        ),
      );

      return;
    }

    if (activeInteraction.type === 'resize') {
      const nextAnnotation = resizeFromHandle(
        activeInteraction.startAnnotation,
        nextPoint,
        activeInteraction.handle,
        currentComposite,
      );

      onAnnotationsChangeRef.current(
        annotationsRef.current.map((annotation) =>
          annotation.annotationId === activeInteraction.annotationId ? nextAnnotation : annotation,
        ),
      );
    }
  }, []);

  const handleWindowPointerUp = useCallback(() => {
    const activeInteraction = interactionRef.current;
    const currentComposite = compositeRef.current;

    if (activeInteraction?.type === 'draw' && currentComposite) {
      const clickPlacementSize = normalizeBoxSize(activeInteraction.lastBoxSize || lastBoxSizeRef.current);
      const nextAnnotationRect = getAnnotationRectFromDrawDraft(
        draftRectRef.current,
        activeInteraction.startPoint,
        clickPlacementSize,
        currentComposite,
      );

      if (nextAnnotationRect) {
        const now = new Date().toISOString();
        const newAnnotationId = window.crypto?.randomUUID?.() || `draft-${Date.now()}`;

        onAnnotationsChangeRef.current([
          ...annotationsRef.current,
          {
            annotationId: newAnnotationId,
            compositeId: currentComposite.compositeId,
            profileId: null,
            source: 'manual',
            detectedName: null,
            matchedProfileId: null,
            matchConfidence: null,
            needsReview: false,
            captionBox: null,
            x: nextAnnotationRect.x,
            y: nextAnnotationRect.y,
            width: nextAnnotationRect.width,
            height: nextAnnotationRect.height,
            createdAt: now,
            updatedAt: now,
          },
        ]);
        onLastBoxSizeChangeRef.current?.({
          width: nextAnnotationRect.width,
          height: nextAnnotationRect.height,
        });
        onSelectAnnotationRef.current(newAnnotationId);
      }
    }

    if (activeInteraction?.type === 'resize') {
      const resizedAnnotation = annotationsRef.current.find(
        (annotation) => annotation.annotationId === activeInteraction.annotationId,
      );

      if (resizedAnnotation) {
        onLastBoxSizeChangeRef.current?.({
          width: resizedAnnotation.width,
          height: resizedAnnotation.height,
        });
      }
    }

    if (activeInteraction?.type === 'pan') {
      setIsPanning(false);
    }

    interactionRef.current = null;
    setDraftRect(null);
    detachWindowListeners(
      listenersAttachedRef,
      handleWindowPointerMove,
      handleWindowPointerUp,
    );
  }, [handleWindowPointerMove]);

  const updateBaseDisplaySize = useCallback(() => {
    const imageElement = imageRef.current;

    if (!imageElement) {
      return;
    }

    setBaseDisplaySize({
      width: imageElement.clientWidth,
      height: imageElement.clientHeight,
    });
  }, []);

  useEffect(() => {
    const imageElement = imageRef.current;

    if (!imageElement) {
      return undefined;
    }

    updateBaseDisplaySize();

    const resizeObserver = new ResizeObserver(() => {
      updateBaseDisplaySize();
    });

    resizeObserver.observe(imageElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [composite?.imageUrl, updateBaseDisplaySize]);

  useEffect(() => {
    const pendingZoomFocus = pendingZoomFocusRef.current;
    const viewportElement = viewportRef.current;

    if (!pendingZoomFocus || !viewportElement) {
      return;
    }

    viewportElement.scrollLeft = Math.max(
      0,
      (pendingZoomFocus.imageX * zoom) - pendingZoomFocus.offsetX,
    );
    viewportElement.scrollTop = Math.max(
      0,
      (pendingZoomFocus.imageY * zoom) - pendingZoomFocus.offsetY,
    );
    pendingZoomFocusRef.current = null;
  }, [zoom]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== 'Escape' || interactionRef.current?.type !== 'draw') {
        return;
      }

      interactionRef.current = null;
      setDraftRect(null);
      detachWindowListeners(
        listenersAttachedRef,
        handleWindowPointerMove,
        handleWindowPointerUp,
      );
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleWindowPointerMove, handleWindowPointerUp]);

  useEffect(() => () => {
    detachWindowListeners(
      listenersAttachedRef,
      handleWindowPointerMove,
      handleWindowPointerUp,
    );
  }, [handleWindowPointerMove, handleWindowPointerUp]);

  const handleOverlayPointerDown = (event) => {
    if (event.button !== 0 || event.target !== event.currentTarget || !composite) {
      return;
    }

    const startPoint = clientPointToImagePoint(event.clientX, event.clientY, imageRef.current, composite);

    if (!startPoint) {
      return;
    }

    event.preventDefault();
    interactionRef.current = {
      type: 'draw',
      startPoint,
      lastBoxSize: normalizeBoxSize(lastBoxSize),
    };
    setDraftRect({
      x: startPoint.x,
      y: startPoint.y,
      width: 0,
      height: 0,
    });
    attachWindowListeners(
      listenersAttachedRef,
      handleWindowPointerMove,
      handleWindowPointerUp,
    );
  };

  const handleViewportPointerDown = (event) => {
    if (event.button !== 2) {
      return;
    }

    const viewportElement = viewportRef.current;

    if (!viewportElement) {
      return;
    }

    event.preventDefault();
    interactionRef.current = {
      type: 'pan',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startScrollLeft: viewportElement.scrollLeft,
      startScrollTop: viewportElement.scrollTop,
    };
    setIsPanning(true);
    attachWindowListeners(
      listenersAttachedRef,
      handleWindowPointerMove,
      handleWindowPointerUp,
    );
  };

  const handleViewportWheel = (event) => {
    if (typeof onZoomChange !== 'function') {
      return;
    }

    const viewportElement = viewportRef.current;
    const viewportRect = viewportElement?.getBoundingClientRect();

    if (!viewportElement || !viewportRect) {
      return;
    }

    event.preventDefault();

    const zoomDirection = event.deltaY < 0 ? 1 : -1;
    const nextZoom = clampZoom(zoom + (zoomDirection * WHEEL_ZOOM_STEP));

    if (nextZoom === zoom) {
      return;
    }

    pendingZoomFocusRef.current = {
      imageX: (viewportElement.scrollLeft + (event.clientX - viewportRect.left)) / zoom,
      imageY: (viewportElement.scrollTop + (event.clientY - viewportRect.top)) / zoom,
      offsetX: event.clientX - viewportRect.left,
      offsetY: event.clientY - viewportRect.top,
    };
    onZoomChange(nextZoom);
  };

  const handleBoxPointerDown = (event, annotation) => {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    onSelectAnnotation(annotation.annotationId);

    const startPoint = clientPointToImagePoint(event.clientX, event.clientY, imageRef.current, composite);

    if (!startPoint) {
      return;
    }

    interactionRef.current = {
      type: 'move',
      annotationId: annotation.annotationId,
      startPoint,
      startAnnotation: annotation,
    };
    attachWindowListeners(
      listenersAttachedRef,
      handleWindowPointerMove,
      handleWindowPointerUp,
    );
  };

  const handleResizePointerDown = (event, annotation, handle) => {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    event.preventDefault();

    onSelectAnnotation(annotation.annotationId);

    const startPoint = clientPointToImagePoint(event.clientX, event.clientY, imageRef.current, composite);

    if (!startPoint) {
      return;
    }

    interactionRef.current = {
      type: 'resize',
      annotationId: annotation.annotationId,
      handle,
      startPoint,
      startAnnotation: annotation,
    };
    attachWindowListeners(
      listenersAttachedRef,
      handleWindowPointerMove,
      handleWindowPointerUp,
    );
  };

  if (!composite) {
    return null;
  }

  const scaledWidth = baseDisplaySize.width * zoom;
  const scaledHeight = baseDisplaySize.height * zoom;

  return (
    <div className="annotationStage">
      <div
        ref={viewportRef}
        className={[
          'annotationStage__viewport',
          isPanning ? 'annotationStage__viewport--panning' : '',
        ].filter(Boolean).join(' ')}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={handleViewportPointerDown}
        onWheel={handleViewportWheel}
      >
        <div
          className="annotationStage__scaledCanvas"
          style={{
            width: scaledWidth || undefined,
            height: scaledHeight || undefined,
          }}
        >
          <div
            className="annotationStage__frame"
            style={{
              transform: `scale(${zoom})`,
            }}
          >
            <img
              ref={imageRef}
              className="annotationStage__image"
              src={composite.imageUrl}
              alt={composite.originalFilename}
              onLoad={updateBaseDisplaySize}
              draggable="false"
            />

            <div className="annotationStage__overlay" onPointerDown={handleOverlayPointerDown}>
              {annotations.map((annotation) => {
                const displayRect = toDisplayRect(annotation, composite, baseDisplaySize);
                const isSelected = annotation.annotationId === selectedAnnotationId;
                const label = resolveAnnotationLabel(annotation);

                return (
                  <button
                    key={annotation.annotationId}
                    type="button"
                    className={[
                      'annotationStage__box',
                      isSelected ? 'annotationStage__box--selected' : '',
                      annotation.source === 'auto' ? 'annotationStage__box--auto' : '',
                      annotation.needsReview ? 'annotationStage__box--review' : '',
                      annotation.profileId ? '' : 'annotationStage__box--unassigned',
                    ].filter(Boolean).join(' ')}
                    style={displayRect}
                    onPointerDown={(event) => handleBoxPointerDown(event, annotation)}
                    aria-label={label}
                  >
                    {isSelected && RESIZE_HANDLES.map((handle) => {
                      const isCornerHandle = handle.length === 2;

                      return (
                        <span
                          key={handle}
                          className={[
                            'annotationStage__handle',
                            isCornerHandle
                              ? 'annotationStage__handle--corner'
                              : 'annotationStage__handle--edge',
                            `annotationStage__handle--${handle}`,
                          ].join(' ')}
                          onPointerDown={(event) => handleResizePointerDown(event, annotation, handle)}
                        />
                      );
                    })}
                  </button>
                );
              })}

              {draftRect ? (
                <div
                  className="annotationStage__box annotationStage__box--draft"
                  style={toDisplayRect(draftRect, composite, baseDisplaySize)}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function attachWindowListeners(listenersAttachedRef, onMove, onUp) {
  if (listenersAttachedRef.current) {
    return;
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  listenersAttachedRef.current = true;
}

function detachWindowListeners(listenersAttachedRef, onMove, onUp) {
  if (!listenersAttachedRef.current) {
    return;
  }

  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  listenersAttachedRef.current = false;
}

function clientPointToImagePoint(clientX, clientY, imageElement, composite) {
  const imageRect = imageElement?.getBoundingClientRect();

  if (!imageRect?.width || !imageRect?.height) {
    return null;
  }

  // Annotation data is stored in original-image pixels, so we translate every
  // pointer event from the rendered image back into the full composite space.
  const normalizedX = clamp((clientX - imageRect.left) / imageRect.width, 0, 1);
  const normalizedY = clamp((clientY - imageRect.top) / imageRect.height, 0, 1);

  return {
    x: normalizedX * composite.imageWidth,
    y: normalizedY * composite.imageHeight,
  };
}

function createRectFromPoints(startPoint, endPoint) {
  return {
    x: Math.min(startPoint.x, endPoint.x),
    y: Math.min(startPoint.y, endPoint.y),
    width: Math.abs(endPoint.x - startPoint.x),
    height: Math.abs(endPoint.y - startPoint.y),
  };
}

function getAnnotationRectFromDrawDraft(draftRect, startPoint, lastBoxSize, composite) {
  if (!draftRect || !startPoint) {
    return null;
  }

  const isClickPlacement =
    draftRect.width <= CLICK_PLACEMENT_THRESHOLD &&
    draftRect.height <= CLICK_PLACEMENT_THRESHOLD;

  if (isClickPlacement) {
    return createPlacementRect(startPoint, lastBoxSize, composite);
  }

  if (draftRect.width < MIN_BOX_SIZE || draftRect.height < MIN_BOX_SIZE) {
    return null;
  }

  return {
    x: Math.round(clamp(draftRect.x, 0, composite.imageWidth - draftRect.width)),
    y: Math.round(clamp(draftRect.y, 0, composite.imageHeight - draftRect.height)),
    width: Math.round(draftRect.width),
    height: Math.round(draftRect.height),
  };
}

function createPlacementRect(centerPoint, lastBoxSize, composite) {
  const normalizedBox = normalizeBoxSize(lastBoxSize);
  const width = Math.min(normalizedBox.width, composite.imageWidth);
  const height = Math.min(normalizedBox.height, composite.imageHeight);

  return {
    x: Math.round(clamp(centerPoint.x - (width / 2), 0, composite.imageWidth - width)),
    y: Math.round(clamp(centerPoint.y - (height / 2), 0, composite.imageHeight - height)),
    width: Math.round(width),
    height: Math.round(height),
  };
}

function toDisplayRect(annotation, composite, baseDisplaySize) {
  const widthRatio = baseDisplaySize.width / composite.imageWidth || 0;
  const heightRatio = baseDisplaySize.height / composite.imageHeight || 0;

  return {
    left: annotation.x * widthRatio,
    top: annotation.y * heightRatio,
    width: annotation.width * widthRatio,
    height: annotation.height * heightRatio,
  };
}

function resizeFromHandle(annotation, pointerPoint, handle, composite) {
  const left = annotation.x;
  const top = annotation.y;
  const right = annotation.x + annotation.width;
  const bottom = annotation.y + annotation.height;

  let nextLeft = left;
  let nextTop = top;
  let nextRight = right;
  let nextBottom = bottom;

  // Each resize handle keeps the opposite corner anchored while the dragged
  // corner is clamped to the image bounds and minimum box size.
  if (handle.includes('n')) {
    nextTop = clamp(pointerPoint.y, 0, bottom - MIN_BOX_SIZE);
  }

  if (handle.includes('s')) {
    nextBottom = clamp(pointerPoint.y, top + MIN_BOX_SIZE, composite.imageHeight);
  }

  if (handle.includes('w')) {
    nextLeft = clamp(pointerPoint.x, 0, right - MIN_BOX_SIZE);
  }

  if (handle.includes('e')) {
    nextRight = clamp(pointerPoint.x, left + MIN_BOX_SIZE, composite.imageWidth);
  }

  return {
    ...annotation,
    x: nextLeft,
    y: nextTop,
    width: nextRight - nextLeft,
    height: nextBottom - nextTop,
  };
}

function normalizeBoxSize(size) {
  return {
    width: Math.max(MIN_BOX_SIZE, Math.round(size?.width || DEFAULT_BOX_SIZE.width)),
    height: Math.max(MIN_BOX_SIZE, Math.round(size?.height || DEFAULT_BOX_SIZE.height)),
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampZoom(value) {
  return clamp(Number(value.toFixed(2)), MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL);
}
