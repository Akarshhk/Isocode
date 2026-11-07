"use client";

import { useActionState } from "react";
import { postToFlatAction, ignoreLineAction, type ResolveState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { inputClass } from "@/components/ui";

type Candidate = { flatCode: string; why: string };

export function QueueActions({ lineId, candidates }: { lineId: string; candidates: Candidate[] }) {
  const [state, action] = useActionState<ResolveState, FormData>(postToFlatAction, {});
  if (state.ok) return <p className="text-sm font-medium text-ok">{state.ok}</p>;
  return (
    <div className="space-y-3">
      {candidates.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">Suggestions</p>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {candidates.map((c) => (
              <li key={c.flatCode} className="flex items-center gap-3 px-3 py-2">
                <span className="num shrink-0 whitespace-nowrap text-sm font-medium">{c.flatCode}</span>
                <span className="min-w-0 flex-1 text-xs text-ink-3">{c.why}</span>
                <form action={action}>
                  <input type="hidden" name="lineId" value={lineId} />
                  <input type="hidden" name="flatCode" value={c.flatCode} />
                  <SubmitButton variant="secondary" size="sm" pendingLabel="…">
                    Post
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <form action={action} className="flex gap-2">
          <input type="hidden" name="lineId" value={lineId} />
          <label className="sr-only" htmlFor={`flat-${lineId}`}>
            Flat code
          </label>
          <input
            id={`flat-${lineId}`}
            name="flatCode"
            placeholder="T07-1203"
            required
            pattern="[Tt]\d{2}-\d{4}"
            title="Flat code like T07-1203"
            className={`${inputClass} num w-32 py-1.5 text-sm`}
          />
          <SubmitButton size="sm" pendingLabel="Posting…">
            Post to flat
          </SubmitButton>
        </form>
        <form action={ignoreLineAction}>
          <input type="hidden" name="lineId" value={lineId} />
          <SubmitButton variant="ghost" size="sm" pendingLabel="…">
            Not maintenance
          </SubmitButton>
        </form>
      </div>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
    </div>
  );
}
