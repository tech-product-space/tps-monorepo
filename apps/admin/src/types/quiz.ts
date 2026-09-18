export interface QuizQuestion {
    id: number;
    question: string;
    options: string[];
    answer: string;
    hasImage: boolean;
    imageUrl?: string | null;
    category: string;
    subCategory: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface CreateQuizQuestionPayload {
    question: string;
    options: string[];
    answer: string;
    hasImage: boolean;
    imageUrl?: string;
    category: string;
    subCategory: string;
}


export interface UpdateQuizQuestionPayload {
    question?: string;
    options?: string[];
    answer?: string;
    hasImage?: boolean;
    imageUrl?: string;
    category?: string;
    subCategory: string;
}
