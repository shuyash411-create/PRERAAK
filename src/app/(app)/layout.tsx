import Link from "next/link";
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/lib/auth";
import { needsOnboarding } from "@/lib/onboarding";
import { headers } from "next/headers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  // Somebody invited but not yet set up has nothing to do anywhere else, so
  // send them to complete onboarding first. Admins are exempt: they are the
  // people who clear the queue, and locking them behind it would strand
  // everyone.
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (!pathname.startsWith("/onboarding") && (await needsOnboarding(actor))) {
    redirect("/onboarding");
  }

  const person = await prisma.person.findUniqueOrThrow({
    where: { id: actor.id },
    select: { fullName: true, preferredName: true, personId: true },
  });

  const name = person.preferredName ?? person.fullName.split(" ")[0];

  async function endSession() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-dvh">
      <header className="border-b border-cream-300 bg-cream-50">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/my-work" className="text-sm font-semibold tracking-wide text-forest-700">
            PRERAAK
          </Link>

          <nav aria-label="Main" className="flex items-center gap-1 text-sm">
            <NavLink href="/my-work">My work</NavLink>
            <NavLink href="/tasks">Tasks</NavLink>
            <NavLink href="/weekly">Weekly</NavLink>
            <NavLink href="/my-people">My people</NavLink>
            <NavLink href="/profile">Profile</NavLink>
            {actor.isAdmin ? <NavLink href="/admin/people">Admin</NavLink> : null}
          </nav>

          <form action={endSession} className="hidden sm:block">
            <button
              type="submit"
              className="text-sm text-ink-500 underline underline-offset-2 hover:text-ink-900"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 pb-16">{children}</main>

      <footer className="mx-auto max-w-5xl px-4 pb-8 text-xs text-ink-400">
        Signed in as {name} · {person.personId}
        <form action={endSession} className="mt-2 sm:hidden">
          <button type="submit" className="underline underline-offset-2">
            Sign out
          </button>
        </form>
      </footer>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-2.5 py-1.5 text-ink-700 hover:bg-cream-200 hover:text-ink-900"
    >
      {children}
    </Link>
  );
}
