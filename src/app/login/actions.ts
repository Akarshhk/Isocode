"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalisePhone, formatPhone } from "@/lib/auth/phone";
import { OTP_MAX_ATTEMPTS, OTP_MAX_PER_10_MIN, OTP_TTL_MINUTES, demoMode, generateOtp, hashOtp, otpMatches } from "@/lib/auth/otp";
import { startSession, endSession } from "@/lib/auth/session";
import { HOME_FOR_ROLE, sessionSecretProblem } from "@/lib/auth/token";

export type LoginState =
  | { step: "phone"; error?: string; phone?: string }
  | { step: "code"; challengeId: string; phone: string; phoneDisplay: string; demoCode?: string; error?: string };

async function requestCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const raw = String(formData.get("phone") ?? "").slice(0, 20);
  const phone = normalisePhone(raw);
  if (!phone) return { step: "phone", error: "Enter a 10-digit Indian mobile number.", phone: raw };

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.active) {
    // Outside demo mode, don't reveal whether a number is registered.
    return demoMode()
      ? { step: "phone", error: "This number isn't linked to a flat or staff account. Try one of the demo accounts below.", phone: raw }
      : { step: "phone", error: "If this number is registered, a code is on its way. Otherwise contact the help desk.", phone: raw };
  }

  const recent = await prisma.otpChallenge.count({ where: { phone, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } } });
  if (recent >= OTP_MAX_PER_10_MIN) {
    return { step: "phone", error: "Too many codes requested. Wait a few minutes and try again.", phone: raw };
  }

  const code = generateOtp();
  const challenge = await prisma.otpChallenge.create({
    data: { phone, codeHash: hashOtp(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000) },
  });
  // Mock SMS. The code itself is never stored in plain text.
  await prisma.notification.create({ data: { userId: user.id, channel: "SMS", body: "Your Township sign-in code was sent (valid 5 minutes)." } });

  return { step: "code", challengeId: challenge.id, phone, phoneDisplay: formatPhone(phone), demoCode: demoMode() ? code : undefined };
}

const VerifySchema = z.object({ challengeId: z.string().min(1).max(40), code: z.string().regex(/^\d{6}$/) });

async function verifyCode(prev: LoginState, formData: FormData): Promise<LoginState> {
  if (prev.step !== "code") return { step: "phone" };
  const parsed = VerifySchema.safeParse({ challengeId: formData.get("challengeId"), code: String(formData.get("code") ?? "").replace(/\s/g, "") });
  if (!parsed.success) return { ...prev, error: "Enter the 6-digit code." };

  const ch = await prisma.otpChallenge.findUnique({ where: { id: parsed.data.challengeId } });
  if (!ch || ch.phone !== prev.phone || ch.consumedAt) return { step: "phone", error: "That code has already been used. Request a new one." };
  if (ch.expiresAt < new Date()) return { step: "phone", error: "That code has expired. Request a new one.", phone: prev.phoneDisplay };
  if (ch.attempts >= OTP_MAX_ATTEMPTS) return { step: "phone", error: "Too many wrong attempts. Request a new code." };

  if (!otpMatches(ch.phone, parsed.data.code, ch.codeHash)) {
    await prisma.otpChallenge.update({ where: { id: ch.id }, data: { attempts: { increment: 1 } } });
    const left = OTP_MAX_ATTEMPTS - ch.attempts - 1;
    return { ...prev, error: left > 0 ? `Wrong code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Too many wrong attempts. Request a new code." };
  }

  // Consume atomically so the same code can't be used twice in parallel.
  const consumed = await prisma.otpChallenge.updateMany({ where: { id: ch.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (consumed.count !== 1) return { step: "phone", error: "That code has already been used. Request a new one." };

  const user = await prisma.user.findUnique({ where: { phone: ch.phone }, include: { membership: true } });
  if (!user || !user.active) return { step: "phone", error: "This account is not active." };
  if (user.role === "RESIDENT" && !user.membership) return { step: "phone", error: "This number isn't linked to a flat yet. Contact the help desk." };

  await startSession({ sub: user.id, role: user.role, name: user.name, flatId: user.membership?.flatId ?? null });
  redirect(HOME_FOR_ROLE[user.role]);
}

/** One action for the whole sign-in form: the submit button's intent picks the step. */
export async function loginAction(prev: LoginState, formData: FormData): Promise<LoginState> {
  const intent = formData.get("intent");
  if (intent === "reset") return { step: "phone" };
  // Without a valid secret no session can be signed: say so instead of failing after the code is entered.
  if (sessionSecretProblem()) {
    return { step: "phone", error: "Sign-in isn't set up on this server yet (SESSION_SECRET). An administrator can check /api/health." };
  }
  if (intent === "verify") return verifyCode(prev, formData);
  return requestCode(prev, formData);
}

export async function signOut() {
  await endSession();
  redirect("/login");
}
