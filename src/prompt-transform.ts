export function commandFileToPiPromptName(fileName: string): string {
  return `gsd-${fileName}`;
}

export function normalizeGsdSlashReferences(input: string): string {
  return input.replace(/(^|[\s([{'"`])\/gsd:([a-z0-9][a-z0-9-]*)/g, "$1/gsd-$2");
}
