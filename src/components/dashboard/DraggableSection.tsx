import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { ReactNode, cloneElement, isValidElement } from "react";

interface DraggableSectionProps {
  id: string;
  children: ReactNode;
  className?: string;
}

export const DraggableSection = ({ id, children, className }: DraggableSectionProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Add drag handle to the children
  const childrenWithDragHandle = isValidElement(children)
    ? cloneElement(children as React.ReactElement<any>, {
        dragHandleProps: { attributes, listeners },
      })
    : children;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={className || ""}
    >
      {childrenWithDragHandle}
    </div>
  );
};
