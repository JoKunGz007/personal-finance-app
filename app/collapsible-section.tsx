"use client";

import { useId, useState, type HTMLAttributes, type ReactNode } from "react";

/**
 * A statistics section whose heading carries a show/hide button. Open by default; the open state is
 * not persisted (no client storage in `app/`, `tests/privacy.test.ts`). The `h2` wraps the button
 * rather than sitting inside a `summary`, because a summary's button role can strip heading
 * semantics in screen readers and heading navigation would lose every section. `headingProps`
 * carries any extra attribute the heading needs (e.g. `tabIndex={-1}` for a skip-link target).
 */
export function CollapsibleSection({ id, title, className = "stats-section", headingProps, children }: {
  id: string;
  title: ReactNode;
  className?: string;
  headingProps?: HTMLAttributes<HTMLHeadingElement>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const bodyId = useId();
  return (
    <section className={className} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="collapsible-heading" {...headingProps}>
        <button type="button" className="collapsible-toggle" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((o) => !o)}>
          {title}
        </button>
      </h2>
      <div id={bodyId} hidden={!open}>{children}</div>
    </section>
  );
}
