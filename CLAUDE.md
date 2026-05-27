@AGENTS.md

# anytocontext (community edition)

通过 n8n 风格可视化 workflow 把任何来源的数据（Git 仓库 / 文本 / Shell 脚本）
接入 AI Agent，然后通过 Playground 或 MCP 与项目对话。

社区版只保留一个 OpenAI 兼容 provider，模型名 / baseURL / apiKey 由 worker
端环境变量统一配置。

## 常用命令

```bash
pnpm install              # 安装依赖（postinstall 自动跑 prisma generate）
pnpm dev                  # 启动开发服务器 http://localhost:3000
pnpm build                # 生产构建
pnpm lint                 # ESLint 检查

# Prisma
pnpm prisma:migrate:dev    # 开发环境迁移
pnpm prisma:migrate:deploy # 生产环境迁移
pnpm prisma:generate       # 重新生成 Prisma Client
```

## 技术栈

- Next.js 16（App Router）+ React 19 + TypeScript
- Clerk（中文本地化）
- Prisma 7 + PostgreSQL；Prisma Client 输出到 `lib/generated/prisma/`，用
  `prisma.config.ts` 配 `DATABASE_URL`
- Tailwind 4 + shadcn/ui（base = radix）
- Zustand + SWR
- Sonner（toast）
- `@xyflow/react`（workflow 编辑器）、Monaco（节点内代码编辑器）、
  `@cloudflare/sandbox`、`@modelcontextprotocol/sdk`

## 架构要点

### Next.js 16 关键差异
- 中间件文件改名：用 **`proxy.ts`** 而非 `middleware.ts`，导出函数名为
  `proxy`（Clerk 的 `clerkMiddleware()` 直接用即可）。

### 路由结构（App Router）

- `app/(marketing)/` — 落地页等公开页面
- `app/(main)/` — 认证后主应用（Clerk middleware 保护）
  - `projects/` — 项目列表 / 详情 / workflow 编辑 / 构建历史 / playground
  - `credentials/` — SSH Key 等凭证管理
  - `api-keys/` — API Key 管理
- `app/sign-in/[[...rest]]/` / `app/sign-up/[[...rest]]/` — Clerk 登录注册
- `app/api/` — API Route Handlers

### 子项目

- `cloudflare/agent-worker/` — Cloudflare Worker：Durable Object Workflow
  + `@cloudflare/sandbox` + 原生 `openai` SDK。承担两种 workflow：
  BuildWorkflow（构建项目）、AgentWorkflow（对话）。
  模型 endpoint 从 `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`
  三个 secret 读取。

### 路径别名

`@/*` 映射项目根目录。
