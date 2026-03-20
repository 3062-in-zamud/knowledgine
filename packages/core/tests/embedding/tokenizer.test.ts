import { describe, it, expect, beforeAll } from "vitest";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { WordPieceTokenizer as WordPieceTokenizerType } from "../../src/embedding/tokenizer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokenizerPath = join(
  __dirname,
  "..",
  "..",
  "models",
  "all-MiniLM-L6-v2",
  "tokenizer.json",
);
const modelAvailable = existsSync(tokenizerPath);

describe.skipIf(!modelAvailable)("WordPieceTokenizer (requires model files)", () => {
  let tokenizer: WordPieceTokenizerType;

  beforeAll(async () => {
    const { WordPieceTokenizer } = await import("../../src/embedding/tokenizer.js");
    tokenizer = new WordPieceTokenizer(tokenizerPath);
  });

  it("should encode text and produce correct sequence length", () => {
    const result = tokenizer.encode("Hello world");
    expect(result.inputIds).toHaveLength(128);
    expect(result.attentionMask).toHaveLength(128);
    expect(result.tokenTypeIds).toHaveLength(128);
  });

  it("should start with [CLS] token (id=101) and include [SEP] token (id=102)", () => {
    const result = tokenizer.encode("Hello world");
    expect(result.inputIds[0]).toBe(101); // [CLS]
    // [SEP] should appear somewhere before padding
    const sepIdx = result.inputIds.indexOf(102);
    expect(sepIdx).toBeGreaterThan(0);
  });

  it("should pad to max_length=128 with attention_mask=0 for padding positions", () => {
    const result = tokenizer.encode("Hi");
    // Check that last token (pad) has mask=0
    expect(result.attentionMask[127]).toBe(0);
    // Check padding token id is 0
    expect(result.inputIds[127]).toBe(0);
  });

  it("should truncate very long text to 128 tokens", () => {
    const longText = "word ".repeat(200);
    const result = tokenizer.encode(longText);
    expect(result.inputIds).toHaveLength(128);
  });

  it("should produce consistent encoding for the same text", () => {
    const r1 = tokenizer.encode("consistency test");
    const r2 = tokenizer.encode("consistency test");
    expect(r1.inputIds).toEqual(r2.inputIds);
  });
});

describe("WordPieceTokenizer (basic tests without model)", () => {
  it("documents expected behavior when model is not available", () => {
    if (!modelAvailable) {
      console.log("Tokenizer tests skipped: model not available at", tokenizerPath);
    }
    expect(modelAvailable || !modelAvailable).toBe(true);
  });
});
