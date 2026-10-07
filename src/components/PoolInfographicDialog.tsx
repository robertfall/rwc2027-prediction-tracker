import { Show, createSignal, onCleanup, onMount } from "solid-js";
import type { DerivedScenario, Scenario } from "../domain/types";
import { capturePosterSnapshot, type createPosterClient } from "../sharing/poster-client";
import { beginClipboardWrite } from "../sharing/clipboard";
import { Icon } from "./Icon";

interface ImageDownload {
  url: string;
  format: "PNG" | "SVG";
  status: string;
  png?: Blob;
}

interface ImageVariant {
  preview: string;
  filename: string;
  download: Promise<ImageDownload | undefined>;
}

export function PoolInfographicDialog(props: {
  derived: DerivedScenario;
  scenario: Scenario;
  teamId: string;
  timeZone?: string;
  posterClient: ReturnType<typeof createPosterClient>;
  returnFocus: HTMLElement;
  onClose: () => void;
}) {
  const team = () => props.derived.tournament.teams.find((team) => team.id === props.teamId)!;
  const [preview, setPreview] = createSignal("");
  const [download, setDownload] = createSignal("");
  const [filename, setFilename] = createSignal("");
  const [format, setFormat] = createSignal<"PNG" | "SVG">("PNG");
  const [status, setStatus] = createSignal("Creating your image…");
  const [failed, setFailed] = createSignal(false);
  const [fallback, setFallback] = createSignal(false);
  const [showPredictions, setShowPredictions] = createSignal(true);
  const [readyDownload, setReadyDownload] = createSignal<ImageDownload>();
  const [publishing, setPublishing] = createSignal(false);
  const [shareStatus, setShareStatus] = createSignal("");
  const [shareUrl, setShareUrl] = createSignal("");
  const [imageUrl, setImageUrl] = createSignal("");
  const capturedHref = window.location.href;
  const variants = new Map<boolean, Promise<ImageVariant | undefined>>();
  const urls = new Set<string>();
  let dialog!: HTMLDialogElement;
  let shareInput: HTMLInputElement | undefined;
  let disposed = false;
  let closed = false;
  let generation = 0;
  const blobUrl = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    urls.add(url);
    return url;
  };
  const close = () => {
    if (closed) return;
    closed = true;
    if (dialog.open && typeof dialog.close === "function") dialog.close();
    const returnFocus = props.returnFocus;
    props.onClose();
    queueMicrotask(() => { if (returnFocus.isConnected) returnFocus.focus({ preventScroll: true }); });
  };
  async function prepare(includePredictions: boolean): Promise<ImageVariant | undefined> {
    const derived = props.derived; const teamId = props.teamId;
    const { createPoolInfographic, rasterizePoolInfographic } = await import("../sharing/pool-infographic");
    if (disposed) return;
    const artifact = await createPoolInfographic(derived, teamId, { showPredictions: includePredictions, timeZone: props.timeZone });
    if (disposed) return;
    const svgUrl = blobUrl(new Blob([artifact.svg], { type: "image/svg+xml;charset=utf-8" }));
    const imageDownload = (async (): Promise<ImageDownload | undefined> => {
      try {
        const png = await rasterizePoolInfographic(artifact.svg);
        if (disposed) return;
        return { url: blobUrl(png), format: "PNG", status: "", png };
      } catch {
        if (disposed) return;
        return { url: svgUrl, format: "SVG", status: "Your browser can save this image as SVG." };
      }
    })();
    return { preview: svgUrl, filename: artifact.filename, download: imageDownload };
  }
  async function create() {
    const current = ++generation;
    const includePredictions = showPredictions();
    setFailed(false); setPreview(""); setDownload(""); setFormat("PNG"); setStatus("Creating your image…");
    setReadyDownload(undefined); setPublishing(false); setShareStatus(""); setShareUrl(""); setImageUrl("");
    let pending = variants.get(includePredictions);
    if (!pending) {
      pending = prepare(includePredictions);
      variants.set(includePredictions, pending);
    }
    try {
      const image = await pending;
      if (!image || disposed || current !== generation) return;
      setPreview(image.preview); setFilename(image.filename);
      const exported = await image.download;
      if (!exported || disposed || current !== generation) return;
      setDownload(exported.url); setFormat(exported.format); setStatus(exported.status); setReadyDownload(exported);
    } catch {
      if (variants.get(includePredictions) === pending) variants.delete(includePredictions);
      if (disposed || current !== generation) return;
      setFailed(true); setStatus("The image could not be created. Please try again.");
    }
  }
  async function copyShareLink() {
    if (publishing() || !readyDownload()) return;
    const current = generation;
    const canCopy = () => !disposed && current === generation;
    const revealLink = () => queueMicrotask(() => {
      if (!canCopy() || !shareInput) return;
      shareInput.scrollIntoView({ block: "nearest" }); shareInput.focus({ preventScroll: true }); shareInput.select();
    });
    const snapshot = capturePosterSnapshot(props.scenario, props.teamId, props.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, showPredictions(), capturedHref);
    setPublishing(true); setShareStatus("Creating your permanent link…"); setShareUrl(""); setImageUrl("");
    const pending = props.posterClient.getLink(snapshot, readyDownload()?.png);
    const copyable = pending.then((link) => {
      if (link.unavailable) throw new Error("Permanent image sharing is unavailable.");
      return link;
    });
    // Unsupported clipboard APIs can return before they consume the promised payload.
    void copyable.catch(() => undefined);
    const nativeCopy = beginClipboardWrite(copyable, canCopy);
    try {
      const link = await pending;
      if (!canCopy()) return;
      setShareUrl(link.url); setImageUrl(link.imageUrl ?? "");
      if (link.unavailable) {
        setShareStatus("Permanent link unavailable. Copy the prediction link below or download the image.");
        revealLink();
        return;
      }
      let copied = await nativeCopy;
      if (!canCopy()) return;
      if (!copied) {
        try { await navigator.clipboard.writeText(link.url); copied = true; } catch { /* The selectable field remains available. */ }
      }
      if (canCopy()) {
        setShareStatus(copied ? "Share link copied" : "Select the share link below to copy it.");
        if (!copied) revealLink();
      }
    } finally { if (canCopy()) setPublishing(false); }
  }
  onMount(() => {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else {
      setFallback(true); dialog.setAttribute("open", "");
      queueMicrotask(() => dialog.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true }));
    }
    void create();
  });
  onCleanup(() => {
    disposed = true;
    for (const url of urls) URL.revokeObjectURL(url);
  });
  return <><Show when={fallback()}><div class="pool-infographic-backdrop" aria-hidden="true" onClick={close} /></Show>
    <dialog ref={(element) => { dialog = element; }} class="pool-infographic-dialog" classList={{ "pool-infographic-dialog--fallback": fallback() }}
    role="dialog" aria-modal="true" aria-label="Pool match infographic" onCancel={(event) => { event.preventDefault(); close(); }} onClose={close}
    onClick={(event) => { if (event.target === dialog) close(); }} onKeyDown={(event) => {
      if (!fallback()) return;
      if (event.key === "Escape") { event.preventDefault(); close(); }
      else if (event.key === "Tab") {
        const controls = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), summary")].filter((element) => element.getClientRects().length > 0);
        const first = controls[0]; const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <div class="pool-infographic-heading"><div><span class="control-caption">Pool matches</span><h2>{team().name}</h2></div>
      <button type="button" class="match-dialog-close" aria-label="Close pool match infographic" onClick={close} autofocus><Icon name="close" size={20} /></button>
    </div>
    <div class="pool-infographic-body"><Show when={preview()}><img class="pool-infographic-preview" src={preview()} alt={`${team().name} pool match infographic`} /></Show>
      <p class="pool-infographic-status" role="status">{status()}</p>
      <Show when={shareUrl()}><div class="pool-infographic-links">
        <label class="manual-share">Share link<input ref={(element) => { shareInput = element; }} type="url" readonly value={shareUrl()} onFocus={(event) => event.currentTarget.select()} /></label>
        <Show when={imageUrl()}><details class="pool-infographic-direct"><summary>Direct image URL</summary>
          <label class="manual-share">Image URL<input type="url" readonly value={imageUrl()} onFocus={(event) => event.currentTarget.select()} /></label>
        </details></Show>
      </div></Show>
    </div>
    <div class="pool-infographic-actions"><label class="pool-infographic-toggle">
      <input type="checkbox" role="switch" checked={showPredictions()} onChange={(event) => {
        setShowPredictions(event.currentTarget.checked); void create();
      }} /><span class="pool-infographic-toggle-track" aria-hidden="true" /><span>Show predictions</span>
    </label><div class="pool-infographic-buttons"><button type="button" class="poster-link-button" disabled={!readyDownload() || publishing()} onClick={() => void copyShareLink()}>
      {publishing() ? "Creating link…" : "Copy share link"}</button><Show when={failed()} fallback={
      <button type="button" class="detail-done" disabled={!download()} onClick={() => {
        const anchor = document.createElement("a"); anchor.href = download(); anchor.download = `${filename()}.${format().toLowerCase()}`;
        anchor.click();
      }}>Download {format()}</button>
    }><button type="button" class="detail-done" onClick={() => void create()}>Try again</button></Show></div>
      <p class="pool-infographic-publication" role="status">{shareStatus()}</p></div>
  </dialog></>;
}
