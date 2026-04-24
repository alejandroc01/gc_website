import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const MIN_ZOOM_LEVEL = 1;
const MAX_ZOOM_LEVEL = 4;
const WHEEL_ZOOM_STEP = 0.25;
const INLINE_REFERENCE_IMAGE_WIDTH = 4200;
const INLINE_REFERENCE_IMAGE_HEIGHT = 3000;

export default function PublicCompositeStage({
  composite,
  annotations = [],
  zoomEnabled = false,
  variant = 'inline',
  onAnnotationSelect,
}) {
  const imageRef = useRef(null);
  const viewportRef = useRef(null);
  const interactionRef = useRef(null);
  const listenersAttachedRef = useRef(false);
  const compositeRef = useRef(composite);
  const pendingZoomFocusRef = useRef(null);
  const [baseDisplaySize, setBaseDisplaySize] = useState({ width: 0, height: 0 });
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(MIN_ZOOM_LEVEL);
  const [isPanning, setIsPanning] = useState(false);

  compositeRef.current = composite;

  const handleWindowPointerMove = useCallback((event) => {
    const activeInteraction = interactionRef.current;

    if (!activeInteraction || activeInteraction.type !== 'pan') {
      return;
    }

    const viewportElement = viewportRef.current;

    if (!viewportElement) {
      return;
    }

    viewportElement.scrollLeft = activeInteraction.startScrollLeft - (event.clientX - activeInteraction.startClientX);
    viewportElement.scrollTop = activeInteraction.startScrollTop - (event.clientY - activeInteraction.startClientY);
  }, []);

  const handleWindowPointerUp = useCallback(() => {
    if (interactionRef.current?.type === 'pan') {
      setIsPanning(false);
    }

    interactionRef.current = null;
    detachWindowListeners(
      listenersAttachedRef,
      handleWindowPointerMove,
      handleWindowPointerUp,
    );
  }, [handleWindowPointerMove]);

  const updateBaseDisplaySize = useCallback(() => {
    const viewportElement = viewportRef.current;
    const currentComposite = compositeRef.current;

    if (!viewportElement || !currentComposite) {
      return;
    }

    const isFullscreen = variant === 'fullscreen';
    const viewportWidth = Math.max(1, viewportElement.clientWidth);
    let fitScale;

    if (isFullscreen) {
      const viewportHeight = Math.max(1, viewportElement.clientHeight);

      fitScale = Math.min(
        viewportWidth / Math.max(currentComposite.imageWidth, 1),
        viewportHeight / Math.max(currentComposite.imageHeight, 1),
      );
    } else {
      const viewportStyle = window.getComputedStyle(viewportElement);
      const horizontalPadding = parseFloat(viewportStyle.paddingLeft || '0')
        + parseFloat(viewportStyle.paddingRight || '0');
      const verticalPadding = parseFloat(viewportStyle.paddingTop || '0')
        + parseFloat(viewportStyle.paddingBottom || '0');
      const availableImageWidth = Math.max(1, viewportWidth - horizontalPadding);
      const availableImageHeight = Math.max(1, viewportElement.clientHeight - verticalPadding);
      const imageWidth = Math.max(Number(currentComposite.imageWidth) || INLINE_REFERENCE_IMAGE_WIDTH, 1);
      const imageHeight = Math.max(Number(currentComposite.imageHeight) || INLINE_REFERENCE_IMAGE_HEIGHT, 1);

      fitScale = Math.min(
        availableImageWidth / imageWidth,
        availableImageHeight / imageHeight,
      );
    }

    setBaseDisplaySize({
      width: Math.max(1, Math.round(currentComposite.imageWidth * fitScale)),
      height: Math.max(1, Math.round(currentComposite.imageHeight * fitScale)),
    });
  }, [variant]);

  useLayoutEffect(() => {
    setIsImageLoaded(false);
    setZoomLevel(MIN_ZOOM_LEVEL);
    setIsPanning(false);
    interactionRef.current = null;

    const viewportElement = viewportRef.current;

    if (viewportElement) {
      viewportElement.scrollLeft = 0;
      viewportElement.scrollTop = 0;
    }
  }, [composite?.compositeId]);

  useEffect(() => {
    const imageElement = imageRef.current;

    if (!imageElement) {
      return;
    }

    if (imageElement.complete && imageElement.naturalWidth > 0) {
      setIsImageLoaded(true);
    }
  }, [composite?.imageUrl]);

  useLayoutEffect(() => {
    const viewportElement = viewportRef.current;

    if (!viewportElement || !composite) {
      return undefined;
    }

    updateBaseDisplaySize();

    const resizeObserver = new ResizeObserver(() => {
      updateBaseDisplaySize();
    });

    resizeObserver.observe(viewportElement);
    window.addEventListener('resize', updateBaseDisplaySize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateBaseDisplaySize);
    };
  }, [composite, updateBaseDisplaySize]);

  useEffect(() => {
    const pendingZoomFocus = pendingZoomFocusRef.current;
    const viewportElement = viewportRef.current;

    if (!pendingZoomFocus || !viewportElement) {
      return;
    }

    viewportElement.scrollLeft = Math.max(
      0,
      (pendingZoomFocus.imageX * zoomLevel) - pendingZoomFocus.offsetX,
    );
    viewportElement.scrollTop = Math.max(
      0,
      (pendingZoomFocus.imageY * zoomLevel) - pendingZoomFocus.offsetY,
    );
    pendingZoomFocusRef.current = null;
  }, [zoomLevel]);

  useEffect(() => {
    if (zoomLevel !== MIN_ZOOM_LEVEL) {
      return;
    }

    const viewportElement = viewportRef.current;

    if (!viewportElement) {
      return;
    }

    viewportElement.scrollLeft = 0;
    viewportElement.scrollTop = 0;
  }, [zoomLevel]);

  useEffect(() => () => {
    detachWindowListeners(
      listenersAttachedRef,
      handleWindowPointerMove,
      handleWindowPointerUp,
    );
  }, [handleWindowPointerMove, handleWindowPointerUp]);

  useEffect(() => {
    if (!zoomEnabled) {
      return undefined;
    }

    const viewportElement = viewportRef.current;

    if (!viewportElement) {
      return undefined;
    }

    const handleViewportWheel = (event) => {
      const viewportRect = viewportElement.getBoundingClientRect();

      event.preventDefault();
      event.stopPropagation();

      const zoomDirection = event.deltaY < 0 ? 1 : -1;
      const nextZoom = clampZoom(zoomLevel + (zoomDirection * WHEEL_ZOOM_STEP));

      if (nextZoom === zoomLevel) {
        return;
      }

      pendingZoomFocusRef.current = {
        imageX: (viewportElement.scrollLeft + (event.clientX - viewportRect.left)) / zoomLevel,
        imageY: (viewportElement.scrollTop + (event.clientY - viewportRect.top)) / zoomLevel,
        offsetX: event.clientX - viewportRect.left,
        offsetY: event.clientY - viewportRect.top,
      };
      setZoomLevel(nextZoom);
    };

    const handleContextMenu = (event) => {
      if (!(event.target instanceof Node) || !viewportElement.contains(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    viewportElement.addEventListener('wheel', handleViewportWheel, { passive: false });
    window.addEventListener('contextmenu', handleContextMenu, true);

    return () => {
      viewportElement.removeEventListener('wheel', handleViewportWheel);
      window.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [zoomEnabled, zoomLevel]);

  const handleViewportPointerDown = (event) => {
    if (!zoomEnabled || event.button !== 2) {
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

  if (!composite) {
    return null;
  }

  const hasMeasuredBaseSize = baseDisplaySize.width > 0 && baseDisplaySize.height > 0;
  const scaledWidth = baseDisplaySize.width * zoomLevel;
  const scaledHeight = baseDisplaySize.height * zoomLevel;

  return (
    <div className={['publicCompositeStage', `publicCompositeStage--${variant}`].join(' ')}>
      <div
        ref={viewportRef}
        className={[
          'publicCompositeStage__viewport',
          isPanning ? 'publicCompositeStage__viewport--panning' : '',
        ].filter(Boolean).join(' ')}
        aria-busy={isImageLoaded ? 'false' : 'true'}
        onContextMenu={zoomEnabled ? (event) => event.preventDefault() : undefined}
        onPointerDown={handleViewportPointerDown}
      >
        <div
          className="publicCompositeStage__scaledCanvas"
          style={{
            width: scaledWidth || undefined,
            height: scaledHeight || undefined,
          }}
        >
          <div
            className={[
              'publicCompositeStage__frame',
              isImageLoaded ? 'publicCompositeStage__frame--loaded' : 'publicCompositeStage__frame--loading',
            ].join(' ')}
            style={{
              visibility: hasMeasuredBaseSize ? 'visible' : 'hidden',
              transform: `scale(${zoomLevel})`,
            }}
          >
            <img
              ref={imageRef}
              className="publicCompositeStage__image"
              src={composite.imageUrl}
              alt={`${composite.displayName || composite.originalFilename} composite`}
              draggable="false"
              onLoad={() => {
                updateBaseDisplaySize();
                setIsImageLoaded(true);
              }}
              style={{
                width: baseDisplaySize.width || undefined,
                height: baseDisplaySize.height || undefined,
              }}
            />

            <div
              className={[
                'publicCompositeStage__overlay',
                isImageLoaded ? '' : 'publicCompositeStage__overlay--loading',
              ].filter(Boolean).join(' ')}
            >
              {annotations.map((annotation) => (
                <button
                  key={annotation.annotationId}
                  type="button"
                  className="publicCompositeStage__hotspot"
                  style={toDisplayRect(annotation, composite, baseDisplaySize)}
                  onClick={() => onAnnotationSelect?.(annotation.profileId)}
                  aria-label="Open member profile"
                  title="Open member profile"
                />
              ))}
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampZoom(value) {
  return clamp(Number(value.toFixed(2)), MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL);
}
