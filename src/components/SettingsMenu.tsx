import { For, Show, createMemo, createSignal, createUniqueId, onCleanup, onMount } from "solid-js";
import { listTimeZones, systemTimeZone } from "../state/timezone-preference";
import { Icon } from "./Icon";

export function SettingsMenu(props: {
  timeZone?: string;
  onChange: (timeZone?: string) => void;
}) {
  const id = `settings-${createUniqueId()}`;
  const [open, setOpen] = createSignal(false);
  const zones = createMemo(() => listTimeZones(props.timeZone));
  const systemZone = systemTimeZone();
  const label = (zone: string) => zone.replaceAll("_", " ").replaceAll("/", " / ");
  let root!: HTMLDivElement;
  let trigger!: HTMLButtonElement;
  let select!: HTMLSelectElement;
  const close = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) trigger.focus({ preventScroll: true });
  };
  onMount(() => {
    const outside = (event: PointerEvent) => { if (!root.contains(event.target as Node)) close(); };
    document.addEventListener("pointerdown", outside);
    onCleanup(() => document.removeEventListener("pointerdown", outside));
  });

  return <div class="settings-menu" ref={(element) => { root = element; }} onFocusOut={(event) => {
    if (!root.contains(event.relatedTarget as Node | null)) close();
  }}>
    <button type="button" class="settings-button" ref={(element) => { trigger = element; }}
      aria-label="Settings" title="Settings" aria-haspopup="dialog" aria-expanded={open()}
      aria-controls={open() ? id : undefined} onClick={() => {
        if (open()) close(true);
        else {
          setOpen(true);
          queueMicrotask(() => { if (open()) select.focus({ preventScroll: true }); });
        }
      }}><Icon name="gear" /></button>
    <Show when={open()}><div id={id} class="settings-popover" role="dialog" aria-label="Settings"
      onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
      }}>
      <label for={`${id}-timezone`}>Timezone</label>
      <select id={`${id}-timezone`} ref={(element) => { select = element; }} value={props.timeZone ?? ""}
        onChange={(event) => props.onChange(event.currentTarget.value || undefined)}>
        <option value="">System timezone ({label(systemZone)})</option>
        <For each={zones()}>{(zone) => <option value={zone}>{label(zone)}</option>}</For>
      </select>
    </div></Show>
  </div>;
}
