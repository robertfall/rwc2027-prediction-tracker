import { For } from "solid-js";

const paths = {
  check: ["m5 12 4 4L19 6"],
  sliders: ["M4 6h6m4 0h6M4 12h11m4 0h1M4 18h2m4 0h10", "M10 3v6m5 0v6M6 15v6"],
  close: ["m6 6 12 12M6 18 18 6"],
  undo: ["m8 4-5 5 5 5M3 9h10a6 6 0 0 1 0 12"],
  redo: ["m16 4 5 5-5 5M21 9H11a6 6 0 0 0 0 12"],
  reset: ["M3 10a9 9 0 1 1 2 9M3 4v6h6"],
  link: ["m10 13 4-4M9 15l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"],
  share: ["M12 15V3m-4 4 4-4 4 4M5 11v9h14v-9"],
  image: ["M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5", "M8 7h.01"],
  gear: ["m9.8 2-.6 2.9-2 .9-2.6-1.5-2.2 3.8 2.1 1.9v4l-2.1 1.9 2.2 3.8 2.6-1.5 2 .9.6 2.9h4.4l.6-2.9 2-.9 2.6 1.5 2.2-3.8-2.1-1.9v-4l2.1-1.9-2.2-3.8-2.6 1.5-2-.9L14.2 2z", "M15.5 12a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0"],
  lock: ["M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4"],
  "chevron-right": ["m9 5 7 7-7 7"],
  grid: ["M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"],
  calendar: ["M4 5h16v16H4zM8 2v6m8-6v6M4 10h16"],
  bracket: ["M3 4h5v5h5m-10 6h5v-6m5 0v6h8m-8 5v-5M3 20h5v-5"],
  trophy: ["M7 3h10v7a5 5 0 0 1-10 0zM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 15v6m-5 0h10"],
  "arrow-right": ["M4 12h16m-6-6 6 6-6 6"],
} as const;

export function Icon(props: { name: keyof typeof paths; size?: number; class?: string }) {
  return <svg class={props.class} width={props.size ?? 16} height={props.size ?? 16} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true"><For each={paths[props.name]}>{(d) => <path d={d} />}</For></svg>;
}
