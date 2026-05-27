import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export default function MainLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex h-14 items-center justify-between border-b px-6">
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/projects" className="font-semibold">
            anytocontext
          </Link>
          <Link href="/projects" className="text-muted-foreground hover:text-foreground">
            项目
          </Link>
          <Link href="/credentials" className="text-muted-foreground hover:text-foreground">
            凭证
          </Link>
          <Link href="/api-keys" className="text-muted-foreground hover:text-foreground">
            API Key
          </Link>
        </nav>
        <UserButton />
      </header>
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
