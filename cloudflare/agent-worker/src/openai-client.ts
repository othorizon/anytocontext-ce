/**
 * 单一 OpenAI 兼容客户端。
 *
 * 模型名 / baseURL / apiKey 全部从 worker secret + var 读取：
 *   - OPENAI_BASE_URL  例如 https://api.openai.com/v1
 *   - OPENAI_API_KEY   sk-...
 *   - OPENAI_MODEL     例如 gpt-4o-mini
 *
 * 任何兼容 OpenAI Chat Completions 协议的 provider 都可以直接对接：
 * Azure OpenAI / DeepSeek / OpenRouter / Ollama / vLLM / LM Studio 等。
 */
import OpenAI from "openai";

export interface OpenAIRuntime {
  client: OpenAI;
  model: string;
}

export function createClient(env: Env): OpenAIRuntime {
  const baseURL = env.OPENAI_BASE_URL?.trim();
  const apiKey = env.OPENAI_API_KEY?.trim();
  const model = env.OPENAI_MODEL?.trim();

  if (!baseURL) {
    throw new Error("OPENAI_BASE_URL is not set on the agent worker");
  }
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set on the agent worker");
  }
  if (!model) {
    throw new Error("OPENAI_MODEL is not set on the agent worker");
  }

  return {
    client: new OpenAI({ baseURL, apiKey }),
    model,
  };
}
