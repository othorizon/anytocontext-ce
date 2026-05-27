import type { Sandbox } from "@cloudflare/sandbox";
import { WORKSPACE_DIR } from "../backup";

const MAX_READ_BYTES = 64 * 1024;
const MAX_LIST_ENTRIES = 500;
const MAX_GREP_LINES = 500;

function quote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

/** read_file：直接读 sandbox 内文件；为安全要求 path 必须以 / 开头 */
export async function readFile(
  sandbox: Sandbox,
  args: { path: string },
): Promise<string> {
  const path = args.path;
  if (!path.startsWith("/")) {
    return `Error: path must be absolute, got ${path}`;
  }
  const res = await sandbox.exec(
    `head -c ${MAX_READ_BYTES} ${quote(path)} 2>&1`,
  );
  if (res.exitCode !== 0) return `Error reading ${path}: ${res.stdout || res.stderr}`;
  let text = res.stdout;
  if (text.length === MAX_READ_BYTES) {
    text += `\n...(truncated at ${MAX_READ_BYTES} bytes)`;
  }
  return text;
}

/** list_dir：以 `ls -la` 风格列出目录 */
export async function listDir(
  sandbox: Sandbox,
  args: { path: string },
): Promise<string> {
  const path = args.path;
  if (!path.startsWith("/")) {
    return `Error: path must be absolute, got ${path}`;
  }
  const res = await sandbox.exec(
    `ls -la --color=never ${quote(path)} | head -n ${MAX_LIST_ENTRIES + 2}`,
  );
  return res.stdout || res.stderr || "(empty)";
}

/** grep：在 path（默认 WORKSPACE_DIR）下做关键字搜索；优先用 grep -RIn */
export async function grep(
  sandbox: Sandbox,
  args: { pattern: string; path?: string },
): Promise<string> {
  const path = args.path?.startsWith("/") ? args.path : WORKSPACE_DIR;
  const pattern = args.pattern;
  if (!pattern) return "Error: pattern is required";
  const res = await sandbox.exec(
    `grep -RInE --color=never -- ${quote(pattern)} ${quote(path)} 2>/dev/null | head -n ${MAX_GREP_LINES}`,
  );
  return res.stdout.trim() || "(no matches)";
}
