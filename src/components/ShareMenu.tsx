import { Show, createEffect, createSignal, createUniqueId, onCleanup, onMount } from "solid-js";
import type { Team } from "../domain/types";
import { Icon } from "./Icon";

export function ShareMenu(props: {
  team?: Team;
  disabled?: boolean;
  sharing: boolean;
  onCopy: () => void;
  onPool: (returnFocus: HTMLButtonElement) => void;
}) {
  const id = `share-${createUniqueId()}`;
  const [open, setOpen] = createSignal(false);
  let root!: HTMLDivElement;
  let trigger!: HTMLButtonElement;
  let copy!: HTMLButtonElement;
  let pool!: HTMLButtonElement;
  const close = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) trigger.focus({ preventScroll: true });
  };
  createEffect(() => { if (props.disabled) close(); });
  onMount(() => {
    const outside = (event: PointerEvent) => { if (!root.contains(event.target as Node)) close(); };
    document.addEventListener("pointerdown", outside);
    onCleanup(() => document.removeEventListener("pointerdown", outside));
  });
  return <div class="share-menu" ref={(element) => { root = element; }} onFocusOut={(event) => {
    if (!root.contains(event.relatedTarget as Node | null)) close();
  }}>
    <button type="button" class="copy-button" ref={(element) => { trigger = element; }}
      aria-label="Share" aria-haspopup="dialog" aria-expanded={open()} aria-controls={open() ? id : undefined}
      disabled={props.disabled} aria-busy={props.sharing} onClick={() => {
        if (open()) close(true);
        else {
          setOpen(true);
          queueMicrotask(() => { if (open()) (props.sharing && props.team ? pool : copy).focus({ preventScroll: true }); });
        }
      }}><Icon name="share" /><span>Share</span></button>
    <Show when={open()}><div id={id} class="share-popover" role="dialog" aria-label="Share predictions" onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
      else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const buttons = [copy, pool].filter((button) => !button.disabled);
        if (!buttons.length) return;
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 :
          (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus({ preventScroll: true });
      }
    }}>
      <button type="button" class="share-option" ref={(element) => { copy = element; }}
        aria-label="Copy URL - Share Full Tournament" disabled={props.sharing} onClick={() => { close(true); props.onCopy(); }}>
        <Icon name="link" size={20} /><span><strong>Copy URL</strong><small>Share full tournament</small></span>
      </button>
      <button type="button" class="share-option" ref={(element) => { pool = element; }}
        aria-label={props.team ? `Share Pool Matches - ${props.team.name}` : "Share Pool Matches"}
        disabled={!props.team} onClick={() => { close(true); props.onPool(trigger); }}>
        <Icon name="image" size={20} /><span><strong>Share pool matches</strong><small>{props.team?.name ?? "Choose a Focus team first"}</small></span>
      </button>
    </div></Show>
  </div>;
}
