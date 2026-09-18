"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createForm,
  updateForm,
  FORM_FIELDS,
  defaultFieldConfig,
  type ExpenseForm,
  type ExpenseTeam,
  type FormFieldConfig,
  type FormFieldKey,
} from "@/services/expenses/expenseFormsService";
import { getCategories, type ExpenseCategory } from "@/services/expenses/expensesService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: ExpenseTeam[];
  form?: ExpenseForm | null; // present => edit mode
  onSaved: () => void;
}

// Per-category selection: checked = included on the form; subIds = the specific
// subcategories allowed (empty = whole category).
type Selection = Record<string, { checked: boolean; subIds: string[] }>;

const FormEditorDialog = ({ open, onOpenChange, teams, form, onSaved }: Props) => {
  const isEdit = !!form;

  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [fieldConfig, setFieldConfig] = useState<FormFieldConfig>(defaultFieldConfig());
  const [isActive, setIsActive] = useState(true);

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [selection, setSelection] = useState<Selection>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    getCategories().then(setCategories).catch(() => {});

    setName(form?.name ?? "");
    setTeamId(form?.team_id ?? "");
    setInstructions(form?.instructions ?? "");
    setFieldConfig(form?.field_config ?? defaultFieldConfig());
    setIsActive(form?.is_active ?? true);

    const sel: Selection = {};
    for (const ac of form?.allowedCategories ?? []) {
      sel[ac.category_id] = { checked: true, subIds: ac.subcategory_ids ?? [] };
    }
    setSelection(sel);
    setExpanded({});
  }, [open, form]);

  const selectedCount = useMemo(
    () => Object.values(selection).filter((s) => s.checked).length,
    [selection]
  );

  const toggleCategory = (categoryId: string) => {
    setSelection((prev) => {
      const cur = prev[categoryId];
      return { ...prev, [categoryId]: { checked: !cur?.checked, subIds: cur?.subIds ?? [] } };
    });
  };

  // Toggle a field's enabled/required flag. Disabling a field also clears its
  // "required" so the two never disagree.
  const setField = (key: FormFieldKey, patch: Partial<{ enabled: boolean; required: boolean }>) => {
    setFieldConfig((prev) => {
      const next = { ...prev[key], ...patch };
      if (!next.enabled) next.required = false;
      return { ...prev, [key]: next };
    });
  };

  const toggleSub = (categoryId: string, subId: string) => {
    setSelection((prev) => {
      const cur = prev[categoryId] ?? { checked: true, subIds: [] };
      const subIds = cur.subIds.includes(subId)
        ? cur.subIds.filter((s) => s !== subId)
        : [...cur.subIds, subId];
      // Selecting a subcategory implies the category is included.
      return { ...prev, [categoryId]: { checked: true, subIds } };
    });
  };

  const handleSubmit = async () => {
    if (!name.trim()) return toast.error("Form name is required");
    if (!teamId) return toast.error("Select a team");

    const allowedCategories = Object.entries(selection)
      .filter(([, v]) => v.checked)
      .map(([category_id, v]) => ({ category_id, subcategory_ids: v.subIds }));

    if (allowedCategories.length === 0)
      return toast.error("Select at least one category for the form");

    const payload = {
      name: name.trim(),
      team_id: teamId,
      instructions: instructions.trim() || null,
      field_config: fieldConfig,
      is_active: isActive,
      allowedCategories,
    };

    try {
      setSaving(true);
      if (isEdit && form) {
        await updateForm(form.id, payload);
        toast.success("Form updated");
      } else {
        await createForm(payload);
        toast.success("Form created");
      }
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Failed to save form");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit form" : "New form"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Form name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Sales team reimbursements"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Team</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Instructions (shown on the public form)</Label>
            <Textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Optional guidance for submitters"
              rows={2}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Switch checked={isActive} onCheckedChange={setIsActive} />
            Active (link works)
          </label>

          {/* Per-field config — what the public form shows and what's required */}
          <div className="grid gap-1.5">
            <Label>Form fields</Label>
            <div className="border rounded-md divide-y">
              <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-medium text-gray-400">
                <span>Field</span>
                <div className="flex items-center gap-6">
                  <span className="w-14 text-center">Show</span>
                  <span className="w-14 text-center">Required</span>
                </div>
              </div>
              {FORM_FIELDS.map(({ key, label }) => {
                const cfg = fieldConfig[key];
                return (
                  <div key={key} className="flex items-center justify-between px-3 py-2">
                    <span className={`text-sm ${cfg.enabled ? "" : "text-gray-400"}`}>{label}</span>
                    <div className="flex items-center gap-6">
                      <div className="w-14 flex justify-center">
                        <Switch
                          checked={cfg.enabled}
                          onCheckedChange={(v) => setField(key, { enabled: v })}
                        />
                      </div>
                      <div className="w-14 flex justify-center">
                        <Switch
                          checked={cfg.required}
                          disabled={!cfg.enabled}
                          onCheckedChange={(v) => setField(key, { required: v })}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-400">
              Title, amount, category and date are always shown.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>
              Allowed categories{" "}
              <span className="text-xs font-normal text-gray-400">
                ({selectedCount} selected — leave subcategories unchecked to allow the whole category)
              </span>
            </Label>
            <div className="border rounded-md divide-y max-h-72 overflow-y-auto">
              {categories.length === 0 ? (
                <div className="p-4 text-sm text-gray-500">No categories. Create some first.</div>
              ) : (
                categories.map((c) => {
                  const sel = selection[c.id];
                  const open2 = expanded[c.id];
                  const hasSubs = (c.subcategories?.length || 0) > 0;
                  return (
                    <div key={c.id}>
                      <div className="flex items-center justify-between px-3 py-2">
                        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!sel?.checked}
                            onChange={() => toggleCategory(c.id)}
                            className="h-4 w-4"
                          />
                          {c.name}
                          {sel?.checked && sel.subIds.length > 0 && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                              {sel.subIds.length} subcat
                            </span>
                          )}
                        </label>
                        {hasSubs && (
                          <button
                            type="button"
                            className="text-gray-400 hover:text-gray-700"
                            onClick={() => setExpanded((p) => ({ ...p, [c.id]: !open2 }))}
                          >
                            {open2 ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                      {open2 && hasSubs && (
                        <div className="bg-gray-50 px-3 pb-2 pl-9 space-y-1">
                          {c.subcategories!.map((s) => (
                            <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!sel?.subIds.includes(s.id)}
                                onChange={() => toggleSub(c.id, s.id)}
                                className="h-3.5 w-3.5"
                              />
                              {s.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? "Save changes" : "Create form"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FormEditorDialog;
