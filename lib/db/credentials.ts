import { prisma } from "./prisma";
import { decryptJson, encryptJson } from "@/lib/crypto/encrypt";
import type { CredentialDTO, CredentialTypeDTO } from "@/lib/dto";

export interface SshKeyPayload {
  privateKey: string;
  knownHosts?: string;
}

function toDTO(row: {
  id: string;
  name: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
}): CredentialDTO {
  return {
    id: row.id,
    name: row.name,
    type: row.type as CredentialTypeDTO,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listCredentials(
  userId: string,
): Promise<CredentialDTO[]> {
  const rows = await prisma.credential.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return rows.map(toDTO);
}

export async function createSshCredential(args: {
  userId: string;
  name: string;
  privateKey: string;
  knownHosts?: string;
}): Promise<CredentialDTO> {
  const payload = encryptJson<SshKeyPayload>({
    privateKey: args.privateKey,
    knownHosts: args.knownHosts,
  });
  const row = await prisma.credential.create({
    data: {
      userId: args.userId,
      name: args.name,
      type: "SSH_KEY",
      payload,
    },
  });
  return toDTO(row);
}

export async function updateSshCredential(args: {
  userId: string;
  id: string;
  name?: string;
  privateKey?: string;
  knownHosts?: string;
}): Promise<CredentialDTO | null> {
  const data: { name?: string; payload?: string } = {};
  if (args.name !== undefined) data.name = args.name;
  if (args.privateKey !== undefined) {
    data.payload = encryptJson<SshKeyPayload>({
      privateKey: args.privateKey,
      knownHosts: args.knownHosts,
    });
  }
  const result = await prisma.credential.updateMany({
    where: { id: args.id, userId: args.userId },
    data,
  });
  if (result.count === 0) return null;
  const row = await prisma.credential.findUnique({ where: { id: args.id } });
  return row ? toDTO(row) : null;
}

export async function deleteCredential(
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await prisma.credential.deleteMany({
    where: { id, userId },
  });
  return result.count > 0;
}

/** 仅 server / worker 流程内调用：取明文 SSH 私钥，用于 git clone。 */
export async function decryptSshCredential(
  userId: string,
  id: string,
): Promise<SshKeyPayload | null> {
  const row = await prisma.credential.findFirst({
    where: { id, userId, type: "SSH_KEY" },
  });
  if (!row) return null;
  return decryptJson<SshKeyPayload>(row.payload);
}
