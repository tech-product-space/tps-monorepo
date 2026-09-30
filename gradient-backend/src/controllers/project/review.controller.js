import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { PROJECT_STATUS } from "../../config/constants/project.js";

const { Project } = db;

/**
 * Approve or reject a community submission.
 *
 * **The only writer of `status`, `reviewedAt`, `reviewedByAdminId` and
 * `rejectionReason`.** `updateProject` strips all four, so a general update
 * cannot smuggle an approval through by posting `status: "approved"`. Keep that
 * split — the moment the edit form can set the moderation state, "who approved
 * this and when" stops being answerable.
 *
 * **Approving does not publish.** A submission almost always needs a copy edit,
 * a category and a skills list before it is fit for the grid; auto-publishing
 * would make "Approve" mean "ship this stranger's prose to production". The
 * panel routes into the edit form afterwards, because approval is the start of
 * the editing job rather than the end of it.
 */
export const reviewProject = asyncWrapper(async (req, res) => {
  const { decision, rejectionReason } = req.body;

  const allowed = [PROJECT_STATUS.APPROVED, PROJECT_STATUS.REJECTED];

  if (!allowed.includes(decision)) {
    return res.status(400).json({
      success: false,
      message: `decision must be one of: ${allowed.join(", ")}`,
    });
  }

  const project = await Project.findByPk(req.params.id);

  if (!project) {
    return res
      .status(404)
      .json({ success: false, message: "Project not found" });
  }

  const rejecting = decision === PROJECT_STATUS.REJECTED;

  await project.update({
    status: decision,
    reviewedAt: new Date(),
    // Denormalised, with no association — a deleted admin must not take the
    // review history with them.
    reviewedByAdminId: req.admin?.id ?? null,
    // Cleared on approval so a previously-rejected submission that is later
    // accepted does not keep displaying why it was turned down.
    rejectionReason: rejecting ? (rejectionReason ?? null) : null,
    // A rejected project cannot stay live. Approving deliberately does not set
    // this the other way — see the note above.
    isPublished: rejecting ? false : project.isPublished,
  });

  req.activity?.set({ entityLabel: project.title });

  return res.status(200).json({ success: true, data: project });
});
