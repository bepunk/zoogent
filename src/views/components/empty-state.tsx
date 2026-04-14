import type { FC, PropsWithChildren } from 'hono/jsx';

interface EmptyStateProps {
  icon?: string;
  title: string;
}

export const EmptyState: FC<PropsWithChildren<EmptyStateProps>> = ({ icon, title, children }) => (
  <div class="card" style="padding: 64px; text-align: center;">
    {icon && <div style="font-size: 48px; margin-bottom: 16px;">{icon}</div>}
    <h2 class="font-display" style="font-size: 22px; font-weight: 700; margin: 0;">{title}</h2>
    {children && <p class="text-muted" style="margin: 10px auto 0; max-width: 400px; line-height: 1.6;">{children}</p>}
  </div>
);
