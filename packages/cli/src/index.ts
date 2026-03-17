import { VERSION } from "@knowledgine/core";

export interface RunResult {
  exitCode: number;
  output: string;
}

export function run(args: string[]): RunResult {
  if (args.includes("--version")) {
    return { exitCode: 0, output: VERSION };
  }

  if (args.includes("--help")) {
    return {
      exitCode: 0,
      output: `knowledgine v${VERSION}\n\nUsage: knowledgine [options]\n\nOptions:\n  --version  Show version\n  --help     Show this help`,
    };
  }

  return {
    exitCode: 0,
    output: `knowledgine v${VERSION} - no command specified. Use --help for usage.`,
  };
}
