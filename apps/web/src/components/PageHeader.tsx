import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: ReactNode;
  children?: ReactNode;
};

// EN-69: the page title bar every page shares. Actions are passed as children
// and rendered as given after the title, so each page keeps its own wrapper
// (an `sf-actions` group or a single link).
export function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <header className="sf-page-header">
      <h1>{title}</h1>
      {children}
    </header>
  );
}
