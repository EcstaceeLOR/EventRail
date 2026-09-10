import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const statusHost = process.env.STATUS_HOST;
  if (statusHost && request.nextUrl.hostname === statusHost && request.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/status", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: "/" };
