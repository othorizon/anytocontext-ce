/** 校验主应用 → worker 的 INTERNAL_API_SECRET 头 */
export function checkInternalSecret(req: Request, env: Env): Response | null {
  const got = req.headers.get("x-internal-api-secret");
  if (!got || got !== env.INTERNAL_API_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
