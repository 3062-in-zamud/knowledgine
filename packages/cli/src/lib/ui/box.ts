import boxen, { type Options as BoxenOptions } from "boxen";

export type BoxType = "success" | "error" | "warning" | "info" | "default";

const borderColors: Record<BoxType, string> = {
  success: "green",
  error: "red",
  warning: "yellow",
  info: "cyan",
  default: "gray",
};

export function createBox(
  content: string,
  options?: { title?: string; type?: BoxType; padding?: number },
): string {
  const type = options?.type ?? "default";
  return boxen(content, {
    title: options?.title,
    titleAlignment: "left",
    padding: options?.padding ?? 1,
    borderColor: borderColors[type] as BoxenOptions["borderColor"],
    borderStyle: "round",
  });
}
