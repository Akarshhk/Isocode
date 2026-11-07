import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-sm flex-col items-center justify-center px-4 text-center">
      <p className="text-lg font-semibold">Not found</p>
      <p className="mt-1 text-sm text-ink-3">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <LinkButton href="/" className="mt-5">
        Go home
      </LinkButton>
    </main>
  );
}
