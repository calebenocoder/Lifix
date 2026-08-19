import type { SVGProps } from "react";
import type { PanelIconId } from "./workspace";

export type IconName = PanelIconId | "pointer" | "zoom" | "more" | "theme";
const paths: Readonly<Record<IconName, string>> = {
  panel: "M4 4h16v16H4zM4 9h16", sliders: "M4 7h10m4 0h2M4 17h2m4 0h10M14 4v6M6 14v6", grid: "M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z", info: "M12 11v6m0-10v.01M4 12a8 8 0 1 0 16 0 8 8 0 1 0-16 0", pointer: "M6 3l11 9-6 1 3 6-2 1-3-6-4 4z", zoom: "M10 4a6 6 0 1 0 0 12 6 6 0 1 0 0-12m5 11 5 5M10 7v6m-3-3h6", more: "M6 12h.01M12 12h.01M18 12h.01", theme: "M12 3a9 9 0 1 0 9 9c0-1.1-.9-2-2-2h-2.2a2 2 0 0 1-1.8-2.9l1-2A9 9 0 0 0 12 3z",
};
export function Icon({ name, ...props }: { readonly name: IconName } & Omit<SVGProps<SVGSVGElement>, "children">) { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}><path d={paths[name]} /></svg>; }
