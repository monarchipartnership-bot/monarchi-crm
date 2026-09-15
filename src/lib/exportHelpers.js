import html2canvas from 'html2canvas';

export function exportPDF() {
  window.print();
}

// Renders `el` to a JPEG and triggers a download as `filename`.
// `onStart`/`onEnd` toggle the "capturing" class that hides interactive-only
// chrome (buttons, sidebar) during the capture — see index.css `.capturing`.
export async function exportJPEG(el, filename, { onStart, onEnd } = {}) {
  if (!el) return;
  onStart?.();
  document.body.classList.add('capturing');
  try {
    // Let React commit the "capturing" state (e.g. textareas swapped for
    // plain divs) and the browser paint it before snapshotting.
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    if (document.fonts?.ready) await document.fonts.ready;
    const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/jpeg', 0.92);
    link.click();
  } catch (err) {
    alert('Не вдалося створити зображення: ' + err.message);
  } finally {
    document.body.classList.remove('capturing');
    onEnd?.();
  }
}
