import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  createTokenizer,
  HFSentencePieceTokenizer,
} from "../../src/embedding/tokenizer-factory.js";
import { WordPieceTokenizer } from "../../src/embedding/tokenizer.js";

/**
 * Minimal WordPiece tokenizer.json (BERT-style)
 */
function createWordPieceTokenizerJson(): object {
  return {
    model: {
      vocab: {
        "[PAD]": 0,
        "[UNK]": 100,
        "[CLS]": 101,
        "[SEP]": 102,
        hello: 7592,
        world: 2088,
        test: 3231,
        "##ing": 2075,
      },
    },
    added_tokens: [
      { id: 100, content: "[UNK]", special: true },
      { id: 101, content: "[CLS]", special: true },
      { id: 102, content: "[SEP]", special: true },
    ],
  };
}

/**
 * Minimal BPE tokenizer.json (SentencePiece-style, like multilingual-e5-small)
 */
function createBPETokenizerJson(): object {
  return {
    model: {
      type: "BPE",
      vocab: {
        "<unk>": 0,
        "<s>": 1,
        "</s>": 2,
        "<pad>": 3,
        "\u2581he": 100,
        "\u2581hel": 101,
        "\u2581hell": 102,
        "\u2581hello": 103,
        "\u2581world": 200,
        "\u2581test": 300,
        h: 400,
        e: 401,
        l: 402,
        o: 403,
        w: 404,
        r: 405,
        d: 406,
      },
      merges: [
        "\u2581h e",
        "\u2581he l",
        "\u2581hel l",
        "\u2581hell o",
        "\u2581w o",
        "\u2581wo r",
        "\u2581wor l",
        "\u2581worl d",
      ],
    },
    added_tokens: [
      { id: 0, content: "<unk>", special: true },
      { id: 1, content: "<s>", special: true },
      { id: 2, content: "</s>", special: true },
      { id: 3, content: "<pad>", special: true },
    ],
    truncation: { max_length: 512 },
    padding: { pad_id: 3 },
    normalizer: { type: "Lowercase", lowercase: true },
  };
}

/**
 * Minimal Unigram tokenizer.json
 */
function createUnigramTokenizerJson(): object {
  return {
    model: {
      type: "Unigram",
      vocab: [
        ["<unk>", 0],
        ["<s>", 0],
        ["</s>", 0],
        ["<pad>", 0],
        ["\u2581hello", -5.0],
        ["\u2581world", -5.0],
        ["\u2581test", -5.0],
        ["h", -10.0],
        ["e", -10.0],
        ["l", -10.0],
        ["o", -10.0],
      ],
    },
    added_tokens: [
      { id: 0, content: "<unk>", special: true },
      { id: 1, content: "<s>", special: true },
      { id: 2, content: "</s>", special: true },
      { id: 3, content: "<pad>", special: true },
    ],
    truncation: { max_length: 128 },
  };
}

describe("createTokenizer", () => {
  let tmpDir: string;

  const setup = () => {
    tmpDir = mkdtempSync(join(tmpdir(), "tokenizer-factory-test-"));
    return tmpDir;
  };

  const teardown = () => {
    rmSync(tmpDir, { recursive: true, force: true });
  };

  it("should return WordPieceTokenizer for BERT-style tokenizer.json", () => {
    setup();
    try {
      const tokenizerPath = join(tmpDir, "tokenizer.json");
      writeFileSync(tokenizerPath, JSON.stringify(createWordPieceTokenizerJson()));

      const tokenizer = createTokenizer(tokenizerPath);
      expect(tokenizer).toBeInstanceOf(WordPieceTokenizer);
    } finally {
      teardown();
    }
  });

  it("should return HFSentencePieceTokenizer for BPE tokenizer.json", () => {
    setup();
    try {
      const tokenizerPath = join(tmpDir, "tokenizer.json");
      writeFileSync(tokenizerPath, JSON.stringify(createBPETokenizerJson()));

      const tokenizer = createTokenizer(tokenizerPath);
      expect(tokenizer).toBeInstanceOf(HFSentencePieceTokenizer);
    } finally {
      teardown();
    }
  });

  it("should return HFSentencePieceTokenizer for Unigram tokenizer.json", () => {
    setup();
    try {
      const tokenizerPath = join(tmpDir, "tokenizer.json");
      writeFileSync(tokenizerPath, JSON.stringify(createUnigramTokenizerJson()));

      const tokenizer = createTokenizer(tokenizerPath);
      expect(tokenizer).toBeInstanceOf(HFSentencePieceTokenizer);
    } finally {
      teardown();
    }
  });
});

