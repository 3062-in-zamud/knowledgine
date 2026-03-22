/**
 * Embedding model downloader.
 * Downloads all-MiniLM-L6-v2 ONNX model files from HuggingFace.
 *
 * Features:
 * - Atomic download (.tmp + rename)
 * - Redirect limit (max 5)
 * - Timeout (5 minutes)
 * - Progress callback
 * - Skip existing files (0-byte treated as corrupt)
 * - SIGINT cleanup
 */

import { mkdirSync, renameSync, unlinkSync, existsSync, statSync, createWriteStream } from "fs";
import { get as httpsGet } from "https";
import { get as httpGet } from "http";
import { pipeline } from "stream/promises";
import type { ModelManager } from "./model-manager.js";

export interface DownloadProgress {
  file: string;
  downloaded: number;
  total: number | null;
}

export interface DownloadOptions {
  onProgress?: (progress: DownloadProgress) => void;
  onFileComplete?: (file: string) => void;
  timeoutMs?: number;
  maxRedirects?: number;
}

export interface ModelFile {
  url: string;
  dest: string;
}

const HF_BASE = "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main";

/**
 * Select the best quantized ONNX model for the current platform.
 * HuggingFace removed the generic `model_quantized.onnx` and now ships
 * architecture-specific variants.
 */
function selectOnnxModel(): string {
  const arch = process.arch; // "arm64" | "x64" | ...
  if (arch === "arm64") {
    return `${HF_BASE}/onnx/model_qint8_arm64.onnx`;
  }
  // x64: prefer AVX2 quantized (widely supported on modern x86_64)
  return `${HF_BASE}/onnx/model_quint8_avx2.onnx`;
}

export const MODEL_FILES: ModelFile[] = [
  {
    url: `${HF_BASE}/tokenizer.json`,
    dest: "tokenizer.json",
  },
  {
    url: `${HF_BASE}/config.json`,
    dest: "config.json",
  },
  {
    url: selectOnnxModel(),
    dest: "model.onnx",
  },
];

function isExistingAndValid(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const stat = statSync(filePath);
  return stat.size > 0;
}

function downloadFile(
  url: string,
  destPath: string,
  options: DownloadOptions,
  fileName: string,
  redirectCount: number = 0,
): Promise<void> {
  const maxRedirects = options.maxRedirects ?? 5;
  const timeoutMs = options.timeoutMs ?? 300_000; // 5 minutes

  if (redirectCount > maxRedirects) {
    return Promise.reject(new Error(`Too many redirects (${maxRedirects}) for ${url}`));
  }

  return new Promise<void>((resolve, reject) => {
    const tmpPath = destPath + ".tmp";
    let aborted = false;

    const cleanup = (): void => {
      try {
        if (existsSync(tmpPath)) unlinkSync(tmpPath);
      } catch {
        // ignore cleanup errors
      }
    };

    const onSigint = (): void => {
      aborted = true;
      cleanup();
    };
    process.on("SIGINT", onSigint);

    const getFunc = url.startsWith("http://") ? httpGet : httpsGet;

    const req = getFunc(url, (response) => {
      if (aborted) return;

      // Handle redirects (301, 302, 307, 308)
      if (
        response.statusCode === 301 ||
        response.statusCode === 302 ||
        response.statusCode === 307 ||
        response.statusCode === 308
      ) {
        clearTimeout(timer);
        process.removeListener("SIGINT", onSigint);
        const rawLocation = response.headers.location;
        if (!rawLocation) {
          reject(new Error(`Redirect without location header for ${url}`));
          return;
        }
        // Handle relative redirect URLs by resolving against the original URL
        const location = rawLocation.startsWith("/") ? new URL(rawLocation, url).href : rawLocation;
        downloadFile(location, destPath, options, fileName, redirectCount + 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        clearTimeout(timer);
        process.removeListener("SIGINT", onSigint);
        reject(new Error(`HTTP ${response.statusCode} for ${fileName}`));
        return;
      }

      const totalSize = response.headers["content-length"]
        ? parseInt(response.headers["content-length"], 10)
        : null;

      let downloaded = 0;
      response.on("data", (chunk: Buffer) => {
        downloaded += chunk.length;
        options.onProgress?.({
          file: fileName,
          downloaded,
          total: totalSize,
        });
      });

      const fileStream = createWriteStream(tmpPath);

      pipeline(response, fileStream)
        .then(() => {
          clearTimeout(timer);
          process.removeListener("SIGINT", onSigint);
          if (aborted) {
            cleanup();
            reject(new Error("Download aborted"));
            return;
          }
          // Atomic rename
          renameSync(tmpPath, destPath);
          options.onFileComplete?.(fileName);
          resolve();
        })
        .catch((err) => {
          clearTimeout(timer);
          process.removeListener("SIGINT", onSigint);
          cleanup();
          reject(err);
        });
    });

    const timer = setTimeout(() => {
      aborted = true;
      req.destroy();
      cleanup();
      reject(new Error(`Download timeout (${timeoutMs}ms) for ${fileName}`));
    }, timeoutMs);

    req.on("error", (err) => {
      clearTimeout(timer);
      process.removeListener("SIGINT", onSigint);
      cleanup();
      reject(err);
    });
  });
}

export async function downloadModel(
  modelManager: ModelManager,
  options: DownloadOptions = {},
): Promise<{ downloaded: string[]; skipped: string[] }> {
  const modelDir = modelManager.getModelDir();
  mkdirSync(modelDir, { recursive: true });

  const downloaded: string[] = [];
  const skipped: string[] = [];

  for (const file of MODEL_FILES) {
    const destPath = `${modelDir}/${file.dest}`;

    if (isExistingAndValid(destPath)) {
      skipped.push(file.dest);
      options.onFileComplete?.(file.dest);
      continue;
    }

    await downloadFile(file.url, destPath, options, file.dest);
    downloaded.push(file.dest);
  }

  return { downloaded, skipped };
}
