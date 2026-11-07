import { redirect } from "next/navigation";

// Middleware sends signed-in users to their home; this is the fallback.
export default function Index() {
  redirect("/login");
}
