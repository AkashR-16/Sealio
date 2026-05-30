import { requireSession } from "@/lib/auth"
import { AppNav } from "./app-nav"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppNav user={session.user} org={session.org} />
      <main className="flex-1 px-6 py-8 max-w-7xl mx-auto w-full">{children}</main>
    </div>
  )
}
