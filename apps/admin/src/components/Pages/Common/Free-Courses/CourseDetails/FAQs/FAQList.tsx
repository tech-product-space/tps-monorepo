"use client";

import React, { useState, useEffect } from "react";
import {
    Plus,
    GripVertical,
    Pencil,
    Trash2,
    Loader2,
    HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    getFAQs,
    createFAQ,
    updateFAQ,
    deleteFAQ,
    reorderFAQs,
    FAQ,
} from "@/services/courses/faqs";

interface FAQListProps {
    courseId: string;
    onRefresh?: () => void;
}

const SortableFAQItem = ({
    faq,
    onEdit,
    onDelete,
}: {
    faq: FAQ;
    onEdit: (faq: FAQ) => void;
    onDelete: (id: string) => void;
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: faq.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : "auto",
        position: "relative" as const,
    };

    return (
        <div ref={setNodeRef} style={style} className={`mb-4 ${isDragging ? "opacity-50" : ""}`}>
            <Card className="border-gray-200 group">
                <CardContent className="p-4 flex items-start gap-4">
                    <button
                        {...attributes}
                        {...listeners}
                        className="mt-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
                    >
                        <GripVertical size={20} />
                    </button>
                    <div className="flex-1">
                        <h4 className="font-semibold text-gray-900 mb-1">{faq.question}</h4>
                        <p className="text-sm text-gray-600 line-clamp-2">{faq.answer}</p>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => onEdit(faq)}
                        >
                            <Pencil size={16} />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => onDelete(faq.id)}
                        >
                            <Trash2 size={16} />
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export const FAQList = ({ courseId, onRefresh }: FAQListProps) => {
    const [faqs, setFaqs] = useState<FAQ[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingFaq, setEditingFaq] = useState<FAQ | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Form state
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const fetchFAQs = async () => {
        try {
            setLoading(true);
            const data = await getFAQs(courseId);
            setFaqs(data);
        } catch (error) {
            console.error("Failed to fetch FAQs", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (courseId) {
            fetchFAQs();
        }
    }, [courseId]);

    const handleOpenDialog = (faq: FAQ | null = null) => {
        if (faq) {
            setEditingFaq(faq);
            setQuestion(faq.question);
            setAnswer(faq.answer);
        } else {
            setEditingFaq(null);
            setQuestion("");
            setAnswer("");
        }
        setDialogOpen(true);
    };

    const handleSubmit = async () => {
        if (!question || !answer) {
            toast.error("Please fill in all fields");
            return;
        }

        try {
            setSubmitting(true);
            if (editingFaq) {
                await updateFAQ(editingFaq.id, { question, answer });
                toast.success("FAQ updated successfully");
            } else {
                await createFAQ(courseId, { question, answer });
                toast.success("FAQ created successfully");
            }
            setDialogOpen(false);
            fetchFAQs();
            if (onRefresh) onRefresh();
        } catch (error) {
            toast.error("Failed to save FAQ");
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this FAQ?")) return;

        try {
            await deleteFAQ(id);
            toast.success("FAQ deleted successfully");
            fetchFAQs();
            if (onRefresh) onRefresh();
        } catch (error) {
            toast.error("Failed to delete FAQ");
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (active.id !== over?.id) {
            const oldIndex = faqs.findIndex((f) => f.id === active.id);
            const newIndex = faqs.findIndex((f) => f.id === over?.id);

            const newFaqs = arrayMove(faqs, oldIndex, newIndex);
            setFaqs(newFaqs);

            try {
                await reorderFAQs(
                    courseId,
                    newFaqs.map((f) => f.id)
                );
                toast.success("Order updated");
            } catch (error) {
                toast.error("Failed to update order");
                fetchFAQs(); // Revert on failure
            }
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">
                    Course FAQs ({faqs.length})
                </h3>
                <Button
                    onClick={() => handleOpenDialog()}
                    className="gap-2 bg-blue-800 hover:bg-blue-900 disabled:opacity-70"
                >
                    <Plus size={18} />
                    Add FAQ
                </Button>
            </div>

            {faqs.length === 0 ? (
                <Card className="border-dashed border-2">
                    <CardContent className="p-16 flex flex-col items-center justify-center ">
                        <HelpCircle className="w-16 h-16 mb-4 opacity-10" />
                        <h3 className="text-lg font-medium text-gray-900 mb-1">
                            No FAQs found
                        </h3>
                        <p className="text-sm text-gray-500 mb-6">
                            Add FAQs to help students understand your course better.
                        </p>
                        <Button
                            onClick={() => handleOpenDialog()}
                            variant="outline"
                            className="gap-2"
                        >
                            <Plus size={18} />
                            Add First FAQ
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={faqs.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                        {faqs.map((faq) => (
                            <SortableFAQItem
                                key={faq.id}
                                faq={faq}
                                onEdit={handleOpenDialog}
                                onDelete={handleDelete}
                            />
                        ))}
                    </SortableContext>
                </DndContext>
            )}

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="w-full max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>{editingFaq ? "Edit FAQ" : "Add New FAQ"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="question">Question</Label>
                            <Input
                                id="question"
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                placeholder="Ex: What are the prerequisites for this course?"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="answer">Answer</Label>
                            <Textarea
                                id="answer"
                                value={answer}
                                onChange={(e) => setAnswer(e.target.value)}
                                placeholder="Provide a detailed answer..."
                                rows={5}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="bg-blue-800 hover:bg-blue-900 disabled:opacity-70"
                        >
                            {submitting ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            {editingFaq ? "Update FAQ" : "Create FAQ"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
