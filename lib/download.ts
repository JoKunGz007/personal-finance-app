/**
 * Hands a string to the browser's download flow.
 *
 * Shared by the two surfaces that write a file — the synthetic `.pldemo` preview on the
 * import route and the real encrypted `.plbak` backup on the recovery route. They were one
 * component until routing split them (PLAN task 19); a copy each would be two places for a
 * revoke to be forgotten.
 */
export function downloadFile(contents: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
