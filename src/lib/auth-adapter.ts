import type { Adapter, AdapterUser, VerificationToken } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";
import type { Person } from "@prisma/client";

/**
 * A deliberately partial Auth.js adapter.
 *
 * Sessions are JWTs, so nothing here stores sessions. Sign-in is magic-link
 * only, so nothing here stores OAuth accounts. What remains is verification
 * tokens and reading a Person by email.
 *
 * The important method is `createUser`, which throws. PRERAAK is invite-only:
 * a person exists because an admin created them, and a magic link requested
 * for an unknown address must not bring an account into being. Making that a
 * missing capability rather than a policy check means no future callback can
 * accidentally re-enable self-signup.
 */

function toAdapterUser(person: Person): AdapterUser {
  return {
    id: person.id,
    email: person.email,
    emailVerified: person.emailVerifiedAt,
    name: person.preferredName ?? person.fullName,
  };
}

export function PeopleAdapter(): Adapter {
  return {
    async createUser() {
      throw new Error(
        "PRERAAK is invite-only: people are created by an admin, never by signing in.",
      );
    },

    async getUser(id) {
      const person = await prisma.person.findUnique({ where: { id } });
      return person ? toAdapterUser(person) : null;
    },

    async getUserByEmail(email) {
      const person = await prisma.person.findUnique({
        where: { email: email.toLowerCase().trim() },
      });
      return person ? toAdapterUser(person) : null;
    },

    async getUserByAccount() {
      // No OAuth providers are configured, so no account can ever match.
      return null;
    },

    async updateUser({ id, emailVerified }) {
      const person = await prisma.person.update({
        where: { id },
        data: { emailVerifiedAt: emailVerified ?? undefined },
      });
      return toAdapterUser(person);
    },

    async linkAccount() {
      throw new Error("Account linking is not supported: sign-in is magic-link only.");
    },

    async createVerificationToken(token) {
      return prisma.verificationToken.create({ data: token });
    },

    async useVerificationToken(params): Promise<VerificationToken | null> {
      try {
        // Consumed on use, so a link works exactly once.
        return await prisma.verificationToken.delete({
          where: { identifier_token: { identifier: params.identifier, token: params.token } },
        });
      } catch {
        return null;
      }
    },
  };
}
