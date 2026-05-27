import useSWR from "swr";
import type { ApiKeyDTO, ApiKeyWithSecretDTO } from "@/lib/dto";
import { postAction } from "./fetcher";

const LIST_URL = "/api/api-keys/list";

interface ListResp {
  items: ApiKeyDTO[];
}

export function useApiKeys() {
  return useSWR<ListResp>(LIST_URL, async (u: string) => {
    return postAction<ListResp>(u, {});
  });
}

export async function createApiKeyApi(input: {
  name: string;
  scopeAll: boolean;
  projectScope: string[];
}): Promise<ApiKeyWithSecretDTO> {
  const { item } = await postAction<{ item: ApiKeyWithSecretDTO }>(
    "/api/api-keys/create",
    input,
  );
  return item;
}

export async function updateApiKeyScopeApi(input: {
  id: string;
  scopeAll: boolean;
  projectScope: string[];
}): Promise<ApiKeyDTO> {
  const { item } = await postAction<{ item: ApiKeyDTO }>(
    "/api/api-keys/update-scope",
    input,
  );
  return item;
}

export async function deleteApiKeyApi(id: string): Promise<void> {
  await postAction("/api/api-keys/delete", { id });
}

export const apiKeysListKey = LIST_URL;
