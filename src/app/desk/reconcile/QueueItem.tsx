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
    <div className="space-y-2">
      {candidates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {candidates.map((c) => (
            <form key={c.flatCode} action={action}>
              <input type="hidden" name="lineId" value={lineId} />
              <input type="hidden" name="flatCode" value={c.flatCode} />
              <SubmitButton variant="secondary" size="sm" title={c.why} pendingLabel="Posting…">
                Post to <span className="num">{c.flatCode}</span>
                <span className="hidden text-xs font-normal text-ink-3 sm:inline">· {c.why.toLowerCase()}</span>
              </SubmitButton>
            </form>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <form action={action} className="flex gap-2">
          <input type="hidden" name="lineId" value={lineId} />
          <label className="sr-only" htmlFor={`flat-${lineId}`}>
            Flat code
          </label>
          <input id={`flat-${lineId}`} name="flatCode" placeholder="T07-1203" required pattern="[Tt]\d{2}-\d{4}" className={`${inputClass} num w-32 py-1.5 text-sm`} />
          <SubmitButton size="sm" pendingLabel="Posting…">
            Post
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
