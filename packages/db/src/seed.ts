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

  const testOrg = await prisma.organization.upsert({
    where: { slug: "test-org" },
    update: {},
    create: {
      name: "Test Org",
      slug: "test-org",
      plan: "pro",
    },
  })

  const testUser = await prisma.user.upsert({
    where: { email: "testuser@sealio.local" },
    update: {},
    create: {
      orgId: testOrg.id,
      email: "testuser@sealio.local",
      passwordHash,
      name: "Test User",
      role: "tester",
    },
  })

  console.log("Seeded:", { org: org.slug, user: user.email })
  console.log("Seeded:", { org: testOrg.slug, user: testUser.email })
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
