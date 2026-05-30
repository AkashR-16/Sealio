export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,   // Amy gate: no pinch zoom
  userScalable: false,
}

export default function SignLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
