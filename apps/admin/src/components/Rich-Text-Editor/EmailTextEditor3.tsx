"use client";
import type React from "react";
import { useRef, useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Plus,
  MousePointer,
  Link,
  Image,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface ButtonConfig {
  text: string;
  url: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: string;
  padding: string;
}

interface LinkConfig {
  text: string;
  url: string;
}

interface ImageConfig {
  src: string;
  alt: string;
  width: string;
  height: string;
  linkUrl: string;
  alignment: "left" | "center" | "right";
}

type Props = {
  value: string;
  onChange: (val: string) => void;
};

// --- Resizable Image Component rendered into the editor DOM ---
function makeResizableImage(
  imgEl: HTMLImageElement,
  wrapper: HTMLElement,
  onDelete: () => void,
) {
  wrapper.style.position = "relative";
  wrapper.style.display = "inline-block";
  wrapper.style.lineHeight = "0";

  imgEl.style.display = "block";
  imgEl.style.cursor = "pointer";
  imgEl.draggable = false;

  // Resize handles: se, sw, ne, nw, e, w, s, n
  const handleDefs: { cursor: string; pos: string }[] = [
    { cursor: "se-resize", pos: "bottom-right" },
    { cursor: "sw-resize", pos: "bottom-left" },
    { cursor: "ne-resize", pos: "top-right" },
    { cursor: "nw-resize", pos: "top-left" },
    { cursor: "e-resize", pos: "middle-right" },
    { cursor: "w-resize", pos: "middle-left" },
    { cursor: "s-resize", pos: "bottom-center" },
    { cursor: "n-resize", pos: "top-center" },
  ];

  const handles: HTMLDivElement[] = [];

  function positionHandle(handle: HTMLDivElement, pos: string) {
    handle.style.position = "absolute";
    handle.style.width = "10px";
    handle.style.height = "10px";
    handle.style.background = "#fff";
    handle.style.border = "2px solid #335DC8";
    handle.style.borderRadius = "2px";
    handle.style.zIndex = "100";
    handle.style.display = "none";

    if (pos === "bottom-right") {
      handle.style.bottom = "-5px";
      handle.style.right = "-5px";
    }
    if (pos === "bottom-left") {
      handle.style.bottom = "-5px";
      handle.style.left = "-5px";
    }
    if (pos === "top-right") {
      handle.style.top = "-5px";
      handle.style.right = "-5px";
    }
    if (pos === "top-left") {
      handle.style.top = "-5px";
      handle.style.left = "-5px";
    }
    if (pos === "middle-right") {
      handle.style.top = "calc(50% - 5px)";
      handle.style.right = "-5px";
    }
    if (pos === "middle-left") {
      handle.style.top = "calc(50% - 5px)";
      handle.style.left = "-5px";
    }
    if (pos === "bottom-center") {
      handle.style.bottom = "-5px";
      handle.style.left = "calc(50% - 5px)";
    }
    if (pos === "top-center") {
      handle.style.top = "-5px";
      handle.style.left = "calc(50% - 5px)";
    }
  }

  handleDefs.forEach(({ cursor, pos }) => {
    const handle = document.createElement("div");
    handle.className = "img-resize-handle";
    handle.style.cursor = cursor;
    positionHandle(handle, pos);
    wrapper.appendChild(handle);
    handles.push(handle);

    let startX = 0,
      startY = 0,
      startW = 0,
      startH = 0;

    const onMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startX = e.clientX;
      startY = e.clientY;
      startW = imgEl.offsetWidth;
      startH = imgEl.offsetHeight;

      const onMouseMove = (e: MouseEvent) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        let newW = startW;
        let newH = startH;

        if (pos.includes("right")) newW = Math.max(40, startW + dx);
        if (pos.includes("left")) newW = Math.max(40, startW - dx);
        if (pos.includes("bottom")) newH = Math.max(20, startH + dy);
        if (pos.includes("top")) newH = Math.max(20, startH - dy);

        // For corner handles maintain aspect ratio with shift, free otherwise
        if (pos === "middle-right" || pos === "middle-left") {
          imgEl.style.width = `${newW}px`;
          imgEl.style.height = "auto";
        } else if (pos === "bottom-center" || pos === "top-center") {
          imgEl.style.height = `${newH}px`;
          imgEl.style.width = "auto";
        } else {
          // corners — maintain aspect ratio
          const ratio = startH / startW;
          imgEl.style.width = `${newW}px`;
          imgEl.style.height = `${Math.round(newW * ratio)}px`;
        }
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        // Trigger onChange after resize
        const editor = wrapper.closest("[contenteditable]") as HTMLElement;
        if (editor) {
          editor.dispatchEvent(new Event("input", { bubbles: true }));
        }
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };

    handle.addEventListener("mousedown", onMouseDown);
  });

  // Delete button
  const deleteBtn = document.createElement("button");
  deleteBtn.innerHTML = "×";
  deleteBtn.contentEditable = "false";
  deleteBtn.style.cssText = `
    position: absolute;
    top: -10px;
    right: -10px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #ef4444;
    color: white;
    border: 2px solid white;
    cursor: pointer;
    font-size: 13px;
    font-weight: bold;
    display: none;
    z-index: 200;
    box-shadow: 0 2px 4px rgba(0,0,0,0.25);
    align-items: center;
    justify-content: center;
    line-height: 1;
    padding: 0;
  `;
  deleteBtn.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onDelete();
  };
  wrapper.appendChild(deleteBtn);

  // Show/hide handles & delete on hover/focus
  function showHandles() {
    handles.forEach((h) => {
      h.style.display = "block";
    });
    deleteBtn.style.display = "flex";
    wrapper.style.outline = "2px solid #335DC8";
  }
  function hideHandles() {
    handles.forEach((h) => {
      h.style.display = "none";
    });
    deleteBtn.style.display = "none";
    wrapper.style.outline = "none";
  }

  wrapper.addEventListener("mouseenter", showHandles);
  wrapper.addEventListener("mouseleave", hideHandles);
}

