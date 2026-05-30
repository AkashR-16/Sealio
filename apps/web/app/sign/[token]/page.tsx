import { SignPage } from "@/features/signing/sign-page"

// No auth required — public signing page
export const metadata = { title: "Sign document — Sealio" }

interface Props {
  params: Promise<{ token: string }>
}

export default async function SignTokenPage({ params }: Props) {
  const { token } = await params
  return <SignPage token={token} />
}
