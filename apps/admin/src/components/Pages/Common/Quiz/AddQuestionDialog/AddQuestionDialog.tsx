"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// import { Checkbox } from "@/components/ui/checkbox"
import { X, Plus, Upload } from "lucide-react";
import { CreateQuizQuestionPayload, QuizQuestion } from "@/types/quiz";
import { Checkbox } from "@/components/ui/checkbox";

interface AddQuestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddQuestion: (question: CreateQuizQuestionPayload) => void;
  categories: string[];
  editMode?: boolean;
  initialData?: QuizQuestion;
}

interface FormData {
  question: string;
  category: string;
  subCategory: string;
  options: string[];
  answer: string;
  hasImage: boolean;
  imageUrl: string;
}

export default function AddQuestionDialog({
  open,
  onOpenChange,
  onAddQuestion,
  categories,
  editMode = false,
  initialData,
}: AddQuestionDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<FormData>({
    question: "",
    category: "",
    subCategory: "",
    options: ["", "", "", ""],
    answer: "",
    hasImage: false,
    imageUrl: "",
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.question.trim()) {
      newErrors.question = "Question is required";
    }

    if (!formData.category) {
      newErrors.category = "Category is required";
    }

    if (!formData.subCategory) {
      newErrors.subCategory = "Sub category is required";
    }

    const nonEmptyOptions = formData.options.filter((opt) => opt.trim() !== "");
    if (nonEmptyOptions.length < 2) {
      newErrors.options = "At least 2 options are required";
    }

    if (!formData.answer) {
      newErrors.answer = "Correct answer is required";
    } else if (!formData.options.includes(formData.answer)) {
      newErrors.answer = "Correct answer must be one of the options";
    }

    if (formData.hasImage && !formData.imageUrl && !selectedFile) {
      newErrors.imageUrl = "Please upload an image or provide an image URL";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validateForm()) {
      const filteredOptions = formData.options.filter(
        (opt) => opt.trim() !== ""
      );
      let imageUrl = formData.imageUrl;
      if (selectedFile) {
        imageUrl = "URL.createObjectURL(selectedFile)";
      }

      onAddQuestion({
        question: formData.question,
        category: formData.category,
        options: filteredOptions,
        answer: formData.answer,
        hasImage: formData.hasImage && (!!imageUrl || !!selectedFile),
        imageUrl: formData.hasImage ? imageUrl : undefined,
        subCategory: formData.subCategory,
      });

      // Reset form if not in edit mode
      if (!editMode) {
        setFormData({
          question: "",
          category: "",
          subCategory: "",
          options: ["", "", "", ""],
          answer: "",
          hasImage: false,
          imageUrl: "",
        });
        setSelectedFile(null);
      }
      setErrors({});
    }
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...formData.options];
    newOptions[index] = value;
    setFormData({ ...formData, options: newOptions });
  };

  const addOption = () => {
    setFormData({ ...formData, options: [...formData.options, ""] });
  };

  const removeOption = (index: number) => {
    const newOptions = formData.options.filter((_, i) => i !== index);
    const newFormData = { ...formData, options: newOptions };

    // If the removed option was the answer, reset the answer
    if (formData.options[index] === formData.answer) {
      newFormData.answer = "";
    }

    setFormData(newFormData);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const subCategoryMap: Record<string, string[]> = {
    "ai-skills": [
      "AI Product Strategy & Lifecycle",
      "AI Architecture & Technical Collaboration",
      "AI Safety, Ethics & Governance",
      "Stakeholder Communication & Team Alignment",
      "AI User Experience, Performance & Metrics",
    ],
    "ai-jobs": [
      "AI System Design & Architecture",
      "Evaluation, Metrics & Governance",
      "Risk, Safety & Robustness",
      "Ethics, Fairness & Social Impact",
      "Optimization, Trade-offs & Product Strategy",
    ],
    "pm-skills": [
      "Product Roadmapping",
      "Market & User Research",
      "Agile Planning",
      "Cross-functional Leadership",
    ],
    "js-skills": [
      "MongoDB Questions",
      "Express.js Questions",
      "Angular Questions",
      "Node.js Questions",
    ],
  };

  useEffect(() => {
    if (editMode && initialData) {
      setFormData({
        question: initialData.question || "",
        category: initialData.category || "",
        subCategory: initialData.subCategory || "",
        options: initialData.options || ["", "", "", ""],
        answer: initialData.answer || "",
        hasImage: initialData.hasImage || false,
        imageUrl: initialData.imageUrl || "",
      });
    } else if (!editMode) {
      // Reset form when not in edit mode
      setFormData({
        question: "",
        category: "",
        subCategory: "",
        options: ["", "", "", ""],
        answer: "",
        hasImage: false,
        imageUrl: "",
      });
    }
  }, [editMode, initialData, open]);

  useEffect(() => {
    if (open) {
      setErrors({});
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:min-w-[600px] sm:max-w-fit max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editMode ? "Edit Question" : "Add New Question"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="question">Question</Label>
            <Input
              id="question"
              value={formData.question}
              onChange={(e) =>
                setFormData({ ...formData, question: e.target.value })
              }
              placeholder="Enter your question"
              className={errors.question ? "border-red-500" : ""}
            />
            {errors.question && (
              <p className="text-sm text-red-500">{errors.question}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2 w-full">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category}
                onValueChange={(value) =>
                  setFormData({ ...formData, category: value })
                }
              >
                <SelectTrigger
                  id="category"
                  className={`w-full ${
                    errors.category ? "border-red-500" : ""
                  }`}
                >
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && (
                <p className="text-sm text-red-500">{errors.category}</p>
              )}
            </div>

            <div className="flex flex-col gap-2 w-full">
              <Label htmlFor="category">Sub-Category</Label>
              <Select
                disabled={!formData.category}
                value={formData.subCategory}
                onValueChange={(value) =>
                  setFormData({ ...formData, subCategory: value })
                }
              >
                <SelectTrigger
                  id="subCategory"
                  className={`w-full ${
                    errors.subCategory ? "border-red-500" : ""
                  }`}
                >
                  <SelectValue placeholder="Select a sub category" />
                </SelectTrigger>
                <SelectContent>
                  {(subCategoryMap[formData.category] || []).map((subCat) => (
                    <SelectItem key={subCat} value={subCat}>
                      {subCat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.subCategory && (
                <p className="text-sm text-red-500">{errors.subCategory}</p>
              )}
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Options</Label>
            {formData.options.map((option, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={option}
                  onChange={(e) => handleOptionChange(index, e.target.value)}
                  placeholder={`Option ${index + 1}`}
                  className={errors.options ? "border-red-500" : ""}
                />
                {formData.options.length > 2 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeOption(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            {errors.options && (
              <p className="text-sm text-red-500">{errors.options}</p>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={addOption}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Option
            </Button>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="answer">Correct Answer</Label>
            <Select
              value={formData.answer}
              onValueChange={(value) =>
                setFormData({ ...formData, answer: value })
              }
            >
              <SelectTrigger
                id="answer"
                className={errors.answer ? "border-red-500" : ""}
              >
                <SelectValue placeholder="Select the correct answer" />
              </SelectTrigger>
              <SelectContent>
                {formData.options
                  .filter((option) => option.trim() !== "")
                  .map((option, index) => (
                    <SelectItem key={index} value={option}>
                      {option}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {errors.answer && (
              <p className="text-sm text-red-500">{errors.answer}</p>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="hasImage"
              checked={formData.hasImage}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, hasImage: checked as boolean })
              }
            />
            <Label htmlFor="hasImage">Has Image</Label>
          </div>
          {formData.hasImage && (
            <div className="grid gap-2">
              <Label>Image</Label>
              <div className="flex flex-col gap-4">
                <div className="flex gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    accept="image/*"
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={triggerFileInput}
                    className="flex-1"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {selectedFile ? selectedFile.name : "Choose Image"}
                  </Button>
                </div>

                {selectedFile && (
                  <div className="text-sm text-muted-foreground">
                    Selected file: {selectedFile.name}
                  </div>
                )}

                <div className="flex items-center">
                  <div className="flex-grow h-px bg-muted"></div>
                  <span className="px-2 text-xs text-muted-foreground">OR</span>
                  <div className="flex-grow h-px bg-muted"></div>
                </div>

                <Input
                  placeholder="Enter image URL"
                  value={formData.imageUrl || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, imageUrl: e.target.value })
                  }
                  className={errors.imageUrl ? "border-red-500" : ""}
                />
              </div>
              {errors.imageUrl && (
                <p className="text-sm text-red-500">{errors.imageUrl}</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>
            {editMode ? "Save Changes" : "Add Question"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
