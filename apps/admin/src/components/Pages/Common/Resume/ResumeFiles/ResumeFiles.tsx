"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  getAllResumeFiles,
} from "@/services/blog/blogService";
import { Check, Copy, Edit, Trash2, UploadCloud } from "lucide-react";
import React, { use, useEffect, useRef, useState } from "react";

export interface FileItem {
  key: string;
  url: string;
  size: number;
  lastModified: string;
}

export const ResumeFiles = () => {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [searchName, setSearchName] = useState<string>("");

  const [filteredFiles, setFilteredFiles] = useState<FileItem[]>([]);

  const getAllResumeFilesFn = async () => {
    const response = await getAllResumeFiles();
    const updatedFiles = [...response.files];
    updatedFiles.shift();
    setFiles(updatedFiles);
  };

  const bytesToMB = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return mb.toFixed(2) + " MB";
  };

  function formatDate(isoString: string) {
    const date = new Date(isoString);
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-based
    const yyyy = date.getFullYear();

    return `${dd}-${mm}-${yyyy}`;
  }

  const handleCopy = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  useEffect(() => {
    getAllResumeFilesFn();
  }, []);

  useEffect(() => {
    const filteredFiles = files
      .filter((file) =>
        file.key.toLowerCase().includes(searchName.toLowerCase())
      )
      .sort((a, b) => {
        const dateA = new Date(a.lastModified).getTime();
        const dateB = new Date(b.lastModified).getTime();
        return dateB - dateA; // Descending
      });

    setFilteredFiles(filteredFiles);
  }, [files, searchName]);

  return (
    <div className="flex flex-col h-screen">
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <SidebarTrigger size={"lg"} />
          <p className="text-lg font-semibold">Resume Files</p>
        </div>
      </div>
      <div className="my-4 mx-5 flex justify-between items-center">
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
                <TableHead className="font-bold text-base">File Name</TableHead>
                <TableHead className="font-bold text-base">
                  Date Added
                </TableHead>
                <TableHead className="font-bold text-base">Size</TableHead>
                <TableHead className="text-right font-bold text-base">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredFiles.map((file, index) => (
                <TableRow
                  key={index}
                  onClick={() => window.open(file.url, "_blank")}
                >
                  <TableCell className="hover:text-blue-400 hover:underline cursor-pointer">
                    {file.key}
                  </TableCell>
                  <TableCell>{formatDate(file.lastModified)}</TableCell>
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
