import type { Sandbox } from "@cloudflare/sandbox";
import { WORKSPACE_DIR } from "../backup";

const MAX_OUTPUT_BYTES = 25_000;

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n...(truncated at ${max} bytes)`;
}

export async function execShell(
  sandbox: Sandbox,
  args: { cmd: string; cwd?: string; timeoutSeconds?: number },
): Promise<string> {
  if (!args.cmd) return "Error: cmd is required";
  const timeout = Math.min(args.timeoutSeconds ?? 60, 300);
  // 未指定 cwd 时默认 /workspace —— agent 看到的工作区根
  const cwd = args.cwd ?? WORKSPACE_DIR;
  const wrapped = `cd ${shellQuote(cwd)} && timeout ${timeout}s bash -c ${shellQuote(args.cmd)}`;
  const res = await sandbox.exec(wrapped);
  return [
    `exitCode: ${res.exitCode}`,
    `--- stdout ---`,
    truncate(res.stdout, MAX_OUTPUT_BYTES),
    `--- stderr ---`,
    truncate(res.stderr, MAX_OUTPUT_BYTES),
  ].join("\n");
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
