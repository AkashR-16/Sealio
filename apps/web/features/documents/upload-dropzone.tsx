"use client"

import { useCallback, useState } from "react"
import { useDropzone } from "react-dropzone"
import { useRouter } from "next/navigation"
import { Upload, FileText, X, CheckCircle, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useUploadDocument } from "./queries"

type UploadState = "idle" | "uploading" | "success" | "error"

export function UploadDropzone() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [uploadState, setUploadState] = useState<UploadState>("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const { mutateAsync: upload } = useUploadDocument()

  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    if (rejected.length > 0) {
      setErrorMsg("Only PDF files up to 50MB are accepted.")
      return
    }
    const f = accepted[0]
    setFile(f)
    setTitle(f.name.replace(/\.pdf$/i, ""))
    setErrorMsg("")
    setUploadState("idle")
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxSize: 50 * 1024 * 1024,
    multiple: false,
  })

  async function handleUpload() {
    if (!file) return
    setUploadState("uploading")
    setErrorMsg("")

    try {
      const result = await upload({ file, title })
      setUploadState("success")
      setTimeout(() => router.push(`/documents/${result.data.id}`), 1200)
    } catch (err: any) {
      setUploadState("error")
      setErrorMsg(err.message ?? "Upload failed")
    }
  }

  return (
    <div className="space-y-6 max-w-xl">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        data-testid="upload-zone"
        className={cn(
          "relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200",
          isDragActive
            ? "border-brand bg-brand-muted scale-[1.01]"
            : file
              ? "border-brand/40 bg-brand-muted/40"
              : "border-border hover:border-brand/40 hover:bg-surface",
        )}
      >
        <input {...getInputProps()} />

        {file ? (
          <div className="flex flex-col items-center gap-3">
            <FileText className="h-10 w-10 text-brand" />
            <div>
              <p className="font-medium text-foreground">{file.name}</p>
              <p className="text-sm text-foreground-muted mt-0.5">
                {(file.size / 1024).toFixed(0)} KB · PDF
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFile(null); setTitle(""); setUploadState("idle") }}
              className="absolute top-3 right-3 text-foreground-subtle hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="h-14 w-14 rounded-2xl bg-surface border border-border flex items-center justify-center">
              <Upload className="h-6 w-6 text-foreground-muted" />
            </div>
            <div>
              <p className="font-medium">
                {isDragActive ? "Drop it here" : "Drag & drop your PDF"}
              </p>
              <p className="text-sm text-foreground-muted mt-1">or click to browse · Max 50MB</p>
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="flex items-center gap-2 rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Success */}
      {uploadState === "success" && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle className="h-4 w-4 shrink-0" />
          Uploaded! Redirecting to your documents…
        </div>
      )}

      {/* Title + submit — only when file selected */}
      {file && uploadState !== "success" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Document title</Label>
            <Input
              id="title"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Consulting Agreement – Acme Inc."
            />
          </div>

          <Button
            data-testid="upload-submit"
            onClick={handleUpload}
            disabled={uploadState === "uploading"}
            className="w-full"
            size="lg"
          >
            {uploadState === "uploading" ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-background/40 border-t-background animate-spin" />
                Uploading…
              </span>
            ) : (
              "Upload document"
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
