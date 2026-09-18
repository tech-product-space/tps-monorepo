"use client";

import React, { useEffect, useState } from "react";
import {
  getInterviewQuestionById,
  editFeedbackAdmin,
  deleteFeedbackAdmin,
  editAnswerAdmin,
  deleteAnswerAdmin,
  addAnswerAdmin,
} from "@/services/interview-questions/interview-question-service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, DeleteIcon, Edit, Plus, Trash } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import LoadingSpinner from "@/components/Common/Loading/HoverLoading";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialogFooter,
  AlertDialogHeader,
} from "@/components/ui/alert-dialog";
import RichAnswerEditor from "../AnswerEditor/RichAnswerEditor";
import UserProfileDialog from "../UserProfile/UserProfile";
import InterviewQuestionMetaData from "../InterviewQuestionMetaData/InterviewQuestionMetaData";
import EditQuestionDialog from "../EditQuestion/EditQuestionDialog";


interface IFeedback {
  _id?: string;
  userId: number;
  userName: string;
  feedbackText: string;
  createdAt: string;
}

interface IAnswer {
  _id?: string;
  userId: number;
  userName: string;
  isMember: boolean;
  content: string;
  likes: any[];
  feedback: IFeedback[];
  createdAt: string;
}

interface IInterviewQuestion {
  _id: string;
  title: string;
  company: string;
  role: string | string[];
  type: string | string[];
  isPublished: boolean;
  createdAt: string;
  slug?: string;
  metaTitle?: string;
  metaDesc?: string;
  answers: IAnswer[];
}

const toList = (v?: string | string[]): string[] =>
  Array.isArray(v) ? v.filter(Boolean) : v ? [v] : [];

