import Link from "next/link"
import { Button } from "@/components/ui/button"
import { DocumentList } from "@/features/documents/document-list"

export const metadata = { title: "Documents — Sealio" }

export default function DocumentsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="text-sm text-foreground-muted mt-1">
            All documents sent or drafted by your team.
          </p>
        </div>
        <Button asChild>
          <Link href="/documents/new">Upload document</Link>
        </Button>
      </div>

      <DocumentList />
    </div>
  )
}
