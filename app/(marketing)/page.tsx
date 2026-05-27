import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Show } from "@clerk/nextjs";

export default function MarketingHome() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
        把任何来源的数据接入你的 AI Agent
      </h1>
      <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
        通过可视化 workflow 配置数据源（Git / 文本 / Shell 脚本），
        一键构建到对象存储，随时通过 Playground 或 MCP 与你的项目对话。
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
        <Show when="signed-in">
          <Button asChild size="lg">
            <Link href="/projects">进入控制台</Link>
          </Button>
        </Show>
        <Show when="signed-out">
          <Button asChild size="lg">
            <Link href="/sign-in">登录开始使用</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/sign-up">注册新账号</Link>
          </Button>
        </Show>
      </div>
    </main>
  );
}
