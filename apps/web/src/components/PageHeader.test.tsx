import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders the title as the level-1 heading of an sf-page-header', () => {
    const { container } = render(<PageHeader title="Communities" />);

    const header = container.firstElementChild;
    expect(header?.tagName).toBe('HEADER');
    expect(header).toHaveClass('sf-page-header');
    expect(header?.children).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Communities');
    expect(header?.firstElementChild).toBe(screen.getByRole('heading', { level: 1 }));
  });

  it('renders its actions unchanged after the title', () => {
    const { container } = render(
      <PageHeader title="Communities">
        <div className="sf-actions">
          <button type="button">New community</button>
        </div>
      </PageHeader>,
    );

    const header = container.firstElementChild;
    expect(header?.children).toHaveLength(2);
    expect(header?.children[1]).toHaveClass('sf-actions');
    expect(header?.children[1]).toContainElement(
      screen.getByRole('button', { name: 'New community' }),
    );
  });
});
