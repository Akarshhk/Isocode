import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";
import { demoMode } from "@/lib/auth/otp";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Sign in" };

const DEMO = [
  { phone: "+919000000002", who: "Swati Joshi · T12-0408", role: "Resident (tenant): dues overdue, open complaint" },
  { phone: "+919000000003", who: "Aamir Shaikh · T21-1601", role: "Resident (owner): part paid" },
  { phone: "+919000000001", who: "Neeraj Kulkarni · T07-1203", role: "Resident (owner): fully paid" },
  { phone: "+919000000100", who: "Rekha Pawar", role: "Help desk and accounts" },
  { phone: "+919000000200", who: "Vaishali Apte", role: "Federation committee (read-only)" },
];

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8">
        <Logo />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-ink-3">Use the mobile number registered with your flat or staff account.</p>
      </div>
      <LoginForm demo={demoMode() ? DEMO : null} />
      <p className="mt-10 text-xs leading-relaxed text-ink-3">
        Your phone number and flat details are personal data under the DPDP Act 2023. They're used only to run
        maintenance billing, payments and complaints for your township.
      </p>
    </main>
  );
}
