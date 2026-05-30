import { prisma } from "./index"
import { hash } from "bcryptjs"

async function main() {
  console.log("Seeding database...")

  const passwordHash = await hash("password123", 12)

  const org = await prisma.organization.upsert({
    where: { slug: "sealio-demo" },
    update: {},
    create: {
      name: "Sealio Demo",
      slug: "sealio-demo",
      plan: "pro",
    },
  })

  const user = await prisma.user.upsert({
    where: { email: "demo@sealio.local" },
    update: {},
    create: {
      orgId: org.id,
      email: "demo@sealio.local",
      passwordHash,
      name: "Demo User",
      role: "owner",
    },
  })

  console.log("Seeded:", { org: org.slug, user: user.email })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
