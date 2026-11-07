"use client";

import { useActionState } from "react";
import { generateBillsAction, type BillingState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/ui";

export function GenerateForm({ period, label, flats }: { period: string; label: string; flats: number }) {
  const [state, action] = useActionState<BillingState, FormData>(generateBillsAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="period" value={period} />
      <SubmitButton pendingLabel="Issuing bills…">Issue {label} bills for {flats} flats</SubmitButton>
      {state.ok && <Notice tone="ok">{state.ok}</Notice>}
      {state.error && <Notice tone="danger">{state.error}</Notice>}
    </form>
  );
}
