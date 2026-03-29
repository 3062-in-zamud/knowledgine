import { readFileSync } from "fs";
import { WordPieceTokenizer } from "./tokenizer.js";

export interface EncodingResult {
  inputIds: number[];
  attentionMask: number[];
  tokenTypeIds: number[];
}

export interface Tokenizer {
  encode(text: string): EncodingResult;
}

// HuggingFace Tokenizers JSON schema (partial)
interface HFTokenizerJson {
  model: {
    type?: string;
    vocab?: Record<string, number> | Array<[string, number]>;
    merges?: string[];
  };
  added_tokens?: Array<{ id: number; content: string; special?: boolean }>;
  truncation?: { max_length?: number };
  padding?: { pad_id?: number; pad_token?: string };
  pre_tokenizer?: { type?: string };
  normalizer?: { type?: string; lowercase?: boolean; strip_accents?: boolean | null | undefined };
}

/**
 * Detect if the tokenizer.json is a WordPiece (BERT-style) tokenizer.
 * WordPiece tokenizers have vocab as a flat Record<string, number> and no model.type field
 * (or model.type === "WordPiece").
 */
function isWordPieceFormat(config: HFTokenizerJson): boolean {
  if (!config.model?.vocab) return false;
  if (Array.isArray(config.model.vocab)) return false;
  // WordPiece may have model.type === "WordPiece" or no type
  const modelType = config.model.type;
  return !modelType || modelType === "WordPiece";
}

/**
 * Factory that creates the appropriate Tokenizer based on tokenizer.json format.
 *
 * Supported formats:
 * - WordPiece (BERT-style): uses WordPieceTokenizer
 * - BPE/Unigram (SentencePiece-style, e.g. multilingual-e5-small): uses HFSentencePieceTokenizer
 */
export function createTokenizer(tokenizerJsonPath: string, maxLength?: number): Tokenizer {
  const raw = readFileSync(tokenizerJsonPath, "utf-8");
  const config = JSON.parse(raw) as HFTokenizerJson;

  if (isWordPieceFormat(config)) {
    return new WordPieceTokenizer(tokenizerJsonPath);
  }

  return new HFSentencePieceTokenizer(config, maxLength);
}

/**
 * Tokenizer for BPE/Unigram models exported via HuggingFace Tokenizers format.
 * Specifically designed to handle Xenova/multilingual-e5-small tokenizer.json format.
 *
 * This is a simplified implementation that:
 * 1. Builds a vocab map from the tokenizer.json
 * 2. Applies basic Unicode normalization (lowercase if configured)
 * 3. Performs BPE tokenization via greedy longest-match
 * 4. Wraps with [CLS]/[SEP] and pads to maxLength
 */
export class HFSentencePieceTokenizer implements Tokenizer {
  private vocab: Map<string, number>;
  private merges: Map<string, number>; // "a b" => merge priority
  private unkId: number;
  private clsId: number;
  private sepId: number;
  private padId: number;
  private maxLength: number;
  private lowercase: boolean;
  private modelType: string;

  constructor(config: HFTokenizerJson, maxLength?: number) {
    this.vocab = new Map();
    this.merges = new Map();

    // Determine maxLength from config or param
    const configMaxLen = config.truncation?.max_length;
    this.maxLength = maxLength ?? configMaxLen ?? 512;

    // Detect lowercase from normalizer
    const normalizerType = config.normalizer?.type;
    const normalizerLowercase: boolean = config.normalizer?.lowercase ?? false;
    this.lowercase =
      normalizerLowercase ||
      normalizerType === "Lowercase" ||
      (normalizerType === "BertNormalizer" && normalizerLowercase);

    this.modelType = config.model?.type ?? "BPE";

    // Build vocab map from model.vocab
    const rawVocab = config.model?.vocab;
    if (rawVocab) {
      if (Array.isArray(rawVocab)) {
        // Array of [token, score] pairs (Unigram format)
        // In Unigram, the ID is the index position, not the second element (which is log-probability)
        for (let i = 0; i < (rawVocab as Array<[string, number]>).length; i++) {
          const [token] = (rawVocab as Array<[string, number]>)[i];
          this.vocab.set(token, i);
        }
      } else {
        // Record<string, number> (BPE format)
        for (const [token, id] of Object.entries(rawVocab as Record<string, number>)) {
          this.vocab.set(token, id);
        }
      }
    }

    // Build merge priorities for BPE
    if (config.model?.merges && Array.isArray(config.model.merges)) {
      for (let i = 0; i < config.model.merges.length; i++) {
        this.merges.set(config.model.merges[i], i);
      }
    }

    // Special tokens from added_tokens and vocab
    // SentencePiece uses <unk>, <s>, </s>, <pad>
    // BERT uses [UNK], [CLS], [SEP], [PAD]
    this.unkId =
      this.findSpecialTokenId(config.added_tokens, ["<unk>", "[UNK]"]) ??
      this.vocab.get("<unk>") ??
      this.vocab.get("[UNK]") ??
      0;
    this.clsId =
      this.findSpecialTokenId(config.added_tokens, ["[CLS]", "<s>"]) ??
      this.vocab.get("[CLS]") ??
      this.vocab.get("<s>") ??
      0;
    this.sepId =
      this.findSpecialTokenId(config.added_tokens, ["[SEP]", "</s>"]) ??
      this.vocab.get("[SEP]") ??
      this.vocab.get("</s>") ??
      1;
    this.padId =
      config.padding?.pad_id ??
      this.findSpecialTokenId(config.added_tokens, ["[PAD]", "<pad>"]) ??
      this.vocab.get("[PAD]") ??
      this.vocab.get("<pad>") ??
      0;
  }

