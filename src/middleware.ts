import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Auth is handled client-side via localStorage token.
// This middleware is kept minimal — no server-side cookie checks.
export function middleware(request: NextRequest) {
	return NextResponse.next();
}
