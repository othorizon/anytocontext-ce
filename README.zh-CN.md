<div align="center">

# anytocontext

**社区版**

把任何东西都变成可以被 Agent 直接查询的信息。通过一个高自由度的可视化构建流程
打包你想开放的数据，让 Agent 直接用自然语言回答。

[官网](https://anytocontext.com) · [English](./README.md) · [简体中文](./README.zh-CN.md)

</div>

---

## 项目作用

**把任何东西都变成可以被 agent 直接查询的信息。** 通过一个高自由度的构建流程，
把你想开放的数据打包好，Agent 就能用自然语言直接查询这些数据。

- 用可视化图结构定义**构建 workflow**：拉 Git 仓库、写 Markdown 文档、跑 Shell
  脚本，**构建节点**把所有源装配到 `/workspace`，并把快照存到对象存储里。
- 定义**对话 workflow**，系统提示词里可以用 `{source.docs.path}` 这种占位符
  按名字引用任意已装配的数据源。
- 打开 **Playground** 或用 MCP 客户端（Claude Desktop、IDE 插件等）连上来对话；
  Agent 在隔离的容器里运行，只读你装配好的 workspace。

## 使用场景

- **把我的文档资料打包给其他成员查阅。** 内部文档、操作手册、知识库一次打包，
  团队同事直接用自然语言提问，不用再在 wiki 里翻来翻去。
- **从代码库里精选可以开放的内容，开放给团队成员查询业务逻辑。** 自己挑哪些
  代码可以被检索，其他成员就能借由 Agent 问「这块业务规则是怎么实现的？」，
  又不必直接暴露完整源码访问权限。

## 云服务版

不想自己搭一套？可以直接用云服务版：<https://anytocontext.com>。注册即可使用，
免去部署 agent worker、配置 R2 / Postgres / Clerk 等一系列云服务的环节，开箱
就能创建项目、跑构建、连 MCP 客户端对话。

## 依赖的云服务

| 服务 | 用途 |
| --- | --- |
| **Cloudflare Workers + Durable Objects + Containers** | 运行 agent worker（`cloudflare/agent-worker`），每次构建 / 对话都在独立容器里执行。必需。 |
| **Cloudflare R2** | 存放构建日志和 workspace 快照（每次 agent 对话的上下文源）。必需。 |
| **Postgres**（Neon / Supabase / RDS / 自建均可） | 应用数据库（项目、凭证、API Key、构建与查询历史）。必需。 |
| **Clerk** | 身份认证。必需（如需替换为其它认证方案需要改代码）。 |
| **任意 OpenAI 兼容 LLM API** | Agent 的大脑，自带 key 和 base URL 即可。必需。 |

## 本地开发

需要：Node.js 20+、[pnpm](https://pnpm.io/)、开通了 R2 的 Cloudflare 账号、
一个 Postgres 数据库、Clerk dev keys。

```bash
# 1) 装依赖（postinstall 会自动跑 prisma generate）
pnpm install

# 2) 配置环境变量
cp env.example .env                                # 主应用
cp cloudflare/agent-worker/env.example \
   cloudflare/agent-worker/.dev.vars               # agent worker
# 在上面两个文件里填入真实值

# 3) 应用数据库 schema
pnpm prisma:migrate:dev

# 4) 启动 agent worker（默认 8790 端口）
cd cloudflare/agent-worker && pnpm wrangler dev --env dev

# 5) 另开一个终端，启动主应用（默认 3000 端口）
pnpm dev
```

打开 <http://localhost:3000> 即可。

## 部署

两部分独立部署：

1. **Agent worker** —— 进入 `cloudflare/agent-worker/`，把
   `wrangler.jsonc` 里的 `REPLACE_WITH_YOUR_*` 占位符替换成你自己的 R2 bucket
   名、account ID、以及主应用的真实 base URL，然后：

   ```bash
   pnpm wrangler secret put INTERNAL_API_SECRET --env prod
   pnpm wrangler secret put R2_ACCESS_KEY_ID    --env prod
   pnpm wrangler secret put R2_SECRET_ACCESS_KEY --env prod
   pnpm wrangler secret put OPENAI_BASE_URL     --env prod
   pnpm wrangler secret put OPENAI_API_KEY      --env prod
   pnpm wrangler secret put OPENAI_MODEL        --env prod
   pnpm wrangler deploy --env prod
   ```

2. **Next.js 主应用** —— 可部署到 Vercel、Cloudflare Pages、Fly.io、自有
   Node 节点等任何能跑 Next.js 16 的平台。把 `env.example` 里的所有变量在
   部署平台上设置好；其中 `SANDBOX_WORKER_URL` 指向部署后的 agent worker，
   两端的 `INTERNAL_API_SECRET` 必须一致。发布时跑一次
   `pnpm prisma:migrate:deploy` 把生产数据库迁到位。

## 技术栈

Next.js 16（App Router）· React 19 · TypeScript · Tailwind 4 · shadcn/ui ·
Prisma 7 · Clerk · `@xyflow/react` · Cloudflare Workers / Durable Objects /
Containers / R2 · `@cloudflare/sandbox` · `@modelcontextprotocol/sdk` ·
OpenAI SDK（OpenAI 兼容协议）。

## 许可证

见 [LICENSE](./LICENSE)。
