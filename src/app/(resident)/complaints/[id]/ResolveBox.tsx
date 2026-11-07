"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { closeComplaintAction, reopenComplaintAction } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { inputClass } from "@/components/ui";

export function ResolveBox({ id, canReopen }: { id: string; canReopen: boolean }) {
  const [rating, setRating] = useState(0);
  const [mode, setMode] = useState<"rate" | "reopen">("rate");

  if (mode === "reopen") {
    return (
      <form action={reopenComplaintAction} className="space-y-3">
        <input type="hidden" name="id" value={id} />
        <label htmlFor="reason" className="block text-sm font-medium">
          What&apos;s still wrong?
        </label>
        <input id="reason" name="reason" maxLength={300} placeholder="e.g. Still leaking after an hour" className={inputClass} />
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setMode("rate")} className="h-11 rounded-xl text-sm text-ink-2 hover:bg-sunken">
            Cancel
          </button>
          <SubmitButton variant="danger" pendingLabel="Reopening…">
            Reopen
          </SubmitButton>
        </div>
      </form>
    );
  }

  return (
    <form action={closeComplaintAction} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="rating" value={rating} />
      <div>
        <p className="text-sm font-medium">How was the fix?</p>
        <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onClick={() => setRating(n)}
              className="grid size-11 place-items-center rounded-xl hover:bg-sunken"
            >
              <Star size={26} className={n <= rating ? "fill-[#d79a12] text-[#d79a12]" : "text-line-strong"} />
            </button>
          ))}
        </div>
      </div>
      <SubmitButton full disabled={rating === 0} pendingLabel="Closing…">
        Yes, it&apos;s fixed. Close it
      </SubmitButton>
      {canReopen && (
        <button type="button" onClick={() => setMode("reopen")} className="w-full text-sm font-medium text-danger hover:underline">
          No, it&apos;s not fixed
        </button>
      )}
    </form>
  );
}
