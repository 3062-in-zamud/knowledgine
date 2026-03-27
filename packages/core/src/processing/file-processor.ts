import { readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";

export interface ProcessedFile {
  filePath: string;
  frontmatter: Record<string, unknown>;
  content: string;
  rawContent: string;
}

export class FileProcessor {
  async processFile(filePath: string): Promise<ProcessedFile> {
    const rawContent = await readFile(filePath, "utf-8");
    const { frontmatter, content } = this.extractFrontMatter(rawContent);

    return {
      filePath,
      frontmatter,
      content,
      rawContent,
    };
  }

  extractFrontMatter(rawContent: string): {
    frontmatter: Record<string, unknown>;
    content: string;
  } {
    const frontMatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
    const match = rawContent.match(frontMatterRegex);

    if (!match) {
      return { frontmatter: {}, content: rawContent };
    }

    try {
      const frontmatter = (parseYaml(match[1] || "") ?? {}) as Record<string, unknown>;
      const content = match[2] || "";
      return { frontmatter, content };
    } catch {
      return { frontmatter: {}, content: rawContent };
    }
  }

  extractTitle(content: string, filePath: string): string {
    for (const line of content.split(/\r?\n/)) {
      if (!line.startsWith("#")) continue;
      if (line.startsWith("##")) continue;
      if (line.length < 3 || line[1] !== " ") continue;

      const title = line.slice(2).trim();
      if (title) {
        return title;
      }
    }

    const filename = filePath.split("/").pop() || "untitled";
    return filename.replace(/\.md$/, "");
  }
}
