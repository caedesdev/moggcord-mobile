export function replaceVideoControl(buttons, replace) {
  if (!Array.isArray(buttons)) return buttons;
  return buttons.map(button => button?.key === "connected-video" && typeof button.render === "function"
    ? { ...button, render: replace(button.render) } : button);
}
