import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PeopleAdapter } from "@/lib/auth-adapter";
import { sendSignInLink } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import type { Actor } from "@/lib/authz";

/**
 * Auth.js v5, magic link only.
 *
 * The Resend provider is used for its verification-token flow; its delivery is
 * replaced by `sendSignInLink`, which owns the email copy and falls back to the
 * server console in development. Chosen over the Nodemailer provider because
 * that one imports nodemailer at module load, and no SMTP server is involved
 * here.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PeopleAdapter(),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", verifyRequest: "/login/check-email", error: "/login" },
  providers: [
    Resend({
      // Read by the provider's default sender, which is replaced below.
      apiKey: process.env.RESEND_API_KEY ?? "",
      from: process.env.EMAIL_FROM ?? "PRERAAK People OS <onboarding@resend.dev>",
      maxAge: 24 * 60 * 60,
      async sendVerificationRequest({ identifier, url }) {
        await sendSignInLink(identifier, url);
      },
    }),
  ],
  callbacks: {
    /**
     * Invite-only, enforced twice: the adapter cannot create a person, and an
     * archived person cannot sign in even though their history is retained.
     */
    async signIn({ user }) {
      if (!user.email) return false;
      const person = await prisma.person.findUnique({
        where: { email: user.email.toLowerCase().trim() },
        select: { status: true },
      });
      return person !== null && person.status !== "ARCHIVED";
    },

    /**
     * The token carries identity only. Authority — is_admin, status — is read
     * from the database on every request, so revoking admin or archiving a
     * person takes effect on their next request rather than their next login.
     */
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },

    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

/**
 * The signed-in person, loaded fresh from the database.
 * Returns null when there is no valid session or the row has since gone.
 */
export async function currentActor(): Promise<Actor | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;

  const person = await prisma.person.findUnique({
    where: { id },
    select: { id: true, personId: true, isAdmin: true, status: true },
  });

  return person ?? null;
}
