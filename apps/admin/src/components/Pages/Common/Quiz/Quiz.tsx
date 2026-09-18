"use client";

import { useEffect, useState } from "react";
import { PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import QuestionList from "./QuestionList/QuestionList";
import AddQuestionDialog from "./AddQuestionDialog/AddQuestionDialog";
import {
  CreateQuizQuestionPayload,
  QuizQuestion,
  UpdateQuizQuestionPayload,
} from "@/types/quiz";
import {
  createQuizQuestion,
  deleteQuizQuestion,
  getAllQuizQuestions,
  updateQuizQuestion,
} from "@/services/quiz/quizService";
import { useNotification } from "@/helpers/NotificationContext";
import { SidebarTrigger } from "@/components/ui/sidebar";

export default function Quiz() {
  const { showNotification } = useNotification();

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [filteredQuestions, setFilteredQuestions] = useState<QuizQuestion[]>(
    []
  );
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const categories = [
    "All",
    ...new Set(["ai-skills", "ai-jobs", "pm-skills", "js-skills"]),
  ];

  const handleAddQuestion = async (newQuestion: CreateQuizQuestionPayload) => {
    const questionToAdd: CreateQuizQuestionPayload = {
      ...newQuestion,
    };

    console.log("New Question:", questionToAdd);

    const response = await createQuizQuestion(questionToAdd);
    console.log(response);

    setQuestions([...questions, response]);
    showNotification(
      "success",
      "Action Successful",
      "Question Added Successfully",
      {
        label: "Close",
        onClick: () => console.log("Close clicked"),
      }
    );
  };

  const handleEditQuestion = async (
    id: number,
    updatedQuestion: UpdateQuizQuestionPayload
  ) => {
    console.log("Updated Question:", updatedQuestion);
    const response = await updateQuizQuestion(id, updatedQuestion);
    showNotification(
      "success",
      "Action Successful",
      "Question Updated Successfully",
      {
        label: "Close",
        onClick: () => console.log("Close clicked"),
      }
    );
    setQuestions(
      questions.map((q) => (q.id === id ? { ...q, ...response } : q))
    );
  };

  const handleDeleteQuestion = async (id: number) => {
    const response = await deleteQuizQuestion(id);
    showNotification("success", "Action Successful", response.message, {
      label: "Close",
      onClick: () => console.log("Close clicked"),
    });
    setQuestions(questions.filter((q) => q.id !== id));
  };

  const getAllQuizQuestionsFn = async () => {
    const response = await getAllQuizQuestions();
    console.log("All Questions:", response);
    setQuestions(response);
  };

  useEffect(() => {
    getAllQuizQuestionsFn();
  }, []);

  useEffect(() => {
    const filtered =
      selectedCategory.toLowerCase() === "all"
        ? questions
        : questions.filter((q) => q.category === selectedCategory);

    setFilteredQuestions(filtered);
  }, [questions, selectedCategory]);

  return (
    <div className="flex flex-col h-screen">
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <SidebarTrigger size={"lg"} />
          <p className="text-lg font-semibold">Quiz Questions</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Select Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((category) => (
                <SelectItem
                  key={category}
                  value={category.toLowerCase() === "all" ? "all" : category}
                >
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => setIsDialogOpen(true)}
            className="w-full sm:w-auto"
          >
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Question
          </Button>
        </div>
      </div>
      <div className="flex flex-col h-full flex-1 overflow-auto p-5 pb-10">
        <QuestionList
          questions={filteredQuestions}
          onEditQuestion={handleEditQuestion}
          onDeleteQuestion={handleDeleteQuestion}
          categories={categories.filter((c) => c !== "All")}
        />

        <AddQuestionDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          onAddQuestion={handleAddQuestion}
          categories={categories.filter((c) => c !== "All")}
        />
      </div>
    </div>
  );
}
