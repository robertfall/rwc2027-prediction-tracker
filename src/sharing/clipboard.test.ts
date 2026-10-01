import { afterEach, describe, expect, it, vi } from "vitest";
import { beginClipboardWrite } from "./clipboard";

class DeferredClipboardItem {
  constructor(private readonly data: Record<string, Promise<Blob>>) {}
  getType(type: string) { return this.data[type]; }
}

function deferredLink() {
  let resolve!: (value: { url: string }) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<{ url: string }>((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve, reject };
}

function clipboard(write: (items: ClipboardItem[]) => Promise<void>) {
  vi.stubGlobal("ClipboardItem", DeferredClipboardItem);
  vi.stubGlobal("navigator", { clipboard: { write } });
}

afterEach(() => vi.unstubAllGlobals());

describe("Clipboard writes within the sharing gesture", () => {
  it("starts the write synchronously during the gesture and resolves its captured link later", async () => {
    const link = deferredLink();
    let gestureActive = true;
    let copied = "";
    const write = vi.fn(async (items: ClipboardItem[]) => {
      expect(gestureActive).toBe(true);
      const blob = await items[0].getType("text/plain");
      expect(blob.type).toBe("text/plain");
      copied = await blob.text();
    });
    clipboard(write);
    const copying = beginClipboardWrite(link.promise);
    expect(write).toHaveBeenCalledOnce();
    expect(copied).toBe("");
    gestureActive = false;
    link.resolve({ url: "https://predict.example/s/happy.blue.otter" });
    expect(await copying).toBe(true);
    expect(copied).toBe("https://predict.example/s/happy.blue.otter");
    expect(write).toHaveBeenCalledOnce();
  });

  it("copies the full fallback link through the same already-started native write", async () => {
    const link = deferredLink();
    let copied = "";
    const write = vi.fn(async (items: ClipboardItem[]) => { copied = await (await items[0].getType("text/plain")).text(); });
    clipboard(write);
    const copying = beginClipboardWrite(link.promise);
    link.resolve({ url: "https://predict.example/#predictions=v3.AYIKQA" });
    expect(await copying).toBe(true);
    expect(copied).toBe("https://predict.example/#predictions=v3.AYIKQA");
    expect(write).toHaveBeenCalledOnce();
  });

  it("handles a rejected native write before the share request settles", async () => {
    const link = deferredLink();
    clipboard(vi.fn().mockRejectedValue(new DOMException("Gesture unavailable.", "NotAllowedError")));
    const copying = beginClipboardWrite(link.promise);
    // The returned promise is safe even if App waits for the sharing request first.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await copying).toBe(false);
    link.resolve({ url: "https://predict.example/" });
  });

  it("handles synchronous constructor failures and unconsumed deferred-data rejection", async () => {
    const link = deferredLink();
    const write = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { write } });
    vi.stubGlobal("ClipboardItem", class { constructor() { throw new TypeError("Deferred data unsupported."); } });
    expect(await beginClipboardWrite(link.promise)).toBe(false);
    expect(write).not.toHaveBeenCalled();
    link.reject(new Error("The deferred link could not be loaded."));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("handles a synchronous write failure without losing the later fallback URL", async () => {
    const link = deferredLink();
    clipboard(vi.fn(() => { throw new DOMException("Unavailable."); }));
    expect(await beginClipboardWrite(link.promise)).toBe(false);
    link.resolve({ url: "https://predict.example/#predictions=v3.AYIKQA" });
    expect(await link.promise).toEqual({ url: "https://predict.example/#predictions=v3.AYIKQA" });
  });

  it("reports unavailable APIs so the caller can use text or manual copying", async () => {
    const link = Promise.resolve({ url: "https://predict.example/" });
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn() } });
    vi.stubGlobal("ClipboardItem", DeferredClipboardItem);
    expect(await beginClipboardWrite(link)).toBe(false);
    vi.stubGlobal("ClipboardItem", undefined);
    clipboard(vi.fn());
    vi.stubGlobal("ClipboardItem", undefined);
    expect(await beginClipboardWrite(link)).toBe(false);
    vi.stubGlobal("navigator", undefined);
    expect(await beginClipboardWrite(link)).toBe(false);
  });

  it("cancels deferred copying when the app is disposed before its link arrives", async () => {
    const link = deferredLink();
    let active = true;
    let copied = "";
    clipboard(async (items) => { copied = await (await items[0].getType("text/plain")).text(); });
    const copying = beginClipboardWrite(link.promise, () => active);
    active = false;
    link.resolve({ url: "https://predict.example/s/happy.blue.otter" });
    expect(await copying).toBe(false);
    expect(copied).toBe("");
  });

  it("handles rejected deferred link data without an unhandled native-write rejection", async () => {
    const link = deferredLink();
    clipboard(async (items) => { await items[0].getType("text/plain"); });
    const copying = beginClipboardWrite(link.promise);
    link.reject(new Error("Sharing failed unexpectedly."));
    expect(await copying).toBe(false);
  });
});
