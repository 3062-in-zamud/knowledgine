import { readFileSync } from "fs";

interface TokenizerJson {
  model: {
    vocab: Record<string, number>;
  };
  added_tokens?: Array<{ id: number; content: string }>;
}

interface EncodingResult {
  inputIds: number[];
  attentionMask: number[];
  tokenTypeIds: number[];
}

const MAX_LENGTH = 128;
const UNK_TOKEN = "[UNK]";
const CLS_TOKEN = "[CLS]";
const SEP_TOKEN = "[SEP]";
const PAD_TOKEN = "[PAD]";

export class WordPieceTokenizer {
  private vocab: Map<string, number>;
  private unkId: number;
  private clsId: number;
  private sepId: number;
  private padId: number;

  constructor(tokenizerJsonPath: string) {
    const raw = readFileSync(tokenizerJsonPath, "utf-8");
    const config = JSON.parse(raw) as TokenizerJson;
    this.vocab = new Map(Object.entries(config.model.vocab));

    this.unkId = this.vocab.get(UNK_TOKEN) ?? 100;
    this.clsId = this.vocab.get(CLS_TOKEN) ?? 101;
    this.sepId = this.vocab.get(SEP_TOKEN) ?? 102;
    this.padId = this.vocab.get(PAD_TOKEN) ?? 0;
  }

  encode(text: string): EncodingResult {
    const tokens = this.tokenize(text);
    // Account for [CLS] and [SEP]
    const maxTokens = MAX_LENGTH - 2;
    const truncated = tokens.slice(0, maxTokens);

    const ids = [this.clsId, ...truncated.map((t) => this.lookupToken(t)), this.sepId];
    const mask = new Array(ids.length).fill(1);

    // Pad to MAX_LENGTH
    while (ids.length < MAX_LENGTH) {
      ids.push(this.padId);
      mask.push(0);
    }

    return {
      inputIds: ids,
      attentionMask: mask,
      tokenTypeIds: new Array(MAX_LENGTH).fill(0),
    };
  }

  private lookupToken(token: string): number {
    return this.vocab.get(token) ?? this.unkId;
  }

  private tokenize(text: string): string[] {
    const normalized = text.toLowerCase().trim();
    const words = normalized.split(/\s+/).filter((w) => w.length > 0);
    const tokens: string[] = [];
    for (const word of words) {
      tokens.push(...this.wordpieceTokenize(word));
    }
    return tokens;
  }

  private wordpieceTokenize(word: string): string[] {
    if (this.vocab.has(word)) {
      return [word];
    }

    const tokens: string[] = [];
    let start = 0;
    let isUnk = false;

    while (start < word.length) {
      let end = word.length;
      let found: string | null = null;

      while (start < end) {
        const substr = (start === 0 ? "" : "##") + word.slice(start, end);
        if (this.vocab.has(substr)) {
          found = substr;
          break;
        }
        end--;
      }

      if (found === null) {
        isUnk = true;
        break;
      }

      tokens.push(found);
      start = end;
    }

    return isUnk ? [UNK_TOKEN] : tokens;
  }
}
