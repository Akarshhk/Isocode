import { describe, expect, it } from "vitest";
import { canViewFlat } from "@/lib/auth/access";
import { normalisePhone } from "@/lib/auth/phone";
import { rolesForPath } from "@/lib/auth/token";
import { hashOtp, otpMatches } from "@/lib/auth/otp";

const resident = { sub: "u1", role: "RESIDENT" as const, name: "Swati", flatId: "flatA" };
const staff = { sub: "u2", role: "STAFF" as const, name: "Rekha", flatId: null };
const committee = { sub: "u3", role: "COMMITTEE" as const, name: "Vaishali", flatId: null };

describe("flat access", () => {
  it("lets a resident see only their own flat", () => {
    expect(canViewFlat(resident, "flatA")).toBe(true);
    expect(canViewFlat(resident, "flatB")).toBe(false);
  });
  it("lets staff see any flat, committee none, and nobody signed out", () => {
    expect(canViewFlat(staff, "flatB")).toBe(true);
    expect(canViewFlat(committee, "flatA")).toBe(false);
    expect(canViewFlat(null, "flatA")).toBe(false);
  });
});

describe("route roles", () => {
  it("keeps residents out of the desk and staff out of resident pages", () => {
    expect(rolesForPath("/desk/reconcile")).toEqual(["STAFF"]);
    expect(rolesForPath("/dues")).toEqual(["RESIDENT"]);
    expect(rolesForPath("/committee")).toContain("COMMITTEE");
    expect(rolesForPath("/committee")).not.toContain("RESIDENT");
    expect(rolesForPath("/login")).toBeNull();
  });
  it("doesn't match a prefix that merely starts the same", () => {
    expect(rolesForPath("/deskx")).toBeNull();
  });
});

describe("phone numbers", () => {
  it.each([
    ["9000000001", "+919000000001"],
    ["+91 90000 00001", "+919000000001"],
    ["09000000001", "+919000000001"],
    ["919000000001", "+919000000001"],
  ])("%s -> %s", (raw, e164) => expect(normalisePhone(raw)).toBe(e164));
  it("rejects non-mobile numbers", () => {
    expect(normalisePhone("12345")).toBeNull();
    expect(normalisePhone("5000000001")).toBeNull();
  });
});

describe("OTP hashing", () => {
  it("matches only the right code for the right phone", () => {
    process.env.SESSION_SECRET = "x".repeat(40);
    const h = hashOtp("+919000000001", "123456");
    expect(otpMatches("+919000000001", "123456", h)).toBe(true);
    expect(otpMatches("+919000000001", "123457", h)).toBe(false);
    expect(otpMatches("+919000000002", "123456", h)).toBe(false);
  });
});
