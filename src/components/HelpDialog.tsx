import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { Icon } from "./Icon";

export function HelpDialog(props: {
  provisionalRules: boolean;
  returnFocus: HTMLElement;
  onClose: () => void;
}) {
  const [fallback, setFallback] = createSignal(false);
  let dialog!: HTMLDialogElement;
  let closed = false;
  let restoreBackground = () => {};
  const close = () => {
    if (closed) return;
    closed = true;
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    const returnFocus = props.returnFocus;
    props.onClose();
    queueMicrotask(() => { if (returnFocus.isConnected) returnFocus.focus({ preventScroll: true }); });
  };
  const controls = () => [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), [tabindex]:not([tabindex='-1'])")]
    .filter((element) => element.getClientRects().length > 0);
  const keepFocusInside = (event: FocusEvent) => {
    if (fallback() && !dialog.contains(event.target as Node | null)) controls()[0]?.focus({ preventScroll: true });
  };
  onMount(() => {
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const isolateBackground = () => {
      const background = [...document.querySelectorAll<HTMLElement>(".app-header, .app-main")].map((element) => ({
        element, inert: element.getAttribute("inert"), hidden: element.getAttribute("aria-hidden"),
      }));
      for (const { element } of background) { element.setAttribute("inert", ""); element.setAttribute("aria-hidden", "true"); }
      restoreBackground = () => {
        for (const { element, inert, hidden } of background) {
          if (inert === null) element.removeAttribute("inert"); else element.setAttribute("inert", inert);
          if (hidden === null) element.removeAttribute("aria-hidden"); else element.setAttribute("aria-hidden", hidden);
        }
      };
    };
    try {
      if (typeof dialog.showModal !== "function") throw new Error("Modal dialog unavailable");
      dialog.showModal();
    } catch {
      setFallback(true); dialog.setAttribute("open", ""); isolateBackground();
    }
    document.addEventListener("focusin", keepFocusInside);
    queueMicrotask(() => { if (!closed) controls()[0]?.focus({ preventScroll: true }); });
    onCleanup(() => {
      document.body.style.overflow = overflow;
      restoreBackground();
      document.removeEventListener("focusin", keepFocusInside);
    });
  });
  return <>
    <Show when={fallback()}><div class="help-dialog-backdrop" aria-hidden="true" onClick={close} /></Show>
    <dialog ref={(element) => { dialog = element; }} class="help-dialog" classList={{ "help-dialog--fallback": fallback() }}
      role="dialog" aria-modal="true" aria-labelledby="help-dialog-title" aria-describedby="help-dialog-intro"
      onCancel={(event) => { event.preventDefault(); close(); }} onClose={close}
      onClick={(event) => {
        if (event.target !== dialog) return;
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
      }} onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) { event.preventDefault(); event.stopPropagation(); }
        if (!fallback()) return;
        if (event.key === "Escape") { event.preventDefault(); close(); }
        else if (event.key === "Tab") {
          const first = controls()[0]; const last = controls().at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <div class="help-dialog-heading"><h2 id="help-dialog-title">How does it work?</h2>
        <button type="button" class="match-dialog-close" aria-label="Close help" onClick={close} autofocus><Icon name="close" size={20} /></button>
      </div>
      <div class="help-dialog-body" tabindex="0">
        <p id="help-dialog-intro" class="help-dialog-intro">Build your World Cup prediction, one match at a time. Your changes update instantly in this browser. No account needed.</p>
        <div class="help-dialog-grid">
          <section><h3>Pick the result</h3><p>Choose a team to win, or Draw in a pool match. We suggest the scores and tries. Open Details to change the margin, tries, exact scores or bonus points.</p></section>
          <section><h3>Fill the gaps</h3><p>Fill matches predicts unpicked games using world rankings, keeping your existing choices. Predict every pool match to unlock Knockout, then choose your path to the final.</p></section>
          <section><h3>Focus on a team</h3><p>Choose a Focus team to show the games that can affect its journey. Your other predictions stay intact. Choose All teams to see everything again.</p></section>
          <section><h3>Try another outcome</h3><p>Change a pick and watch the standings and bracket update. Undo and Redo let you explore; even Reset can be undone.</p></section>
          <section><h3>Share your prediction</h3><p>Share → Copy URL shares the full tournament. With a Focus team, Share pool matches creates an infographic. Switch Show predictions off for a fixture-only image. Download it, or Copy share link for a permanent image page.</p></section>
          <section><h3>Set your timezone</h3><p>Kickoff times use your device’s timezone. Change it in Settings; we’ll remember your choice.</p></section>
        </div>
        <Show when={props.provisionalRules}><p class="help-dialog-note">2027 qualification rules are provisional. See the rules and sources in the footer.</p></Show>
      </div>
      <div class="help-dialog-actions"><button type="button" onClick={close}>Got it</button></div>
    </dialog>
  </>;
}