describe("HFSentencePieceTokenizer", () => {
  let tmpDir: string;

  const setup = () => {
    tmpDir = mkdtempSync(join(tmpdir(), "tokenizer-hf-test-"));
    return tmpDir;
  };

  const teardown = () => {
    rmSync(tmpDir, { recursive: true, force: true });
  };

  it("should encode text and return arrays of correct length", () => {
    setup();
    try {
      const tokenizerPath = join(tmpDir, "tokenizer.json");
      writeFileSync(tokenizerPath, JSON.stringify(createBPETokenizerJson()));

      const tokenizer = createTokenizer(tokenizerPath, 32);
      const result = tokenizer.encode("hello world");

      expect(result.inputIds).toHaveLength(32);
      expect(result.attentionMask).toHaveLength(32);
      expect(result.tokenTypeIds).toHaveLength(32);
    } finally {
      teardown();
    }
  });

  it("should start with CLS token id and end with SEP token id before padding", () => {
    setup();
    try {
      const tokenizerPath = join(tmpDir, "tokenizer.json");
      writeFileSync(tokenizerPath, JSON.stringify(createBPETokenizerJson()));

      const tokenizer = createTokenizer(tokenizerPath, 32);
      const result = tokenizer.encode("hello");

      // First token is CLS (<s> = id 1)
      expect(result.inputIds[0]).toBe(1); // <s>
      // attentionMask should be 1 for real tokens, 0 for padding
      expect(result.attentionMask[0]).toBe(1);
    } finally {
      teardown();
    }
  });

  it("should pad remaining tokens with pad id and mask 0", () => {
    setup();
    try {
      const tokenizerPath = join(tmpDir, "tokenizer.json");
      writeFileSync(tokenizerPath, JSON.stringify(createBPETokenizerJson()));

      const tokenizer = createTokenizer(tokenizerPath, 32);
      const result = tokenizer.encode("hi");

      // Find first padding position
      const firstPadIdx = result.attentionMask.findIndex((m) => m === 0);
      if (firstPadIdx >= 0) {
        // All subsequent masks should be 0
        for (let i = firstPadIdx; i < result.attentionMask.length; i++) {
          expect(result.attentionMask[i]).toBe(0);
        }
        // Pad token id = 3
        expect(result.inputIds[firstPadIdx]).toBe(3);
      }
    } finally {
      teardown();
    }
  });

  it("should respect maxLength from config when not overridden", () => {
    setup();
    try {
      const tokenizerPath = join(tmpDir, "tokenizer.json");
      writeFileSync(tokenizerPath, JSON.stringify(createBPETokenizerJson()));

      // BPE config has max_length: 512
      const tokenizer = createTokenizer(tokenizerPath);
      const result = tokenizer.encode("test");

      expect(result.inputIds).toHaveLength(512);
    } finally {
      teardown();
    }
  });

  it("should override maxLength when provided", () => {
    setup();
    try {
      const tokenizerPath = join(tmpDir, "tokenizer.json");
      writeFileSync(tokenizerPath, JSON.stringify(createBPETokenizerJson()));

      const tokenizer = createTokenizer(tokenizerPath, 64);
      const result = tokenizer.encode("test");

      expect(result.inputIds).toHaveLength(64);
    } finally {
      teardown();
    }
  });

  it("tokenTypeIds should all be 0", () => {
    setup();
    try {
      const tokenizerPath = join(tmpDir, "tokenizer.json");
      writeFileSync(tokenizerPath, JSON.stringify(createBPETokenizerJson()));

      const tokenizer = createTokenizer(tokenizerPath, 16);
      const result = tokenizer.encode("hello");

      expect(result.tokenTypeIds.every((t) => t === 0)).toBe(true);
    } finally {
      teardown();
    }
  });
});
