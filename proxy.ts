import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

// /api/internal/* 是 worker → 主应用的 service-to-service 通道，
// 自己用 x-internal-api-secret 鉴权，不能要求 Clerk session
const isInternalApi = createRouteMatcher(["/api/internal/(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isInternalApi(req)) return;
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
