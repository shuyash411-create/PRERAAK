"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTaskAction } from "@/app/actions/admin";
import { buttonClass, ErrorNote, Field, inputClass, secondaryButtonClass } from "@/components/ui";

export function TaskComposer({
  teams,
  people,
  today,
}: {
  teams: { id: string; name: string }[];
  people: { id: string; label: string }[];
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className={buttonClass} onClick={() => setOpen(true)}>
        Create a task
      </button>
    );
  }

  return (
    <form
      className="space-y-4 rounded-lg border border-cream-300 bg-cream-50 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setError(null);
        startTransition(async () => {
          const result = await createTaskAction(data);
          if (!result.ok) {
            setError(result.message);
            return;
          }
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <Field label="Title" htmlFor="title">
        <input id="title" name="title" required autoFocus className={inputClass} />
      </Field>

      <Field label="What is needed" htmlFor="description">
        <textarea id="description" name="description" rows={3} className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Deadline" htmlFor="dueDate">
          <input id="dueDate" name="dueDate" type="date" required defaultValue={today}
            className={inputClass} />
        </Field>

        <Field label="Team" htmlFor="teamId">
          <select id="teamId" name="teamId" className={inputClass} defaultValue="">
            <option value="">No team</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>

        <Field label="Priority" htmlFor="priority">
          <select id="priority" name="priority" className={inputClass} defaultValue="NORMAL">
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
          </select>
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink-900">Assign to</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {people.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-sm text-ink-900">
              <input type="checkbox" name="assigneeIds" value={p.id} className="size-4" />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? "Creating…" : "Create task"}
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
