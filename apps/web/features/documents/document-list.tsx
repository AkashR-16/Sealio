"use client"

import Link from "next/link"
import { FileText, Clock, CheckCircle, Ban, FileEdit, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { formatRelativeTime } from "@/lib/utils"
import { useDocuments, type DocumentSummary } from "./queries"

const STATUS_CONFIG: Record<string, { label: string; variant: "completed" | "pending" | "draft" | "declined" | "sent" | "default"; icon: React.ElementType }> = {
  draft:             { label: "Draft",           variant: "draft",     icon: FileEdit },
  sent:              { label: "Sent",             variant: "sent",      icon: Clock },
  partially_signed:  { label: "In progress",      variant: "pending",   icon: Clock },
  completed:         { label: "Completed",        variant: "completed", icon: CheckCircle },
  declined:          { label: "Declined",         variant: "declined",  icon: Ban },
  expired:           { label: "Expired",          variant: "draft",     icon: Clock },
  voided:            { label: "Voided",           variant: "draft",     icon: Ban },
}

function DocumentRow({ doc }: { doc: DocumentSummary }) {
  const cfg = STATUS_CONFIG[doc.status] ?? STATUS_CONFIG.draft
  const Icon = cfg.icon

  return (
    <div className="flex items-center justify-between py-4 border-b border-border last:border-0 gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <div className="h-10 w-10 rounded-lg bg-surface border border-border flex items-center justify-center shrink-0">
          <FileText className="h-5 w-5 text-foreground-muted" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{doc.title}</p>
          <p className="text-xs text-foreground-subtle mt-0.5">
            {doc.creator.name} · {formatRelativeTime(doc.createdAt)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Badge variant={cfg.variant}>
          <Icon className="h-3 w-3" />
          {cfg.label}
        </Badge>
        <Link
          href={`/documents/${doc.id}`}
          className="text-foreground-subtle hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}

export function DocumentList() {
  const { data, isLoading, isError } = useDocuments()

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-lg bg-surface animate-pulse" />
        ))}
      </div>
    )
  }

  // Error state
  if (isError) {
    return (
      <div className="rounded-xl border border-error/30 bg-error/10 px-6 py-10 text-center">
        <p className="text-sm text-error">Failed to load documents. Is the API running?</p>
      </div>
    )
  }

  const documents = data?.data?.documents ?? []

  // Empty state
  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-16 text-center space-y-4">
        <div className="h-14 w-14 rounded-2xl bg-brand-muted flex items-center justify-center mx-auto">
          <FileText className="h-7 w-7 text-brand" />
        </div>
        <div>
          <p className="font-semibold">No documents yet</p>
          <p className="text-sm text-foreground-muted mt-1">Upload your first PDF to get started.</p>
        </div>
        <Button asChild size="sm">
          <Link href="/documents/new">Upload document</Link>
        </Button>
      </div>
    )
  }

  // Success state — document list
  return (
    <div className="rounded-xl border border-border bg-surface divide-y divide-border overflow-hidden">
      <div className="px-4">
        {documents.map((doc) => (
          <DocumentRow key={doc.id} doc={doc} />
        ))}
      </div>
    </div>
  )
}
