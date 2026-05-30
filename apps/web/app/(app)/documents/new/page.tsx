import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { UploadDropzone } from "@/features/documents/upload-dropzone"

export const metadata = { title: "Upload document — Sealio" }

export default function NewDocumentPage() {
  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <Link
          href="/documents"
          className="inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground transition-colors mb-4"
        >
          <ChevronLeft className="h-4 w-4" />
          Documents
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Upload a document</h1>
        <p className="text-sm text-foreground-muted mt-1">
          Upload a PDF to place signature fields and send for signing.
        </p>
      </div>

      <UploadDropzone />
    </div>
  )
}
