import { NextResponse, type NextRequest } from "next/server";

/**
 * Makes the current path readable from server components.
 *
 * The app layout redirects a person who has not completed onboarding, and it
 * has to know whether it is already rendering the onboarding page — otherwise
 * that redirect loops forever. Next does not expose the pathname to a layout,
 * so it travels as a request header.
 *
 * This is not an authorization boundary. Every access decision is made by
 * `authorize()` inside the route or page; middleware only carries a hint.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
