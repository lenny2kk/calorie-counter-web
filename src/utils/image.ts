/**
 * Zdjęcia do analizy AI zmniejszamy w przeglądarce: zdjęcie z telefonu ma kilka MB,
 * a do rozpoznania potrawy wystarcza ~1280 px. Mniejszy plik = szybsza i tańsza odpowiedź.
 */

const MAX_SIDE = 1280;
const QUALITY = 0.82;

const drawToJpegBase64 = (source: CanvasImageSource, width: number, height: number, maxSide = MAX_SIDE): string => {
  if (!width || !height) throw new Error('Nie udało się odczytać zdjęcia.');
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Nie udało się przetworzyć zdjęcia.');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', QUALITY).split(',')[1];
};

/** Klatka z podglądu aparatu → JPEG base64 (bez prefiksu data:). */
export const videoFrameToJpegBase64 = (video: HTMLVideoElement): string =>
  drawToJpegBase64(video, video.videoWidth, video.videoHeight);

/** Plik z galerii/aparatu systemowego → zmniejszony JPEG base64 (bez prefiksu data:). */
export const fileToJpegBase64 = async (file: File): Promise<string> => {
  if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
    throw new Error('Wybierz plik ze zdjęciem.');
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode().catch(() => {
      throw new Error('Ta przeglądarka nie potrafi otworzyć tego zdjęcia. Spróbuj zrobić je aparatem w aplikacji.');
    });
    return drawToJpegBase64(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
};
