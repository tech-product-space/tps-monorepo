"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AddQuestionDialog from "../AddQuestionDialog/AddQuestionDialog";
import { QuizQuestion, UpdateQuizQuestionPayload } from "@/types/quiz";

interface QuestionListProps {
  questions: QuizQuestion[];
  onEditQuestion: (
    id: number,
    updatedQuestion: UpdateQuizQuestionPayload
  ) => void;
  onDeleteQuestion: (id: number) => void;
  categories: string[];
}

export default function QuestionList({
  questions,
  onEditQuestion,
  onDeleteQuestion,
  categories,
}: QuestionListProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState<number | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [questionToEdit, setQuestionToEdit] = useState<QuizQuestion | null>(
    null
  );

  const handleDeleteClick = (id: number) => {
    setQuestionToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (questionToDelete !== null) {
      onDeleteQuestion(questionToDelete);
      setDeleteDialogOpen(false);
      setQuestionToDelete(null);
    }
  };

  const handleEditClick = (question: QuizQuestion) => {
    setQuestionToEdit(question);
    console.log(question);

    setEditDialogOpen(true);
  };

  const handleEditSave = (updatedQuestion: UpdateQuizQuestionPayload) => {
    if (questionToEdit) {
      onEditQuestion(questionToEdit.id, updatedQuestion);
      setEditDialogOpen(false);
      setQuestionToEdit(null);
    }
  };

  if (questions.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">
          No questions found. Add a new question to get started.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50%]">Question</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {questions.map((question) => (
              <TableRow key={question.id}>
                <TableCell className="font-medium">
                  <div className="truncate max-w-[400px]">
                    {question.question}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge>{question.category}</Badge>
                </TableCell>
                {question.subCategory ? (
                  <TableCell>
                    <Badge>{question.subCategory}</Badge>
                  </TableCell>
                ) : (
                  <TableCell>
                    <Badge className="bg-red-400">
                      Sub Category not specified
                    </Badge>
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEditClick(question)}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleDeleteClick(question.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              question.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Question Dialog */}
      {questionToEdit && (
        <AddQuestionDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          onAddQuestion={handleEditSave}
          categories={categories}
          editMode={true}
          initialData={questionToEdit}
        />
      )}
    </>
  );
}
