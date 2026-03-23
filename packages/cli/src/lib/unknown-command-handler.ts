/**
 * Generates the "available commands" help text when an unknown command is entered.
 *
 * This is extracted as a pure function to enable unit testing independent of
 * Commander.js program state.
 */
export function buildUnknownCommandHelp(commandNames: string[]): string {
  const sorted = [...commandNames].sort();
  return (
    `\nAvailable commands: ${sorted.join(", ")}\n` +
    `Run 'knowledgine --help' for usage information.\n`
  );
}

/**
 * Creates a Commander.js outputError handler that:
 *  1. Writes the original error message
 *  2. Appends available commands list when the error is "unknown command"
 */
export function createOutputErrorHandler(
  getCommandNames: () => string[],
): (str: string, write: (s: string) => void) => void {
  return (str: string, write: (s: string) => void) => {
    write(str);
    if (str.includes("unknown command")) {
      write(buildUnknownCommandHelp(getCommandNames()));
    }
  };
}
