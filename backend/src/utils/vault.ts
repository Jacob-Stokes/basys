import fs from 'fs';
import path from 'path';

export interface VaultDocResult {
  obsidian_path: string;  // relative path within vault, e.g. "Projects/My App/README.md"
  obsidian_uri: string;   // obsidian://open?vault=...&file=...
}

/** Strip characters illegal in file/folder names, trim, truncate */
export function sanitizeForPath(name: string): string {
  return name
    .replace(/[/\\:*?"<>|#^[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

/** Returns the base vault directory path from env or default */
export function getVaultBasePath(): string {
  return process.env.VAULT_PATH || '/vault';
}

/** Build an obsidian:// deep link URI */
export function buildObsidianUri(vaultName: string, filePath: string): string {
  // Obsidian URIs omit the .md extension
  const file = filePath.replace(/\.md$/, '');
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(file)}`;
}

/** Check if the vault base directory exists and is writable */
function isVaultAvailable(): boolean {
  try {
    const base = getVaultBasePath();
    fs.accessSync(base, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** Resolve a unique folder name, appending UUID prefix if path already exists */
function resolveUniquePath(dirPath: string, id: string): string {
  if (!fs.existsSync(dirPath)) return dirPath;
  const suffix = id.slice(0, 8);
  const uniquePath = `${dirPath} (${suffix})`;
  return uniquePath;
}

/** Generate a project markdown doc in the vault */
export function generateProjectDoc(
  project: { id: string; title: string; description: string | null; hex_color: string; type: string },
  vaultName: string
): VaultDocResult | null {
  if (!isVaultAvailable()) return null;

  const base = getVaultBasePath();
  const sanitized = sanitizeForPath(project.title);
  if (!sanitized) return null;

  const projectDir = resolveUniquePath(path.join(base, 'Projects', sanitized), project.id);
  const sprintsDir = path.join(projectDir, 'sprints');
  fs.mkdirSync(sprintsDir, { recursive: true });

  const now = new Date().toISOString();
  const content = `---
basys_id: "${project.id}"
basys_type: project
basys_url: "/tasks?project=${project.id}"
type: "${project.type}"
color: "${project.hex_color}"
created: "${now}"
---

# ${project.title}

${project.description || ''}

## Sprints

## Notes
`;

  const filePath = path.join(projectDir, 'README.md');
  fs.writeFileSync(filePath, content, 'utf-8');

  // Relative path from vault root
  const obsidian_path = path.relative(base, filePath);
  const obsidian_uri = buildObsidianUri(vaultName, obsidian_path);

  return { obsidian_path, obsidian_uri };
}

/** Generate a sprint markdown doc under the project folder in the vault */
export function generateSprintDoc(
  sprint: {
    id: string;
    title: string;
    description: string | null;
    project_id: string;
    sprint_number: number | null;
    start_date: string | null;
    end_date: string | null;
  },
  projectTitle: string,
  vaultName: string
): VaultDocResult | null {
  if (!isVaultAvailable()) return null;

  const base = getVaultBasePath();
  const projectSanitized = sanitizeForPath(projectTitle);
  const sprintSanitized = sanitizeForPath(sprint.title);
  if (!projectSanitized || !sprintSanitized) return null;

  // Find the project folder — may have UUID suffix
  const projectsDir = path.join(base, 'Projects');
  let projectDir = path.join(projectsDir, projectSanitized);

  // If exact folder doesn't exist, look for one with UUID suffix
  if (!fs.existsSync(projectDir) && fs.existsSync(projectsDir)) {
    const candidates = fs.readdirSync(projectsDir).filter(d => d.startsWith(projectSanitized));
    if (candidates.length > 0) {
      projectDir = path.join(projectsDir, candidates[0]);
    }
  }

  const sprintsDir = path.join(projectDir, 'sprints');
  fs.mkdirSync(sprintsDir, { recursive: true });

  const now = new Date().toISOString();
  const sprintLabel = sprint.sprint_number ? `Sprint ${sprint.sprint_number}: ` : '';
  const content = `---
basys_id: "${sprint.id}"
basys_type: sprint
basys_project_id: "${sprint.project_id}"
sprint_number: ${sprint.sprint_number ?? 'null'}
status: planned
start_date: "${sprint.start_date || ''}"
end_date: "${sprint.end_date || ''}"
created: "${now}"
---

# ${sprintLabel}${sprint.title}

${sprint.description || ''}

## Tasks

## Notes
`;

  const fileName = `${sprintSanitized}.md`;
  const filePath = resolveUniquePath(path.join(sprintsDir, fileName), sprint.id);
  const finalPath = filePath.endsWith('.md') ? filePath : `${filePath}.md`;
  fs.writeFileSync(finalPath, content, 'utf-8');

  const obsidian_path = path.relative(base, finalPath);
  const obsidian_uri = buildObsidianUri(vaultName, obsidian_path);

  return { obsidian_path, obsidian_uri };
}
