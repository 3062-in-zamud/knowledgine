export function stderr(text: string): void {
  process.stderr.write(text + "\n");
}
