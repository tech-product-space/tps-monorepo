import db from "../../database/postgres/models/index.js";
const { User } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";

export const getUserDetails = asyncWrapper(async (req, res) => {
  const user = await User.findByPk(req.user.id, {
    attributes: {
      exclude: ["password"],
    },
  });

  return res.json(user);
});
