// Compress an image File to a JPEG data-URL bounded by `maxEdge`, so a 12MP camera
// photo never uploads at full size. Falls back to the original data-URL if the
// canvas pipeline is unavailable (very old browsers / jsdom in tests). Mirrors the
// BillUploader compression budget so both bill-photo entry points behave the same.
export async function compressImageToDataUrl(
  file: File,
  maxEdge = 1600,
  quality = 0.72,
): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  try {
    const img = await loadImage(dataUrl);
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL("image/jpeg", quality);
    // Guard against a pathological canvas output larger than the source.
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl; // best-effort: send the original rather than fail
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = src;
  });
}
