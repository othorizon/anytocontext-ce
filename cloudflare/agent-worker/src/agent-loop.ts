/**
 * ReAct 多轮 agent 循环 —— 精简版（无 stream，无 billing，无 user-action）。
 *
 * 每轮：
 *   1. 调 chat.completions.create（非流式）
 *   2. 如果 response 不含 tool_calls → 完成，返回 content
 *   3. 否则在 sandbox 里执行所有 tool_calls，把结果 push 回 messages，下一轮
 *   4. 最多 maxRounds 轮，达到上限则把最后一次 content（或拼出来的提示）作为 finalText
 */
import type { Sandbox } from "@cloudflare/sandbox";
import type {
  ChatCompletionMessageParam,
  ChatCompletionAssistantMessageParam,
} from "openai/resources/chat/completions";
import { createClient } from "./openai-client";
import { AGENT_TOOLS, executeToolCall } from "./tools";

const DEFAULT_MAX_ROUNDS = 500;
const DEFAULT_MAX_TOKENS = 4096;

export interface AgentLoopParams {
  env: Env;
  systemPrompt: string;
  userPrompt: string;
  getSandbox: () => Promise<Sandbox>;
  maxRounds?: number;
}

export async function runAgentLoop({
  env,
  systemPrompt,
  userPrompt,
  getSandbox,
  maxRounds = DEFAULT_MAX_ROUNDS,
}: AgentLoopParams): Promise<string> {
  const { client, model } = createClient(env);
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  let lastAssistantText = "";

  for (let round = 1; round <= maxRounds; round++) {
    const completion = await client.chat.completions.create({
      model,
      messages,
      tools: AGENT_TOOLS,
      tool_choice: "auto",
      max_tokens: DEFAULT_MAX_TOKENS,
    });

    const choice = completion.choices[0];
    if (!choice) {
      throw new Error("OpenAI returned no choices");
    }
    const msg = choice.message;
    const text = (msg.content ?? "").trim();
    if (text) lastAssistantText = text;

    const toolCalls = msg.tool_calls ?? [];

    // 把 assistant 消息（含 tool_calls）压回历史
    const assistantHistory: ChatCompletionAssistantMessageParam = {
      role: "assistant",
      content: text || null,
    };
    if (toolCalls.length) {
      assistantHistory.tool_calls = toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.function?.name ?? "",
          arguments: tc.function?.arguments ?? "{}",
        },
      }));
    }
    messages.push(assistantHistory);

    if (toolCalls.length === 0) {
      // 终态
      return text;
    }

    // 依次执行每个 tool_call
    const sandbox = await getSandbox();
    for (const tc of toolCalls) {
      const name = tc.function?.name ?? "";
      let parsed: unknown = {};
      try {
        parsed = JSON.parse(tc.function?.arguments ?? "{}");
      } catch {
        parsed = { _raw: tc.function?.arguments };
      }
      let toolResult: string;
      try {
        toolResult = await executeToolCall(sandbox, name, parsed);
      } catch (err) {
        toolResult = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: toolResult,
      });
    }
  }

  return (
    lastAssistantText ||
    `(达到最大循环轮数 ${maxRounds}，未拿到最终回答)`
  );
}
