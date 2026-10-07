// Decorative, bounded to this panel, and independent of the upload lifecycle.
// Canvas snapshots reuse already-rendered thumbnails: no new media requests.
export function createTransferMotion(document, { reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches } = {}) {
  const running = new Set();
  const hiddenFigures = new Set();
  let departures = [];
  let generation = 0;
  let layer;
  function animate(element, frames, options, cleanup = () => {}) {
    if (typeof element.animate !== 'function') { cleanup(); return Promise.resolve(); }
    const animation = element.animate(frames, options);
    running.add(animation);
    return Promise.resolve(animation.finished).then(() => { running.delete(animation); cleanup(); }, () => { running.delete(animation); cleanup(); });
  }
  function stop() {
    generation++;
    running.forEach(animation => animation.cancel()); running.clear();
    layer?.remove(); layer = undefined;
    hiddenFigures.forEach(figure => figure.classList.remove('transfer-away')); hiddenFigures.clear();
    departures = [];
  }
  function flyThumbnails() {
    const rail = document.querySelector('#media-rail'); if (!rail) return;
    const railRect = rail.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    const visible = [...rail.querySelectorAll('figure')].filter(figure => {
      const rect = figure.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.left >= Math.max(0, railRect.left) && rect.right <= Math.min(width, railRect.right) && rect.bottom > 68 && rect.top < height;
    }).slice(0, 4);
    if (!visible.length) return;
    if (!layer?.isConnected) {
      layer = document.createElement('div'); layer.className = 'media-flight-layer';
      layer.setAttribute('aria-hidden', 'true'); document.body.append(layer);
    }
    const currentLayer = layer;
    visible.forEach((figure, index) => {
      const media = figure.querySelector('img, video'); if (!media) return;
      const rect = figure.getBoundingClientRect();
      const flight = document.createElement('div'); flight.className = 'media-flight';
      Object.assign(flight.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      const canvas = document.createElement('canvas'); canvas.width = Math.round(rect.width * 2); canvas.height = Math.round(rect.height * 2);
      try {
        const ctx = canvas.getContext('2d');
        const mediaWidth = media.naturalWidth || media.videoWidth; const mediaHeight = media.naturalHeight || media.videoHeight;
        if (ctx && mediaWidth && mediaHeight) {
          const scale = (media.tagName === 'VIDEO' ? Math.min : Math.max)(canvas.width / mediaWidth, canvas.height / mediaHeight);
          ctx.drawImage(media, (canvas.width - mediaWidth * scale) / 2, (canvas.height - mediaHeight * scale) / 2, mediaWidth * scale, mediaHeight * scale);
        }
      } catch { /* An undecoded thumbnail must never interrupt an upload. */ }
      const number = document.createElement('span'); number.textContent = figure.querySelector('figcaption')?.textContent || String(index + 1);
      flight.append(canvas, number); currentLayer.append(flight);
      departures.push(animate(flight, [
        { opacity: 1, transform: 'translate(0, 0) scale(1) rotate(0deg)' },
        { opacity: 1, transform: `translate(8px, -${22 + index * 5}px) scale(1.04) rotate(${4 - index * 2}deg)`, offset: .22 },
        { opacity: .95, transform: `translate(-${rect.right * .58}px, -${58 + index * 12}px) scale(.88) rotate(-8deg)`, offset: .62 },
        { opacity: 0, transform: `translate(-${rect.right + 40}px, -${94 + index * 16}px) scale(.65) rotate(-12deg)` },
      ], { duration: 900, delay: index * 85, easing: 'cubic-bezier(.32,0,.38,1)', fill: 'both' }, () => {
        flight.remove(); if (!currentLayer.childElementCount) { currentLayer.remove(); if (layer === currentLayer) layer = undefined; }
      }));
    });
    // Hide the sources after snapshotting, leaving their slots in place.
    rail.querySelectorAll('figure').forEach(figure => { figure.classList.add('transfer-away'); hiddenFigures.add(figure); });
  }
  function arrive() {
    const ticket = generation;
    const figures = [...document.querySelectorAll('#media-rail figure')];
    if (reducedMotion()) { stop(); return; }
    figures.forEach(figure => { figure.classList.add('transfer-away'); hiddenFigures.add(figure); });
    return Promise.all(departures).then(() => {
      if (generation !== ticket) return;
      hiddenFigures.forEach(figure => figure.classList.remove('transfer-away')); hiddenFigures.clear();
      const width = document.documentElement.clientWidth; const height = document.documentElement.clientHeight;
      figures.filter(figure => {
        const rect = figure.getBoundingClientRect();
        return figure.isConnected && rect.width > 0 && rect.right > 0 && rect.left < width && rect.bottom > 68 && rect.top < height;
      }).slice(0, 5).forEach((figure, index) => animate(figure, [
        { opacity: 0, transform: 'translateY(24px) scale(.55)' },
        { opacity: 1, transform: 'translateY(-7px) scale(1.1, .94)', offset: .5 },
        { opacity: 1, transform: 'translateY(2px) scale(.98, 1.025)', offset: .77 },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ], { duration: 570, delay: index * 65, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'backwards' }));
    }).catch(() => stop());
  }
  return {
    play(phase) {
      if (phase !== 'sending' || reducedMotion()) return;
      // Motion failures are purely visual and cannot change transfer success.
      try { stop(); flyThumbnails(); } catch { stop(); }
    },
    arrive,
    stop,
  };
}
