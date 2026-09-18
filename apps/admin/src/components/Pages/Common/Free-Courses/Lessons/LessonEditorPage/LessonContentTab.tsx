import { useMemo } from "react";
import { BlockEditor } from "@/components/block-editor/BlockEditor";
import type { ICourseLesson } from "@/types/course";
import type { IBlockBase } from "@/components/block-editor/types/block.types";

interface Props {
  lesson: ICourseLesson;
  setLesson: React.Dispatch<React.SetStateAction<ICourseLesson | null>>;
  /**
   * The course images upload under. Passed in rather than read off the route:
   * this page's only route parameter is the *lesson* id, and using it here sent
   * every uploaded image to `written-course/<lessonId>/`.
   */
  courseId: string;
}

export function LessonContentTab({ lesson, setLesson, courseId }: Props) {

  const blocks: IBlockBase[] = useMemo(
    () => lesson.content?.blocks ?? [],
    [lesson.content?.blocks]
  );

  const handleBlocksChange = (newBlocks: IBlockBase[]) => {
    setLesson((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        content: {
          ...(prev.content || {}),
          blocks: newBlocks,
        },
      };
    });
  };

  return (
    <BlockEditor
      value={blocks}
      onChange={handleBlocksChange}
      extraData={{ courseId }}
    />
  );
}