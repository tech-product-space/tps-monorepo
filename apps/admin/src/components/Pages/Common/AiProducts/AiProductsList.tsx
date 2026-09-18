"use client";

import React, { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Bot,
  Copy,
  GripVertical,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

import { AiProduct } from "@/types/aiProduct";
import {
  createAiProduct,
  deleteAiProduct,
  getAllAiProducts,
  getApiErrorMessage,
  duplicateAiProduct,
  reorderAiProducts,
  resolveAssetUrl,
  sanitizeSlugInput,
  slugifyClient,
  updateAiProduct,
} from "@/services/ai-products/aiProductService";

function SortableProductRow({
  product,
  onEdit,
  onToggleStatus,
  onDelete,
  onDuplicate,
  togglingId,
  duplicatingId,
}: {
  product: AiProduct;
  onEdit: (id: string) => void;
  onToggleStatus: (product: AiProduct) => void;
  onDelete: (product: AiProduct) => void;
  onDuplicate: (product: AiProduct) => void;
  togglingId: string | null;
  duplicatingId: string | null;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const toggling = togglingId === product.id;
  const tags = product.content?.tags || [];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 bg-white border rounded-lg shadow-sm p-4"
    >
      <button {...attributes} {...listeners} className="cursor-grab text-gray-400">
        <GripVertical size={18} />
      </button>

      {product.content?.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolveAssetUrl(product.content.thumbnailUrl)}
          alt=""
          className="w-12 h-12 rounded object-cover border"
        />
      ) : (
        <div className="w-12 h-12 rounded bg-gray-100 border flex items-center justify-center">
          <ImageIcon size={18} className="text-gray-400" />
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-semibold truncate">{product.name}</h4>
          <button type="button" onClick={() => onToggleStatus(product)} disabled={toggling}>
            <Badge
              variant={product.status === "published" ? "default" : "secondary"}
              className={`text-[10px] uppercase flex items-center gap-1 cursor-pointer ${
                toggling ? "opacity-60 pointer-events-none" : ""
              }`}
            >
              {toggling && <Loader2 size={10} className="animate-spin" />}
              {product.status}
            </Badge>
          </button>
        </div>
        <p className="text-xs text-gray-500 truncate">
          /{product.slug}
          {tags.length > 0 && ` · ${tags.join(", ")}`}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => onEdit(product.id)}>
          <Pencil size={14} />
          Edit
        </Button>
        <Button
          size="icon"
          variant="ghost"
          title="Duplicate"
          disabled={duplicatingId === product.id}
          onClick={() => onDuplicate(product)}
        >
          {duplicatingId === product.id ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Copy size={16} className="text-gray-500" />
          )}
        </Button>
        <Button size="icon" variant="ghost" onClick={() => onDelete(product)}>
          <Trash2 size={16} className="text-red-500" />
        </Button>
      </div>
    </div>
  );
}

export default function AiProductsList() {
  const router = useRouter();
  // Works under any role tree (/admin/ai-products, /superadmin/ai-products, …)
  const pathname = usePathname();
  const basePath = `/${pathname?.split("/")[1] || "admin"}/ai-products`;
  const [products, setProducts] = useState<AiProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [creating, setCreating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AiProduct | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const fetchProducts = useCallback(async () => {
    try {
      const data = await getAllAiProducts();
      setProducts(data);
    } catch {
      toast.error("Failed to load AI products");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const openCreate = () => {
    setNewName("");
    setNewSlug("");
    setSlugEdited(false);
    setCreateOpen(true);
  };

  // Suggest slug from name until the user types in the slug field themselves.
  const handleNameChange = (value: string) => {
    setNewName(value);
    if (!slugEdited) setNewSlug(slugifyClient(value));
  };

  const handleSlugChange = (value: string) => {
    setSlugEdited(true);
    setNewSlug(sanitizeSlugInput(value));
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      setCreating(true);
      const product = await createAiProduct(
        newName.trim(),
        slugifyClient(newSlug) || undefined
      );
      toast.success("Draft created");
      router.push(`${basePath}/${product.id}/edit`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to create product"));
      setCreating(false);
    }
  };

  const handleToggleStatus = async (product: AiProduct) => {
    const newStatus = product.status === "published" ? "draft" : "published";
    try {
      setTogglingId(product.id);
      await updateAiProduct(product.id, { status: newStatus });
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, status: newStatus } : p))
      );
      toast.success(`Marked as ${newStatus}`);
    } catch {
      toast.error("Failed to update status");
    } finally {
      setTogglingId(null);
    }
  };

  const handleDuplicate = async (product: AiProduct) => {
    try {
      setDuplicatingId(product.id);
      const copy = await duplicateAiProduct(product.id);
      await fetchProducts();
      toast.success(`Duplicated as “${copy.name}” (draft)`);
    } catch {
      toast.error("Failed to duplicate product");
    } finally {
      setDuplicatingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await deleteAiProduct(deleteTarget.id);
      setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast.success("Product deleted");
    } catch {
      toast.error("Failed to delete product");
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = products.findIndex((p) => p.id === active.id);
    const newIndex = products.findIndex((p) => p.id === over.id);
    const reordered = arrayMove(products, oldIndex, newIndex);
    setProducts(reordered);

    try {
      await reorderAiProducts(
        reordered.map((p, i) => ({ id: p.id, display_order: i + 1 }))
      );
    } catch {
      toast.error("Failed to save order");
      fetchProducts();
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <div className="px-5 h-16 flex justify-between items-center border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <p className="text-lg font-semibold text-gray-900">AI Products</p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus size={16} />
          Add Product
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-5 bg-gray-50">
        <div className="max-w-4xl mx-auto space-y-3">
          <p className="text-sm text-gray-500">
            Showcase projects on the public AI Product Labs page. Drag to reorder — the order
            here is the order on the website.
          </p>

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-gray-400" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-16 text-gray-500 border rounded-lg bg-white">
              No products yet. Click “Add Product” to create the first one.
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={products.map((p) => p.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {products.map((product) => (
                    <SortableProductRow
                      key={product.id}
                      product={product}
                      togglingId={togglingId}
                      duplicatingId={duplicatingId}
                      onEdit={(id) => router.push(`${basePath}/${id}/edit`)}
                      onToggleStatus={handleToggleStatus}
                      onDelete={setDeleteTarget}
                      onDuplicate={handleDuplicate}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl w-[95vw]">
          <DialogHeader>
            <DialogTitle>New AI Product</DialogTitle>
            <DialogDescription>
              Creates a draft — you’ll add the content (sections, media, team) on the next
              screen. Only published products appear on the website.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-product-name">Product name</Label>
              <Input
                id="new-product-name"
                value={newName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. AI Resume Screener"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-product-slug">URL slug</Label>
              <Input
                id="new-product-slug"
                value={newSlug}
                onChange={(e) => handleSlugChange(e.target.value)}
                placeholder="ai-resume-screener"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <p className="text-xs text-gray-500">
                Public page URL:{" "}
                <span className="font-mono text-gray-700">
                  /ai-products/{newSlug || "…"}
                </span>
                {" "}— must be unique; lowercase letters, numbers and dashes only.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
              {creating && <Loader2 size={14} className="animate-spin" />}
              Create draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the product and its page. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
