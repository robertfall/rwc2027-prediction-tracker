/** Start the native write during the click, while its text may still be loading. */
export function beginClipboardWrite(link: Promise<{ url: string }>, canCopy = () => true): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
      return Promise.resolve(false);
    }
    const data = link.then(({ url }) => {
      if (!canCopy()) throw new Error("Copy cancelled.");
      return new Blob([url], { type: "text/plain" });
    });
    // A constructor or write can reject before it consumes the deferred data.
    void data.catch(() => undefined);
    const item = new ClipboardItem({ "text/plain": data });
    return Promise.resolve(navigator.clipboard.write([item])).then(() => true, () => false);
  } catch {
    return Promise.resolve(false);
  }
}
