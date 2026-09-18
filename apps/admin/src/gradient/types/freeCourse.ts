export interface Author {
  name: string;
  company: string;
  designation: string;
  imageKey: string;
  linkedIn?: string;
}

export interface Section {
  heading: string;
  points: string[];
}

export interface Certificate {
  heading: string;
  imageKey: string;
}

export interface FAQ {
  question: string;
  answer: string;
  index: number;
}

export interface SEO {
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string;
}

export interface CreateFreeCoursePayload {
  title: string;
  subTitle: string;
  description: string;
  slug: string;
  thumbnail?: string;
  author?: Author;
  whatYouWillLearn?: Section;
  whoShouldAttend?: Section;
  certificate?: Certificate;
  seo?: SEO;
  faq?: FAQ[];
  rightCard?: { [key: number]: string };
  curriculum?: { heading: string; subTitle: string };
}

// TYPES FOR THE MODULE SECTION OF THE DETAIL PAGE


export interface Lesson {
  id: string;
  title: string;
  slug: string;
  order: number;
  isPublished: boolean;
}
export interface FreeCourseModule {
  id: string;
  freeCourseId: string;
  title: string;
  subTitle?: string;
  slug: string;
  isPublished: boolean;
  overview?: Record<string, any>;
  order: number;
  seo?: SEO;
  lessons?: Lesson[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateModulePayload {
  title: string;
  subTitle?: string;
  slug: string;
  overview?: Record<string, any>;
}

/** One row sent to POST /free-courses/module/import/:courseId */
export interface ImportModulePayload {
  title: string;
  slug: string;
  subTitle?: string;
  overview?: Record<string, any>;
}

export interface UpdateModulePayload {
  title?: string;
  subTitle?: string;
  slug?: string;
  overview?: Record<string, any>;
  seo?: SEO;
}

// TYPES FOR THE LESSON

export interface FreeCourseLesson {
  id: string;
  freeCourseModuleId: string;
  title: string;
  slug: string;
  content: Record<string, any>;
  order: number;
  isPublished: boolean;
  seo: SEO;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLessonPayload {
  title: string;
  slug: string;
  content: Record<string, any>;
  isPublished?: boolean;
  seo?: SEO;
}

/** One row sent to POST /free-courses/lesson/import/:moduleId */
export interface ImportLessonPayload {
  title: string;
  slug: string;
  content?: Record<string, any>;
  seo?: SEO;
}

export interface UpdateLessonPayload {
  title?: string;
  slug?: string;
  content?: Record<string, any>;
  isPublished?: boolean;
  seo?: SEO;
  order?: number;
}