  private findSpecialTokenId(
    addedTokens: Array<{ id: number; content: string; special?: boolean }> | undefined,
    candidates: string[],
  ): number | undefined {
    if (!addedTokens) return undefined;
    for (const candidate of candidates) {
      const found = addedTokens.find((t) => t.content === candidate);
      if (found !== undefined) return found.id;
    }
    return undefined;
  }

  encode(text: string): EncodingResult {
    const tokens = this.tokenize(text);
    // Account for [CLS] and [SEP]
    const maxTokens = this.maxLength - 2;
    const truncated = tokens.slice(0, maxTokens);

    const ids = [this.clsId, ...truncated.map((t) => this.lookupToken(t)), this.sepId];
    const mask = new Array(ids.length).fill(1);

    // Pad to maxLength
    while (ids.length < this.maxLength) {
      ids.push(this.padId);
      mask.push(0);
    }

    return {
      inputIds: ids,
      attentionMask: mask,
      tokenTypeIds: new Array(this.maxLength).fill(0),
    };
  }

  private lookupToken(token: string): number {
    return this.vocab.get(token) ?? this.unkId;
  }

  private tokenize(text: string): string[] {
    let normalized = text.trim();
    if (this.lowercase) {
      normalized = normalized.toLowerCase();
    }

    // Split on whitespace
    const words = normalized.split(/\s+/).filter((w) => w.length > 0);
    const tokens: string[] = [];

    for (const word of words) {
      // SentencePiece uses ▁ (U+2581) as word-start marker
      const sentencePieceWord = "\u2581" + word;

      if (this.modelType === "BPE" && this.merges.size > 0) {
        tokens.push(...this.bpeTokenize(sentencePieceWord));
      } else {
        // Unigram or no-merges fallback: character-level tokenization with vocab lookup
        tokens.push(...this.unigramTokenize(sentencePieceWord));
      }
    }

    return tokens;
  }

  /**
   * BPE tokenization: start with individual characters, apply merges.
   */
  private bpeTokenize(word: string): string[] {
    if (this.vocab.has(word)) return [word];

    // Split into individual characters (handle Unicode properly)
    let symbols = [...word];

    // Apply merges iteratively
    let changed = true;
    while (changed && symbols.length > 1) {
      changed = false;
      let bestPriority = Infinity;
      let bestIdx = -1;

      for (let i = 0; i < symbols.length - 1; i++) {
        const pair = `${symbols[i]} ${symbols[i + 1]}`;
        const priority = this.merges.get(pair);
        if (priority !== undefined && priority < bestPriority) {
          bestPriority = priority;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0) {
        const merged = symbols[bestIdx] + symbols[bestIdx + 1];
        symbols = [...symbols.slice(0, bestIdx), merged, ...symbols.slice(bestIdx + 2)];
        changed = true;
      }
    }

    return symbols.map((s) =>
      this.vocab.has(s) ? s : this.vocab.has("\u2581") ? "\u2581" : "[UNK]",
    );
  }

  /**
   * Unigram/greedy longest-match tokenization for SentencePiece models.
   */
  private unigramTokenize(word: string): string[] {
    if (this.vocab.has(word)) return [word];

    // Greedy longest-match forward tokenization
    const tokens: string[] = [];
    let start = 0;

    while (start < word.length) {
      let end = word.length;
      let found: string | null = null;

      // Try the full remaining substring first, then shrink
      while (start < end) {
        const substr = word.slice(start, end);
        if (this.vocab.has(substr)) {
          found = substr;
          break;
        }
        // Also try without ▁ prefix for non-start positions
        if (start > 0) {
          const substrNoMark = word.slice(start, end);
          if (this.vocab.has(substrNoMark)) {
            found = substrNoMark;
            break;
          }
        }
        end--;
      }

      if (found === null) {
        // Fall back to character-level with unk
        tokens.push("[UNK]");
        start++;
      } else {
        tokens.push(found);
        start = start + (end - start);
      }
    }

    return tokens;
  }
}
