import type { Sandbox } from "@cloudflare/sandbox";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { grep, listDir, readFile } from "./file-ops";
import { execShell } from "./shell-exec";

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "列出 sandbox 内某个绝对路径目录的条目（ls -la 风格）。",
      parameters: {
        type: "object",
        required: ["path"],
        properties: {
          path: {
            type: "string",
            description: "绝对路径，例如 /workspace 或 /workspace/<outputDir>",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "读取 sandbox 内的一个文本文件，从开头返回最多 64KB；二进制文件不要用此工具。",
      parameters: {
        type: "object",
        required: ["path"],
        properties: {
          path: { type: "string", description: "绝对路径" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description:
        "在指定目录下递归搜索匹配的行；默认搜索范围是 /workspace。支持基础正则。",
      parameters: {
        type: "object",
        required: ["pattern"],
        properties: {
          pattern: { type: "string", description: "正则表达式（ERE）" },
          path: {
            type: "string",
            description: "搜索根目录绝对路径，默认 /workspace",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "exec_shell",
      description:
        "在 sandbox 内运行 bash 命令；常用于复杂查询、统计、json 解析等。默认 60s 超时，默认工作目录 /workspace。",
      parameters: {
        type: "object",
        required: ["cmd"],
        properties: {
          cmd: { type: "string", description: "bash 命令" },
          cwd: {
            type: "string",
            description: "工作目录绝对路径，可选，默认 /workspace",
          },
          timeoutSeconds: { type: "number", description: "超时秒数，最大 300" },
        },
      },
    },
  },
];

export async function executeToolCall(
  sandbox: Sandbox,
  name: string,
  rawArgs: unknown,
): Promise<string> {
  const args = (rawArgs ?? {}) as Record<string, unknown>;
  switch (name) {
    case "list_dir":
      return await listDir(sandbox, { path: String(args.path ?? "") });
    case "read_file":
      return await readFile(sandbox, { path: String(args.path ?? "") });
    case "grep":
      return await grep(sandbox, {
        pattern: String(args.pattern ?? ""),
        path: args.path ? String(args.path) : undefined,
      });
    case "exec_shell":
      return await execShell(sandbox, {
        cmd: String(args.cmd ?? ""),
        cwd: args.cwd ? String(args.cwd) : undefined,
        timeoutSeconds:
          typeof args.timeoutSeconds === "number"
            ? args.timeoutSeconds
            : undefined,
      });
    default:
      return `Error: unknown tool ${name}`;
  }
}
