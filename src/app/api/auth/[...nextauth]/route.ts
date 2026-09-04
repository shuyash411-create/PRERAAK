import { handlers } from "@/lib/auth";

// The only route in this application reachable without a session. Every other
// route under /api is produced by guarded() and answers 401 to a stranger.
export const { GET, POST } = handlers;
