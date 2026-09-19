const express = require("express");
const router = express.Router();

const uploadCsv = require("../middlewares/uploadCsv");
const asyncWrapper = require("../utils/asyncWrapper");

const {
  uploadContacts,
  getContactLists,
  getContactsByListId,
} = require("../controllers/campaign/upload-conctacts.controller");


router.post("/bulk-upload", uploadCsv.single("file"),asyncWrapper(uploadContacts));
router.get("/", asyncWrapper(getContactLists));
router.get("/:id/contacts", asyncWrapper(getContactsByListId));

module.exports = router;