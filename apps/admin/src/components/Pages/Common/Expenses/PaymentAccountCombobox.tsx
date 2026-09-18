"use client";
import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  createPaymentAccount,
  getPaymentAccounts,
  type ExpensePaymentAccount,
} from "@/services/expenses/expensesService";

interface Props {
  value: string | null; // account id
  onChange: (id: string | null) => void;
  placeholder?: string;
  className?: string;
  // Set false on screens that shouldn't mint accounts (e.g. a filter bar).
  allowCreate?: boolean;
}

/**
 * Picker for `payment_account_id`. Accounts are a managed list (Payment accounts
 * tab), but this also creates one inline so logging an expense never means
 * leaving the dialog. Creating a name that already exists reuses it — the
 * backend resolves that, so no duplicates.
 */
export const PaymentAccountCombobox = ({
  value,
  onChange,
  placeholder = "None",
  className,
  allowCreate = true,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<ExpensePaymentAccount[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getPaymentAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]));
  }, []);

  const selected = accounts.find((a) => a.id === value);
  const trimmed = query.trim();
  const isNew =
    allowCreate &&
    !!trimmed &&
    !accounts.some((a) => a.name.toLowerCase() === trimmed.toLowerCase());

  const select = (id: string | null) => {
    onChange(id);
    setQuery("");
    setOpen(false);
  };

  const handleCreate = async () => {
    try {
      setCreating(true);
      const account = await createPaymentAccount(trimmed);
      // Reuse-or-create: only add to the local list if it isn't there already.
      setAccounts((prev) =>
        prev.some((a) => a.id === account.id) ? prev : [...prev, account].sort((a, b) => a.name.localeCompare(b.name))
      );
      select(account.id);
    } catch {
      toast.error("Failed to add payment account");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-gray-500",
            className
          )}
        >
          {/* An archived account still selected on an old expense resolves to
              undefined here — show a neutral label rather than "None". */}
          <span className="truncate">{selected?.name || (value ? "—" : placeholder)}</span>
          <span className="flex items-center gap-1 shrink-0">
            {value && (
              <X
                className="h-3.5 w-3.5 text-gray-400 hover:text-gray-700"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput
            placeholder={allowCreate ? "Search or add an account..." : "Search accounts..."}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {!isNew && (
              <CommandEmpty>
                {allowCreate ? "No accounts yet — type one to add it." : "No accounts found."}
              </CommandEmpty>
            )}
            {isNew && (
              <CommandGroup>
                <CommandItem value={`__add__${trimmed}`} onSelect={handleCreate} disabled={creating}>
                  {creating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Add &quot;{trimmed}&quot;
                </CommandItem>
              </CommandGroup>
            )}
            {accounts.length > 0 && (
              <CommandGroup heading="Accounts">
                {accounts.map((a) => (
                  <CommandItem key={a.id} value={a.name} onSelect={() => select(a.id)}>
                    <Check
                      className={cn("mr-2 h-4 w-4", value === a.id ? "opacity-100" : "opacity-0")}
                    />
                    {a.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default PaymentAccountCombobox;
