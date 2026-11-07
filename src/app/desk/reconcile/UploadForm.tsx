"use client";

import { useActionState, useState } from "react";
import { Upload } from "lucide-react";
import { uploadStatementAction, type UploadState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/ui";

export function UploadForm() {
  const [state, action] = useActionState<UploadState, FormData>(uploadStatementAction, {});
  const [name, setName] = useState<string | null>(null);
  return (
    <form action={action} className="space-y-3">
      <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong bg-canvas px-4 py-6 text-center hover:bg-sunken">
        <Upload size={20} className="text-ink-3" aria-hidden />
        <span className="text-sm font-medium">{name ?? "Choose a bank statement (.csv)"}</span>
        <span className="text-xs text-ink-3">Date, Narration, Ref, Debit, Credit columns. Up to 2 MB or 5,000 rows.</span>
        <input type="file" name="file" accept=".csv,text/csv" required className="sr-only" onChange={(e) => setName(e.target.files?.[0]?.name ?? null)} />
      </label>
      {state.error && (
        <Notice tone="danger" title={state.error}>
          {state.details && state.details.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {state.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </Notice>
      )}
      <SubmitButton full pendingLabel="Matching rows…">
        Upload and match
      </SubmitButton>
    </form>
  );
}
