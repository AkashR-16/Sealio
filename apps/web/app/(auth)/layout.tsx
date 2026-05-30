export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(#6ee7b7 1px, transparent 1px), linear-gradient(to right, #6ee7b7 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  )
}
