import { requireSession } from "@/lib/auth"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { FileText, Clock, CheckCircle, TrendingUp } from "lucide-react"

export const metadata = { title: "Dashboard — Sealio" }

function greeting() {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return "Good morning"
  if (h >= 12 && h < 17) return "Good afternoon"
  if (h >= 17 && h < 21) return "Good evening"
  return "Good night"
}

export default async function DashboardPage() {
  const { user, org } = await requireSession()

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {greeting()}, {user.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-foreground-muted mt-1">
            {org.plan.charAt(0).toUpperCase() + org.plan.slice(1)} plan · {org.name}
          </p>
        </div>
        <Button asChild>
          <Link href="/documents/new">Send document</Link>
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Sent this month", value: "0", icon: FileText, color: "text-brand" },
          { label: "Awaiting signature", value: "0", icon: Clock, color: "text-warning" },
          { label: "Completed", value: "0", icon: CheckCircle, color: "text-success" },
          { label: "Completion rate", value: "—", icon: TrendingUp, color: "text-info" },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-foreground-muted">
                  {stat.label}
                </CardTitle>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty state */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-brand-muted flex items-center justify-center">
            <FileText className="h-7 w-7 text-brand" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Send your first document</h3>
            <p className="text-sm text-foreground-muted mt-1 max-w-sm">
              Upload a PDF, place signature fields, and send it to anyone. They'll sign in minutes.
            </p>
          </div>
          <Button asChild>
            <Link href="/documents/new">Upload a document</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
