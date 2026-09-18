const { EventGuests, users } = require("../../../models");

async function resolveEventGuests(filters) {
  if (!filters?.eventFilters) return [];

  const leads = [];

  const eventFilters = filters.eventFilters;

  for (const eventId of Object.keys(eventFilters)) {
    const filter = eventFilters[eventId];

    const where = {
      eventId: Number(eventId),
    };

    if (filter.targetGuestRole !== "All") {
      where.userType = filter.targetGuestRole;
    }

    if (filter.targetGuestType !== "All") {
      where.guestType = filter.targetGuestType;
    }

    const guests = await EventGuests.findAll({
      where,
      attributes: ["id", "name", "phone", "eventId", "userId"],
      include: [
        {
          model: users,
          as: "user",
          attributes: ["email"],
        },
      ],
      raw: true,
      nest: true,
    });

    leads.push(
      ...guests.map((guest) => ({
        email: guest.user?.email,
        name: guest.name,
        phone: guest.phone,
        source_type: "events",
        source_id: guest.id,
      })),
    );
  }

  return leads.filter((l) => l.email); 
}

module.exports = {
  resolveEventGuests,
};
