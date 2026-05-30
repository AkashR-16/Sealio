import type { FastifyRequest, FastifyReply } from "fastify"
import type { TokenPayload } from "./services/auth.service.js"

declare module "fastify" {
  interface FastifyInstance {
    authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>
  }
  interface FastifyRequest {
    user: TokenPayload
  }
}
