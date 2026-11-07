import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Township: dues and complaints",
    short_name: "Township",
    description: "Pay maintenance, raise complaints and track them.",
    start_url: "/home",
    display: "standalone",
    background_color: "#f6f5f2",
    theme_color: "#1d5c48",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
