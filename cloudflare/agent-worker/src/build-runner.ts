/**
 * 在 build sandbox 内拓扑执行所有源节点，把产物落到 BUILD_DIR（/build）。
 *
 * - git    → git clone --depth=1 -b <ref> <url> {BUILD_DIR}/<name>
 * - text   → 写 <content> 到 {BUILD_DIR}/<name>.md
 * - script → 在临时工作目录跑 .sh；outputDir 非空时 mv 到 {BUILD_DIR}/<name>/；
 *           否则把整个工作目录作为 {BUILD_DIR}/<name>/
 *
 * build 节点本身不参与此阶段；装配到 /workspace 由 build-workflow 的
 * assemble-workspace step 负责。
 */
import type { Sandbox } from "@cloudflare/sandbox";
import { BUILD_DIR } from "./backup";
import type { R2LogWriter } from "./log-writer";
import type {
  DecryptedSshKey,
  WorkflowGraph,
  WorkflowNode,
} from "./types";

function topoSort(graph: WorkflowGraph): WorkflowNode[] {
  const idToNode = new Map(graph.nodes.map((n) => [n.id, n]));
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) {
    inDeg.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const e of graph.edges) {
    if (!idToNode.has(e.source) || !idToNode.has(e.target)) continue;
    adj.get(e.source)!.push(e.target);
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const [id, d] of inDeg) if (d === 0) queue.push(id);
  const out: WorkflowNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    out.push(idToNode.get(id)!);
    for (const next of adj.get(id) ?? []) {
      const d = (inDeg.get(next) ?? 0) - 1;
      inDeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (out.length !== graph.nodes.length) {
    throw new Error("Build graph has cycle");
  }
  return out;
}

interface RunOptions {
  sandbox: Sandbox;
  graph: WorkflowGraph;
  sshKeys: Map<string, DecryptedSshKey>; // credentialId → key
  log: R2LogWriter;
}

