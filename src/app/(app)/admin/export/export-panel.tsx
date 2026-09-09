"use client";

import { useState } from "react";
import { Field, buttonClass, inputClass, secondaryButtonClass } from "@/components/ui";

const DATASETS = [
  {
    id: "people",
    name: "People and progress",
    description: "One row per person: team, designation, mentor, work logs, weekly reports and tasks.",
  },
  {
    id: "teams",
    name: "Team summary",
    description: "One row per team: headcount, submissions, tasks outstanding and overdue.",
  },
  {
    id: "work-logs",
    name: "Work logs",
    description: "Every daily log in the range, with what was done and what was blocking.",
  },
  {
    id: "tasks",
    name: "Tasks and assignments",
    description: "Every task with its assignees, deadline, submission date and whether it ran past.",
  },
] as const;

export function ExportPanel({
  defaultFrom,
  defaultTo,
}: {
  defaultFrom: string;
  defaultTo: string;
}) {
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const query = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="From" htmlFor="from">
          <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className={inputClass} />
        </Field>
        <Field label="To" htmlFor="to">
          <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className={inputClass} />
        </Field>
      </div>

      <ul className="space-y-3">
        {DATASETS.map((dataset, index) => (
          <li key={dataset.id} className="rounded-lg border border-cream-300 bg-cream-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink-900">{dataset.name}</p>
                <p className="mt-1 text-sm text-ink-500">{dataset.description}</p>
              </div>
              <a
                href={`/api/export/${dataset.id}${query}`}
                download
                className={index === 0 ? buttonClass : secondaryButtonClass}
              >
                Download CSV
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
