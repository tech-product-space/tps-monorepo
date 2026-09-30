import express from "express";

import {
  createContactList,
  deleteContact,
  deleteContactList,
  getContactList,
  listContactLists,
  listContacts,
  updateContactList,
} from "../../controllers/contact/crud.controller.js";
import { uploadContacts } from "../../controllers/contact/upload.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { uploadCsv } from "../../middlewares/uploadCsv.middleware.js";

const router = express.Router();

// BASE URL -> /contacts
//
// adminAuth only, matching /campaigns: a contact list is an audience, and the
// people who build audiences are the people who send to them.

router.use(adminAuth);

router.post("/lists", createContactList);
router.get("/lists", listContactLists);

router.get("/lists/:id", getContactList);
router.patch("/lists/:id", updateContactList);
router.delete("/lists/:id", deleteContactList);

router.get("/lists/:id/contacts", listContacts);
router.post("/lists/:id/upload", uploadCsv("file"), uploadContacts);
router.delete("/lists/:id/contacts/:contactId", deleteContact);

export default router;