export default function EmailTextEditor3({ value, onChange }: Props) {
  const emailBody = "";
  const [content, setContent] = useState(emailBody || "");

  const [showButtonModal, setShowButtonModal] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showImageEditModal, setShowImageEditModal] = useState(false);
  const [editingImageEl, setEditingImageEl] = useState<HTMLImageElement | null>(
    null,
  );
  const [editingWrapperEl, setEditingWrapperEl] = useState<HTMLElement | null>(
    null,
  );
  const [editImageConfig, setEditImageConfig] = useState<ImageConfig>({
    src: "",
    alt: "",
    width: "100%",
    height: "auto",
    linkUrl: "",
    alignment: "center",
  });

  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);

  useEffect(() => {
    if (editorRef.current && value && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
      setContent(value);
    }
  }, [value]);

  useEffect(() => {
    if (editorRef.current && !editorRef.current.innerHTML && content) {
      editorRef.current.innerHTML = content;
    }
  }, [content]);

  const listItemStyles =
    "margin: 6px 0; line-height: 1.6; font-weight: normal; font-size: 14px;";

  const sanitizePastedContent = (html: string): string => {
    const temp = document.createElement("div");
    temp.innerHTML = html;
    const headings = temp.querySelectorAll("h1, h2, h3, h4, h5, h6");
    headings.forEach((heading) => {
      const p = document.createElement("p");
      p.innerHTML = heading.innerHTML;
      p.style.color = "#333333";
      p.style.lineHeight = "1.6";
      p.style.margin = "0 0 14px 0";
      heading.replaceWith(p);
    });
    return temp.innerHTML;
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    const contentToInsert = html ? sanitizePastedContent(html) : text;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const temp = document.createElement("div");
      temp.innerHTML = contentToInsert;
      const frag = document.createDocumentFragment();
      let node: Node | null;
      while ((node = temp.firstChild)) frag.appendChild(node);
      range.insertNode(frag);
      if (editorRef.current) {
        const newContent = editorRef.current.innerHTML;
        setContent(newContent);
        onChange(newContent);
      }
    }
  };

  const execCommand = (command: string, value?: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    if (command === "insertUnorderedList" || command === "insertOrderedList") {
      const listType = command === "insertUnorderedList" ? "ul" : "ol";
      const selectedText = selection.toString().trim();
      const currentList =
        range.commonAncestorContainer.nodeType === Node.TEXT_NODE
          ? range.commonAncestorContainer.parentElement?.closest("ul, ol")
          : (range.commonAncestorContainer as Element)?.closest("ul, ol");

      if (currentList) {
        const listItems = Array.from(currentList.querySelectorAll("li"));
        const fragment = document.createDocumentFragment();
        listItems.forEach((li) => {
          const p = document.createElement("p");
          p.innerHTML = li.innerHTML || "<br>";
          fragment.appendChild(p);
        });
        currentList.parentNode?.replaceChild(fragment, currentList);
      } else {
        const listElement = document.createElement(listType);
        listElement.style.cssText = "margin: 12px 0; padding-left: 24px;";
        if (selectedText) {
          const lines = selectedText.split("\n").filter((line) => line.trim());
          if (lines.length > 0) {
            lines.forEach((line) => {
              const li = document.createElement("li");
              li.textContent = line.trim();
              li.style.cssText = listItemStyles;
              listElement.appendChild(li);
            });
          } else {
            const li = document.createElement("li");
            li.textContent = selectedText;
            li.style.cssText = listItemStyles;
            listElement.appendChild(li);
          }
        } else {
          const li = document.createElement("li");
          li.innerHTML = "<br>";
          li.style.cssText = listItemStyles;
          listElement.appendChild(li);
        }
        range.deleteContents();
        range.insertNode(listElement);
        const firstLi = listElement.querySelector("li");
        if (firstLi) {
          const newRange = document.createRange();
          newRange.setStart(firstLi, firstLi.childNodes.length);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }
      }
    } else {
      document.execCommand(command, false, value);
    }

    if (editorRef.current) {
      const newContent = editorRef.current.innerHTML;
      setContent(newContent);
      onChange(newContent);
    }
  };

  const handleTextColor = (color: string) => execCommand("foreColor", color);
  const handleBackgroundColor = (color: string) =>
    execCommand("hiliteColor", color);

  const handleEditorKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    if (e.key === "Enter") {
      const listItem =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? range.startContainer.parentElement?.closest("li")
          : (range.startContainer as Element)?.closest("li");

      if (listItem) {
        e.preventDefault();
        const list = listItem.closest("ul, ol")!;
        const isEmptyItem = listItem.textContent?.trim() === "";
        if (isEmptyItem) {
          const newP = document.createElement("p");
          newP.innerHTML = "<br>";
          if (list.children.length === 1) {
            list.parentNode?.replaceChild(newP, list);
          } else {
            listItem.remove();
            list.insertAdjacentElement("afterend", newP);
          }
          const newRange = document.createRange();
          newRange.setStart(newP, 0);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        } else {
          const newLi = document.createElement("li");
          newLi.innerHTML = "<br>";
          newLi.style.cssText = listItemStyles;
          listItem.insertAdjacentElement("afterend", newLi);
          const newRange = document.createRange();
          newRange.setStart(newLi, 0);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        }
        const newContent = editorRef.current!.innerHTML;
        setContent(newContent);
        onChange(newContent);
        return;
      }
    }

    if (e.key === "Backspace") {
      const listItem =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? range.startContainer.parentElement?.closest("li")
          : (range.startContainer as Element)?.closest("li");

      if (listItem && range.startOffset === 0) {
        const isEmptyItem = listItem.textContent?.trim() === "";
        if (isEmptyItem) {
          e.preventDefault();
          const list = listItem.closest("ul, ol")!;
          if (list.children.length === 1) {
            const newP = document.createElement("p");
            newP.innerHTML = "<br>";
            list.parentNode?.replaceChild(newP, list);
            const newRange = document.createRange();
            newRange.setStart(newP, 0);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
          } else {
            const prevLi = listItem.previousElementSibling as HTMLLIElement;
            listItem.remove();
            if (prevLi) {
              const newRange = document.createRange();
              newRange.setStart(prevLi, prevLi.childNodes.length);
              newRange.collapse(true);
              selection.removeAllRanges();
              selection.addRange(newRange);
            }
          }
          const newContent = editorRef.current!.innerHTML;
          setContent(newContent);
          onChange(newContent);
        }
      }
    }
  };

  // Click on image → open edit modal
  const handleEditorClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === "IMG") {
      const img = target as HTMLImageElement;
      const wrapper = img.closest("[data-image-wrapper]") as HTMLElement | null;
      const anchor = img.closest("a") as HTMLAnchorElement | null;
      const currentLinkUrl = anchor?.href || "";
      let alignment: "left" | "center" | "right" = "center";
      if (wrapper) {
        const ta = wrapper.style.textAlign;
        if (ta === "left") alignment = "left";
        else if (ta === "right") alignment = "right";
        else alignment = "center";
      }
      setEditingImageEl(img);
      setEditingWrapperEl(wrapper);
      setEditImageConfig({
        src: img.src,
        alt: img.alt,
        width: img.style.width || "100%",
        height: img.style.height || "auto",
        linkUrl: currentLinkUrl,
        alignment,
      });
      setShowImageEditModal(true);
    }
  };

  const applyImageEdit = () => {
    if (!editingImageEl || !editorRef.current) return;

    const alignStyle =
      editImageConfig.alignment === "center"
        ? "margin: 0 auto;"
        : editImageConfig.alignment === "right"
          ? "margin-left: auto; margin-right: 0;"
          : "margin-right: auto; margin-left: 0;";

    editingImageEl.src = editImageConfig.src;
    editingImageEl.alt = editImageConfig.alt;
    editingImageEl.style.cssText = `
      width: ${editImageConfig.width};
      height: ${editImageConfig.height};
      max-width: 100%;
      display: block;
      border-radius: 4px;
      cursor: pointer;
      ${alignStyle}
    `;

    if (editingWrapperEl) {
      editingWrapperEl.style.textAlign = editImageConfig.alignment;
    }

    const currentAnchor = editingImageEl.closest(
      "a",
    ) as HTMLAnchorElement | null;
    if (editImageConfig.linkUrl.trim()) {
      if (currentAnchor) {
        currentAnchor.href = editImageConfig.linkUrl;
      } else {
        const anchor = document.createElement("a");
        anchor.href = editImageConfig.linkUrl;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        anchor.style.display = "block";
        editingImageEl.parentNode?.insertBefore(anchor, editingImageEl);
        anchor.appendChild(editingImageEl);
      }
    } else {
      if (currentAnchor) {
        currentAnchor.parentNode?.insertBefore(editingImageEl, currentAnchor);
        currentAnchor.remove();
      }
    }

    const newContent = editorRef.current.innerHTML;
    setContent(newContent);
    onChange(newContent);
    setShowImageEditModal(false);
    setEditingImageEl(null);
    setEditingWrapperEl(null);
  };

  const [buttonConfig, setButtonConfig] = useState<ButtonConfig>({
    text: "Click Here",
    url: "",
    backgroundColor: "#335DC8",
    textColor: "#ffffff",
    borderRadius: "12px",
    padding: "12px 24px",
  });

  const [linkConfig, setLinkConfig] = useState<LinkConfig>({
    text: "",
    url: "",
  });

  const [imageConfig, setImageConfig] = useState<ImageConfig>({
    src: "",
    alt: "",
    width: "100%",
    height: "auto",
    linkUrl: "",
    alignment: "center",
  });

  const insertHyperlink = () => {
    if (!editorRef.current) return;
    const selection = window.getSelection();
    if (savedRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
    editorRef.current.focus({ preventScroll: true });
    if (savedRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
    if (!selection || selection.rangeCount === 0) {
      alert("Please place your cursor in the editor first");
      return;
    }
    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();
    const linkText = selectedText || linkConfig.text;
    if (!linkText) {
      alert("Please enter link text or select some text first");
      return;
    }
    const linkElement = document.createElement("a");
    linkElement.href = linkConfig.url;
    linkElement.target = "_blank";
    linkElement.rel = "noopener noreferrer";
    linkElement.style.color = "#007bff";
    linkElement.style.textDecoration = "underline";
    linkElement.style.cursor = "pointer";
    linkElement.textContent = linkText;
    try {
      if (selectedText) {
        range.deleteContents();
        range.insertNode(linkElement);
      } else {
        range.insertNode(linkElement);
      }
      selection.removeAllRanges();
      if (editorRef.current) {
        setContent(editorRef.current.innerHTML);
        onChange(editorRef.current.innerHTML);
      }
    } catch (error) {
      console.warn("Link insertion failed:", error);
    }
    setLinkConfig({ text: "", url: "" });
    savedRangeRef.current = null;
    setShowLinkModal(false);
  };

  const openLinkModal = () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() || "";
    if (selection && selection.rangeCount > 0) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
    setLinkConfig({ text: selectedText, url: "" });
    setShowLinkModal(true);
  };

  const openButtonModal = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
    setShowButtonModal(true);
  };

  const openImageModal = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      savedRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
    setImageConfig({
      src: "",
      alt: "",
      width: "100%",
      height: "auto",
      linkUrl: "",
      alignment: "center",
    });
    setShowImageModal(true);
  };

  const insertImage = () => {
    if (!editorRef.current || !imageConfig.src) {
      alert("Please provide an image.");
      return;
    }
    const selection = window.getSelection();
    if (savedRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
    editorRef.current.focus({ preventScroll: true });
    if (savedRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }

    const alignStyle =
      imageConfig.alignment === "center"
        ? "margin: 0 auto;"
        : imageConfig.alignment === "right"
          ? "margin-left: auto; margin-right: 0;"
          : "margin-right: auto; margin-left: 0;";

    const imgElement = document.createElement("img");
    imgElement.src = imageConfig.src;
    imgElement.alt = imageConfig.alt;
    imgElement.style.cssText = `
      width: ${imageConfig.width};
      height: ${imageConfig.height};
      max-width: 100%;
      display: block;
      border-radius: 4px;
      cursor: pointer;
      ${alignStyle}
    `;
    imgElement.draggable = false;

    let insertNode: HTMLElement = imgElement;
    if (imageConfig.linkUrl.trim()) {
      const anchor = document.createElement("a");
      anchor.href = imageConfig.linkUrl;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.style.display = "block";
      anchor.appendChild(imgElement);
      insertNode = anchor;
    }

    // Outer block wrapper (p tag, stays in editor flow)
    const outerWrapper = document.createElement("p");
    outerWrapper.setAttribute("data-image-wrapper", "true");
    outerWrapper.style.cssText = `
      margin: 12px 0;
      text-align: ${imageConfig.alignment};
      position: relative;
      line-height: 0;
    `;

    // Inner span wrapper for resize handles
    const innerWrapper = document.createElement("span");
    innerWrapper.style.cssText = `
      display: inline-block;
      position: relative;
      line-height: 0;
    `;
    innerWrapper.appendChild(insertNode);
    outerWrapper.appendChild(innerWrapper);

    // Attach resize handles to innerWrapper
    makeResizableImage(imgElement, innerWrapper, () => {
      outerWrapper.remove();
      if (editorRef.current) {
        const newContent = editorRef.current.innerHTML;
        setContent(newContent);
        onChange(newContent);
      }
    });

    try {
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        let insertAfter: Element | null = null;
        let node: Node | null = range.startContainer;
        while (node && node !== editorRef.current) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            const display = window.getComputedStyle(el).display;
            if (display === "block" || display === "list-item") {
              insertAfter = el;
              break;
            }
          }
          node = node.parentNode;
        }
        if (insertAfter && insertAfter !== editorRef.current) {
          insertAfter.insertAdjacentElement("afterend", outerWrapper);
        } else {
          range.insertNode(outerWrapper);
        }
      } else {
        editorRef.current.appendChild(outerWrapper);
      }

      const spacer = document.createElement("p");
      spacer.innerHTML = "<br>";
      outerWrapper.insertAdjacentElement("afterend", spacer);

      const newRange = document.createRange();
      newRange.setStart(spacer, 0);
      newRange.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(newRange);

      const newContent = editorRef.current.innerHTML;
      setContent(newContent);
      onChange(newContent);
    } catch (error) {
      console.warn("Image insertion failed:", error);
    }

    savedRangeRef.current = null;
    setShowImageModal(false);
  };

  const insertButton = () => {
    if (!editorRef.current) return;
    const selection = window.getSelection();

    // Restore saved range (editor lost focus when modal opened)
    if (savedRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }
    editorRef.current.focus({ preventScroll: true });
    if (savedRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRangeRef.current);
    }

    let range: Range | null = null;
    if (selection && selection.rangeCount > 0) {
      range = selection.getRangeAt(0);
    }

    const buttonWrapper = document.createElement("div");
    buttonWrapper.className = "email-button-wrapper";
    buttonWrapper.style.cssText = `
      margin: 16px 0;
      text-align: center;
      position: relative;
      border: 2px dashed transparent;
      padding: 8px;
      border-radius: 8px;
      transition: all 0.2s ease;
    `;
    buttonWrapper.contentEditable = "false";
    buttonWrapper.setAttribute("data-button-id", Date.now().toString());

    const buttonElement = document.createElement("a");
    buttonElement.href = buttonConfig.url;
    buttonElement.target = "_blank";
    buttonElement.style.cssText = `
      display: inline-block;
      background-color: ${buttonConfig.backgroundColor};
      color: ${buttonConfig.textColor};
      text-decoration: none;
      padding: ${buttonConfig.padding};
      border-radius: ${buttonConfig.borderRadius};
      font-weight: 500;
      border: none;
      cursor: pointer;
      user-select: none;
      transition: all 0.2s ease;
      font-family: inherit;
      font-size: 14px;
    `;
    buttonElement.textContent = buttonConfig.text;
    buttonElement.addEventListener("mouseenter", () => {
      buttonElement.style.opacity = "0.9";
      buttonElement.style.transform = "translateY(-1px)";
    });
    buttonElement.addEventListener("mouseleave", () => {
      buttonElement.style.opacity = "1";
      buttonElement.style.transform = "translateY(0)";
    });

    const deleteButton = document.createElement("button");
    deleteButton.innerHTML = "×";
    deleteButton.style.cssText = `
      position: absolute; top: -8px; right: -8px;
      width: 24px; height: 24px; border-radius: 50%;
      background: #ef4444; color: white; border: 2px solid white;
      cursor: pointer; font-size: 14px; font-weight: bold;
      display: none; z-index: 10;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2); transition: all 0.2s ease;
    `;
    deleteButton.addEventListener("mouseenter", () => {
      deleteButton.style.background = "#dc2626";
      deleteButton.style.transform = "scale(1.1)";
    });
    deleteButton.addEventListener("mouseleave", () => {
      deleteButton.style.background = "#ef4444";
      deleteButton.style.transform = "scale(1)";
    });
    deleteButton.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      buttonWrapper.remove();
      const newContent = editorRef.current!.innerHTML;
      setContent(newContent);
      onChange(newContent);
    };
    buttonWrapper.onmouseenter = () => {
      buttonWrapper.style.border = "2px dashed #007bff";
      buttonWrapper.style.backgroundColor = "rgba(0, 123, 255, 0.05)";
      deleteButton.style.display = "flex";
      deleteButton.style.alignItems = "center";
      deleteButton.style.justifyContent = "center";
    };
    buttonWrapper.onmouseleave = () => {
      buttonWrapper.style.border = "2px dashed transparent";
      buttonWrapper.style.backgroundColor = "transparent";
      deleteButton.style.display = "none";
    };
    buttonWrapper.appendChild(buttonElement);
    buttonWrapper.appendChild(deleteButton);

    if (range) {
      range.deleteContents();
      range.insertNode(buttonWrapper);
      const spacer = document.createElement("p");
      spacer.innerHTML = "<br>";
      buttonWrapper.insertAdjacentElement("afterend", spacer);
      const newRange = document.createRange();
      newRange.setStart(spacer, 0);
      newRange.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(newRange);
    } else {
      editorRef.current.appendChild(buttonWrapper);
      const spacer = document.createElement("p");
      spacer.innerHTML = "<br>";
      editorRef.current.appendChild(spacer);
    }

    const newContent = editorRef.current.innerHTML;
    setContent(newContent);
    onChange(newContent);
    savedRangeRef.current = null;
    setShowButtonModal(false);
  };

  return (
    <div className="overflow-y-auto gap-4 flex flex-col">
      <div>
        {/* Link Modal */}
        {showLinkModal && (
          <div className="fixed inset-0 bg-black/10 flex items-center justify-center z-50">
            <Card className="w-full max-w-md mx-4">
              <CardHeader>
                <CardTitle className="text-lg">Insert Hyperlink</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Link Text</Label>
                  <Input
                    value={linkConfig.text}
                    onChange={(e) =>
                      setLinkConfig({ ...linkConfig, text: e.target.value })
                    }
                    placeholder="Enter link text"
                  />
                </div>
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input
                    value={linkConfig.url}
                    onChange={(e) =>
                      setLinkConfig({ ...linkConfig, url: e.target.value })
                    }
                    placeholder="https://www.theproductspace.in"
                  />
                </div>
                <div className="flex gap-2 pt-4">
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      insertHyperlink();
                    }}
                    className="flex-1"
                  >
                    <Link className="h-4 w-4 mr-2" /> Insert Link
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowLinkModal(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Insert Image Modal */}
        {showImageModal && (
          <div className="fixed inset-0 bg-black/10 flex items-center justify-center z-50">
            <Card className="w-full max-w-lg mx-4">
              <CardHeader>
                <CardTitle className="text-lg">Insert Image</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Image URL</Label>
                  <Input
                    value={
                      imageConfig.src.startsWith("data:") ? "" : imageConfig.src
                    }
                    onChange={(e) =>
                      setImageConfig({ ...imageConfig, src: e.target.value })
                    }
                    placeholder="https://... or paste image link"
                  />
                </div>
                {imageConfig.src && (
                  <div className="p-3 border rounded-lg bg-muted flex items-center justify-center min-h-[100px]">
                    <img
                      src={imageConfig.src}
                      alt="preview"
                      style={{
                        maxWidth: "100%",
                        maxHeight: "150px",
                        objectFit: "contain",
                        borderRadius: "4px",
                      }}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>
                    Alt Text{" "}
                    <span className="text-muted-foreground font-normal text-xs">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    value={imageConfig.alt}
                    onChange={(e) =>
                      setImageConfig({ ...imageConfig, alt: e.target.value })
                    }
                    placeholder="Describe the image"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Width</Label>
                    <Input
                      value={imageConfig.width}
                      onChange={(e) =>
                        setImageConfig({
                          ...imageConfig,
                          width: e.target.value,
                        })
                      }
                      placeholder="100% or 300px"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Alignment</Label>
                  <div className="flex gap-2">
                    {(["left", "center", "right"] as const).map((align) => (
                      <Button
                        key={align}
                        type="button"
                        variant={
                          imageConfig.alignment === align
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        className="flex-1 capitalize"
                        onClick={() =>
                          setImageConfig({ ...imageConfig, alignment: align })
                        }
                      >
                        {align}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>
                    Link URL{" "}
                    <span className="text-muted-foreground font-normal text-xs">
                      (optional — makes image clickable)
                    </span>
                  </Label>
                  <Input
                    value={imageConfig.linkUrl}
                    onChange={(e) =>
                      setImageConfig({
                        ...imageConfig,
                        linkUrl: e.target.value,
                      })
                    }
                    placeholder="https://www.theproductspace.in"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    onClick={insertImage}
                    className="flex-1"
                    disabled={!imageConfig.src}
                  >
                    <Image className="h-4 w-4 mr-2" /> Insert Image
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowImageModal(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Edit Image Modal */}
        {showImageEditModal && (
          <div className="fixed inset-0 bg-black/10 flex items-center justify-center z-50">
            <Card className="w-full max-w-lg mx-4">
              <CardHeader>
                <CardTitle className="text-lg">Edit Image</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Image URL</Label>
                  <Input
                    value={
                      editImageConfig.src.startsWith("data:")
                        ? "(uploaded image)"
                        : editImageConfig.src
                    }
                    onChange={(e) =>
                      setEditImageConfig({
                        ...editImageConfig,
                        src: e.target.value,
                      })
                    }
                    placeholder="https://..."
                  />
                </div>
                {editImageConfig.src && (
                  <div className="p-3 border rounded-lg bg-muted flex items-center justify-center min-h-[100px]">
                    <img
                      src={editImageConfig.src}
                      alt="preview"
                      style={{
                        maxWidth: "100%",
                        maxHeight: "150px",
                        objectFit: "contain",
                        borderRadius: "4px",
                      }}
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Alt Text</Label>
                  <Input
                    value={editImageConfig.alt}
                    onChange={(e) =>
                      setEditImageConfig({
                        ...editImageConfig,
                        alt: e.target.value,
                      })
                    }
                    placeholder="Describe the image"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Width</Label>
                    <Input
                      value={editImageConfig.width}
                      onChange={(e) =>
                        setEditImageConfig({
                          ...editImageConfig,
                          width: e.target.value,
                        })
                      }
                      placeholder="100% or 300px"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Alignment</Label>
                  <div className="flex gap-2">
                    {(["left", "center", "right"] as const).map((align) => (
                      <Button
                        key={align}
                        type="button"
                        variant={
                          editImageConfig.alignment === align
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        className="flex-1 capitalize"
                        onClick={() =>
                          setEditImageConfig({
                            ...editImageConfig,
                            alignment: align,
                          })
                        }
                      >
                        {align}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>
                    Link URL{" "}
                    <span className="text-muted-foreground font-normal text-xs">
                      (optional — leave empty to remove link)
                    </span>
                  </Label>
                  <Input
                    value={editImageConfig.linkUrl}
                    onChange={(e) =>
                      setEditImageConfig({
                        ...editImageConfig,
                        linkUrl: e.target.value,
                      })
                    }
                    placeholder="https://www.theproductspace.in"
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    onClick={applyImageEdit}
                    className="flex-1"
                  >
                    <Image className="h-4 w-4 mr-2" /> Apply Changes
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowImageEditModal(false);
                      setEditingImageEl(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Button Modal */}
        {showButtonModal && (
          <div className="fixed inset-0 bg-black/10 flex items-center justify-center z-50">
            <Card className="w-full max-w-md mx-4">
              <CardHeader>
                <CardTitle className="text-lg">Insert Button</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Button Text</Label>
                  <Input
                    value={buttonConfig.text}
                    onChange={(e) =>
                      setButtonConfig({ ...buttonConfig, text: e.target.value })
                    }
                    placeholder="Click Here"
                  />
                </div>
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input
                    value={buttonConfig.url}
                    onChange={(e) =>
                      setButtonConfig({ ...buttonConfig, url: e.target.value })
                    }
                    placeholder="https://www.theproductspace.in"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Background Color</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={buttonConfig.backgroundColor}
                        onChange={(e) =>
                          setButtonConfig({
                            ...buttonConfig,
                            backgroundColor: e.target.value,
                          })
                        }
                        className="w-12 h-10 border rounded cursor-pointer"
                      />
                      <Input
                        value={buttonConfig.backgroundColor}
                        onChange={(e) =>
                          setButtonConfig({
                            ...buttonConfig,
                            backgroundColor: e.target.value,
                          })
                        }
                        placeholder="#007bff"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Text Color</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={buttonConfig.textColor}
                        onChange={(e) =>
                          setButtonConfig({
                            ...buttonConfig,
                            textColor: e.target.value,
                          })
                        }
                        className="w-12 h-10 border rounded cursor-pointer"
                      />
                      <Input
                        value={buttonConfig.textColor}
                        onChange={(e) =>
                          setButtonConfig({
                            ...buttonConfig,
                            textColor: e.target.value,
                          })
                        }
                        placeholder="#ffffff"
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Border Radius</Label>
                    <Input
                      value={buttonConfig.borderRadius}
                      onChange={(e) =>
                        setButtonConfig({
                          ...buttonConfig,
                          borderRadius: e.target.value,
                        })
                      }
                      placeholder="8px"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Padding</Label>
                    <Input
                      value={buttonConfig.padding}
                      onChange={(e) =>
                        setButtonConfig({
                          ...buttonConfig,
                          padding: e.target.value,
                        })
                      }
                      placeholder="12px 24px"
                    />
                  </div>
                </div>
                <div className="p-4 border rounded-lg bg-muted">
                  <Label className="text-sm font-medium">Preview:</Label>
                  <div className="mt-2 text-center">
                    <div
                      style={{
                        display: "inline-block",
                        backgroundColor: buttonConfig.backgroundColor,
                        color: buttonConfig.textColor,
                        padding: buttonConfig.padding,
                        borderRadius: buttonConfig.borderRadius,
                        fontWeight: "500",
                        cursor: "pointer",
                      }}
                    >
                      {buttonConfig.text}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-4">
                  <Button
                    type="button"
                    onClick={insertButton}
                    className="flex-1"
                  >
                    <Plus className="h-4 w-4 mr-2" /> Insert Button
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowButtonModal(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <Card>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2 p-3 border rounded-t-lg bg-muted/50">
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => execCommand("bold")}
                  title="Bold"
                >
                  <Bold className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => execCommand("italic")}
                  title="Italic"
                >
                  <Italic className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => execCommand("underline")}
                  title="Underline"
                >
                  <Underline className="h-4 w-4" />
                </Button>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => execCommand("justifyLeft")}
                  title="Align Left"
                >
                  <AlignLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => execCommand("justifyCenter")}
                  title="Align Center"
                >
                  <AlignCenter className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => execCommand("justifyRight")}
                  title="Align Right"
                >
                  <AlignRight className="h-4 w-4" />
                </Button>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => execCommand("insertUnorderedList")}
                  title="Bullet List"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => execCommand("insertOrderedList")}
                  title="Numbered List"
                >
                  <ListOrdered className="h-4 w-4" />
                </Button>
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div className="flex gap-1">
                <input
                  type="color"
                  onChange={(e) => handleTextColor(e.target.value)}
                  className="w-8 h-8 border rounded cursor-pointer"
                  title="Text Color"
                />
                <input
                  type="color"
                  onChange={(e) => handleBackgroundColor(e.target.value)}
                  className="w-8 h-8 border rounded cursor-pointer"
                  title="Background Color"
                />
              </div>
              <Separator orientation="vertical" className="h-8" />
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    openLinkModal();
                  }}
                  title="Insert Hyperlink"
                >
                  <Link className="h-4 w-4" />
                </Button>
                {/* <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        openImageModal();
                                    }}
                                    title="Insert Image"
                                >
                                    <Image className="h-4 w-4" />
                                </Button> */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    openButtonModal();
                  }}
                  title="Insert Custom Button"
                >
                  <MousePointer className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div
              ref={editorRef}
              contentEditable
              className="min-h-[50vh] max-h-[63vh] overflow-y-auto p-6 border border-t-0 rounded-b-lg focus:outline-none bg-white dark:bg-gray-900 tip-tap"
              style={{
                whiteSpace: "pre-wrap",
                lineHeight: "1.6",
                fontSize: "14px",
              }}
              onInput={() => {
                if (editorRef.current) {
                  const newContent = editorRef.current.innerHTML;
                  setContent(newContent);
                  onChange(newContent);
                }
              }}
              onKeyDown={handleEditorKeyDown}
              onPaste={handlePaste}
              onClick={handleEditorClick}
              suppressContentEditableWarning={true}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
