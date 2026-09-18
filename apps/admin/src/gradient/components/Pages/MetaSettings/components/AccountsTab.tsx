"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/gradient/components/ui/alert-dialog";
import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent } from "@/gradient/components/ui/card";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { cn } from "@/gradient/lib/utils";
import { metaService } from "@/gradient/services/metaService";
import type { MetaAccount } from "@/gradient/types/meta";

import AccountDialog from "./AccountDialog";

interface Props {
  accounts: MetaAccount[];
  loading: boolean;
  /**
   * Super Admin. Gates the three actions that touch a credential or destroy
   * data — connect, edit, remove. Validate and Sync stay available to everyone,
   * because they use the stored token without revealing or replacing it.
   */
  canManage: boolean;
  onRefresh: () => void;
}

const TOKEN_BADGE = {
  valid: {
    label: "Token valid",
    icon: CheckCircle2,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  invalid: {
    label: "Token invalid",
    icon: AlertTriangle,
    className: "bg-rose-50 text-rose-700 border-rose-200",
  },
  unknown: {
    label: "Not checked",
    icon: HelpCircle,
    className: "bg-slate-50 text-slate-600 border-slate-200",
  },
} as const;

const relative = (value: string | null) => {
  if (!value) return "never";
  return new Date(value).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const AccountsTab = ({ accounts, loading, canManage, onRefresh }: Props) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MetaAccount | null>(null);
  const [deleting, setDeleting] = useState<MetaAccount | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (id: string, action: () => Promise<unknown>, fallback: string) => {
    setBusy(id);

    try {
      const result = (await action()) as { message?: string };
      toast.success(result?.message || "Done");
      onRefresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error, fallback));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Connect a page
          </Button>
        </div>
      )}

      {!loading && accounts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {canManage
                ? "No Facebook pages connected yet. Connect one to start importing lead ad submissions."
                : "No Facebook pages connected yet. A Super Admin needs to connect one before leads can be imported."}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {accounts.map((account) => {
          const badge = TOKEN_BADGE[account.tokenStatus];
          const Icon = badge.icon;
          const isBusy = busy === account.id;

          return (
            <Card key={account.id}>
              <CardContent className="space-y-4 pt-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{account.name}</h3>
                      {!account.enabled && (
                        <Badge variant="outline" className="font-normal">
                          Disabled
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Page ID {account.pageId}
                    </p>
                  </div>

                  <Badge
                    variant="outline"
                    className={cn("shrink-0 font-normal", badge.className)}
                  >
                    <Icon className="mr-1 h-3 w-3" />
                    {badge.label}
                  </Badge>
                </div>

                {/*
                  Graph's own message, verbatim. "(#190) This method must be
                  called with a Page Access Token" names its own fix; anything
                  we paraphrased would be less useful.
                */}
                {account.lastError && (
                  <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
                    {account.lastError}
                  </div>
                )}

                <dl className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <dt className="inline">Last polled: </dt>
                    <dd className="inline">{relative(account.lastPolledAt)}</dd>
                  </div>
                  <div>
                    <dt className="inline">Forms synced: </dt>
                    <dd className="inline">{relative(account.lastSyncedAt)}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="inline">Default routing: </dt>
                    {/* Joined from the catalogue now, so read the label off the
                        related row rather than printing the object. */}
                    <dd className="inline">
                      {account.defaultSource?.displayName || "Not set"}
                      {account.defaultSubSource
                        ? ` / ${account.defaultSubSource.displayName}`
                        : ""}
                    </dd>
                  </div>
                </dl>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() =>
                      run(
                        account.id,
                        () => metaService.validateToken(account.id),
                        "Token check failed",
                      )
                    }
                  >
                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                    Validate
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() =>
                      run(
                        account.id,
                        () => metaService.syncForms(account.id),
                        "Could not sync forms",
                      )
                    }
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Sync forms
                  </Button>

                  {/*
                    Hidden rather than disabled: a greyed-out Remove invites
                    people to ask why, and there is no answer they can act on.
                    Enforced server-side regardless — see meta.route.js.
                  */}
                  {canManage && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isBusy}
                        onClick={() => {
                          setEditing(account);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>

                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        disabled={isBusy}
                        onClick={() => setDeleting(account)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <AccountDialog
        open={dialogOpen}
        account={editing}
        onClose={() => setDialogOpen(false)}
        onSaved={onRefresh}
      />

      <AlertDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
      >
        {/* Base caps at max-w-sm, which wraps this warning into a wall of text
            — and it is the one confirmation here that people must actually read. */}
        <AlertDialogContent className="text-sm sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {deleting?.name}?</AlertDialogTitle>
            {/*
              Worth spelling out: this is not just disconnecting a page. The
              cascade takes the forms and every lead imported through them.
            */}
            <AlertDialogDescription>
              This deletes the page&apos;s cached forms and{" "}
              <strong>every Facebook lead imported through it</strong>. To stop
              importing without losing anything, edit the account and turn
              Enabled off instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (!deleting) return;
                run(
                  deleting.id,
                  () => metaService.deleteAccount(deleting.id),
                  "Could not remove the account",
                );
                setDeleting(null);
              }}
            >
              Remove page and leads
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AccountsTab;
