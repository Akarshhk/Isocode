"use client";

import { useActionState, useRef } from "react";
import { loginAction, type LoginState } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice, inputClass } from "@/components/ui";

type Demo = { phone: string; who: string; role: string };

export function LoginForm({ demo }: { demo: Demo[] | null }) {
  const [state, action] = useActionState<LoginState, FormData>(loginAction, { step: "phone" });
  const phoneRef = useRef<HTMLInputElement>(null);

  if (state.step === "code") {
    return (
      <form action={action} className="space-y-4" key={state.challengeId}>
        <input type="hidden" name="challengeId" value={state.challengeId} />
        <p className="text-sm text-ink-2">
          Enter the 6-digit code sent to <span className="num font-medium text-ink">{state.phoneDisplay}</span>.
        </p>
        {state.demoCode && (
          <Notice tone="info" title="Demo mode: no SMS is sent">
            Your code is <span className="num font-semibold tracking-widest text-ink">{state.demoCode}</span>
          </Notice>
        )}
        <div>
          <label htmlFor="code" className="sr-only">
            One-time code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            placeholder="••••••"
            className={`${inputClass} num text-center text-2xl tracking-[0.5em]`}
          />
        </div>
        {state.error && (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        )}
        <SubmitButton name="intent" value="verify" full size="lg" pendingLabel="Checking…">
          Verify and sign in
        </SubmitButton>
        <button type="submit" name="intent" value="reset" formNoValidate className="w-full text-sm text-ink-3 hover:text-ink">
          Use a different number
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="phone" className="mb-1.5 block text-sm font-medium text-ink">
            Mobile number
          </label>
          <div className="flex rounded-xl border border-line-strong bg-surface focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20">
            <span className="num grid place-items-center pl-3.5 pr-1 text-[15px] text-ink-3">+91</span>
            <input
              ref={phoneRef}
              id="phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              required
              defaultValue={state.phone ?? ""}
              placeholder="90000 00001"
              className="num block w-full rounded-xl bg-transparent px-2 py-3 text-[17px] text-ink placeholder:text-ink-3 focus:outline-none"
            />
          </div>
        </div>
        {state.error && (
          <p className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        )}
        <SubmitButton name="intent" value="request" full size="lg" pendingLabel="Sending…">
          Send code
        </SubmitButton>
      </form>

      {demo && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-3">Demo accounts · tap to fill</p>
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {demo.map((d) => (
              <li key={d.phone}>
                <button
                  type="button"
                  onClick={() => {
                    if (phoneRef.current) {
                      phoneRef.current.value = d.phone.replace("+91", "");
                      phoneRef.current.focus();
                    }
                  }}
                  className="flex w-full items-center justify-between gap-3 bg-surface px-3.5 py-2.5 text-left hover:bg-sunken"
                >
                  <span>
                    <span className="block text-sm font-medium text-ink">{d.who}</span>
                    <span className="block text-xs text-ink-3">{d.role}</span>
                  </span>
                  <span className="num shrink-0 text-xs text-ink-3">{d.phone.slice(3, 8) + " " + d.phone.slice(8)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
