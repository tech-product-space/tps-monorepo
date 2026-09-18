"use client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteBlog,
  deleteBlogFile,
  getAllBlogFiles,
  uploadBlogFile,
} from "@/services/blog/blogService";
import { Check, Copy, Edit, Trash2, UploadCloud } from "lucide-react";
import { format } from "path";
import React, { use, useEffect, useRef, useState } from "react";

export interface FileItem {
  key: string;
  url: string;
  size: number;
  lastModified: string;
}

const BlogFiles = () => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [searchName, setSearchName] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([]);

  const getAllBlogFilesFn = async () => {
    const response = await getAllBlogFiles();
    const updatedFiles = [...response.files];
    updatedFiles.shift();
    setFiles(updatedFiles);
  };

  const bytesToMB = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(2) + " MB";
  };

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setUploadedFilename(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setIsUploading(true);
      const response = await uploadBlogFile(file);
      setUploadedFilename(file.name);
      console.log("Uploaded file info:", response.data);

      const newFile: FileItem = {
        key: file.name,
        url: response.fileUrl,
        size: 0,
        lastModified: new Date().toString(),
      };

      setFiles((prevFiles) => [...prevFiles, newFile]);
      setFile(null);
      setUploadedFilename(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handlePreviewFileDelete = () => {
    setFile(null);
    setUploadedFilename(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleDelete = async (key: string) => {
    try {
      const response = await deleteBlogFile({ key });
      console.log("Deleted file info:", response.data);
      setFiles((prevFiles) => prevFiles.filter((file) => file.key !== key));
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  useEffect(() => {
    getAllBlogFilesFn();
  }, []);

  useEffect(() => {
    const filteredFiles = files.filter((file) =>
      file.key.toLowerCase().includes(searchName.toLowerCase())
    );
    setFilteredFiles(filteredFiles);
  }, [files, searchName]);

  return (
    <div className="flex flex-col h-screen">
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <SidebarTrigger size={"lg"} />
          <p className="text-lg font-semibold">Blog Files</p>
        </div>
      </div>
      <div className="my-4 mr-5 flex justify-between items-center">
        <div className="w-full max-w-md p-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Input
                id="file"
                type="file"
                onChange={handleFileChange}
                ref={inputRef}
                className="cursor-pointer"
              />

              <Button
                variant="ghost"
                size="icon"
                onClick={handlePreviewFileDelete}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>

            <Button
              disabled={!file || isUploading}
              onClick={handleUpload}
              className="flex items-center gap-2"
            >
              <UploadCloud className="h-4 w-4" />
              {isUploading ? "Uploading..." : "Upload File"}
            </Button>

            {uploadedFilename && (
              <p className="text-sm text-green-600">
                Uploaded: {uploadedFilename}
              </p>
            )}
          </div>
        </div>
        <Input
          type="text"
          placeholder="Search by image name"
          className="border p-2 rounded-md w-64"
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
        />
      </div>
      <div className="flex flex-col h-full flex-1 overflow-auto p-5 pb-10">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-bold text-base">Image</TableHead>
                <TableHead className="font-bold text-base">File Name</TableHead>
                <TableHead className="font-bold text-base">Size</TableHead>
                <TableHead className="text-right font-bold text-base">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFiles.map((file, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <img
                      src={file.url}
                      alt={file.key}
                      className="h-16 rounded-md border"
                    />
                  </TableCell>
                  <TableCell>{file.key}</TableCell>
                  <TableCell>{bytesToMB(file.size)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => handleCopy(file.url, index)}
                      >
                        {copiedIndex === index ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                        <span className="sr-only">Copy URL</span>
                      </Button>

                      <Button
                        variant="outline"
                        size="icon"
                        className="text-destructive"
                        onClick={() => handleDelete(file.key)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredFiles.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No blogs found. Create your first blog post!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default BlogFiles;
