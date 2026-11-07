import { ImageResponse } from "next/og";

// App icons for the installable web app, drawn at request time (no binary files in the repo).
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const px = size === "512" ? 512 : 192;
  return new ImageResponse(
    (
      <div style={{ width: px, height: px, background: "#1d5c48", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={px * 0.56} height={px * 0.56} viewBox="0 0 32 32">
          <path d="M6 26V13l10-6 10 6v13" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" />
          <path d="M12.5 26v-7h7v7" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    { width: px, height: px },
  );
}
