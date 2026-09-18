"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Cookies from "js-cookie";
import { SidebarTrigger } from "@/components/ui/sidebar";

const TABS = [
  { label: "Expenses", path: "expenses" },
  { label: "Dashboard", path: "expenses/dashboard" },
  { label: "Categories", path: "expenses/categories" },
  { label: "Payment accounts", path: "expenses/accounts" },
  { label: "Recurring", path: "expenses/recurring" },
  { label: "Forms", path: "expenses/forms" },
  { label: "Teams", path: "expenses/teams" },
];

// Shared header + tab bar for the expense screens. `right` slots in page-specific
// actions (e.g. the "Add expense" button).
const ExpensesNav = ({ right }: { right?: React.ReactNode }) => {
  const pathname = usePathname();
  const role = Cookies.get("currentRole") || "superadmin";

  return (
    <div className="px-5 h-16 flex justify-between items-center border-b">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger size={"lg"} />
          <p className="text-lg font-semibold">Expenses</p>
        </div>
        <nav className="flex items-center gap-1">
          {TABS.map((t) => {
            const href = `/${role}/${t.path}`;
            const active = pathname === href;
            return (
              <Link
                key={t.path}
                href={href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {right}
    </div>
  );
};

export default ExpensesNav;
