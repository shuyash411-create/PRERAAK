import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { currentActor } from "@/lib/auth";
import { authorize, AuthzError, type Action, type Actor, type Grant, type Resource } from "@/lib/authz";

/**
 * The choke point.
 *
 * Every API route handler in this codebase is produced by this function. It
 * resolves the actor, authorizes the request, and only then runs the handler —
 * so there is no route where the check is skipped, deferred to a component, or
 * done after the data has already been read.
 *
 * A test enumerates every route file and fails if any exported handler was not
 * built here. That is what keeps this true as routes are added.
 */

const GUARD_MARK = Symbol.for("preraak.guarded");

export type Handler<P> = (context: {
  actor: Actor;
  grant: Grant;
  req: Request;
  params: P;
}) => Promise<Response> | Response;

export type RouteHandler = ((req: Request, context: { params: Promise<never> }) => Promise<Response>) & {
  [GUARD_MARK]?: true;
};

type Spec<P> = {
  action: Action;
  /**
   * The resource under request. Receives the actor, the route params and the
   * request, so a resource identified by the caller or by a body field is
   * resolved before the handler ever sees it.
   */
  resource:
    | Resource
    | ((context: { actor: Actor; params: P; req: Request }) => Resource | Promise<Resource>);
};

export function guarded<P = Record<string, string>>(
  spec: Spec<P>,
  handler: Handler<P>,
): (req: Request, context: { params: Promise<P> }) => Promise<Response> {
  const route = async (req: Request, context: { params: Promise<P> }): Promise<Response> => {
    try {
      const params = ((await context?.params) ?? {}) as P;

      // Identity first. A request with no session is refused before any
      // record is looked up, so a stranger cannot probe for what exists.
      const actor = await currentActor();
      if (!actor) throw new AuthzError(401, "unauthenticated", "Sign in to continue.");

      const resource =
        typeof spec.resource === "function"
          ? await spec.resource({ actor, params, req })
          : spec.resource;

      const grant = await authorize(actor, spec.action, resource);

      return await handler({ actor, grant, req, params });
    } catch (error) {
      return toResponse(error);
    }
  };

  Object.defineProperty(route, GUARD_MARK, { value: true, enumerable: false });
  return route;
}

export function isGuarded(handler: unknown): boolean {
  return typeof handler === "function" && (handler as RouteHandler)[GUARD_MARK] === true;
}

/** Thrown by handlers for ordinary rule violations that are not access denials. */
export class RequestError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RequestError";
  }
}

/**
 * Errors become friendly sentences. The real error is logged server-side; a
 * stack trace never reaches the browser.
 */
function toResponse(error: unknown): NextResponse {
  if (error instanceof AuthzError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
  }

  if (error instanceof RequestError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "Some of those details did not look right. Check the highlighted fields.",
        fields: error.issues.map((issue) => ({
          field: issue.path.join(".") || "(request)",
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  }

  console.error("[preraak] unhandled route error:", error);
  return NextResponse.json(
    {
      error: "internal_error",
      message: "Something went wrong at our end. The team has been notified.",
    },
    { status: 500 },
  );
}

/** Parse a JSON body, treating a malformed one as a 400 rather than a 500. */
export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new RequestError(400, "invalid_request", "Expected a JSON object.");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, "invalid_request", "That request body was not valid JSON.");
  }
}
