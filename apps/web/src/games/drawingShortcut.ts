export function isDrawingUndo(event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "repeat" | "defaultPrevented">, enabled: boolean, editing: boolean, overlay: boolean) {
  return enabled && !editing && !overlay && !event.defaultPrevented && !event.repeat && !event.altKey && !event.shiftKey && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z";
}
