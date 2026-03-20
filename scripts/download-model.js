#!/usr/bin/env node
/**
 * Download all-MiniLM-L6-v2 ONNX model for knowledgine semantic search.
 *
 * Downloads:
 *   - model.onnx (INT8 quantized, ~23MB) from HuggingFace
 *   - tokenizer.json from HuggingFace
 *   - config.json from HuggingFace
 *
 * Usage:
 *   node scripts/download-model.js
 */

import { mkdirSync, createWriteStream, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { get } from "https";
import { pipeline } from "stream/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const modelDir = join(__dirname, "..", "packages", "core", "models", "all-MiniLM-L6-v2");

const FILES = [
  {
    url: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/tokenizer.json",
    dest: "tokenizer.json",
  },
  {
    url: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/config.json",
    dest: "config.json",
  },
  {
    // INT8 quantized ONNX model (~23MB)
    url: "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx",
    dest: "model.onnx",
  },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    const request = get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        download(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }
      pipeline(response, file).then(resolve).catch(reject);
    });
    request.on("error", reject);
  });
}

async function main() {
  mkdirSync(modelDir, { recursive: true });
  console.log(`Downloading model files to: ${modelDir}`);

  for (const { url, dest } of FILES) {
    const destPath = join(modelDir, dest);
    if (existsSync(destPath)) {
      console.log(`  [skip] ${dest} already exists`);
      continue;
    }
    process.stdout.write(`  [download] ${dest} ... `);
    try {
      await download(url, destPath);
      console.log("done");
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      process.exit(1);
    }
  }

  console.log("Model download complete. Semantic search is now available.");
}

main();
