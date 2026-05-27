import useSWR from "swr";
import type { CredentialDTO } from "@/lib/dto";
import { jsonFetcher, postAction } from "./fetcher";

const LIST_URL = "/api/credentials/list";

interface ListResp {
  items: CredentialDTO[];
}

interface ItemResp {
  item: CredentialDTO;
}

export function useCredentials() {
  return useSWR<ListResp>(LIST_URL, async (u: string) => {
    return postAction<ListResp>(u, {});
  });
}

export async function createCredential(input: {
  name: string;
  privateKey: string;
}): Promise<CredentialDTO> {
  const { item } = await postAction<ItemResp>(
    "/api/credentials/create",
    input,
  );
  return item;
}

export async function updateCredential(input: {
  id: string;
  name?: string;
  privateKey?: string;
}): Promise<CredentialDTO> {
  const { item } = await postAction<ItemResp>(
    "/api/credentials/update",
    input,
  );
  return item;
}

export async function deleteCredentialApi(id: string): Promise<void> {
  await postAction("/api/credentials/delete", { id });
}

export interface GeneratedKeyPair {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
}

export async function generateSshKeyPair(
  comment?: string,
): Promise<GeneratedKeyPair> {
  return await postAction<GeneratedKeyPair>("/api/credentials/generate", {
    comment,
  });
}

export const credentialsListKey = LIST_URL;
// 保留 jsonFetcher 引用以便其它地方需要 GET 时直接使用
export { jsonFetcher };
