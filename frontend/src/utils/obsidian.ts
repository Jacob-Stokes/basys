/** Build an obsidian:// deep link URI to open a note */
export function buildObsidianUri(vaultName: string, obsidianPath: string): string {
  const file = obsidianPath.replace(/\.md$/, '');
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(file)}`;
}
