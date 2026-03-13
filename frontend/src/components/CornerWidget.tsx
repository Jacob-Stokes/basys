/**
 * CornerWidget — fixed h-14 strips that sit at navbar height in each panel column.
 *
 * Four corners, each associated with a panel:
 *   top-left     → LeftPanel (default layout)
 *   top-right    → ChatSidebar (default layout)
 *   bottom-left  → (reserved — no panel yet)
 *   bottom-right → (reserved — no panel yet)
 *
 * When panels are swapped, left ↔ right corners swap accordingly.
 * All corners are currently empty placeholders — add functionality later.
 */

type Corner = 'top-left' | 'top-right';

interface CornerWidgetProps {
  corner: Corner;
}

export default function CornerWidget({ corner }: CornerWidgetProps) {
  // TODO: top-left corner — associated with LeftPanel (notes, quick info, etc.)
  // TODO: top-right corner — associated with ChatSidebar (agent status, quick stats, etc.)

  void corner; // suppress unused-var until content is added

  return (
    <div className="h-full w-full flex items-center justify-center">
      {/* placeholder — functionality to be added */}
    </div>
  );
}
