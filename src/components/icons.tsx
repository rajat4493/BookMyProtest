import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({ width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "square" as const, strokeLinejoin: "miter" as const, "aria-hidden": true, ...p });

export const Arrow = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 12h15M13 6l6 6-6 6" /></svg>);
export const Check = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 12.5l5 5L20 6.5" /></svg>);
export const Bang = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 4v11M12 19v1" /></svg>);
export const Plus = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 4v16M4 12h16" /></svg>);
export const Back = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M20 12H5M11 6l-6 6 6 6" /></svg>);

/** Simple category glyphs, deliberately abstract. */
export function Glyph({ name, ...p }: { name: string } & SVGProps<SVGSVGElement>) {
  const paths: Record<string, string> = {
    permissions: "M5 4h10l4 4v12H5zM15 4v4h4M9 13h6M9 17h6",
    documents: "M6 3h9l3 3v15H6zM9 10h6M9 14h6M9 18h4",
    route: "M6 20a2 2 0 100-4 2 2 0 000 4zM18 8a2 2 0 100-4 2 2 0 000 4zM8 18h6a3 3 0 000-6h-4a3 3 0 010-6h6",
    sound: "M4 9v6h4l5 4V5L8 9zM17 9a4 4 0 010 6M19.5 6.5a8 8 0 010 11",
    transport: "M4 6h16v9H4zM4 11h16M7 18v2M17 18v2M7 15h.01M17 15h.01",
    water: "M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z",
    medical: "M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z",
    vendors: "M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9a2.7 2.7 0 005.3 0 2.7 2.7 0 005.4 0A2.7 2.7 0 0020 9M10 20v-5h4v5",
    safety: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
    logistics: "M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10",
  };
  return (<svg {...base(p)}><path d={paths[name] ?? paths.documents} /></svg>);
}
