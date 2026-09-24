// src/modules/resume/application/services/ocr.service.spec.ts
//
// The pixel conversion is tested for real — pdf.js hands back three different memory
// layouts and getting one wrong produces a picture that OCR reads as nothing, with no
// error anywhere to say why. The Tesseract call itself is stubbed: downloading 15 MB of
// language data inside a unit test would make the suite depend on the network.

import { OcrService, type RawImage } from './ocr.service';
import { PNG } from 'pngjs';

type WithPrivates = {
  workerPromise: Promise<unknown> | null;
  worker(): Promise<{ recognize: jest.Mock; terminate: jest.Mock }>;
};

function stubWorker(text: string, confidence: number) {
  return {
    recognize: jest.fn().mockResolvedValue({ data: { text, confidence } }),
    terminate: jest.fn().mockResolvedValue(undefined),
  };
}

/** A tiny image in one of pdf.js's three layouts. */
function rawImage(kind: number): RawImage {
  const w = 2,
    h = 2;
  const perPixel = kind === 3 ? 4 : kind === 2 ? 3 : 1;
  const data = new Uint8Array(w * h * perPixel);
  for (let i = 0; i < data.length; i++) data[i] = (i * 40) % 256;
  return { width: w, height: h, kind, data };
}

describe('OcrService', () => {
  let service: OcrService;
  let worker: ReturnType<typeof stubWorker>;

  beforeEach(() => {
    service = new OcrService();
    worker = stubWorker('SO SEREYSOKBOTRA\nSoftware Engineer', 93);
    jest
      .spyOn(service as unknown as WithPrivates, 'worker')
      .mockResolvedValue(worker as never);
  });

  it('returns the text Tesseract read', async () => {
    expect(await service.readImage(Buffer.from('png'))).toBe(
      'SO SEREYSOKBOTRA\nSoftware Engineer',
    );
  });

  it('returns empty for a low-confidence read rather than passing on noise', async () => {
    // A blurred photo produces confident-looking garbage. Handing that to the parser
    // would fill a profile with invented text, which is worse than failing the upload.
    worker.recognize.mockResolvedValue({
      data: { text: 'ee ~~ ||| 1l', confidence: 12 },
    });
    expect(await service.readImage(Buffer.from('png'))).toBe('');
  });

  it('returns empty when Tesseract finds nothing at all', async () => {
    worker.recognize.mockResolvedValue({ data: { text: '   ', confidence: 90 } });
    expect(await service.readImage(Buffer.from('png'))).toBe('');
  });

  // ── the pixel conversion ───────────────────────────────────────────────────

  it.each([
    ['RGBA_32BPP', 3],
    ['RGB_24BPP', 2],
    ['GRAYSCALE', 1],
  ])('encodes a %s page image to a valid PNG of the same size', async (_label, kind) => {
    await service.readRawImage(rawImage(kind));

    const sent = worker.recognize.mock.calls[0][0] as Buffer;
    const decoded = PNG.sync.read(sent);
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    // Fully opaque: a stray alpha of 0 renders as a blank page to OCR, which is the
    // silent failure this conversion exists to avoid.
    for (let i = 3; i < decoded.data.length; i += 4) {
      expect(decoded.data[i]).toBe(255);
    }
  });

  it('flattens a semi-transparent pixel onto white, not onto nothing', async () => {
    // Half-opaque mid-grey over paper should read as a light grey, never as a hole.
    const img: RawImage = {
      width: 1,
      height: 1,
      kind: 3,
      data: new Uint8Array([0, 0, 0, 128]),
    };
    await service.readRawImage(img);

    const decoded = PNG.sync.read(worker.recognize.mock.calls[0][0] as Buffer);
    expect(decoded.data[0]).toBeGreaterThan(100);
    expect(decoded.data[3]).toBe(255);
  });

  it('keeps the colour channels in order for RGB pixels', async () => {
    const img: RawImage = {
      width: 1,
      height: 1,
      kind: 2,
      data: new Uint8Array([10, 20, 30]),
    };
    await service.readRawImage(img);

    const decoded = PNG.sync.read(worker.recognize.mock.calls[0][0] as Buffer);
    expect([decoded.data[0], decoded.data[1], decoded.data[2]]).toEqual([10, 20, 30]);
  });

  it('expands a grey pixel into all three channels', async () => {
    const img: RawImage = {
      width: 1,
      height: 1,
      kind: 1,
      data: new Uint8Array([77]),
    };
    await service.readRawImage(img);

    const decoded = PNG.sync.read(worker.recognize.mock.calls[0][0] as Buffer);
    expect([decoded.data[0], decoded.data[1], decoded.data[2]]).toEqual([77, 77, 77]);
  });

  // ── worker lifecycle ───────────────────────────────────────────────────────

  it('shuts the worker down, and tolerates never having started one', async () => {
    const fresh = new OcrService();
    await expect(fresh.onModuleDestroy()).resolves.toBeUndefined();

    (service as unknown as WithPrivates).workerPromise = Promise.resolve(worker);
    await service.onModuleDestroy();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
});
