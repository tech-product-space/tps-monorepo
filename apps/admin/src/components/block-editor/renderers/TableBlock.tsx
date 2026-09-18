"use client";

import React, { useEffect, useRef, useState } from "react";
import { Trash2, GripVertical, Table2, Plus, Minus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDragHandle } from "./SortableBlock";
import { sanitizeHtml } from "@/hooks/useQuillPasteSanitizer";

function buildTableHtml(rows: number, cols: number) {
  const headerCells = Array.from({ length: cols }, (_, i) => `<th>Header ${i + 1}</th>`).join("");
  const bodyRows = Array.from({ length: Math.max(rows - 1, 1) }, () =>
    `<tr>${Array.from({ length: cols }, () => "<td></td>").join("")}</tr>`
  ).join("");

  return `<table><tbody><tr>${headerCells}</tr>${bodyRows}</tbody></table>`;
}

function htmlHasTable(html: string) {
  return /<table[\s>]/i.test(html);
}

export function TableBlock({ block, actions }: any) {
  const { setActivatorNodeRef, listeners, attributes } = useDragHandle();
  const editorRef = useRef<HTMLDivElement>(null);

  const hasTable = htmlHasTable(block.data.html ?? "");

  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);

  useEffect(() => {
    if (!editorRef.current) return;

    const nextHtml = block.data.html ?? "";
    if (editorRef.current.innerHTML !== nextHtml) {
      editorRef.current.innerHTML = nextHtml;
    }
  }, [block.data.html]);

  const syncHtml = () => {
    actions.update(block.id, {
      html: editorRef.current?.innerHTML ?? "",
    });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();

    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");

    const contentToInsert = html
      ? sanitizeHtml(html)
      : text.split("\n").map((line) => `<p>${line}</p>`).join("");

    if (!editorRef.current) return;
    editorRef.current.innerHTML = contentToInsert;
    syncHtml();
  };

  const updateTable = (transform: (table: HTMLTableElement) => void) => {
    if (!editorRef.current) return;

    const wrapper = document.createElement("div");
    wrapper.innerHTML = editorRef.current.innerHTML;

    const table = wrapper.querySelector("table");
    if (!table) return;

    transform(table);
    editorRef.current.innerHTML = wrapper.innerHTML;
    syncHtml();
  };

  const insertTable = () => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = buildTableHtml(rows, cols);
    syncHtml();
  };

  const addRow = () => {
    updateTable((table) => {
      const body = table.tBodies[0] ?? table.createTBody();
      const colCount = Math.max(table.rows[0]?.cells.length ?? 2, 1);
      const row = body.insertRow();
      for (let i = 0; i < colCount; i += 1) row.insertCell().innerHTML = "";
    });
  };

  const removeRow = () => {
    updateTable((table) => {
      if (table.rows.length <= 1) return;
      table.deleteRow(table.rows.length - 1);
    });
  };

  const addColumn = () => {
    updateTable((table) => {
      Array.from(table.rows).forEach((row, rowIndex) => {
        const cell = document.createElement(rowIndex === 0 ? "th" : "td");
        cell.innerHTML = rowIndex === 0 ? `Header ${row.cells.length + 1}` : "";
        row.appendChild(cell);
      });
    });
  };

  const removeColumn = () => {
    updateTable((table) => {
      Array.from(table.rows).forEach((row) => {
        if (row.cells.length <= 1) return;
        row.deleteCell(row.cells.length - 1);
      });
    });
  };

  return (
    <div className="rounded-lg border bg-background shadow-sm">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted"
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <Table2 className="h-4 w-4" />
          Table
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => actions.remove(block.id)}
          className="h-7 w-7"
        >
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>

      {/* Controls — switch between "create" and "edit" mode */}
      {!hasTable ? (
        <div className="px-3 pt-3 pb-1 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Define table size, then click <strong>Insert Table</strong> — or just paste from Notion / Google Docs.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-muted-foreground">Rows</label>
              <Input
                type="number"
                min={1}
                max={50}
                value={rows}
                onChange={(e) => setRows(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                className="h-8 w-20 text-xs"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-muted-foreground">Columns</label>
              <Input
                type="number"
                min={1}
                max={20}
                value={cols}
                onChange={(e) => setCols(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="h-8 w-20 text-xs"
              />
            </div>
            <Button type="button" size="sm" onClick={insertTable}>
              <Table2 className="h-3.5 w-3.5 mr-1" /> Insert Table
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
          <Button type="button" size="sm" variant="outline" onClick={addRow}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Row
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={removeRow}>
            <Minus className="h-3.5 w-3.5 mr-1" /> Row
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={addColumn}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Column
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={removeColumn}>
            <Minus className="h-3.5 w-3.5 mr-1" /> Column
          </Button>
        </div>
      )}

      {/* Editable area */}
      <div className="p-3" onPointerDown={(e) => e.stopPropagation()}>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning={true}
          onInput={syncHtml}
          onBlur={syncHtml}
          onPaste={handlePaste}
          className="min-h-40 rounded-md border bg-white p-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-ring [&_table]:w-max [&_table]:min-w-full [&_table]:max-w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_td]:border [&_td]:border-slate-300 [&_td]:px-3 [&_td]:py-2"
          data-placeholder="Paste your table here..."
        />
      </div>
    </div>
  );
}
