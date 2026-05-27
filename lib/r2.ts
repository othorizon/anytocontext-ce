/**
 * R2 客户端（S3 兼容 API）。
 * 主应用只用读路径（代理构建日志、清理项目前缀）；
 * 写入由 agent worker 通过 R2 binding 直接操作。
 */
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

let cached: { client: S3Client; bucket: string } | null = null;

function getClient(): { client: S3Client; bucket: string } {
  if (cached) return cached;
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_ENDPOINT,
  } = process.env;
  if (
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET ||
    (!R2_ENDPOINT && !R2_ACCOUNT_ID)
  ) {
    throw new Error(
      "R2 client requires R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_ENDPOINT or R2_ACCOUNT_ID",
    );
  }
  const endpoint =
    R2_ENDPOINT ||
    `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  cached = {
    client: new S3Client({
      region: "auto",
      endpoint,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    }),
    bucket: R2_BUCKET,
  };
  return cached;
}

export interface R2LogSlice {
  text: string;
  totalSize: number;
  /** 是否对象不存在（构建刚开始未写过日志） */
  notFound: boolean;
}

/**
 * 读取一段 R2 对象，从 from 字节开始到末尾。
 * 用于构建日志增量轮询。
 */
export async function readR2Range(
  key: string,
  from: number,
): Promise<R2LogSlice> {
  const { client, bucket } = getClient();
  try {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    const totalSize = Number(head.ContentLength ?? 0);
    if (from >= totalSize) {
      return { text: "", totalSize, notFound: false };
    }
    const got = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        Range: `bytes=${from}-`,
      }),
    );
    const text = await got.Body?.transformToString("utf-8");
    return { text: text ?? "", totalSize, notFound: false };
  } catch (err) {
    if (isNotFound(err)) return { text: "", totalSize: 0, notFound: true };
    throw err;
  }
}

/** 删除以 prefix 开头的所有对象（项目删除时调） */
export async function deletePrefix(prefix: string): Promise<void> {
  const { client, bucket } = getClient();
  let token: string | undefined;
  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    );
    const keys = (listed.Contents ?? [])
      .map((o) => o.Key)
      .filter((k): k is string => !!k);
    if (keys.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
        }),
      );
    }
    token = listed.NextContinuationToken;
  } while (token);
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e.name === "NotFound" ||
    e.name === "NoSuchKey" ||
    e.$metadata?.httpStatusCode === 404
  );
}
