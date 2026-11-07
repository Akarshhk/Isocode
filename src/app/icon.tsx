import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: 64, height: 64, borderRadius: 16, background: "#1d5c48", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="38" height="38" viewBox="0 0 32 32">
          <path d="M6 26V13l10-6 10 6v13" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinejoin="round" />
          <path d="M12.5 26v-7h7v7" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinejoin="round" />
        </svg>
      </div>
    ),
    size,
  );
}
