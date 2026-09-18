// gradient-admin's services import from this path. Re-exported from the
// unified, workspace-aware PrivateAxios (@/helpers/PrivateAxios) rather than
// gradient's own copy, so these requests route through the same active-
// workspace base URL resolution and the same single identity/refresh flow as
// tps and crm — see BACKEND-CONSOLIDATION-PLAN.md §7.2/§7.3.
export { PrivateAxios, PrivateBlogsAxios, PrivateUploadAxios } from "@/helpers/PrivateAxios";
