export async function copyText(text) {
  const value = String(text ?? '');
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {}
  }

  let area = null;
  try {
    area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    area.style.top = '0';
    area.style.opacity = '0';
    area.style.pointerEvents = 'none';
    document.body.append(area);
    area.focus({ preventScroll: true });
    area.select();
    area.setSelectionRange(0, value.length);
    return document.execCommand?.('copy') === true;
  } catch {
    return false;
  } finally {
    area?.remove();
  }
}
