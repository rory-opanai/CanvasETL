import type { ReactNode } from "react";

export const metadata = {
  title: "CanvasApp MCP Server",
  description: "MCP server for summarizing chat context"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
