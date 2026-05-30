import { DocumentEditor } from "@/features/documents/document-editor"

interface Props {
  params: Promise<{ id: string }>
}

export const metadata = { title: "Edit Document — Sealio" }

export default async function DocumentEditorPage({ params }: Props) {
  const { id } = await params
  return <DocumentEditor documentId={id} />
}
