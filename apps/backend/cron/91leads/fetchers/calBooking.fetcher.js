const { CalBooking } = require("../../../models");
const { Op } = require("sequelize");

module.exports = async function calBookingFetcher(limit) {
  return CalBooking.findAll({
    where: {
      leads91Synced: false,
      attendeePhone: {
        [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }],
      },
    },
    limit,
    order: [["createdAt", "ASC"]],
  });
};
