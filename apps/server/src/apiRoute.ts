import type {
  FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault,
  RouteGenericInterface, RouteHandlerMethod, RouteShorthandOptions,
} from 'fastify'

import {
  splitRouteKey, type ApiBinary, type ApiErrorBody, type ApiRouteKey, type RouteBody, type RouteHasNoContent,
  type RouteParams, type RouteQuery, type RouteResponse, type Untrusted,
} from '@grafetto/shared'

/** (#623) What a handler of route K sees and may answer, derived from the
 *  shared table (packages/shared/src/rest.ts).
 *
 *  - Params arrive from the router as strings, whatever the client filled
 *    them with; the names are the table's.
 *  - Query and body are input: their field *names* come from the table, so a
 *    rename breaks this side too, but every value is `unknown` until the
 *    handler has checked it (see Untrusted).
 *  - Reply is the table's success body, or an error body. A binary route
 *    answers bytes; a `noContent` route may answer 204 with nothing. */
export interface ServerRoute<K extends ApiRouteKey> extends RouteGenericInterface {
  Params: RouteParams<K> extends object ? { [P in keyof RouteParams<K>]: string } : Record<string, never>
  Querystring: Untrusted<RouteQuery<K>>
  Body: Untrusted<RouteBody<K>>
  Reply:
    // A binary route may also answer 304 with nothing, when the ETag matches.
    | (RouteResponse<K> extends ApiBinary ? Buffer | Uint8Array | undefined : RouteResponse<K>)
    | (RouteHasNoContent<K> extends true ? undefined : never)
    | ApiErrorBody
}

export type ApiHandler<K extends ApiRouteKey> = RouteHandlerMethod<
  RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, ServerRoute<K>
>

export type ApiRouteOptions<K extends ApiRouteKey> = RouteShorthandOptions<
  RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, ServerRoute<K>
>

/** Registers route K: method and path from the key itself, so the table and
 *  the registration cannot name two different paths.
 *
 *    apiRoute(app, 'PATCH /api/rooms/:id/closed', async (request, reply) => …)
 *    apiRoute(app, 'POST /api/auth/logout', { config: { rateLimit } }, async …)
 */
export function apiRoute<K extends ApiRouteKey>(app: FastifyInstance, key: K, handler: ApiHandler<K>): void
export function apiRoute<K extends ApiRouteKey>(
  app: FastifyInstance, key: K, options: ApiRouteOptions<K>, handler: ApiHandler<K>,
): void
export function apiRoute<K extends ApiRouteKey>(
  app: FastifyInstance, key: K, optionsOrHandler: ApiRouteOptions<K> | ApiHandler<K>, maybeHandler?: ApiHandler<K>,
): void {
  const [method, url] = splitRouteKey(key)
  const options = typeof optionsOrHandler === 'function' ? {} : optionsOrHandler
  const handler = typeof optionsOrHandler === 'function' ? optionsOrHandler : maybeHandler
  if (!handler) throw new Error(`apiRoute: no handler for ${key}`)
  app.route<ServerRoute<K>>({ ...options, method, url, handler })
}
