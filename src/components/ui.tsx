import Link from "next/link";
import type { ReactNode } from "react";

/** Shared presentational pieces. Deliberately plain. */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-lg border border-cream-300 bg-cream-50 p-4 sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}

/**
 * An empty state always says what the screen is for and what to do next.
 * A blank panel makes a working system look broken.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-cream-300 bg-cream-50 px-5 py-10 text-center">
      <p className="font-medium text-ink-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    SUBMITTED: "bg-forest-100 text-forest-800 border-forest-200",
    DRAFT: "bg-cream-200 text-ink-700 border-cream-300",
    ACTIVE: "bg-forest-100 text-forest-800 border-forest-200",
    UPCOMING: "bg-cream-200 text-ink-700 border-cream-300",
    COMPLETED: "bg-cream-200 text-ink-700 border-cream-300",
    TERMINATED: "bg-clay-100 text-clay-600 border-clay-100",
    ARCHIVED: "bg-cream-200 text-ink-500 border-cream-300",
    PENDING: "bg-cream-200 text-ink-700 border-cream-300",
    APPROVED: "bg-forest-100 text-forest-800 border-forest-200",
    REJECTED: "bg-clay-100 text-clay-600 border-clay-100",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
        tone[status] ?? "bg-cream-200 text-ink-700 border-cream-300"
      }`}
    >
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-900">
        {label}
      </label>
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export const inputClass =
  "w-full rounded-md border border-cream-300 bg-white px-3 py-2.5 text-ink-900 " +
  "placeholder:text-ink-400 focus:border-forest-600 focus:outline-none";

export const buttonClass =
  "inline-flex items-center justify-center rounded-md bg-forest-700 px-4 py-2.5 " +
  "font-medium text-cream-50 hover:bg-forest-800 disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-md border border-cream-300 bg-cream-50 " +
  "px-4 py-2.5 font-medium text-ink-900 hover:bg-cream-200 disabled:opacity-60";

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-md border border-clay-100 bg-clay-100 px-3 py-2 text-sm text-clay-600">
      {children}
    </p>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm text-forest-700 underline underline-offset-2 hover:text-forest-800">
      {children}
    </Link>
  );
}