export async function runSourceNodes({
  sandbox,
  graph,
  sshKeys,
  log,
}: RunOptions): Promise<void> {
  // 保证 BUILD_DIR 存在（外层 prepareBuildDirs 已建，这里幂等）
  await sandbox.mkdir(BUILD_DIR, { recursive: true });
  await log.appendLine("[build] start running source nodes");

  for (const node of topoSort(graph)) {
    if (node.type === "build") continue;
    await log.appendLine(`[node] ${node.type}/${node.name} → start`);
    try {
      switch (node.type) {
        case "git":
          await runGitNode(sandbox, node, sshKeys, log);
          break;
        case "text":
          await runTextNode(sandbox, node, log);
          break;
        case "script":
          await runScriptNode(sandbox, node, log);
          break;
      }
      await log.appendLine(`[node] ${node.type}/${node.name} → done`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await log.appendLine(`[node] ${node.type}/${node.name} → ERROR: ${msg}`);
      throw err;
    }
  }
}

async function runGitNode(
  sandbox: Sandbox,
  node: Extract<WorkflowNode, { type: "git" }>,
  sshKeys: Map<string, DecryptedSshKey>,
  log: R2LogWriter,
): Promise<void> {
  const target = `${BUILD_DIR}/${node.name}`;
  // 准备 SSH key（如果有）
  let env: Record<string, string> = {};
  if (node.data.credentialId) {
    const cred = sshKeys.get(node.data.credentialId);
    if (!cred) {
      throw new Error(`SSH credential ${node.data.credentialId} not provided`);
    }
    await sandbox.mkdir("/root/.ssh", { recursive: true });
    // OpenSSH/OpenSSL 严格模式下 PEM 必须以 \n 结尾，否则 "error in libcrypto"
    const keyContent = cred.privateKey.endsWith("\n")
      ? cred.privateKey
      : cred.privateKey + "\n";
    await sandbox.writeFile("/root/.ssh/id_rsa", keyContent);
    await sandbox.exec("chmod 600 /root/.ssh/id_rsa");
    if (cred.knownHosts) {
      await sandbox.writeFile("/root/.ssh/known_hosts", cred.knownHosts);
    } else {
      // 用 ssh-keyscan 自动生成 known_hosts（基于 URL 主机名）
      const host = parseGitHost(node.data.url);
      if (host) {
        const ks = await sandbox.exec(`ssh-keyscan -H ${host} 2>/dev/null || true`);
        if (ks.stdout) await sandbox.writeFile("/root/.ssh/known_hosts", ks.stdout);
      }
    }
    env = {
      GIT_SSH_COMMAND:
        "ssh -i /root/.ssh/id_rsa -o UserKnownHostsFile=/root/.ssh/known_hosts -o StrictHostKeyChecking=accept-new",
    };
  }
  // 清掉旧的 target（保证幂等）
  await sandbox.exec(`rm -rf ${shellQuote(target)}`);
  const cmd = `git clone --depth=1 -b ${shellQuote(node.data.ref)} ${shellQuote(
    node.data.url,
  )} ${shellQuote(target)}`;
  await log.appendLine(`[git] ${cmd}`);
  const res = await sandbox.exec(cmd, { env });
  if (res.stdout) await log.append(res.stdout);
  if (res.stderr) await log.append(res.stderr);
  if (res.exitCode !== 0) {
    throw new Error(`git clone failed (exit ${res.exitCode})`);
  }
}

async function runTextNode(
  sandbox: Sandbox,
  node: Extract<WorkflowNode, { type: "text" }>,
  log: R2LogWriter,
): Promise<void> {
  const target = `${BUILD_DIR}/${node.name}.md`;
  await log.appendLine(`[text] write ${target} (${node.data.content.length} chars)`);
  await sandbox.writeFile(target, node.data.content);
}

async function runScriptNode(
  sandbox: Sandbox,
  node: Extract<WorkflowNode, { type: "script" }>,
  log: R2LogWriter,
): Promise<void> {
  const work = `/tmp/work-${node.name}`;
  const scriptFile = `${work}/_run.sh`;
  await sandbox.exec(`rm -rf ${shellQuote(work)} && mkdir -p ${shellQuote(work)}`);
  await sandbox.writeFile(scriptFile, node.data.script);
  await sandbox.exec(`chmod +x ${shellQuote(scriptFile)}`);
  await log.appendLine(`[script] bash ${scriptFile} (cwd=${work})`);
  const res = await sandbox.exec(`cd ${shellQuote(work)} && bash ${shellQuote(scriptFile)}`);
  if (res.stdout) await log.append(res.stdout);
  if (res.stderr) await log.append(res.stderr);
  if (res.exitCode !== 0) {
    throw new Error(`script exited with code ${res.exitCode}`);
  }
  if (node.data.noOutput) {
    // 纯副作用脚本：不产数据，直接清掉临时目录
    await log.appendLine(`[script] noOutput: discard work dir`);
    await sandbox.exec(`rm -rf ${shellQuote(work)}`);
    return;
  }
  const target = `${BUILD_DIR}/${node.name}`;
  await sandbox.exec(`rm -rf ${shellQuote(target)}`);
  if (node.data.outputDir) {
    const src = `${work}/${node.data.outputDir.replace(/^\/+/, "")}`;
    await sandbox.exec(
      `mv ${shellQuote(src)} ${shellQuote(target)}`,
    );
  } else {
    // 移除 _run.sh 后整个目录搬走
    await sandbox.exec(`rm -f ${shellQuote(scriptFile)}`);
    await sandbox.exec(`mv ${shellQuote(work)} ${shellQuote(target)}`);
  }
}

function parseGitHost(url: string): string | null {
  // git@github.com:owner/repo.git 或 ssh://git@host:port/...
  const sshShort = url.match(/^[\w-]+@([^:]+):/);
  if (sshShort) return sshShort[1];
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

function shellQuote(s: string): string {
  // 单引号包裹，内部单引号转 '\''
  return `'${s.replace(/'/g, "'\\''")}'`;
}
