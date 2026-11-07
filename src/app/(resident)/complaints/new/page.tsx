import type { Metadata } from "next";
import { requireResident } from "@/lib/auth/session";
import { Card, PageHeader } from "@/components/ui";
import { NewComplaintForm } from "./NewComplaintForm";

export const metadata: Metadata = { title: "New complaint" };

export default async function NewComplaintPage() {
  await requireResident();
  return (
    <div>
      <PageHeader title="Raise a complaint" back={{ href: "/complaints", label: "Complaints" }} />
      <Card className="p-5">
        <NewComplaintForm />
      </Card>
    </div>
  );
}
