import fp from "fastify-plugin"
import jwt from "@fastify/jwt"
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify"
import { env } from "../lib/env.js"

// Expand the \n escape sequences that may be present when reading from env
function parseKey(key: string): string {
  return key.replace(/\\n/g, "\n")
}

export const jwtPlugin = fp(async (fastify: FastifyInstance) => {
  await fastify.register(jwt, {
    secret: {
      private: parseKey(env.JWT_PRIVATE_KEY),
      public: parseKey(env.JWT_PUBLIC_KEY),
    },
    sign: { algorithm: "RS256" },
    cookie: {
      cookieName: "access_token",
      signed: false,
    },
  })

  fastify.decorate(
    "authenticate",
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify()
        // Reject refresh tokens used in place of access tokens
        const payload = request.user as { type?: string }
        if (payload.type !== "access") throw new Error("Not an access token")
      } catch {
        return reply.status(401).send({
          error: { code: "UNAUTHORIZED", message: "Authentication required" },
        })
      }
    },
  )
})
