import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { authorize, AuthzError } from "@/lib/authz";
import { addIstDays, istDateString } from "@/lib/ist";
import { Card, PageHeader } from "@/components/ui";
import { ExportPanel } from "./export-panel";

/**
 * Download progress as CSV.
 *
 * Reachable by admins and by mentors — a mentor's files contain their mentees
 * and nobody else, enforced in the export routes rather than here.
 */
export default async function ExportPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  try {
    await authorize(actor, "export", { kind: "export", dataset: "people" });
  } catch (error) {
    if (error instanceof AuthzError) redirect("/my-work");
    throw error;
  }

  const today = istDateString();

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Export"
        subtitle={
          actor.isAdmin
            ? "Everyone's progress, as spreadsheets."
            : "The people you mentor, as spreadsheets."
        }
      />

      <ExportPanel defaultFrom={addIstDays(today, -90)} defaultTo={today} />

      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">A note on these files</p>
        <p className="mt-2 text-sm text-ink-700">
          They contain personal data — names, emails, phone numbers and colleges. Every download is
          recorded on the timeline with who took it and when, so treat the files the same way you
          would treat the records themselves.
        </p>
      </Card>
    </div>
  );
}
