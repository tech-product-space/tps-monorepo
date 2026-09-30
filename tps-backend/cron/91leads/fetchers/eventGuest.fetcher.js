const { EventGuests, Event, users } = require("../../../models");

module.exports = async function eventGuestsFetcher(limit) {
  return EventGuests.findAll({
    where: {
      leads91Synced: false,
    },
    include: [
      {
        model: Event,
        as: "event",
        attributes: ["id", "eventTitle", "eventSlug"],
      },
      {
        model: users,
        as: "user",
        attributes: ["id", "email", "name", "phone"],
      },
    ],
    limit,
    order: [["createdAt", "ASC"]],
  });
};
