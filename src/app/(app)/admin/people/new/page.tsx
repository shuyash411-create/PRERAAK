import { redirect } from "next/navigation";
import { currentActor } from "@/lib/auth";
import { authorize, AuthzError } from "@/lib/authz";
import { BackLink, PageHeader } from "@/components/ui";
import { NewPersonForm } from "./new-person-form";

export default async function NewPersonPage() {
  const actor = await currentActor();
  if (!actor) redirect("/login");

  try {
    await authorize(actor, "create", { kind: "admin" });
  } catch (error) {
    if (error instanceof AuthzError) redirect("/my-work");
    throw error;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <BackLink href="/admin/people">← Back to people</BackLink>
      <PageHeader
        title="Add a person"
        subtitle="They get a permanent PRERAAK id now and keep it for good — through internship, employment and anything after."
      />
      <NewPersonForm />
    </div>
  );
}
