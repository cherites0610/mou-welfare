import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { asc, eq } from 'drizzle-orm'
import type { AppEnv } from '../../app.ts'
import { faqs } from '../../db/schema/index.ts'

const Faq = z.object({ id: z.uuid(), question: z.string(), answer: z.string() }).openapi('Faq')

const list = createRoute({
  method: 'get',
  path: '/v1/faq',
  tags: ['faq'],
  responses: {
    200: { description: '已發布的常見問題', content: { 'application/json': { schema: z.object({ data: z.array(Faq) }) } } },
  },
})

export const faqRoutes = new OpenAPIHono<AppEnv>().openapi(list, async (c) => {
  const rows = await c.var.deps.db
    .select({ id: faqs.id, question: faqs.question, answer: faqs.answer })
    .from(faqs)
    .where(eq(faqs.published, true))
    .orderBy(asc(faqs.sort), asc(faqs.createdAt))
  return c.json({ data: rows }, 200)
})