export default function InterviewQuestionDetails() {
  const [question, setQuestion] = useState<IInterviewQuestion | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSlugAvailable, setisSlugAvailable] = useState("");
  const [questionerId, setquestionerId] = useState(null);
  // Feedback Edit
  const [editingFeedbackId, setEditingFeedbackId] = useState<string | null>(
    null
  );
  const [editingText, setEditingText] = useState("");
  const [metaDetails, setMetaDetails] = useState({
    metaTitle: "",
    metaDesc: "",
    slug: "",
  });

  // Answer Edit
  const [editingAnswerId, setEditingAnswerId] = useState<string | null>(null);
  const [editingAnswerContent, setEditingAnswerContent] = useState("");
  const [savingAnswer, setSavingAnswer] = useState(false);

  // Add Answer
  const [isAddingAnswer, setIsAddingAnswer] = useState(false);
  const [addingAnswer, setAddingAnswer] = useState(false);
  const [newAnswerAuthor, setNewAnswerAuthor] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<{
    type: "answer" | "feedback" | null;
    answerId?: string;
    feedbackId?: string;
  } | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const QuestionId = pathname.split("/").pop();

  const getQuestion = async (id: string) => {
    try {
      setLoading(true);
      const response = await getInterviewQuestionById(id);
      if (response.answers.length > 0) {
        response.answers = response.answers.sort(
          (a: any, b: any) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }
      setQuestion(response);
      setisSlugAvailable(response?.slug);
      setquestionerId(response?.userId);
      setMetaDetails({
        slug: response?.slug || "",
        metaTitle: response?.metaTitle || "",
        metaDesc: response?.metaDesc || "",
      });
    } catch (error) {
      console.error("Failed to fetch question:", error);
      setQuestion(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!QuestionId) return;
    getQuestion(QuestionId);
  }, [QuestionId]);

  // -----------------------------
  // EDIT FEEDBACK (ADMIN)
  // -----------------------------
  const startEditing = (feedbackId: string, currentText: string) => {
    setEditingFeedbackId(feedbackId);
    setEditingText(currentText);
  };

  const handleSaveEdit = async (answerId: string, feedbackId: string) => {
    if (!editingText.trim()) return;

    try {
      await editFeedbackAdmin(QuestionId!, answerId, feedbackId, editingText);
      setEditingFeedbackId(null);
      setEditingText("");
      await getQuestion(QuestionId!);
    } catch (err) {
      console.error("Admin feedback edit error:", err);
    }
  };

  // -----------------------------
  // EDIT ANSWER (ADMIN)
  // -----------------------------
  const startEditingAnswer = (answerId: string, currentContent: string) => {
    setEditingAnswerId(answerId);
    setEditingAnswerContent(currentContent);
  };

  const handleSaveAnswerEdit = async (answerId: string, newContent: string) => {
    if (!newContent.trim()) return;

    try {
      setSavingAnswer(true);
      await editAnswerAdmin({
        questionId: QuestionId!,
        answerId,
        content: newContent,
      });

      setEditingAnswerId(null);
      setEditingAnswerContent("");
      await getQuestion(QuestionId!);
    } catch (err) {
      console.error("Admin answer edit error:", err);
      toast.error("Failed to save answer. Please try again.");
    } finally {
      setSavingAnswer(false);
    }
  };

  // -----------------------------
  // ADD ANSWER (ADMIN)
  // -----------------------------
  const handleAddAnswer = async (content: string) => {
    if (!content.trim()) return;

    try {
      setAddingAnswer(true);
      await addAnswerAdmin({
        questionId: QuestionId!,
        content,
        userName: newAnswerAuthor.trim() || undefined,
      });

      setIsAddingAnswer(false);
      setNewAnswerAuthor("");
      await getQuestion(QuestionId!);
      toast.success("Answer added.");
    } catch (err) {
      console.error("Admin add answer error:", err);
      toast.error("Failed to add answer. Please try again.");
    } finally {
      setAddingAnswer(false);
    }
  };

  const confirmDeleteAction = async () => {
    if (!deleteTarget) return;

    const { type, answerId, feedbackId } = deleteTarget;

    try {
      if (type === "feedback" && answerId && feedbackId) {
        await deleteFeedbackAdmin(QuestionId!, answerId, feedbackId);
      }

      if (type === "answer" && answerId) {
        await deleteAnswerAdmin({
          questionId: QuestionId!,
          answerId,
        });
      }

      await getQuestion(QuestionId!);
    } catch (err) {
      console.error("Delete error:", err);
    }

    setDeleteTarget(null);
  };

  if (loading) return <LoadingSpinner />;

  if (!question)
    return <div className="p-5 text-gray-600">No question found.</div>;

  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Header */}
      <div className="px-5 h-16 flex justify-between items-center border-b border-gray-200">
        {/* LEFT SIDE */}
        <div className="flex items-center gap-3">
          <ArrowLeft
            className="h-5 w-5 m-2 cursor-pointer"
            onClick={() => router.back()}
          />
          <p className="text-lg font-semibold text-gray-900">
            Question Details
          </p>
        </div>

        {/* RIGHT SIDE */}
        <div className=" flex gap-2 ">
          <EditQuestionDialog
            question={question}
            onUpdated={() => getQuestion(QuestionId!)}
          />
          <UserProfileDialog userId={String(questionerId)} />
          {isSlugAvailable && (
            <a
              href={`https://theproductspace.in/interviewprep/interview-questions/questions/${isSlugAvailable}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button variant="outline" className="ml-3">
                View Live Page
              </Button>
            </a>
          )}
          <InterviewQuestionMetaData
            metaDetails={metaDetails} 
            id={QuestionId}
          />
        </div>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6 overflow-y-auto bg-gray-50 h-[90vh]">
        {/* Question */}
        <div>
          <h2 className="text-2xl font-bold mb-2">{question.title}</h2>

          <div className="flex flex-wrap gap-3">
            <Badge variant="secondary">Company: {question.company}</Badge>
            {toList(question.role).map((r) => (
              <Badge key={`role-${r}`} variant="secondary">
                Role: {r}
              </Badge>
            ))}
            {toList(question.type).map((t) => (
              <Badge key={`type-${t}`} variant="secondary">
                Type: {t}
              </Badge>
            ))}
            <Badge
              variant="outline"
              className="text-green-600 border-green-600"
            >
              {question.isPublished ? "Published" : "Unpublished"}
            </Badge>
          </div>
        </div>

        {/* Answers */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xl font-semibold">
              Answers ({question.answers.length})
            </h3>
            {!isAddingAnswer && (
              <Button size="sm" onClick={() => setIsAddingAnswer(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Answer
              </Button>
            )}
          </div>

          {isAddingAnswer && (
            <div className="border border-gray-200 rounded-xl p-4 mb-4 bg-white shadow-sm">
              <p className="font-semibold mb-3 text-gray-700">New Answer</p>
              <div className="space-y-1.5 max-w-sm mb-4">
                <Label htmlFor="newAnswerAuthor">Answer author name</Label>
                <Input
                  id="newAnswerAuthor"
                  value={newAnswerAuthor}
                  onChange={(e) => setNewAnswerAuthor(e.target.value)}
                  placeholder="Product Space"
                />
                <p className="text-xs text-muted-foreground">
                  Shown as the author on the public site. Leave blank to use
                  &ldquo;Product Space&rdquo;.
                </p>
              </div>
              <RichAnswerEditor
                initialContent=""
                saving={addingAnswer}
                onSave={handleAddAnswer}
                onCancel={() => {
                  setIsAddingAnswer(false);
                  setNewAnswerAuthor("");
                }}
              />
            </div>
          )}

          {question.answers.map((answer) => (
            <div
              key={answer._id}
              className="border border-gray-200 rounded-xl p-4 mb-4 bg-white shadow-sm"
            >
              {/* Answer Header */}
              <div className="bg-white border rounded-xl p-4 shadow-sm mb-4">
                <div className="flex justify-between items-start gap-4">
                  {/* LEFT SECTION */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-lg text-gray-900">
                        Answered By: {answer.userName}
                      </p>

                      {answer.isMember && (
                        <Button
                          variant="outline"
                          className="h-8 text-sm rounded-md border-gray-400 text-gray-700 
             hover:bg-gray-100 hover:border-gray-500 transition-all"
                        >
                          Member
                        </Button>
                      )}

                      <UserProfileDialog userId={String(answer.userId)} />
                    </div>

                    <p className="text-sm text-gray-500">
                      {new Date(answer.createdAt).toLocaleString()}
                    </p>
                  </div>

                  {/* ACTION BUTTONS */}
                  <div className="flex gap-2 shrink-0">
                    {editingAnswerId !== answer._id && (
                      <>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() =>
                            startEditingAnswer(answer._id!, answer.content)
                          }
                        >
                          <Edit className="h-4 w-4" />
                        </Button>

                        <Button
                          size="icon"
                          variant="destructive"
                          onClick={() =>
                            setDeleteTarget({
                              type: "answer",
                              answerId: answer._id!,
                            })
                          }
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Answer Content */}
              {editingAnswerId === answer._id ? (
                <div className="px-5">
                  <RichAnswerEditor
                    initialContent={editingAnswerContent}
                    saving={savingAnswer}
                    onSave={(html) => {
                      setEditingAnswerContent(html);
                      handleSaveAnswerEdit(answer._id!, html);
                    }}
                    onCancel={() => setEditingAnswerId(null)}
                  />
                </div>
              ) : (
                <div
                  className="prose max-w-none px-5 tiptap-interviewquestions"
                  dangerouslySetInnerHTML={{ __html: answer.content }}
                />
              )}

              {/* Feedback */}
              <div className="mt-4 bg-white p-3 border rounded-lg">
                <p className="font-semibold mb-3 text-gray-700">Feedback:</p>

                {answer.feedback.map((fb) => (
                  <div key={fb._id} className="mb-4 pb-3 border-b">
                    {/* Feedback Text */}
                    {editingFeedbackId === fb._id ? (
                      <div>
                        <textarea
                          className="w-full border rounded-md p-2 text-sm"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                        />
                        <div className="flex justify-end gap-3 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingFeedbackId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="bg-blue-600 text-white"
                            onClick={() => handleSaveEdit(answer._id!, fb._id!)}
                          >
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-800">
                        <span className="font-semibold">{fb.userName}: </span>
                        {fb.feedbackText}
                      </p>
                    )}

                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(fb.createdAt).toLocaleString()}
                    </p>

                    {editingFeedbackId !== fb._id && (
                      <div className="flex justify-end gap-3 mt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => startEditing(fb._id!, fb.feedbackText)}
                        >
                          <Edit />
                        </Button>

                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            setDeleteTarget({
                              type: "feedback",
                              answerId: answer._id!,
                              feedbackId: fb._id!,
                            })
                          }
                        >
                          <Trash />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent>
          <AlertDialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {deleteTarget?.type}?
            </DialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteAction}>
              Delete
            </Button>
          </AlertDialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
