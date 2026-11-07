"use client";

import { Printer } from "lucide-react";
import { Button } from "./ui";

export function PrintButton() {
  return (
    <Button variant="secondary" size="sm" onClick={() => window.print()}>
      <Printer size={16} aria-hidden /> Print or save PDF
    </Button>
  );
}
