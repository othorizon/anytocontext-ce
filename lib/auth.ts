import { auth } from "@clerk/nextjs/server";

/** Server 上下文里取登录态 userId；未登录时抛 401（要求由 Clerk middleware 已处理重定向） */
export async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return userId;
}
