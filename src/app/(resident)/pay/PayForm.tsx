"use client";

import { useActionState, useState } from "react";
import { payAction, type PayState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice } from "@/components/ui";
import { Smartphone, CreditCard, Landmark } from "lucide-react";

const METHODS = [
  { id: "UPI", label: "UPI", icon: Smartphone },
  { id: "CARD", label: "Card", icon: CreditCard },
  { id: "NETBANKING", label: "Net banking", icon: Landmark },
] as const;

export function PayForm({ defaultAmount, idempotencyKey }: { defaultAmount: number; idempotencyKey: string }) {
  const [state, action] = useActionState<PayState, FormData>(payAction, {});
  const [method, setMethod] = useState<string>("UPI");
  const [amount, setAmount] = useState(String(defaultAmount / 100));

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <input type="hidden" name="method" value={method} />

      <div>
        <label htmlFor="amount" className="mb-1.5 block text-sm font-medium">
          Amount
        </label>
        <div className="flex items-center rounded-xl border border-line-strong bg-surface px-3.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
          <span className="text-xl text-ink-3">₹</span>
          <input
            id="amount"
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            required
            className="num block w-full bg-transparent px-2 py-3 text-2xl font-semibold focus:outline-none"
          />
        </div>
        <p className="mt-1.5 text-xs text-ink-3">You can pay part of the amount. The rest stays due.</p>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Pay with</legend>
        <div className="grid grid-cols-3 gap-2">
          {METHODS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMethod(m.id)}
              aria-pressed={method === m.id}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm ${
                method === m.id ? "border-brand bg-brand-soft font-medium text-brand" : "border-line-strong bg-surface text-ink-2 hover:bg-sunken"
              }`}
            >
              <m.icon size={20} aria-hidden />
              {m.label}
            </button>
          ))}
        </div>
      </fieldset>

      {state.error && (
        <Notice tone="danger" title={state.failed ? "Payment failed" : "Can't pay that amount"}>
          {state.error}
        </Notice>
      )}

      <div className="space-y-2">
        <SubmitButton name="outcome" value="success" full size="lg" pendingLabel="Processing…">
          Pay ₹{Number(amount || 0).toLocaleString("en-IN")}
        </SubmitButton>
        <SubmitButton name="outcome" value="failure" variant="ghost" full size="md" pendingLabel="Processing…">
          Simulate a declined payment
        </SubmitButton>
      </div>
    </form>
  );
}
