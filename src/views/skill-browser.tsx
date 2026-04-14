import type { FC } from 'hono/jsx';
import { html } from 'hono/html';
import { Layout } from './layout.js';
import { EmptyState } from './components/empty-state.js';

// ─── Tree builder ───────────────────────────────────────────────────────────

interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  skill?: {
    name: string | null;
    description: string | null;
  };
  children: TreeNode[];
}

function buildTree(skills: { path: string; name: string | null; description: string | null }[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const skill of skills) {
    const parts = skill.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const pathSoFar = parts.slice(0, i + 1).join('/');

      let node = current.find(n => n.name === part);
      if (!node) {
        node = {
          name: part,
          path: pathSoFar,
          isFile,
          skill: isFile ? { name: skill.name, description: skill.description } : undefined,
          children: [],
        };
        current.push(node);
      }
      current = node.children;
    }
  }

  // Sort: folders first, then files, alphabetically
  function sortTree(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) sortTree(n.children);
  }
  sortTree(root);

  return root;
}

// ─── Components ─────────────────────────────────────────────────────────────

const TreeNodeView: FC<{ node: TreeNode; activePath?: string; depth?: number; teamBase?: string }> = ({ node, activePath, depth = 0, teamBase = '' }) => {
  const indent = depth * 20;
  const isActive = activePath === node.path;

  if (node.isFile) {
    const displayName = node.skill?.name || node.name.replace(/\.md$/, '');
    return (
      <a
        href={`${teamBase}/skills/${node.path}`}
        style={`display: block; padding: 8px 14px 8px ${14 + indent}px; font-size: 14px; font-weight: ${isActive ? '700' : '500'}; color: ${isActive ? 'var(--accent)' : 'var(--text-secondary)'}; background: ${isActive ? 'var(--accent-soft)' : 'transparent'}; border-radius: 8px; text-decoration: none; transition: all 0.15s; margin-bottom: 2px;`}
      >
        <span style="margin-right: 8px; opacity: 0.5;">&#9643;</span>
        {displayName}
      </a>
    );
  }

  return (
    <div style="margin-bottom: 4px;">
      <div style={`padding: 8px 14px 8px ${14 + indent}px; font-size: 13px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; font-family: 'Plus Jakarta Sans', sans-serif;`}>
        <span style="margin-right: 8px;">&#9662;</span>
        {node.name}
      </div>
      {node.children.map(child => (
        <TreeNodeView node={child} activePath={activePath} depth={depth + 1} teamBase={teamBase} />
      ))}
    </div>
  );
};

// ─── Pages ──────────────────────────────────────────────────────────────────

interface SkillBrowserProps {
  skills: {
    id: number;
    path: string;
    name: string | null;
    description: string | null;
    category: string | null;
  }[];
  activePath?: string;
  activeContent?: string;
  activeSkill?: {
    name: string | null;
    description: string | null;
    path: string;
    usedBy: { agentId: string; agentName: string | null }[];
  };
  teamBase: string;
  teamSlug?: string;
  teamName?: string;
}

export const SkillBrowserPage: FC<SkillBrowserProps> = ({ skills, activePath, activeContent, activeSkill, teamBase, teamSlug, teamName }) => {
  const tree = buildTree(skills);
  const folderCount = new Set(skills.map(s => s.path.includes('/') ? s.path.split('/')[0] : null).filter(Boolean)).size;

  return (
    <Layout title="Skills" currentPath="/skills" teamSlug={teamSlug} teamName={teamName}>
      <div class="animate-in" style="display: flex; align-items: flex-end; justify-content: space-between; margin-bottom: 24px;">
        <div>
          <h1 class="font-display" style="font-size: 32px; font-weight: 800; margin: 0; letter-spacing: -0.03em;">Skill Graph</h1>
          <p class="page-subtitle">
            {skills.length} skills{folderCount > 0 ? ` in ${folderCount} folders` : ''}
          </p>
        </div>
        <form method="post" action="/api/skills/sync" style="display: inline;">
          <button type="submit" class="btn">Sync Files</button>
        </form>
      </div>

      {skills.length === 0 ? (
        <div class="animate-in delay-1">
          <EmptyState title="No skills found">
            Add markdown files to <code class="font-mono" style="background: var(--bg-inset); padding: 3px 10px; border-radius: 6px; font-size: 14px;">data/skills/</code> and click Sync.
          </EmptyState>
        </div>
      ) : (
        <div class="animate-in delay-1 grid-sidebar" style="gap: 20px; align-items: start;">
          {/* Tree sidebar */}
          <div class="card" style="padding: 16px 8px; position: sticky; top: 84px;">
            <div style="padding: 4px 14px 12px; font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-family: 'Plus Jakarta Sans', sans-serif; border-bottom: 1px solid var(--border); margin-bottom: 8px;">
              Files
            </div>
            {tree.map(node => (
              <TreeNodeView node={node} activePath={activePath} teamBase={teamBase} />
            ))}
          </div>

          {/* Content area */}
          <div class="card" style="padding: 36px; min-height: 400px;">
            {activeSkill ? (
              <div>
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
                  <div>
                    <h2 class="font-display" style="font-size: 24px; font-weight: 800; margin: 0;">{activeSkill.name || activePath}</h2>
                    {activeSkill.description && (
                      <p style="font-size: 15px; color: var(--text-secondary); margin: 6px 0 0;">{activeSkill.description}</p>
                    )}
                  </div>
                  {activeSkill.usedBy.length > 0 && (
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                      {activeSkill.usedBy.map(a => (
                        <a href={`${teamBase}/agents/${a.agentId}`} class="badge badge-accent" style="text-decoration: none;">{a.agentName || a.agentId}</a>
                      ))}
                    </div>
                  )}
                </div>
                <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px; font-weight: 500; font-family: 'JetBrains Mono', monospace;">
                  {activePath}
                </div>
                <div style="border-top: 1px solid var(--border); padding-top: 24px; font-size: 16px; line-height: 1.8; color: var(--text-primary); white-space: pre-wrap;">
                  {activeContent}
                </div>
              </div>
            ) : (
              <div style="display: flex; align-items: center; justify-content: center; height: 300px; color: var(--text-muted); font-size: 16px;">
                Select a skill from the tree to view its contents
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
};
