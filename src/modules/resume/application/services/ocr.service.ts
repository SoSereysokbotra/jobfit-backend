// src/modules/resume/application/services/ocr.service.ts
//
// Reads text off an image, for the résumés that carry no text layer: a photo of a CV, or
// the PDF a phone produces when you "scan" one. Those used to reach the parser, yield an
// empty string, and fail with a message that blamed the AI service.
//
// WHY tesseract.js AND NOT pytesseract IN THE AI SERVICE. Two reasons, and the second is
// the one that decided it:
//   1. pytesseract needs the Tesseract BINARY installed on the host. tesseract.js is
//      WebAssembly — it needs nothing but Node, so it works on Cloud Run with no image
//      changes and no system package to remember.
//   2. The AI service runs on a laptop behind a tunnel. Putting OCR there would mean a
//      photographed CV only parses while that laptop is awake. Here, OCR runs in the
//      same BullMQ worker that already does PDF and DOCX extraction, so the only thing
//      still needing the AI service is the structuring step that always did.
//
// COST. OCR is CPU-bound and slow next to reading a text layer — measured at ~3s for a
// single 900x320 page on this hardware, and a full A4 page at 150dpi is several times
// that. It is therefore a FALLBACK, never the first thing tried, and it runs on the
// worker where a slow job costs nobody a request.

import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PNG } from 'pngjs';
import { createWorker, type Worker } from 'tesseract.js';

/** One page image handed to the OCR engine. `kind` follows pdf.js's ImageKind. */
export interface RawImage {
  width: number;
  height: number;
  /** 1 = GRAYSCALE_1BPP, 2 = RGB_24BPP, 3 = RGBA_32BPP (pdf.js ImageKind). */
  kind: number;
  data: Uint8Array | Uint8ClampedArray;
}

/**
 * Languages loaded into the engine.
 *
 * KHMER IS HERE ON PURPOSE. The corpus is 83% Cambodian and a scanned CV from this
 * market may be partly or wholly in Khmer script; an English-only engine returns
 * confident nonsense for it rather than nothing, which is the worse failure. Tesseract
 * accepts several languages at once and decides per region.
 */
const OCR_LANGS = 'eng+khm';

/** Below this, treat the result as noise rather than text. */
const MIN_CONFIDENCE = 40;

/**
 * Where the downloaded language data is cached.
 *
 * MUST BE A WRITABLE DIRECTORY, and the default is not one. tesseract.js caches into the
 * process CWD, which is `/app` in the container — read-only on Cloud Run, so the first
 * OCR would fail there while working perfectly in development. (It also litters the repo
 * root: the first local run wrote eng.traineddata and khm.traineddata beside
 * package.json.) The OS temp dir is writable in every environment this runs in.
 *
 * The cost is that a cold start re-downloads ~15 MB on first OCR. Acceptable for a
 * fallback path; bake the files into the image if that ever becomes the bottleneck.
 */
const OCR_CACHE_DIR = path.join(os.tmpdir(), 'jobfit-tesseract');

@Injectable()
export class OcrService implements OnModuleDestroy {
  private readonly logger = new Logger(OcrService.name);
  private workerPromise: Promise<Worker> | null = null;

  /**
   * One worker, created on first use and reused.
   *
   * Creating it downloads the language data (~15 MB for eng+khm) and starts a WASM
   * runtime, which is far too expensive per résumé. It is NOT created at boot either:
   * most deployments never OCR anything, and paying that cost on every start — including
   * every Cloud Run cold start — to serve a minority path is the wrong trade.
   */
  private worker(): Promise<Worker> {
    if (!this.workerPromise) {
      this.logger.log(`Initialising OCR worker (${OCR_LANGS}) — first use only`);
      // The directory must EXIST before the worker starts. tesseract.js does not create
      // it, and it does not complain either — it silently skips disk caching and
      // re-downloads the language data on every worker, which is the kind of quiet
      // waste that only shows up as latency. Verified: with the directory absent,
      // nothing is written anywhere; with it present, eng.traineddata lands in it.
      fs.mkdirSync(OCR_CACHE_DIR, { recursive: true });
      this.workerPromise = createWorker(OCR_LANGS, undefined, {
        cachePath: OCR_CACHE_DIR,
      }).catch((err: unknown) => {
        // Do not cache a failed init: a transient download failure would otherwise
        // disable OCR for the life of the process.
        this.workerPromise = null;
        throw err;
      });
    }
    return this.workerPromise;
  }

  /**
   * Text read from an encoded image (PNG/JPEG bytes), or '' when nothing legible.
   *
   * Returns '' rather than throwing on low confidence: the caller's job is to decide
   * that a résumé could not be read, and it makes that decision the same way for an
   * empty PDF text layer and for an unreadable photo.
   */
  async readImage(image: Buffer): Promise<string> {
    const worker = await this.worker();
    const { data } = await worker.recognize(image);
    const text = data.text.trim();
    if (!text || data.confidence < MIN_CONFIDENCE) {
      this.logger.warn(
        `OCR produced nothing usable (confidence ${data.confidence.toFixed(1)}, ` +
          `${text.length} chars)`,
      );
      return '';
    }
    this.logger.log(
      `OCR read ${text.length} chars at confidence ${data.confidence.toFixed(1)}`,
    );
    return text;
  }

  /** Text read from raw pdf.js page pixels. */
  async readRawImage(img: RawImage): Promise<string> {
    return this.readImage(OcrService.toPng(img));
  }

  /** Release the WASM worker so Node can exit; a live worker keeps the process up. */
  async onModuleDestroy(): Promise<void> {
    const pending = this.workerPromise;
    this.workerPromise = null;
    if (!pending) return;
    try {
      await (await pending).terminate();
    } catch (err) {
      this.logger.warn(`OCR worker shutdown failed: ${(err as Error).message}`);
    }
  }

  /**
   * pdf.js hands back raw pixels in one of three layouts; Tesseract wants an encoded
   * image. pngjs does that in pure JS — `sharp` and `canvas` would both pull a native
   * binary into the deploy for one buffer conversion.
   *
   * Every layout comes out fully opaque: transparency has no meaning to OCR, and the
   * page it is reading is paper.
   */
  private static toPng(img: RawImage): Buffer {
    const png = new PNG({ width: img.width, height: img.height });
    const src = img.data;
    const dst = png.data;
    const pixels = img.width * img.height;
    for (let p = 0, s = 0, d = 0; p < pixels; p++, d += 4) {
      if (img.kind === 3) {
        // COMPOSITE ONTO WHITE rather than carrying the alpha through. A partly
        // transparent region in a scan is whatever the page shows behind it, which is
        // paper; passing the alpha on instead leaves Tesseract deciding what a
        // half-there pixel means, and a fully transparent one reads as a blank page.
        const r = src[s++];
        const g = src[s++];
        const b = src[s++];
        const a = src[s++] / 255;
        dst[d] = Math.round(r * a + 255 * (1 - a));
        dst[d + 1] = Math.round(g * a + 255 * (1 - a));
        dst[d + 2] = Math.round(b * a + 255 * (1 - a));
        dst[d + 3] = 255;
      } else if (img.kind === 2) {
        dst[d] = src[s++];
        dst[d + 1] = src[s++];
        dst[d + 2] = src[s++];
        dst[d + 3] = 255;
      } else {
        // GRAYSCALE_1BPP arrives already expanded to one byte per pixel by pdf.js.
        const v = src[s++];
        dst[d] = v;
        dst[d + 1] = v;
        dst[d + 2] = v;
        dst[d + 3] = 255;
      }
    }
    return PNG.sync.write(png);
  }
}
