import { For, Show, createEffect, createMemo, createSignal, createUniqueId, on, onCleanup, onMount } from "solid-js";
import type { Team } from "../domain/types";
import { Icon } from "./Icon";
import { TeamLabel } from "./TeamLabel";

export function TeamFocusPicker(props: {
  teams: readonly Team[];
  value?: string;
  disabled?: boolean;
  onChange: (teamId?: string) => void;
}) {
  const listId = `team-focus-${createUniqueId()}`;
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(0);
  let root!: HTMLDivElement;
  let trigger!: HTMLButtonElement;
  let list: HTMLDivElement | undefined;
  let typed = "";
  let typedAt = 0;
  const options = createMemo(() => [undefined, ...[...props.teams].sort((first, second) => first.name.localeCompare(second.name, "en"))]);
  const selected = () => props.teams.find((team) => team.id === props.value);
  const selectedIndex = () => Math.max(0, options().findIndex((team) => team?.id === props.value));
  const optionId = (index: number) => `${listId}-${index}`;

  function show() {
    trigger.focus({ preventScroll: true });
    setActive(selectedIndex());
    typed = "";
    typedAt = 0;
    setOpen(true);
  }

  function choose(index: number) {
    props.onChange(options()[index]?.id);
    setOpen(false);
    trigger.focus();
  }

  function keyDown(event: KeyboardEvent) {
    if (event.key === "Escape" || (event.altKey && event.key === "ArrowUp")) {
      if (open()) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
      return;
    }
    if (event.key === "Tab") { setOpen(false); return; }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open()) choose(active());
      else show();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const wasOpen = open();
      if (!wasOpen) show();
      if (event.key === "Home") setActive(0);
      else if (event.key === "End") setActive(options().length - 1);
      else if (wasOpen) setActive((active() + (event.key === "ArrowDown" ? 1 : -1) + options().length) % options().length);
      return;
    }
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
    event.preventDefault();
    if (!open()) show();
    const now = Date.now();
    typed = now - typedAt < 700 ? typed + event.key.toLocaleLowerCase() : event.key.toLocaleLowerCase();
    typedAt = now;
    const query = [...typed].every((letter) => letter === typed[0]) ? typed[0] : typed;
    const start = active() + (query.length === 1 ? 1 : 0);
    for (let offset = 0; offset < options().length; offset++) {
      const index = (start + offset) % options().length;
      if ((options()[index]?.name ?? "All teams").toLocaleLowerCase().startsWith(query)) {
        setActive(index);
        break;
      }
    }
  }

  createEffect(on(() => [props.teams, props.disabled] as const, () => setOpen(false)));
  createEffect(() => {
    if (!open()) return;
    const index = active();
    queueMicrotask(() => {
      if (!open() || !list) return;
      const option = list.children[index] as HTMLElement | undefined;
      if (!option) return;
      if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
      else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
      }
    });
  });
  onMount(() => {
    const outside = (event: PointerEvent) => { if (!root.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    onCleanup(() => document.removeEventListener("pointerdown", outside));
  });

  return <div class="team-focus" ref={(element) => { root = element; }} onFocusOut={(event) => {
    if (event.relatedTarget && !root.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <span class="control-caption">Focus</span>
    <button ref={(element) => { trigger = element; }} type="button" class="team-focus-trigger" role="combobox" aria-label="Focus"
      aria-haspopup="listbox" aria-expanded={open()} aria-controls={open() ? listId : undefined}
      aria-activedescendant={open() ? optionId(active()) : undefined} data-team-id={props.value ?? ""}
      disabled={props.disabled} title="Show this team’s pool, predicted route and undecided opponent feeders."
      onKeyDown={keyDown} onClick={() => { if (open()) setOpen(false); else show(); }}>
      <TeamLabel team={selected()} fallback="All teams" />
      <Icon name="chevron-right" class="team-focus-chevron" />
    </button>
    <Show when={open()}><div ref={(element) => { list = element; }} id={listId} class="team-focus-list" role="listbox" aria-label="Focus teams">
      <For each={options()}>{(team, index) => <button type="button" id={optionId(index())}
        class="team-focus-option" classList={{ "is-active": active() === index() }} role="option" tabindex="-1"
        aria-selected={(team?.id ?? "") === (props.value ?? "")} data-team-id={team?.id ?? ""}
        onPointerDown={(event) => { if (event.pointerType === "mouse") event.preventDefault(); }}
        onPointerMove={(event) => { if (event.pointerType === "mouse") setActive(index()); }}
        onClick={() => choose(index())}>
        <TeamLabel team={team} fallback="All teams" />
        <Show when={(team?.id ?? "") === (props.value ?? "")}><Icon name="check" /></Show>
      </button>}</For>
    </div></Show>
  </div>;
}
