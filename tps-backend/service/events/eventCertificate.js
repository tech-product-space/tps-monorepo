const { EventGuests, Event, users } = require("../../models");
const { Sequelize } = require("sequelize");

const approveCertificateService = async (
  guestId,
  transaction,
  approveTeamMember = false,
) => {
  //GET GUEST
  const eventGuest = await EventGuests.findOne({
    where: { id: guestId },
    include: [
      {
        model: Event,
        as: "event",
        attributes: ["id", "eventType"],
      },
      {
        model: users,
        as: "user",
        attributes: ["id", "email"],
      },
    ],
    transaction,
  });

  if (!eventGuest) {
    throw new Error("Event guest not found");
  }

  //check if already approved
  if (eventGuest.certificateApproved) {
    return { skipped: true };
  }

  const isSpecialEvent = ["Hackathon", "Teardown"].includes(
    eventGuest.event?.eventType,
  );

  if (isSpecialEvent) {
    const isPrimaryMember = eventGuest.feedbackData?.isPrimaryMember === true;

    if (isPrimaryMember) {
      eventGuest.certificateApproved = true;
      await eventGuest.save({ transaction });

      const teamMember2Email = eventGuest.feedbackData?.teamMember2Email;

      if (teamMember2Email) {
        const teamUser = await users.findOne({
          where: { email: teamMember2Email },
          transaction,
        });

        if (teamUser) {
          const teamGuest = await EventGuests.findOne({
            where: {
              userId: teamUser.id,
              eventId: eventGuest.eventId,
            },
            transaction,
          });

          if (teamGuest) {
            const secondaryFeedback = {
              ...(eventGuest.feedbackData || {}),
            };

            delete secondaryFeedback.isPrimaryMember;

            teamGuest.feedbackData = secondaryFeedback;
            teamGuest.feedbackSubmittedAt =
              eventGuest.feedbackSubmittedAt || new Date();

            if (approveTeamMember) {
              teamGuest.certificateApproved = true;
            }

            await teamGuest.save({ transaction });
          }
        }
      }
    } else if (!eventGuest.feedbackData) {
      const primaryGuests = await EventGuests.findAll({
        where: Sequelize.and(
          { eventId: eventGuest.eventId },
          Sequelize.literal(
            `"EventGuests"."feedbackData"->>'isPrimaryMember' = 'true'`,
          ),
          Sequelize.literal(
            `"EventGuests"."feedbackData"->>'teamMember2Email' = '${eventGuest.user.email}'`,
          ),
        ),
        transaction,
      });

      if (primaryGuests.length === 1) {
        const primaryGuest = primaryGuests[0];

        if (primaryGuest.feedbackSubmittedAt) {
          const secondaryFeedback = {
            ...(primaryGuest.feedbackData || {}),
          };

          delete secondaryFeedback.isPrimaryMember;

          eventGuest.feedbackData = secondaryFeedback;
          eventGuest.feedbackSubmittedAt = primaryGuest.feedbackSubmittedAt;
          eventGuest.certificateApproved = true;

          await eventGuest.save({ transaction });
        }
      }
    } else if (eventGuest.feedbackData) {
      eventGuest.certificateApproved = true;
      await eventGuest.save({ transaction });
    }
  } else {
    eventGuest.certificateApproved = true;
    await eventGuest.save({ transaction });
  }

  return { success: true };
};

module.exports = { approveCertificateService };
