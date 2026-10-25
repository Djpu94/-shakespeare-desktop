import Fastify from "fastify";

export function createServer() {
  return Fastify({ logger: true });
}
