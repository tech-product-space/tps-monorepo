import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import Sequelize from "sequelize";

const { Event, Resource } = db;
const { Op } = Sequelize;

export const getHomePageData = asyncWrapper(async (req, res) => {
  const today = new Date();

  const [resources, events] = await Promise.all([
    Resource.findAll({
      attributes: [
        "id",
        "title",
        "subtitle",
        "resourceCategory",
        "resourceType",
        "thumbnailSrc",
        "resourceSlug",
        "seo",
        [
          Sequelize.literal(`"resourceContent"->>'publishedDate'`),
          "publishedDate",
        ],
      ],
      where: {
        isPublished: true,
      },
      order: [["createdAt", "DESC"]],
      limit: 4,
    }),

    Event.findAll({
      attributes: [
        "eventTitle",
        "eventSubtitle",
        "eventStartDate",
        "eventEndDate",
        "eventStartTime",
        "eventEndTime",
        "speakers",
        "eventCreativeUrl",
        "eventType",
        "eventCategory",
        "ctaType",
        "location",
        "eventSlug",
      ],
      where: {
        isPublished: true,
        eventStartDate: {
          [Op.gte]: today,
        },
      },
      order: [["eventStartDate", "ASC"]],
      limit: 3,
    }),
  ]);

  return res.status(200).json({
    data: {
      events,
      resources,
    },
  });

});
