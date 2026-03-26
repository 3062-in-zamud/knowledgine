import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

export interface ConformanceTestContext {
  client: Client;
}

export interface ConformanceResult {
  name: string;
  passed: boolean;
  error?: string;
}

export async function callTool(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ isError: boolean; text: string; data: unknown }> {
  const result = await client.callTool({ name: toolName, arguments: args });
  const content = result.content as Array<{ type: string; text: string }>;
  const text = content[0]?.text ?? "";
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { isError: result.isError === true, text, data };
}

export function makeResult(name: string, passed: boolean, error?: string): ConformanceResult {
  return { name, passed, error };
}
